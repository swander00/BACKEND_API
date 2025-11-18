// ===============================================================================================
// VERIFY PARKING COLUMNS IN DATABASE VIEW
// ===============================================================================================
// Checks if PropertyView has the correct parking columns
// ===============================================================================================

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: './.env.local' });
if (!process.env.PORT) {
  dotenv.config({ path: './environment.env' });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyParkingColumns() {
  console.log('\n🔍 Verifying parking columns in PropertyView...\n');

  try {
    // Get a sample property to check column names
    // Use PropertyView (unified view) instead of PropertyDetailsView
    const { data, error } = await supabase
      .from('PropertyView')
      .select('ListingKey, GarageSpaces, CoveredSpaces, ParkingSpaces, ParkingTotal')
      .limit(1)
      .single();

    if (error) {
      console.error('❌ Error querying PropertyView:', error.message);
      console.log('\n📝 Possible issues:');
      console.log('   1. PropertyView might not exist');
      console.log('   2. PropertyView might need to be refreshed');
      console.log('   3. Column names might be different\n');
      return;
    }

    console.log('✅ PropertyView exists and is queryable\n');
    console.log('📊 Sample property parking data:');
    console.log('   ListingKey:', data.ListingKey);
    console.log('   GarageSpaces:', data.GarageSpaces);
    console.log('   CoveredSpaces:', data.CoveredSpaces);
    console.log('   ParkingSpaces:', data.ParkingSpaces);
    console.log('   ParkingTotal:', data.ParkingTotal);
    console.log('\n');

    // Check for null/undefined values
    const issues = [];
    if (data.GarageSpaces === null || data.GarageSpaces === undefined) {
      issues.push('GarageSpaces is null/undefined');
    }
    if (data.ParkingSpaces === null || data.ParkingSpaces === undefined) {
      issues.push('ParkingSpaces is null/undefined');
    }
    if (data.ParkingTotal === null || data.ParkingTotal === undefined) {
      issues.push('ParkingTotal is null/undefined');
    }

    if (issues.length > 0) {
      console.log('⚠️  Potential issues found:');
      issues.forEach(issue => console.log('   -', issue));
      console.log('\n📝 This might be normal if the property has no parking data');
    } else {
      console.log('✅ All parking columns have values');
    }

    console.log('\n💡 Expected mappings:');
    console.log('   Garage Spaces → CoveredSpaces (or GarageSpaces)');
    console.log('   Driveway Spaces → ParkingSpaces');
    console.log('   Total Parking → ParkingTotal\n');

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

verifyParkingColumns();

