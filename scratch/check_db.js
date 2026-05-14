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
        const r = await pool.query('SELECT COUNT(*) FROM rentals');
        const d = await pool.query('SELECT COUNT(*) FROM delivery_boys');
        const i = await pool.query('SELECT COUNT(*) FROM items');
        const re = await pool.query('SELECT COUNT(*) FROM reviews');
        console.log({
            rentals: r.rows[0].count,
            delivery_boys: d.rows[0].count,
            items: i.rows[0].count,
            reviews: re.rows[0].count
        });
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
check();
