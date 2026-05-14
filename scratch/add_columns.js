const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.split('?')[0] : null;
const pool = dbUrl
    ? new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'admin123',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'rentplay',
    });

async function migrate() {
    try {
        console.log('🚀 Adding missing columns to rentals table...');
        await pool.query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS purchase_mode VARCHAR(50)');
        await pool.query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS condition VARCHAR(50)');
        await pool.query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS size VARCHAR(50)');
        console.log('✅ Columns added successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
