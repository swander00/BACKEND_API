// ===============================================================================================
// SUPABASE ADMIN CLIENT
// ===============================================================================================
// Server-side Supabase client with service role key for admin operations
// ===============================================================================================

import { createClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

let supabaseAdmin = null;

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase admin credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    logger.info('Supabase admin client initialized');
  }

  return supabaseAdmin;
}

// ===============================================================================================
// AUTH VERIFICATION HELPERS
// ===============================================================================================

/**
 * Verify JWT token and return user
 * @param {string} token - JWT token from Authorization header
 * @returns {Promise<{user: object, userId: string}>}
 */
export async function verifyAuthToken(token) {
  if (!token) {
    throw new Error('No token provided');
  }

  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid or expired token');
  }

  return { user, userId: user.id };
}

