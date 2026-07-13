module.exports = {
  apps: [
    {
      name: 'pmp-backend',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      error_file: './logs/pmp-backend-error.log',
      out_file: './logs/pmp-backend-out.log',
      time: true,
    },
  ],
};
