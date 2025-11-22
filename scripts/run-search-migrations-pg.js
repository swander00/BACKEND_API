// ===============================================================================================
// RUN SEARCH MIGRATIONS VIA PG LIBRARY
// ===============================================================================================
// Executes PropertySuggestionView and FuzzySearchFunction SQL scripts via pg library
// ===============================================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import pg from 'pg';

const { Client } = pg;

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database connection string
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;

if (!dbUrl) {
  console.error('❌ Missing database connection string.');
  console.error('   Please set one of: DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL');
  console.error('\n   You can get it from:');
  console.error('   - Supabase Dashboard > Settings > Database > Connection string');
  console.error('   - Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres');
  process.exit(1);
}

// Read SQL file
function readSQLFile(filename) {
  const filePath = join(__dirname, '..', 'docs', 'Database scripts', filename);
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ Error reading file ${filename}:`, error.message);
    throw error;
  }
}

// Execute SQL file
async function executeSQLFile(client, filename) {
  const sql = readSQLFile(filename);
  
  console.log(`\n📝 Executing ${filename}...\n`);

  try {
    // Execute the entire SQL file
    await client.query(sql);
    console.log(`✓ ${filename} executed successfully\n`);
    return true;
  } catch (error) {
    console.error(`❌ Error executing ${filename}:`);
    console.error(`   ${error.message}`);
    if (error.position) {
      console.error(`   Position: ${error.position}`);
    }
    return false;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting search migration scripts via pg library...\n');
  console.log('📋 Connecting to database...');
  
  const client = new Client({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false // Supabase requires SSL
    }
  });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // Execute scripts in order
    console.log('='.repeat(80));
    console.log('STEP 1: Updating PropertySuggestionView');
    console.log('='.repeat(80));
    const step1Success = await executeSQLFile(client, 'PropertySuggestionView.sql');
    
    if (!step1Success) {
      console.error('❌ Step 1 failed. Stopping migration.');
      await client.end();
      process.exit(1);
    }

    console.log('='.repeat(80));
    console.log('STEP 2: Updating FuzzySearchFunction');
    console.log('='.repeat(80));
    const step2Success = await executeSQLFile(client, 'FuzzySearchFunction.sql');
    
    if (!step2Success) {
      console.error('❌ Step 2 failed.');
      await client.end();
      process.exit(1);
    }

    console.log('='.repeat(80));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(80));
    console.log('\n📝 Next steps:');
    console.log('   1. Test the search functionality in your application');
    console.log('   2. Verify search results include matches from all fields');
    console.log('   3. Check that PublicRemarks and Features are searched when address matches are exhausted\n');

    await client.end();
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (client) {
      await client.end().catch(() => {});
    }
    process.exit(1);
  }
}

main().catch(console.error);

