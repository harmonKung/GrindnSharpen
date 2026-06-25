import { Pool } from 'pg';
import dotenv from 'dotenv';
 
dotenv.config();

const useSsl =
  process.env.DB_SSL === 'true' ||
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.DATABASE_URL);

const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'grindnsharpen',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };
 
const pool = new Pool({
  ...connectionConfig,
  max: 20,                  // max pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
 
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});
 
export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);
 
export const getClient = () => pool.connect();
 
export default pool;
