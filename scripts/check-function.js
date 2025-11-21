// Check if the function exists and its definition
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });
if (!process.env.PORT) {
  dotenv.config({ path: './environment.env' });
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL');
  process.exit(1);
}

async function checkFunction() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    // Check if function exists
    const funcCheck = await client.query(`
      SELECT 
        p.proname as function_name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'search_property_suggestions'
    `);
    
    if (funcCheck.rows.length === 0) {
      console.log('❌ Function search_property_suggestions does NOT exist!\n');
      console.log('You need to run the SQL script to create it.');
      return;
    }
    
    console.log('✓ Function exists\n');
    console.log('Function definition (first 500 chars):');
    console.log(funcCheck.rows[0].definition.substring(0, 500));
    console.log('...\n');
    
    // Try calling it with a simple test
    console.log('→ Testing function call...');
    try {
      const testResult = await client.query(`SELECT * FROM search_property_suggestions('331', 3)`);
      console.log(`✓ Function call successful! Returned ${testResult.rows.length} rows\n`);
      
      if (testResult.rows.length > 0) {
        console.log('First result:');
        console.log(`  Address: ${testResult.rows[0].FullAddress}`);
        console.log(`  MLS: ${testResult.rows[0].MLSNumber}`);
        console.log(`  Similarity: ${testResult.rows[0].similarity_score}`);
      }
    } catch (err) {
      console.log(`❌ Function call failed: ${err.message}`);
    }
    
  } catch (error) {
    console.error('\n❌ Check failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkFunction();

