// ===============================================================================================
// POSTGREST SCHEMA RELOAD SCRIPT
// ===============================================================================================
// Reloads PostgREST schema cache to pick up new views/tables
// Run this after creating or modifying database views
// ===============================================================================================

import dotenv from 'dotenv';
import { Client } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables from .env.local (preferred) or fallback to environment.env
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = path.join(projectRoot, 'environment.env');

const envLocalResult = dotenv.config({ path: envLocalPath });
if (envLocalResult.error) {
  const envResult = dotenv.config({ path: envPath });
  if (envResult.error) {
    console.error('Warning: Could not load environment.env:', envResult.error.message);
  }
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

async function reloadSchema() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log('→ Reloading PostgREST schema cache...');
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log('✓ Schema cache reload notification sent');
    console.log('  Note: PostgREST should reload within a few seconds');
  } catch (err) {
    console.error('✗ Failed to reload schema:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

reloadSchema().catch(err => {
  console.error(err);
  process.exit(1);
});

