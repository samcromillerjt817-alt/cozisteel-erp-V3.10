module.exports = {
  apps: [{
    name: 'cozisteel-erp',
    script: '.next/standalone/server.js',
    cwd: '/home/julio/cozisteel-erp',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: 'file:/home/julio/cozisteel-erp/data/cozisteel.db',
      NEXTAUTH_SECRET: 'gyRNHpBfQak8yF2nDRU7l0bjGPhFMTYtZZDSWcBpmWY',
      NEXTAUTH_URL: 'http://172.17.46.147:3000',
      STORAGE_PATH: '/home/julio/cozisteel-erp/storage',
      LOG_PATH: '/home/julio/cozisteel-erp/logs',
      BACKUP_PATH: '/home/julio/cozisteel-erp/storage/backups',
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    watch: false,
  }]
}
