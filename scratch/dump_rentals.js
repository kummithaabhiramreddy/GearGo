const { Pool } = require('pg');
require('dotenv').config();

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

async function check() {
    try {
        const r = await pool.query('SELECT * FROM rentals LIMIT 5');
        console.log(JSON.stringify(r.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
check();
