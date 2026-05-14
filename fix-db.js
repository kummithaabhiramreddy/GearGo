const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    ssl: false
});
pool.query('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS verified VARCHAR(50)')
    .then(() => { console.log('✅ verified column added'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
