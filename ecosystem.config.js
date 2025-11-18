/**
 * PM2 Ecosystem Configuration
 * Process Manager for Node.js - handles clustering, auto-restart, and monitoring
 * 
 * Usage:
 *   pm2 start ecosystem.config.js          # Start all apps
 *   pm2 start ecosystem.config.js --env production  # Start with production env
 *   pm2 stop all                           # Stop all
 *   pm2 restart all                        # Restart all
 *   pm2 delete all                         # Delete all from PM2
 *   pm2 logs                               # View logs
 *   pm2 monit                              # Monitor dashboard
 *   pm2 save                               # Save current process list
 *   pm2 startup                            # Generate startup script
 */

export default {
  apps: [
    {
      name: 'trreb-api',
      script: './index.js',
      cwd: './',
      instances: 1, // For now, single instance. Increase for clustering
      exec_mode: 'fork', // Use 'cluster' for multi-core if needed
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 8080,
        RUN_SYNC_ON_START: 'false' // Disable auto-sync in PM2 (use manual triggers or cron)
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
        RUN_SYNC_ON_START: 'false'
      },
      
      // Auto-restart settings
      autorestart: true,
      watch: false, // Set to true for development auto-reload (not recommended for production)
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // Prefix logs with timestamps
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced settings
      min_uptime: '10s', // Minimum uptime to consider app stable
      max_restarts: 10, // Max restarts in 1 minute
      restart_delay: 4000, // Wait 4s before restarting
      
      // Graceful shutdown (matches our graceful shutdown handlers)
      kill_timeout: 30000, // 30 seconds for graceful shutdown
      listen_timeout: 10000, // Wait 10s for app to start listening
      shutdown_with_message: true, // Send shutdown message
      
      // Node.js specific
      node_args: '--enable-source-maps', // Enable source maps for better error traces
      
      // Ignore watch patterns (if watch: true)
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log',
        '.git',
        'environment.env',
        'public',
        'docs'
      ]
    }
  ]
};

