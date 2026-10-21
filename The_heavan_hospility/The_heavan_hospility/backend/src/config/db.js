const { Pool } = require('pg');
const schema = require('./schema');

const connectionString = (process.env.DATABASE_URL || '')
  .replace(/([?&])channel_binding=[^&]*&?/, '$1')
  .replace(/[?&]$/, '')
  .replace('sslmode=require', 'sslmode=verify-full');

const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30000 });

const connectDB = async () => {
  try {
    await pool.query(schema);
    console.log('PostgreSQL connected');
  } catch (error) {
    console.error('PostgreSQL connection failed:', error.message);
    throw error;
  }
};

module.exports = connectDB;
module.exports.pool = pool;
