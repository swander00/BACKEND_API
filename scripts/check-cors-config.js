#!/usr/bin/env node
/**
 * Check CORS configuration
 * 
 * This script helps verify that CORS is properly configured for production.
 * Run this locally or check Railway logs to see if ALLOWED_ORIGINS is set.
 */

import dotenv from 'dotenv';

// Try to load environment variables
const envLocalResult = dotenv.config({ path: './.env.local' });
if (envLocalResult.error && envLocalResult.error.code !== 'ENOENT') {
  console.log('Warning: Could not load .env.local:', envLocalResult.error.message);
}
if (!process.env.PORT && !process.env.SUPABASE_URL) {
  const envResult = dotenv.config({ path: './environment.env' });
  if (envResult.error && envResult.error.code !== 'ENOENT') {
    console.log('Warning: Could not load environment.env:', envResult.error.message);
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

console.log('\n=== CORS Configuration Check ===\n');
console.log(`Environment: ${nodeEnv}`);
console.log(`Allowed Origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'NONE CONFIGURED'}\n`);

if (nodeEnv === 'production') {
  if (allowedOrigins.length === 0) {
    console.error('❌ ERROR: ALLOWED_ORIGINS is not set in production!');
    console.error('\nTo fix this:');
    console.error('1. Go to Railway Dashboard → Your Project → Variables');
    console.error('2. Add environment variable:');
    console.error('   ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app');
    console.error('\nFor multiple origins (comma-separated, no spaces):');
    console.error('   ALLOWED_ORIGINS=https://frontend-api-pi.vercel.app,https://www.yourdomain.com');
    console.error('\n3. Railway will automatically redeploy after adding the variable\n');
    process.exit(1);
  } else {
    console.log('✅ CORS configuration looks good!');
    console.log(`   Allowing requests from: ${allowedOrigins.join(', ')}\n`);
  }
} else {
  console.log('ℹ️  Development mode: localhost origins are automatically allowed');
  if (allowedOrigins.length > 0) {
    console.log(`   Additional allowed origins: ${allowedOrigins.join(', ')}\n`);
  }
}

process.exit(0);

