// ===============================================================================================
// PROPERTY SUGGESTION VIEW SETUP SCRIPT
// ===============================================================================================
// Creates PropertySuggestionView materialized view for search/autocomplete
// This view depends on PropertyView, so PropertyView must exist first
// ===============================================================================================

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env.local' });
if (!process.env.PORT) {
  dotenv.config({ path: './environment.env' });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

// ===============================================================================================
// CREATE PROPERTY SUGGESTION VIEW
// ===============================================================================================

async function createPropertySuggestionView(client) {
  console.log('\n📋 Creating PropertySuggestionView...');
  
  // Check if PropertyView exists first
  const checkPropertyViewSQL = `
    SELECT EXISTS (
      SELECT FROM pg_matviews 
      WHERE schemaname = 'public' 
      AND matviewname = 'PropertyView'
    );
  `;
  
  const viewCheck = await client.query(checkPropertyViewSQL);
  if (!viewCheck.rows[0].exists) {
    throw new Error('PropertyView must exist before creating PropertySuggestionView. Please run setup-views.js first.');
  }
  
  // Read PropertySuggestionView.sql
  const viewPath = join(__dirname, '../docs/Database scripts/PropertySuggestionView.sql');
  const viewSQL = readFileSync(viewPath, 'utf8');
  
  try {
    // Execute the entire SQL file
    await client.query(viewSQL);
    console.log('✓ PropertySuggestionView created');
  } catch (error) {
    console.error('❌ Error creating PropertySuggestionView:', error.message);
    if (error.position) {
      console.error(`   Error at position: ${error.position}`);
    }
    if (error.hint) {
      console.error(`   Hint: ${error.hint}`);
    }
    throw error;
  }
}

// ===============================================================================================
// REFRESH PROPERTY SUGGESTION VIEW
// ===============================================================================================

async function refreshPropertySuggestionView(client) {
  console.log('\n🔄 Refreshing PropertySuggestionView...');
  
  try {
    console.log('  → Refreshing PropertySuggestionView...');
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertySuggestionView"`);
    console.log('  ✓ PropertySuggestionView refreshed');
  } catch (error) {
    // Fallback to non-concurrent refresh
    console.log('  → Falling back to non-concurrent refresh...');
    await client.query(`REFRESH MATERIALIZED VIEW public."PropertySuggestionView"`);
    console.log('  ✓ PropertySuggestionView refreshed (non-concurrent)');
  }
}

// ===============================================================================================
// RELOAD POSTGREST SCHEMA CACHE
// ===============================================================================================

async function reloadPostgRESTSchema(client) {
  console.log('\n🔄 Reloading PostgREST schema cache...');
  
  try {
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log('✓ PostgREST schema cache reload notification sent');
  } catch (error) {
    console.warn('⚠ PostgREST schema reload error:', error.message);
    console.warn('  You may need to manually reload the schema cache in Supabase Dashboard');
  }
}

// ===============================================================================================
// MAIN EXECUTION
// ===============================================================================================

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    // Step 1: Create PropertySuggestionView
    await createPropertySuggestionView(client);
    
    // Step 2: Refresh PropertySuggestionView
    await refreshPropertySuggestionView(client);
    
    // Step 3: Reload PostgREST schema cache
    await reloadPostgRESTSchema(client);
    
    console.log('\n✅ PropertySuggestionView created and refreshed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Verify PropertySuggestionView in Supabase Dashboard > Database > Tables');
    console.log('   2. Test /api/search endpoint to ensure it works correctly');
    console.log('   3. Set up scheduled refresh via REFRESH_MVS_INTERVAL_MS or cron job');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

