// ===============================================================================================
// REFRESH PROPERTY SUGGESTION VIEW
// ===============================================================================================
// Forces refresh of PropertySuggestionView after schema changes
// ===============================================================================================

import { Client } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env.local' });
if (!process.env.PORT) {
  dotenv.config({ path: './environment.env' });
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

async function refreshPropertySuggestionView() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    console.log('🔄 Refreshing PropertySuggestionView...');
    console.log('  This may take a few moments...\n');
    
    try {
      // Try concurrent refresh first (non-blocking)
      await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertySuggestionView"`);
      console.log('✓ PropertySuggestionView refreshed (concurrent)');
    } catch (error) {
      // Fallback to non-concurrent refresh if concurrent fails
      console.log('  → Falling back to non-concurrent refresh...');
      await client.query(`REFRESH MATERIALIZED VIEW public."PropertySuggestionView"`);
      console.log('✓ PropertySuggestionView refreshed (non-concurrent)');
    }
    
    // Reload PostgREST schema cache
    try {
      await client.query(`NOTIFY pgrst, 'reload schema';`);
      console.log('✓ PostgREST schema cache reload notification sent');
    } catch (error) {
      console.warn('⚠ PostgREST schema reload error:', error.message);
      console.warn('  You may need to manually reload the schema cache in Supabase Dashboard');
    }
    
    console.log('\n✅ PropertySuggestionView refresh completed!');
    console.log('\n📝 Note: Search suggestions will now include all statuses (Sold, Expired, etc.)');
    
  } catch (error) {
    console.error('\n❌ Refresh failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

refreshPropertySuggestionView();

