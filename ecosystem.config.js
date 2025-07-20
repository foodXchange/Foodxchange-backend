module.exports = {
  apps: [
    {
      name: 'foodxchange-backend-dev',
      script: './dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 5001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      
      // Advanced features
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      
      // Development features
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git', 'dist'],
      
      // Graceful start/shutdown
      wait_ready: true,
      listen_timeout: 3000,
      kill_timeout: 5000,
      
      // Auto restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Environment
      instance_var: 'INSTANCE_ID',
      
      // Monitoring
      pmx: true,
      automation: true,
      
      // Node.js arguments
      node_args: '--max-old-space-size=1024',
      
      // Interpreter
      interpreter: 'node',
      interpreter_args: '',
      
      // Working directory
      cwd: './',
      
      // Source map support
      source_map_support: true,
      
      // Merge logs
      merge_logs: true,
      
      // Log date format
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ],

  deploy: {
    development: {
      user: process.env.DEV_USER || 'deploy',
      host: process.env.DEV_HOST || 'localhost',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/foodxchange-backend.git',
      path: '/var/www/foodxchange-backend',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env development',
      'pre-setup': '',
      ssh_options: 'StrictHostKeyChecking=no',
      env: {
        NODE_ENV: 'development'
      }
    },
    
    staging: {
      user: process.env.STAGING_USER || 'deploy',
      host: process.env.STAGING_HOST || 'localhost',
      ref: 'origin/staging',
      repo: 'git@github.com:your-org/foodxchange-backend.git',
      path: '/var/www/foodxchange-backend',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      ssh_options: 'StrictHostKeyChecking=no',
      env: {
        NODE_ENV: 'staging'
      }
    },
    
    production: {
      user: process.env.PROD_USER || 'deploy',
      host: process.env.PROD_HOST || 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/foodxchange-backend.git',
      path: '/var/www/foodxchange-backend',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm ci --only=production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      ssh_options: 'StrictHostKeyChecking=no',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};