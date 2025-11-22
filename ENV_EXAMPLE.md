# Environment Variables Example

Copy this content to create a `.env.local` file in the `BACKEND_API` directory.

```bash
# ===========================================
# BACKEND API ENVIRONMENT VARIABLES
# ===========================================
# 
# Copy this file to .env.local and fill in your actual values
# The backend will load .env.local first, then fallback to environment.env
#
# IMPORTANT: Never commit .env.local or environment.env to Git
# These files contain sensitive credentials
# ===========================================

# ===========================================
# REQUIRED - SUPABASE CONFIGURATION
# ===========================================
# Get these values from your Supabase project dashboard:
# https://app.supabase.com/project/_/settings/api

# Supabase Project URL
SUPABASE_URL=https://your-project.supabase.co

# Supabase Service Role Key (REQUIRED)
# This key bypasses Row Level Security - keep it secret!
# Never expose this to the frontend or client-side code
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ===========================================
# SERVER CONFIGURATION
# ===========================================

# Server Port (default: 8080)
PORT=8080

# Node Environment (development | production)
NODE_ENV=development

# ===========================================
# CORS CONFIGURATION
# ===========================================
# Comma-separated list of allowed origins for CORS
# In production, set this to your frontend URL(s)
# Example: https://your-app.vercel.app,https://www.yourdomain.com
# In development, localhost origins are automatically allowed

ALLOWED_ORIGINS=https://your-frontend.vercel.app

# ===========================================
# RATE LIMITING
# ===========================================
# Rate limit window in milliseconds (default: 60000 = 1 minute)
RATE_LIMIT_WINDOW_MS=60000

# Maximum requests per window (default: 120)
RATE_LIMIT_MAX=120

# ===========================================
# DATABASE CONFIGURATION
# ===========================================
# Direct database connection URL (optional, for scripts)
# Format: postgres://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
# Only needed for direct database access (not required for Supabase client)

DATABASE_URL=postgres://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# ===========================================
# EXTERNAL API KEYS
# ===========================================

# Google Maps API Key (for geocoding service)
# Get this from Google Cloud Console: https://console.cloud.google.com/google/maps-apis/credentials
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# OpenAI API Key (optional, for AI features)
# Get this from OpenAI: https://platform.openai.com/api-keys
OPENAI_API_KEY=your-openai-api-key

# ===========================================
# AMPRE RESO API CONFIGURATION
# ===========================================
# These are used for syncing property data from TRREB RESO API

# AMPRE API Token
AMPRE_API_TOKEN=your-ampre-api-token

# AMPRE API Base URL
AMPRE_API_URL=https://api.ampre.ca

# Rate limit for AMPRE API requests (requests per minute, default: 120)
AMPRE_RATE_LIMIT_PER_MINUTE=120

# ===========================================
# ADMIN & SECURITY
# ===========================================

# Admin token for admin endpoints (optional)
# Used for administrative operations like cache clearing
ADMIN_TOKEN=your-secure-admin-token-here

# ===========================================
# SYNC CONFIGURATION
# ===========================================

# Run sync on server start (true | false, default: false)
# Set to true to automatically sync properties when server starts
RUN_SYNC_ON_START=false

# Materialized view refresh interval in milliseconds (optional)
# If set, will automatically refresh materialized views at this interval
# Example: 3600000 = 1 hour
REFRESH_MVS_INTERVAL_MS=

# ===========================================
# LOGGING
# ===========================================

# Log level (ERROR | WARN | INFO | DEBUG, default: INFO)
LOG_LEVEL=INFO
```

## Setup Instructions

1. Copy the content above to a file named `.env.local` in the `BACKEND_API` directory
2. Replace all placeholder values with your actual credentials
3. Restart your server for changes to take effect

## Notes

- `.env.local` takes precedence over `environment.env`
- Never commit `.env.local` or `environment.env` to Git
- For production deployments (Railway), set these variables in the platform's environment settings
- The `SUPABASE_SERVICE_ROLE_KEY` is highly sensitive - never expose it to the frontend

