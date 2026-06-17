import fs from 'fs';
import path from 'path';
import { query } from '../database';

async function migrate() {
  console.log('🔄 Running database migrations...');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await query(sql);
    console.log('✅ Migrations complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();