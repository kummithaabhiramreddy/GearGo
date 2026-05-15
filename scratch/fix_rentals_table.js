require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function updateTable() {
    console.log('⏳ Updating rentals table in cloud...');
    try {
        await pool.query(`
            ALTER TABLE rentals 
            ADD COLUMN IF NOT EXISTS verified VARCHAR(50),
            ADD COLUMN IF NOT EXISTS purchase_mode VARCHAR(50) DEFAULT 'rent',
            ADD COLUMN IF NOT EXISTS condition VARCHAR(100),
            ADD COLUMN IF NOT EXISTS size VARCHAR(50);

            ALTER TABLE items
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS info TEXT,
            ADD COLUMN IF NOT EXISTS store_id INTEGER,
            ADD COLUMN IF NOT EXISTS user_uploaded BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS seller_phone VARCHAR(20),
            ADD COLUMN IF NOT EXISTS seller_email VARCHAR(100),
            ADD COLUMN IF NOT EXISTS condition VARCHAR(100);
        `);
        console.log('✅ Columns added successfully!');
    } catch (err) {
        console.error('❌ Error updating table:', err.message);
    } finally {
        await pool.end();
    }
}

updateTable();
