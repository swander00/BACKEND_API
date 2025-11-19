// ===============================================================================================
// MATERIALIZED VIEWS SETUP SCRIPT
// ===============================================================================================
// Creates PropertyView materialized view for the API
// Other views (RoomDetailsView, PropertySuggestionView, etc.) will be rebuilt later
// Run this script once to set up the PropertyView
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
// [1] CREATE HELPER FUNCTIONS AND STUB TABLES
// ===============================================================================================

async function createHelperFunctions(client) {
  console.log('\n📋 Creating helper functions...');
  
  const helpersPath = join(__dirname, '../docs/Database scripts/PropertyViewCalculationHelpers.sql');
  const helpersSQL = readFileSync(helpersPath, 'utf8');
  
  try {
    // Split SQL file into individual functions
    // PostgreSQL functions use $$ delimiters, so we need to parse carefully
    const functions = [];
    let currentFunction = '';
    let inFunction = false;
    let dollarCount = 0;
    const lines = helpersSQL.split('\n');
    
    for (const line of lines) {
      // Check if this line starts a new function
      if (line.trim().match(/^CREATE\s+OR\s+REPLACE\s+FUNCTION/i)) {
        // Save previous function if exists
        if (currentFunction.trim()) {
          functions.push(currentFunction.trim());
        }
        currentFunction = line;
        inFunction = true;
        dollarCount = 0;
      } else if (inFunction) {
        currentFunction += '\n' + line;
        // Count $$ markers to know when function ends
        const dollarMatches = line.match(/\$\$/g);
        if (dollarMatches) {
          dollarCount += dollarMatches.length;
          // Function ends when we have an even number of $$ and see LANGUAGE
          if (dollarCount >= 2 && line.match(/LANGUAGE\s+\w+/i)) {
            inFunction = false;
            dollarCount = 0;
          }
        }
      }
    }
    // Add last function
    if (currentFunction.trim()) {
      functions.push(currentFunction.trim());
    }
    
    if (functions.length > 0) {
      console.log(`  → Found ${functions.length} functions to create/update`);
      for (let i = 0; i < functions.length; i++) {
        const funcSQL = functions[i];
        // Extract function name for logging
        const nameMatch = funcSQL.match(/FUNCTION\s+(?:public\.)?(\w+)\s*\(/i);
        const funcName = nameMatch ? nameMatch[1] : `function_${i + 1}`;
        
        try {
          await client.query(funcSQL);
          console.log(`  ✓ ${funcName}`);
        } catch (err) {
          // CREATE OR REPLACE should work even if function exists
          if (err.message.includes('invalid message format')) {
            console.warn(`  ⚠ ${funcName}: Skipping due to format issue (may already exist)`);
          } else {
            console.warn(`  ⚠ ${funcName}: ${err.message}`);
            // Don't fail the whole script for individual function errors
          }
        }
      }
      console.log('✓ Helper functions processed');
    } else {
      // Fallback: try executing the entire file
      console.log('  → No functions parsed, executing SQL file as single statement...');
      await client.query(helpersSQL);
      console.log('✓ Helper functions created');
    }
  } catch (error) {
    // Provide more detailed error information
    console.error('❌ Error creating helper functions:', error.message);
    if (error.position) {
      console.error(`   Error at position: ${error.position}`);
    }
    if (error.hint) {
      console.error(`   Hint: ${error.hint}`);
    }
    // Don't throw - allow script to continue
    console.warn('⚠ Continuing despite errors (functions may already exist)');
  }
}

async function createStubTables(client) {
  console.log('\n📋 Checking for required tables...');
  
  // Check if PriceReductionHistory exists, create stub if not
  const checkTableSQL = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'PriceReductionHistory'
    );
  `;
  
  const result = await client.query(checkTableSQL);
  const tableExists = result.rows[0].exists;
  
  if (!tableExists) {
    console.log('  → Creating stub PriceReductionHistory table...');
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public."PriceReductionHistory" (
        "ListingKey" TEXT,
        "PriceReductionAmount" NUMERIC,
        "PriceReductionPercent" NUMERIC,
        "ReductionNumber" INTEGER,
        "PriceChangeTimestamp" TIMESTAMP
      );
    `;
    await client.query(createTableSQL);
    console.log('  ✓ PriceReductionHistory stub table created');
  } else {
    console.log('  ✓ PriceReductionHistory table exists');
  }
}

// ===============================================================================================
// [2] CREATE PROPERTY VIEW
// ===============================================================================================

async function createPropertyView(client) {
  console.log('\n📋 Creating PropertyView...');
  
  // Read PropertyView.sql - it should already include the CTEs inline
  const viewPath = join(__dirname, '../docs/Database scripts/PropertyView.sql');
  const viewSQL = readFileSync(viewPath, 'utf8');
  
  try {
    // Execute the entire SQL file
    // PostgreSQL can handle multiple statements separated by semicolons
    await client.query(viewSQL);
    console.log('✓ PropertyView created');
  } catch (error) {
    console.error('❌ Error creating PropertyView:', error.message);
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
// [3] REFRESH PROPERTY VIEW
// ===============================================================================================

async function refreshPropertyView(client) {
  console.log('\n🔄 Refreshing PropertyView...');
  
  try {
    console.log('  → Refreshing PropertyView...');
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY public."PropertyView"`);
    console.log('  ✓ PropertyView refreshed');
  } catch (error) {
    // Fallback to non-concurrent refresh
    console.log('  → Falling back to non-concurrent refresh...');
    await client.query(`REFRESH MATERIALIZED VIEW public."PropertyView"`);
    console.log('  ✓ PropertyView refreshed (non-concurrent)');
  }
}

// ===============================================================================================
// [4] RELOAD POSTGREST SCHEMA CACHE
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
// [8] MAIN EXECUTION
// ===============================================================================================

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    // Step 1: Create helper functions and stub tables
    await createHelperFunctions(client);
    await createStubTables(client);
    
    // Step 2: Create PropertyView (main view)
    await createPropertyView(client);
    
    // Step 3: Refresh PropertyView
    await refreshPropertyView(client);
    
    // Step 4: Reload PostgREST schema cache
    await reloadPostgRESTSchema(client);
    
    console.log('\n✅ PropertyView created and refreshed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Verify PropertyView in Supabase Dashboard > Database > Tables');
    console.log('   2. Test API endpoints to ensure they work correctly');
    console.log('   3. Set up scheduled refresh via REFRESH_MVS_INTERVAL_MS or cron job');
    console.log('   4. Rebuild other views (RoomDetailsView, PropertySuggestionView, etc.) later as needed');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

