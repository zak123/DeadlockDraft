module.exports = {
  apps: [
    {
      name: 'deadlock-draft-server',
      script: 'bun',
      args: 'run --cwd apps/server src/index.ts',
      cwd: '/var/www/deadlock-draft',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/var/www/deadlock-draft/logs/error.log',
      out_file: '/var/www/deadlock-draft/logs/out.log',
      log_file: '/var/www/deadlock-draft/logs/combined.log',
      time: true,
    },
  ],
};
