// Materialized Views Refresh Script
// - Connects to Postgres using DATABASE_URL
// - Refreshes views in dependency order
// - Falls back to non-concurrent refresh if needed
// - Calls admin cache-bust endpoint when done

import { Client } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env.local' });
if (!process.env.PORT) {
  dotenv.config({ path: './environment.env' });
}

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

async function checkRefreshProgress(client, viewName) {
  try {
    const result = await client.query(`
      SELECT * FROM pg_stat_progress_create_materialized_view 
      WHERE viewname = $1
    `, [viewName]);
    if (result.rows.length > 0) {
      const progress = result.rows[0];
      console.log(`  Progress: ${progress.phase || 'Unknown'}`);
      if (progress.blocks_total) {
        const percent = Math.round((progress.blocks_done / progress.blocks_total) * 100);
        console.log(`  Blocks: ${progress.blocks_done}/${progress.blocks_total} (${percent}%)`);
      }
      return true;
    }
  } catch (e) {
    // Progress view might not be available, ignore
  }
  return false;
}

async function refreshView(client, viewName, concurrent = true, timeoutMinutes = 30) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  
  try {
    // Set statement timeout
    console.log(`→ Setting statement timeout to ${timeoutMinutes} minutes...`);
    await client.query(`SET statement_timeout = '${timeoutMinutes}min'`);
    
    const stmt = `REFRESH MATERIALIZED VIEW ${concurrent ? 'CONCURRENTLY ' : ''}public."${viewName}"`;
    console.log(`→ Refreshing ${viewName} ${concurrent ? '(concurrent)' : '(non-concurrent)'} ...`);
    console.log(`  This may take several minutes for large datasets...`);
    
    // Start refresh in background and monitor progress
    const refreshPromise = client.query(stmt);
    
    // Monitor progress every 5 seconds
    const progressInterval = setInterval(async () => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ⏱️  Elapsed: ${elapsed}s`);
      await checkRefreshProgress(client, viewName);
    }, 5000);
    
    try {
      await refreshPromise;
      clearInterval(progressInterval);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`✓ Refreshed ${viewName} in ${elapsed}s`);
    } catch (err) {
      clearInterval(progressInterval);
      throw err;
    } finally {
      // Reset timeout
      await client.query(`RESET statement_timeout`);
    }
  } catch (err) {
    // Reset timeout on error
    try {
      await client.query(`RESET statement_timeout`);
    } catch (e) {
      // Ignore reset errors
    }
    
    // Fallback if concurrent not possible or timeout
    if (concurrent && (err.code === '57014' || err.message.includes('timeout') || err.message.includes('canceling statement'))) {
      console.warn(`! Concurrent refresh timed out or was canceled for ${viewName}`);
      console.warn(`→ Retrying without CONCURRENTLY (faster but blocks reads)...`);
      await refreshView(client, viewName, false, timeoutMinutes);
    } else if (concurrent) {
      console.warn(`! Concurrent refresh failed for ${viewName}: ${err.code || err.message}`);
      console.warn(`→ Retrying without CONCURRENTLY ...`);
      await refreshView(client, viewName, false, timeoutMinutes);
    } else {
      throw err;
    }
  }
}

async function checkForLocks(client, viewName) {
  try {
    const result = await client.query(`
      SELECT 
        l.locktype, 
        l.relation::regclass,
        l.mode,
        l.granted,
        l.pid,
        a.query_start,
        a.state,
        a.wait_event_type,
        a.wait_event
      FROM pg_locks l
      JOIN pg_stat_activity a ON l.pid = a.pid
      WHERE l.relation::regclass::text = $1
        AND l.locktype = 'relation'
    `, [`public."${viewName}"`]);
    
    if (result.rows.length > 0) {
      console.log(`⚠️  Found ${result.rows.length} lock(s) on ${viewName}:`);
      result.rows.forEach((lock, i) => {
        console.log(`  Lock ${i + 1}: ${lock.mode} (granted: ${lock.granted}, pid: ${lock.pid})`);
        if (lock.query_start) {
          const age = Math.round((Date.now() - new Date(lock.query_start).getTime()) / 1000);
          console.log(`    Query age: ${age}s, State: ${lock.state}`);
        }
      });
      return true;
    }
  } catch (e) {
    console.warn(`Could not check locks: ${e.message}`);
  }
  return false;
}

async function run() {
  const args = process.argv.slice(2);
  const forceNonConcurrent = args.includes('--force') || args.includes('-f');
  const timeoutArg = args.find(arg => arg.startsWith('--timeout='));
  // Default to 2 hours (120 minutes) for large datasets
  const timeoutMinutes = timeoutArg ? parseInt(timeoutArg.split('=')[1]) : 120;
  
  if (forceNonConcurrent) {
    console.log('⚠️  Using non-concurrent refresh (faster but blocks reads)');
  }
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Check for existing locks
    console.log('→ Checking for existing locks...');
    await checkForLocks(client, 'PropertyView');
    
    // Refresh PropertyView
    await refreshView(client, 'PropertyView', !forceNonConcurrent, timeoutMinutes);
  } finally {
    await client.end();
  }

  // Reload PostgREST schema cache
  try {
    console.log('→ Reloading PostgREST schema cache...');
    const reloadClient = new Client({ connectionString: DATABASE_URL });
    await reloadClient.connect();
    await reloadClient.query(`NOTIFY pgrst, 'reload schema';`);
    await reloadClient.end();
    console.log('✓ PostgREST schema cache reload notification sent');
  } catch (e) {
    console.warn(`PostgREST schema reload error: ${e.message}`);
    console.warn('  You may need to manually reload the schema cache');
  }

  // Cache-bust
  try {
    if (!ADMIN_TOKEN) {
      console.warn('ADMIN_TOKEN not set; skipping cache-bust call.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/admin/cache-bust`, {
      method: 'POST',
      headers: {
        'x-admin-token': ADMIN_TOKEN
      }
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`Cache-bust failed: ${res.status} ${text}`);
    } else {
      console.log('✓ Cache-bust triggered successfully.');
    }
  } catch (e) {
    console.warn(`Cache-bust request error: ${e.message}`);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node scripts/refresh-mvs.js [options]

Options:
  --force, -f          Use non-concurrent refresh (faster but blocks reads)
  --timeout=N          Set timeout in minutes (default: 120 for large datasets)
  --help, -h           Show this help message

Examples:
  node scripts/refresh-mvs.js                    # Concurrent refresh with 120min timeout
  node scripts/refresh-mvs.js --force            # Non-concurrent refresh (faster)
  node scripts/refresh-mvs.js --timeout=180      # Concurrent refresh with 180min timeout
  `);
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ Refresh failed:', err.message);
  if (err.code) {
    console.error(`   Error code: ${err.code}`);
  }
  if (err.stack && process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});


