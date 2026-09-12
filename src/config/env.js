module.exports = {
  port: process.env.PORT || 3000,
  appPasswordHash: process.env.APP_PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || '',
  dbHost: process.env.DB_HOST || 'localhost',
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: process.env.DB_NAME || 'ligrowtasks'
};
