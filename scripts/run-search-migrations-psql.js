// ===============================================================================================
// RUN SEARCH MIGRATIONS VIA PSQL
// ===============================================================================================
// Executes PropertySuggestionView and FuzzySearchFunction SQL scripts via psql
// ===============================================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

// Execute SQL file via psql
async function executeSQLFile(filename) {
  const filePath = join(__dirname, '..', 'docs', 'Database scripts', filename);
  
  console.log(`\n📝 Executing ${filename}...`);
  console.log(`   File: ${filePath}\n`);

  try {
    // Use psql to execute the SQL file
    // -f flag executes the file
    // -v ON_ERROR_STOP=1 stops on first error
    const command = `psql "${dbUrl}" -f "${filePath}" -v ON_ERROR_STOP=1`;
    
    console.log('Running command...');
    const { stdout, stderr } = await execAsync(command);
    
    if (stdout) {
      console.log(stdout);
    }
    if (stderr && !stderr.includes('NOTICE')) {
      console.error('⚠️  Warnings:', stderr);
    }
    
    console.log(`✓ ${filename} executed successfully\n`);
    return true;
  } catch (error) {
    console.error(`❌ Error executing ${filename}:`);
    console.error(error.message);
    if (error.stdout) console.log('Stdout:', error.stdout);
    if (error.stderr) console.error('Stderr:', error.stderr);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting search migration scripts via psql...\n');
  console.log('📋 Database:', dbUrl.replace(/:[^:@]+@/, ':****@')); // Hide password

  try {
    // Check if psql is available
    try {
      await execAsync('psql --version');
      console.log('✓ psql is available\n');
    } catch (error) {
      console.error('❌ psql is not installed or not in PATH');
      console.error('   Please install PostgreSQL client tools');
      console.error('   Or run the SQL scripts manually in Supabase Dashboard SQL Editor');
      process.exit(1);
    }

    // Execute scripts in order
    console.log('='.repeat(80));
    console.log('STEP 1: Updating PropertySuggestionView');
    console.log('='.repeat(80));
    const step1Success = await executeSQLFile('PropertySuggestionView.sql');
    
    if (!step1Success) {
      console.error('❌ Step 1 failed. Stopping migration.');
      process.exit(1);
    }

    console.log('='.repeat(80));
    console.log('STEP 2: Updating FuzzySearchFunction');
    console.log('='.repeat(80));
    const step2Success = await executeSQLFile('FuzzySearchFunction.sql');
    
    if (!step2Success) {
      console.error('❌ Step 2 failed.');
      process.exit(1);
    }

    console.log('='.repeat(80));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(80));
    console.log('\n📝 Next steps:');
    console.log('   1. Test the search functionality in your application');
    console.log('   2. Verify search results include matches from all fields');
    console.log('   3. Check that PublicRemarks and Features are searched when address matches are exhausted\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

