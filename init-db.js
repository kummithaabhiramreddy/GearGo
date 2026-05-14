/**
 * Database Initialization Script
 * Creates tables and migrates data from JSON files and hardcoded templates.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const fs = require('fs');

console.log('DB_URL:', process.env.DATABASE_URL ? 'PRESENT (Masked)' : 'MISSING');
const pool = process.env.DATABASE_URL 
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'admin123',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'rentplay',
        ssl: false
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
    description TEXT, info TEXT, store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    user_uploaded BOOLEAN DEFAULT FALSE, seller_phone VARCHAR(20), seller_email VARCHAR(100),
    condition VARCHAR(50)
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
    track_status VARCHAR(50), assigned_store_id INTEGER,
    verified VARCHAR(50),
    purchase_mode VARCHAR(50),
    condition VARCHAR(50),
    size VARCHAR(50)
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

const studentTemplates = [
    { name: "Scientific Calculator", type: "single", price: 50, emoji: "🖩", desc: "Advanced engineering calculator.", image: "https://laz-img-sg.alicdn.com/p/8bd51e27fc9b2b69540bf27556ebeb4d.jpg" },
    { name: "White Lab Apron", type: "single", price: 30, emoji: "🥼", desc: "Cotton lab coat for practicals.", image: "https://th.bing.com/th/id/OIP.JCwaMwsuJtmWNHfED7D1QwHaHa?w=179&h=200&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Khaki Uniform Pant", type: "single", price: 40, emoji: "👖", desc: "Standard student uniform trousers.", image: "https://th.bing.com/th/id/OIP.PMBvUHmVnIYwv0rMp0rCSgHaHa?w=202&h=202&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "School Shoes (Black)", type: "pair", price: 60, emoji: "👞", desc: "Formal black leather shoes.", image: "https://th.bing.com/th/id/OIP.A_1TcoU642h1DIK8ytyrJgHaHa?w=159&h=180&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Exam Study Pad", type: "single", price: 15, emoji: "📋", desc: "Hardboard exam writing pad.", image: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500" },
    { name: "Mini Drafter", type: "single", price: 45, emoji: "📐", desc: "Engineering drawing drafter.", image: "https://th.bing.com/th?q=Mini+Drafter+in+Board&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Geometry Box", type: "kit", price: 35, emoji: "✏️", desc: "Pencils, erasers, protractor, 3-sets, etc.", image: "https://th.bing.com/th?q=Most+Expensive+Geometry+Box&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Engineering Drawing Kit", type: "kit", price: 25, emoji: "📐", desc: "Geometry Box + Mini Drafter.", image: "https://th.bing.com/th?q=Technical+Drawing+Set+Mini+Drafter&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Canvas Board Set", type: "kit", price: 40, emoji: "🖼️", desc: "3 cotton canvas boards for paintings.", image: "https://th.bing.com/th/id/OIP.7FSmrVkRX6B_mcmhIg5rKgHaHa?w=203&h=203&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Water Colors Set", type: "kit", price: 30, emoji: "🎨", desc: "24-color artist palette.", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=500" },
    { name: "Mini Engineering Drawing Board", type: "single", price: 50, emoji: "📋", desc: "Mini wooden engineering drawing board.", image: "https://th.bing.com/th?q=Drafting+Machine&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Lab Eye Specs", type: "single", price: 15, emoji: "🥽", desc: "Protective eyewear for chemistry.", image: "https://th.bing.com/th?q=Lab+Safety+Glasses+Goggles&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Dissection Kit", type: "kit", price: 45, emoji: "✂️", desc: "Biology lab instruments (stainless steel).", image: "https://th.bing.com/th?q=Stainless+Steel+Dissection+Kit&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Molecular Model Kit", type: "kit", price: 40, emoji: "⚛️", desc: "Chemistry structure builder.", image: "https://th.bing.com/th?q=Molecular+Model+Kit+Chair+Structure&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Basic Calculator", type: "single", price: 20, emoji: "🖩", desc: "Standard 12-digit calculator.", image: "https://th.bing.com/th?q=What+Is+a+Basic+Calculator&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "White Uniform Shirt", type: "single", price: 35, emoji: "👕", desc: "Half-sleeve school shirt.", image: "https://th.bing.com/th/id/OIP.HKC65RoDYzghuZphtXapXAHaJD?w=156&h=190&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Canvas Shoes (White)", type: "single", price: 40, emoji: "👟", desc: "White sports shoes for PE.", image: "https://th.bing.com/th/id/OIP.muef-wNt03n3i47viQrNuwHaJQ?w=135&h=180&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Large Set Squares", type: "kit", price: 20, emoji: "📐", desc: "Pair of acrylic set squares.", image: "https://th.bing.com/th/id/OIP.C4R7S-HxEd-EOlQ4dYuLeQHaHa?w=160&h=180&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Square Ruler", type: "single", price: 25, emoji: "📏", desc: "Steel square for drafting.", image: "https://th.bing.com/th?q=L+Square+Ruler+for+Sewing&w=120&h=120&c=1&rs=1&qlt=70&o=7&cb=1&dpr=2&pid=InlineBlock&rm=3&mkt=en-IN&cc=IN&setlang=en&adlt=moderate&t=1&mw=247" },
    { name: "Steel Scale 12 inch", type: "single", price: 25, emoji: "📏", desc: "Steel scale for drafting.", image: "https://th.bing.com/th/id/OIP.A_1TcoU642h1DIK8ytyrJgHaHa?w=159&h=180&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Safety Gloves Lab", type: "kit", price: 15, emoji: "🧤", desc: "Nitrile disposable gloves.", image: "https://th.bing.com/th/id/OIP.GOheei689NgDNBw7cA7MqAHaHa?w=181&h=184&c=7&r=0&o=7&dpr=2&pid=1.7&rm=3" },
    { name: "Graphic Tablet Basic", type: "single", price: 80, emoji: "✍️", desc: "USB drawing pen tablet.", image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500" },
    { name: "Engineering Scale", type: "single", price: 15, emoji: "📏", desc: "Triangular architect scale.", image: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=500" },
    { name: "Wooden Exam Clipboard", type: "single", price: 10, emoji: "📋", desc: "Classic writing board.", image: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500" },
    { name: "Binder Notebook", type: "single", price: 20, emoji: "📓", desc: "Refillable ring binder.", image: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500" },
    { name: "Small Whiteboard", type: "single", price: 25, emoji: "📝", desc: "Dry erase practice board.", image: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500" },
    { name: "Dry Erase Markers", type: "kit", price: 15, emoji: "🖍️", desc: "Pack of 4 colors.", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=500" },
    { name: "Desk Organizer", type: "single", price: 20, emoji: "🗃️", desc: "Pen and stationery holder.", image: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500" },
    { name: "Student Backpack", type: "single", price: 45, emoji: "🎒", desc: "Spacious multi-compartment bag.", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500" },
    { name: "Study Lamp (LED)", type: "single", price: 35, emoji: "💡", desc: "Adjustable desk light.", image: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500" }
];

async function init() {
    console.log('🚀 Starting Database Initialization...');
    
    try {
        await pool.query(CREATE_TABLES);
        console.log('✅ Tables created successfully!');

        // 1. Migrate Items (from studentTemplates)
        const itemCountRes = await pool.query('SELECT COUNT(*) FROM items');
        if (parseInt(itemCountRes.rows[0].count) === 0) {
            console.log('📦 Seeding items...');
            for (const item of studentTemplates) {
                await pool.query(
                    'INSERT INTO items (name, cat, type, price, emoji, description, image, rating, reviews) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                    [item.name, 'student', item.type, item.price, item.emoji, item.desc, item.image, 4.8, 15]
                );
            }
            console.log('✅ Items seeded!');
        } else {
            console.log('⏭  Items already exist, skipping seed.');
        }

        // 2. Migrate Delivery Boys (from JSON)
        const dbPath = path.join(__dirname, 'data', 'delivery_boys.json');
        if (fs.existsSync(dbPath)) {
            const deliveryBoys = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            console.log(`🚚 Migrating ${deliveryBoys.length} delivery boys...`);
            for (const b of deliveryBoys) {
                try {
                    await pool.query(
                        `INSERT INTO delivery_boys (first_name, last_name, dob, gender, mobile, alternate_mobile, email, address, city, vehicle_type, vehicle_brand, vehicle_model, status, created_at)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (mobile) DO NOTHING`,
                        [b.first_name, b.last_name, b.dob || null, b.gender || '', b.mobile, b.alternate_mobile || '', b.email || null, b.address || '', b.city || '', b.vehicle_type || '', b.vehicle_brand || '', b.vehicle_model || '', b.status || 'active', b.created_at || new Date()]
                    );
                } catch (err) {
                    console.warn(`  ⚠ Skipped delivery boy ${b.mobile}: ${err.message}`);
                }
            }
            console.log('✅ Delivery boys migrated!');
        }

        // 3. Migrate Rentals (from JSON)
        const rentalsPath = path.join(__dirname, 'data', 'rentals.json');
        if (fs.existsSync(rentalsPath)) {
            const rentals = JSON.parse(fs.readFileSync(rentalsPath, 'utf8'));
            console.log(`📦 Migrating ${rentals.length} rentals...`);
            for (const r of rentals) {
                try {
                    await pool.query(
                        `INSERT INTO rentals (name, item, phone, price, days, address, payment_mode, status, booking_date, booking_time, booking_day, created_at, email, signature, verified)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
                        [r.name, r.item, r.phone, r.price, r.days, r.address, r.payment_mode || r.paymentMode || 'COD', r.status, r.booking_date, r.booking_time, r.booking_day, r.created_at, r.email, r.signature, r.verified || null]
                    );
                } catch (err) {
                    console.warn(`  ⚠ Skipped rental: ${err.message}`);
                }
            }
            console.log('✅ Rentals migrated!');
        }

        // 4. Migrate Reviews (from JSON)
        const reviewsPath = path.join(__dirname, 'data', 'reviews.json');
        if (fs.existsSync(reviewsPath)) {
            const reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));
            console.log(`⭐ Migrating ${reviews.length} reviews...`);
            for (const r of reviews) {
                try {
                    await pool.query(
                        `INSERT INTO reviews (name, city, category, title, body, rating, tags, helpful, created_at)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [r.name, r.city, r.category, r.title, r.body, r.rating, Array.isArray(r.tags) ? r.tags.join(',') : r.tags, r.helpful || 0, r.created_at]
                    );
                } catch (err) {
                    console.warn(`  ⚠ Skipped review: ${err.message}`);
                }
            }
            console.log('✅ Reviews migrated!');
        }

        console.log('\n🎉 Database Initialization Complete!');
    } catch (err) {
        console.error('❌ Initialization failed:', err);
    } finally {
        await pool.end();
    }
}

init();
