import { Pool } from 'pg';
import dotenv from 'dotenv';
 
dotenv.config();
 
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'grindnsharpen',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,                  // max pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});
 
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});
 
export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);
 
export const getClient = () => pool.connect();
 
export default pool;