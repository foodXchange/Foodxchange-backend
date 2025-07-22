/**
 * PM2 Configuration for Production Deployment
 * Usage: pm2 start ecosystem.config.js --env production
 */

module.exports = {
  apps: [{
    name: 'foodxchange-api',
    script: './dist/server.js',
    instances: 'max', // Use all available CPU cores
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5000
    },
    
    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Advanced features
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    max_memory_restart: '1G',
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    
    // Graceful reload
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads', '.git'],
    
    // Health check
    health_check: {
      interval: 30000,
      timeout: 5000,
      max_consecutive_failures: 3
    },
    
    // Auto restart
    autorestart: true,
    min_uptime: '10s',
    max_restarts: 10,
    
    // Environment specific
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5000,
      instances: process.env.WEB_CONCURRENCY || 'max',
      exec_mode: 'cluster'
    }
  }],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: process.env.DEPLOY_HOST,
      ref: 'origin/main',
      repo: process.env.REPO_URL || 'git@github.com:yourusername/foodxchange-backend.git',
      path: '/var/www/foodxchange',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};