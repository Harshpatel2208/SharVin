/**
 * SharVin SaaS Platform - Production PM2 Process Manager Configuration
 * Designed for bare-metal, VPS, and cloud instance (AWS EC2 / DigitalOcean) deployment.
 */

module.exports = {
  apps: [
    {
      name: 'sharvin-server',
      script: './server/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/pm2-server-error.log',
      out_file: './logs/pm2-server-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
