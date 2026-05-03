/**
 * Migration Script: Local PostgreSQL → Neon Cloud
 * Creates tables and copies all data
 */
require('dotenv').config();
const { Pool } = require('pg');

const LOCAL = new Pool({
    user: 'postgres', password: 'admin123',
    host: 'localhost', port: 5432, database: 'rentplay'
});

const CLOUD_URL = 'postgresql://neondb_owner:npg_lYhfr5ON3MIc@ep-rough-mode-an2e2fkx-pooler.c-6.us-east-1.aws.neon.tech/neondb';

const CLOUD = new Pool({
    connectionString: CLOUD_URL,
    ssl: true
});

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100), location VARCHAR(150),
    lat NUMERIC(10,8), lng NUMERIC(11,8),
    contact VARCHAR(20), status VARCHAR(20) DEFAULT 'active',
    city VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, cat VARCHAR(50) NOT NULL,
    type VARCHAR(50) DEFAULT 'Single', price INTEGER NOT NULL,
    image TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    brand VARCHAR(100), rating NUMERIC(3,1), avail BOOLEAN DEFAULT TRUE,
    players VARCHAR(50), age VARCHAR(20), deposit INTEGER,
    emoji VARCHAR(20), reviews INTEGER DEFAULT 0,
    description TEXT, info TEXT, store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rentals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100), item VARCHAR(100), phone VARCHAR(20),
    price INTEGER, days INTEGER, address TEXT,
    payment_mode VARCHAR(50), status VARCHAR(20) DEFAULT 'pending',
    booking_date DATE, booking_time TIME, booking_day VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email VARCHAR(255), signature TEXT,
    delivery_boy_name VARCHAR(100), delivery_boy_phone VARCHAR(20),
    track_status VARCHAR(50), assigned_store_id INTEGER
);

CREATE TABLE IF NOT EXISTS delivery_boys (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100) NOT NULL,
    dob DATE, gender VARCHAR(20), mobile VARCHAR(20) NOT NULL UNIQUE,
    alternate_mobile VARCHAR(20), email VARCHAR(100) UNIQUE,
    assigned_store_id INTEGER, address TEXT,
    city VARCHAR(100), state VARCHAR(100), pincode VARCHAR(20), landmark VARCHAR(150),
    vehicle_type VARCHAR(50), vehicle_brand VARCHAR(100), vehicle_model VARCHAR(100),
    registration_number VARCHAR(50), year_of_manufacture INTEGER,
    insurance_valid_until DATE, fuel_type VARCHAR(50), ownership VARCHAR(50),
    work_type VARCHAR(50), experience VARCHAR(100),
    delivery_zones TEXT, time_slots TEXT, expected_salary INTEGER, languages TEXT,
    emergency_name VARCHAR(100), emergency_relationship VARCHAR(50), emergency_mobile VARCHAR(20),
    bank_holder_name VARCHAR(100), account_number VARCHAR(50), ifsc_code VARCHAR(50),
    bank_name VARCHAR(100), upi_id VARCHAR(100), payment_preference VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, city VARCHAR(100),
    category VARCHAR(100), title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL, rating INTEGER NOT NULL,
    tags TEXT, helpful INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scrap_requests (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(100) NOT NULL, category VARCHAR(50) NOT NULL,
    expected_price INTEGER, item_condition VARCHAR(50),
    info TEXT, image TEXT, user_phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_email VARCHAR(100), store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_requests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, email VARCHAR(100) NOT NULL,
    subject VARCHAR(200), message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    phone VARCHAR(20)
);
`;

async function migrate() {
    console.log('🔗 Connecting to Neon cloud...');
    try {
        await CLOUD.query('SELECT NOW()');
        console.log('✅ Connected to Neon!');
    } catch (err) {
        console.error('❌ Cannot connect to Neon:', err.message);
        process.exit(1);
    }

    console.log('\n📦 Creating tables on Neon...');
    await CLOUD.query(CREATE_TABLES);
    console.log('✅ All tables created!');

    // Migrate each table
    const tables = ['stores', 'items', 'rentals', 'delivery_boys', 'reviews', 'scrap_requests', 'support_requests'];

    for (const table of tables) {
        try {
            const { rows } = await LOCAL.query(`SELECT * FROM ${table}`);
            if (rows.length === 0) {
                console.log(`⏭  ${table}: 0 rows (skipped)`);
                continue;
            }

            // Clear existing data in cloud
            await CLOUD.query(`DELETE FROM ${table}`);

            const cols = Object.keys(rows[0]);
            const colList = cols.join(', ');

            let inserted = 0;
            for (const row of rows) {
                const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
                const values = cols.map(c => {
                    const v = row[c];
                    // Convert arrays to comma-separated string
                    if (Array.isArray(v)) return v.join(',');
                    return v;
                });
                try {
                    await CLOUD.query(`INSERT INTO ${table} (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING`, values);
                    inserted++;
                } catch (e) {
                    // Skip rows that cause conflicts (like duplicate unique keys)
                    console.warn(`  ⚠ Skipped row in ${table}: ${e.message.substring(0, 80)}`);
                }
            }
            
            // Reset sequence to max id
            try {
                await CLOUD.query(`SELECT setval('${table}_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${table}), true)`);
            } catch (e) { /* sequence might not exist */ }

            console.log(`✅ ${table}: ${inserted}/${rows.length} rows migrated`);
        } catch (err) {
            console.error(`❌ ${table}: ${err.message}`);
        }
    }

    console.log('\n🎉 Migration complete!');
    await LOCAL.end();
    await CLOUD.end();
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
