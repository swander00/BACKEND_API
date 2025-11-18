// ===============================================================================================
// FIX PropertyCardView ALIAS
// ===============================================================================================
// Creates PropertyCardView as an alias to PropertyView for backward compatibility
// This fixes the error: "Could not find the table 'public.PropertyCardView' in the schema cache"
// ===============================================================================================

import { Client } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

async function createPropertyCardViewAlias(client) {
  console.log('\n📋 Creating PropertyCardView alias...');
  
  // First, check if PropertyView exists
  const checkPropertyViewSQL = `
    SELECT EXISTS (
      SELECT FROM pg_matviews 
      WHERE schemaname = 'public' 
      AND matviewname = 'PropertyView'
    );
  `;
  
  const viewCheck = await client.query(checkPropertyViewSQL);
  if (!viewCheck.rows[0].exists) {
    console.error('❌ PropertyView does not exist. Please run setup-views.js first.');
    process.exit(1);
  }
  
  console.log('✓ PropertyView exists');
  
  // Drop PropertyCardView if it exists (could be a view or materialized view)
  console.log('  → Dropping existing PropertyCardView if it exists...');
  try {
    await client.query(`DROP MATERIALIZED VIEW IF EXISTS public."PropertyCardView" CASCADE;`);
  } catch (e) {
    // Ignore errors
  }
  try {
    await client.query(`DROP VIEW IF EXISTS public."PropertyCardView" CASCADE;`);
  } catch (e) {
    // Ignore errors
  }
  
  // Create PropertyCardView as a regular view (not materialized) that selects from PropertyView
  // This is more efficient than a materialized view for an alias
  const createViewSQL = `
    CREATE VIEW public."PropertyCardView" AS
    SELECT * FROM public."PropertyView";
  `;
  
  await client.query(createViewSQL);
  console.log('✓ PropertyCardView created as alias to PropertyView');
  
  // Grant permissions (same as PropertyView)
  try {
    await client.query(`GRANT SELECT ON public."PropertyCardView" TO anon, authenticated;`);
    console.log('✓ Permissions granted');
  } catch (e) {
    console.warn('⚠ Could not grant permissions:', e.message);
  }
}

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

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    // Create PropertyCardView alias
    await createPropertyCardViewAlias(client);
    
    // Reload PostgREST schema cache
    await reloadPostgRESTSchema(client);
    
    console.log('\n✅ PropertyCardView alias created successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Test API endpoints to ensure they work correctly');
    console.log('   2. PropertyCardView now points to PropertyView');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

