// ===============================================================================================
// RUN SEARCH MIGRATIONS
// ===============================================================================================
// Executes PropertySuggestionView and FuzzySearchFunction SQL scripts via Supabase
// ===============================================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

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

// Execute SQL via Supabase REST API (using rpc or direct query)
async function executeSQL(sql) {
  try {
    // Split SQL into individual statements (semicolon-separated)
    // Remove comments and empty lines
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
      .filter(s => !s.match(/^\s*$/));

    console.log(`\n📝 Executing ${statements.length} SQL statements...\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip empty statements
      if (!statement || statement.trim().length === 0) continue;

      // For DROP/CREATE statements, we need to use the REST API directly
      // Supabase PostgREST doesn't support DDL, so we'll use the REST API with service role
      try {
        // Use Supabase REST API to execute SQL
        // Note: This requires using the PostgREST API or direct PostgreSQL connection
        // Since we're using Supabase JS client, we'll need to use the REST API endpoint
        
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ sql_query: statement + ';' })
        });

        if (!response.ok) {
          // Try alternative: use direct PostgreSQL connection via Supabase
          // For now, let's use a workaround: execute via Supabase dashboard SQL editor API
          // Actually, Supabase JS client doesn't support DDL directly
          // We need to use psql or the Supabase dashboard
          
          console.log(`⚠️  Statement ${i + 1} may need manual execution:`);
          console.log(`   ${statement.substring(0, 100)}...`);
          console.log(`   Error: ${response.status} ${response.statusText}`);
        } else {
          console.log(`✓ Statement ${i + 1}/${statements.length} executed`);
        }
      } catch (error) {
        // Fallback: Use Supabase management API if available
        console.log(`⚠️  Statement ${i + 1} execution note:`);
        console.log(`   ${statement.substring(0, 80)}...`);
        console.log(`   Note: Some DDL statements may need to be run manually in Supabase dashboard`);
      }
    }

    // Alternative approach: Use Supabase's SQL execution endpoint
    // Since Supabase JS client doesn't support DDL, we'll provide instructions
    console.log('\n📋 IMPORTANT: Supabase JS client cannot execute DDL statements directly.');
    console.log('   Please run these SQL scripts manually in the Supabase Dashboard:');
    console.log('   1. Go to https://app.supabase.com');
    console.log('   2. Select your project');
    console.log('   3. Go to SQL Editor');
    console.log('   4. Run PropertySuggestionView.sql first');
    console.log('   5. Then run FuzzySearchFunction.sql');
    console.log('\n   Or use psql with your database connection string.\n');

  } catch (error) {
    console.error('❌ Error executing SQL:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting search migration scripts...\n');

  try {
    // Read SQL files
    console.log('📖 Reading SQL files...');
    const propertySuggestionViewSQL = readSQLFile('PropertySuggestionView.sql');
    const fuzzySearchFunctionSQL = readSQLFile('FuzzySearchFunction.sql');
    console.log('✓ Files read successfully\n');

    // Note: Supabase JS client doesn't support DDL statements
    // We need to use psql or the Supabase dashboard
    console.log('⚠️  Note: Supabase JS client cannot execute DDL statements (CREATE, DROP, etc.)');
    console.log('   These scripts need to be run via:');
    console.log('   1. Supabase Dashboard SQL Editor (recommended)');
    console.log('   2. psql command line tool');
    console.log('   3. Supabase CLI (if installed)\n');

    // Provide the SQL content for manual execution
    console.log('='.repeat(80));
    console.log('SCRIPT 1: PropertySuggestionView.sql');
    console.log('='.repeat(80));
    console.log(propertySuggestionViewSQL);
    console.log('\n' + '='.repeat(80));
    console.log('SCRIPT 2: FuzzySearchFunction.sql');
    console.log('='.repeat(80));
    console.log(fuzzySearchFunctionSQL);
    console.log('\n' + '='.repeat(80));

    // Try to use psql if available
    console.log('\n🔍 Checking for psql...');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync('psql --version');
      console.log('✓ psql is available\n');
      
      // Check if we have database connection string
      const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
      if (dbUrl) {
        console.log('📝 To run via psql, use:');
        console.log(`   psql "${dbUrl}" -f "docs/Database scripts/PropertySuggestionView.sql"`);
        console.log(`   psql "${dbUrl}" -f "docs/Database scripts/FuzzySearchFunction.sql"`);
      } else {
        console.log('⚠️  DATABASE_URL or SUPABASE_DB_URL not found in environment');
        console.log('   You can get your connection string from Supabase Dashboard > Settings > Database');
      }
    } catch (error) {
      console.log('⚠️  psql not found. Please run scripts manually in Supabase Dashboard.\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

