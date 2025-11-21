// Script to update the fuzzy search function in the database
// Run this after modifying FuzzySearchFunction.sql

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
  console.error('❌ Missing DATABASE_URL');
  process.exit(1);
}

async function updateFuzzySearchFunction() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✓ Connected to database\n');
    
    // Read the SQL file
    const sqlPath = join(__dirname, '../docs/Database scripts/FuzzySearchFunction.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    
    console.log('→ Updating search_property_suggestions function...');
    await client.query(sql);
    console.log('✓ Function updated successfully!\n');
    
    console.log('✅ Fuzzy search function updated successfully!');
    console.log('\n💡 Note: PropertySuggestionView does NOT need to be refreshed');
    console.log('   The function queries the view dynamically, so changes take effect immediately.');
    
  } catch (error) {
    console.error('\n❌ Failed to update function:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateFuzzySearchFunction();

