// Script to check actual MlsStatus values in PropertyView
import { initDB } from '../db/client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });
if (!process.env.SUPABASE_URL) {
  dotenv.config({ path: join(__dirname, '../environment.env') });
}

async function checkStatusValues() {
  const db = initDB();
  
  console.log('🔍 Checking MlsStatus values in PropertyView...\n');
  
  try {
    // Get distinct MlsStatus values
    const { data: statusData, error: statusError } = await db
      .from('PropertyView')
      .select('MlsStatus')
      .limit(10000);
    
    if (statusError) {
      console.error('Error fetching statuses:', statusError);
      return;
    }
    
    // Count occurrences of each status
    const statusCounts = {};
    statusData.forEach(record => {
      const status = record.MlsStatus;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    console.log('📊 Distinct MlsStatus values found:');
    console.log('=====================================\n');
    
    const sorted = Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1]);
    
    sorted.forEach(([status, count]) => {
      console.log(`${status.padEnd(40)} : ${count}`);
    });
    
    console.log(`\n📈 Total records checked: ${statusData.length}`);
    console.log(`📊 Unique status values: ${sorted.length}\n`);
    
    // Also check TransactionType values
    console.log('\n🔍 Checking TransactionType values...\n');
    const { data: transData, error: transError } = await db
      .from('PropertyView')
      .select('TransactionType')
      .limit(10000);
    
    if (!transError && transData) {
      const transCounts = {};
      transData.forEach(record => {
        const trans = record.TransactionType;
        transCounts[trans] = (transCounts[trans] || 0) + 1;
      });
      
      console.log('📊 Distinct TransactionType values:');
      console.log('=====================================\n');
      Object.entries(transCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([trans, count]) => {
          console.log(`${(trans || 'NULL').padEnd(40)} : ${count}`);
        });
    }
    
    // Check combination of MlsStatus and TransactionType for special cases
    console.log('\n🔍 Checking MlsStatus + TransactionType combinations...\n');
    const { data: comboData, error: comboError } = await db
      .from('PropertyView')
      .select('MlsStatus, TransactionType')
      .limit(10000);
    
    if (!comboError && comboData) {
      const comboCounts = {};
      comboData.forEach(record => {
        const key = `${record.MlsStatus} | ${record.TransactionType || 'NULL'}`;
        comboCounts[key] = (comboCounts[key] || 0) + 1;
      });
      
      console.log('📊 Top MlsStatus + TransactionType combinations:');
      console.log('==================================================\n');
      Object.entries(comboCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([combo, count]) => {
          console.log(`${combo.padEnd(60)} : ${count}`);
        });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

checkStatusValues();

