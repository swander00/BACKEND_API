// Materialized Views Refresh Script
// - Connects to Postgres using DATABASE_URL
// - Refreshes views in dependency order
// - Falls back to non-concurrent refresh if needed
// - Calls admin cache-bust endpoint when done

import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

async function refreshView(client, viewName, concurrent = true) {
  const stmt = `REFRESH MATERIALIZED VIEW ${concurrent ? 'CONCURRENTLY ' : ''}public."${viewName}"`;
  try {
    console.log(`→ Refreshing ${viewName} ${concurrent ? '(concurrent)' : ''} ...`);
    await client.query(stmt);
    console.log(`✓ Refreshed ${viewName}`);
  } catch (err) {
    // Fallback if concurrent not possible or other constraint issues
    if (concurrent) {
      console.warn(`! Concurrent refresh failed for ${viewName}: ${err.code || err.message}`);
      console.warn(`→ Retrying without CONCURRENTLY ...`);
      await client.query(`REFRESH MATERIALIZED VIEW public."${viewName}"`);
      console.log(`✓ Refreshed ${viewName} (non-concurrent)`);
    } else {
      throw err;
    }
  }
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Refresh PropertyView only (other views will be rebuilt later)
    await refreshView(client, 'PropertyView', true);
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

run().catch(err => {
  console.error(err);
  process.exit(1);
});


