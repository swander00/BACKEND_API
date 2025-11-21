// Test the fuzzy search function directly
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

async function testFuzzySearch() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    console.log('→ Testing search_property_suggestions with "331"...\n');
    
    const result = await client.query(
      `SELECT * FROM search_property_suggestions('331', 10)`
    );
    
    console.log(`📋 Found ${result.rows.length} results:\n`);
    result.rows.forEach((row, index) => {
      const addr = row.FullAddress?.toLowerCase() || '';
      const prefixMatch = addr.startsWith('331') ? '✅ PREFIX' : (addr.includes('331') ? '❌ SUBSTRING' : '❓ OTHER');
      console.log(`${index + 1}. ${prefixMatch} | ${row.FullAddress} (MLS: ${row.MLSNumber})`);
      console.log(`   Similarity: ${row.similarity_score?.toFixed(3) || 'N/A'}\n`);
    });
    
    // Check if prefix matches are first
    const prefixMatches = result.rows.filter(r => r.FullAddress?.toLowerCase().startsWith('331'));
    const substringMatches = result.rows.filter(r => !r.FullAddress?.toLowerCase().startsWith('331') && r.FullAddress?.toLowerCase().includes('331'));
    
    console.log(`\n📊 Summary:`);
    console.log(`   Prefix matches (start with "331"): ${prefixMatches.length}`);
    console.log(`   Substring matches (contain "331"): ${substringMatches.length}`);
    
    if (prefixMatches.length > 0 && substringMatches.length > 0) {
      const firstPrefixIndex = result.rows.findIndex(r => r.FullAddress?.toLowerCase().startsWith('331'));
      const firstSubstringIndex = result.rows.findIndex(r => !r.FullAddress?.toLowerCase().startsWith('331') && r.FullAddress?.toLowerCase().includes('331'));
      
      if (firstPrefixIndex < firstSubstringIndex) {
        console.log(`\n✅ SUCCESS: Prefix matches appear before substring matches!`);
      } else {
        console.log(`\n❌ ISSUE: Substring matches appear before prefix matches!`);
        console.log(`   First prefix match at index: ${firstPrefixIndex}`);
        console.log(`   First substring match at index: ${firstSubstringIndex}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

testFuzzySearch();

