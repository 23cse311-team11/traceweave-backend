import { Sequelize } from 'sequelize';
import config from './config.js'; 

// Initialize Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: config.env === 'development' ? (msg) => console.log(`[SQL] ${msg}`) : false, // Log SQL queries in development
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    }, // Connection pool settings
  }
);

export default sequelize;