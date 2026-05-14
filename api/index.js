require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const app = express();

// ── POSTGRESQL CONNECTION ──
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

// Middleware
app.use(cors({ origin: '*', methods: 'GET,POST,PUT,DELETE,OPTIONS' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── STATIC WEBSITE SERVING ──
// 1. Serve files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// 2. Handle extension-less URLs (e.g. /search -> search.html)
app.get('/:page', (req, res, next) => {
    const page = req.params.page;
    if (page.includes('.') || page.startsWith('api')) return next();
    const filePath = path.join(__dirname, '../public', `${page}.html`);
    res.sendFile(filePath, (err) => {
        if (err) next();
    });
});

// ── EMAIL SETUP ──
const emailUser = process.env.EMAIL_USER || '';
const emailPass = process.env.EMAIL_PASS || '';
let mailTransporter = null;
if (emailUser && emailPass && !emailUser.includes('your-email')) {
    mailTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user: emailUser, pass: emailPass } });
}

async function sendBookingEmail(toEmail, userName, itemName, bookingId, totalPrice) {
    if (!toEmail || !mailTransporter) return;
    const html = `<div style="font-family:sans-serif;max-width:500px;margin:auto;background:#0b0d12;border-radius:16px;padding:30px;color:#fff;">
        <h2>Booking Confirmed ✅</h2>
        <p>Hello ${userName}, your order for <b>${itemName}</b> is confirmed.</p>
        <p><b>Booking ID:</b> #${bookingId}</p>
        <p><b>Total:</b> ${totalPrice}</p>
    </div>`;
    try { await mailTransporter.sendMail({ from: `"GearGo" <${emailUser}>`, to: toEmail, subject: `✅ Booking Confirmed: ${itemName}`, html }); } catch (err) { }
}

// ── API ROUTES ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'PostgreSQL' }));

app.get('/api/stats', async (_req, res) => {
    try {
        const [itemsRes, ridersRes] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM items'),
            pool.query('SELECT COUNT(*) FROM delivery_boys'),
        ]);
        res.json({
            itemsNearby: parseInt(itemsRes.rows[0].count) || 300,
            deliveryBoys: parseInt(ridersRes.rows[0].count) || 3,
            avgMins: 12,
        });
    } catch (err) {
        res.json({ itemsNearby: 300, deliveryBoys: 3, avgMins: 12 });
    }
});

app.get('/api/search', async (req, res) => {
    const query = (req.query.q || '').toLowerCase();
    const { storeId } = req.query;
    try {
        let sql = 'SELECT * FROM items WHERE 1=1';
        const params = [];
        let idx = 1;
        if (storeId && storeId !== 'null') { sql += ` AND store_id = $${idx++}`; params.push(storeId); }
        if (query) { sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(COALESCE(brand,'')) LIKE $${idx} OR LOWER(cat) LIKE $${idx})`; params.push(`%${query}%`); idx++; }
        sql += ' ORDER BY id DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.get('/api/items', async (req, res) => {
    const { storeId, cat } = req.query;
    try {
        let sql = 'SELECT * FROM items WHERE 1=1';
        const params = [];
        if (storeId && storeId !== 'null') { 
            params.push(storeId);
            sql += ` AND store_id = $${params.length}`; 
        }
        if (cat && cat !== 'all') {
            params.push(cat);
            sql += ` AND cat = $${params.length}`;
        }
        sql += ' ORDER BY id DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/items', async (req, res) => {
    const b = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO items (name, cat, type, price, image, emoji, description, info, user_uploaded, seller_phone, seller_email, condition, rating, reviews)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
            [b.name, b.cat, b.type || 'single', b.price, b.image, b.emoji || '📦', b.desc, b.info || '', true, b.seller_phone, b.seller_email, b.condition, 0, 0]
        );
        res.json({ success: true, id: rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/book', async (req, res) => {
    const b = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO rentals (name, item, phone, email, price, days, address, booking_date, booking_time, booking_day, payment_mode, signature, status, verified)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
            [b.userName, b.itemName, b.userPhone, b.userEmail, b.price, b.days, b.address, b.bookingDate, b.bookingTime, b.bookingDay, b.paymentMode, b.signature, b.status || 'pending', b.verified || null]
        );
        const bookingId = rows[0].id;
        // if (b.userEmail) await sendBookingEmail(b.userEmail, b.userName, b.itemName, bookingId, `₹${b.price}`);
        res.json({ success: true, bookingId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/view-bookings', async (_req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM rentals ORDER BY id DESC');
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.get('/api/delivery-boys', async (_req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM delivery_boys ORDER BY id DESC');
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/register-delivery', async (req, res) => {
    const b = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO delivery_boys (first_name, last_name, dob, gender, mobile, alternate_mobile, email, address, city, vehicle_type, vehicle_brand, vehicle_model, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [b.first_name, b.last_name, b.dob, b.gender, b.mobile, b.alternate_mobile, b.email, b.address, b.city, b.vehicle_type, b.vehicle_brand, b.vehicle_model, 'pending']
        );
        res.json({ success: true, partnerId: rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reviews', async (_req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM reviews ORDER BY id DESC');
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/reviews', async (req, res) => {
    const { name, city, category, title, body, rating } = req.body;
    try {
        const { rows } = await pool.query(
            'INSERT INTO reviews (name, city, category, title, body, rating) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [name, city, category, title, body, rating]
        );
        res.json({ success: true, id: rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Root fallback (Home page)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Export the app for Vercel
module.exports = app;

// Local dev support
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Master Server running on http://localhost:${PORT}`));
}
