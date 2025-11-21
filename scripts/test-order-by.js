// Test the ORDER BY logic directly
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });
if (!process.env.PORT) {
  dotenv.config({ path: './environment.env' });
}

const DATABASE_URL = process.env.DATABASE_URL;

async function testOrderBy() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    
    // Test the actual function results
    console.log('Testing search_property_suggestions ORDER BY...\n');
    
    const result = await client.query(`
      SELECT 
        "FullAddress",
        CASE 
          WHEN lower("FullAddress") LIKE '331%' THEN 4
          ELSE 7
        END as computed_priority
      FROM search_property_suggestions('331', 10)
    `);
    
    console.log(`Found ${result.rows.length} results:\n`);
    result.rows.forEach((row, i) => {
      const isPrefix = row.FullAddress?.toLowerCase().startsWith('331');
      const marker = isPrefix ? '✅ PREFIX' : '❌ SUBSTRING';
      console.log(`${i + 1}. ${marker} | Priority: ${row.computed_priority} | ${row.FullAddress}`);
    });
    
    // Check if prefix matches are first
    const prefixIndex = result.rows.findIndex(r => r.FullAddress?.toLowerCase().startsWith('331'));
    const substringIndex = result.rows.findIndex(r => !r.FullAddress?.toLowerCase().startsWith('331') && r.FullAddress?.toLowerCase().includes('331'));
    
    if (prefixIndex >= 0 && substringIndex >= 0) {
      if (prefixIndex < substringIndex) {
        console.log(`\n✅ Prefix matches come first (index ${prefixIndex} vs ${substringIndex})`);
      } else {
        console.log(`\n❌ PROBLEM: Substring matches come first (index ${substringIndex} vs ${prefixIndex})`);
        console.log('The ORDER BY in the function is not working correctly!');
      }
    }
    
    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testOrderBy();

