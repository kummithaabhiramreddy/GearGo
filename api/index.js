require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { Pool } = require('pg');
const app = express();

// ── POSTGRESQL CONNECTION ──
// Supports DATABASE_URL (for cloud: Supabase, Neon, Vercel Postgres)
// OR individual DB_* variables (for local development)
const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.split('?')[0] : null;
const pool = dbUrl
    ? new Pool({ connectionString: dbUrl, ssl: true })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'admin123',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'rentplay',
    });

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT NOW()')
    .then(() => console.log('✅ PostgreSQL connected successfully'))
    .catch(err => console.error('❌ PostgreSQL connection failed:', err.message));

// Middleware setup
app.use(cors({
    origin: '*',
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    exposedHeaders: ['X-Backend']
}));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple Logger
app.use((req, res, next) => {
    res.setHeader('X-Backend', 'GearGo-Express-PG');
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// SMS Setup
const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const twilioNumber = (process.env.TWILIO_PHONE_NUMBER || '').trim();
const ownerPhoneNumber = (process.env.OWNER_PHONE_NUMBER || '+918185951564').trim();
const fast2smsKey = (process.env.FAST2SMS_API_KEY || '').trim();

let client = null;
if (accountSid && authToken) {
    client = twilio(accountSid, authToken);
}

async function sendSmsViaTwilio(message, toNumber = ownerPhoneNumber) {
    if (!client) return { success: false, provider: 'twilio', error: 'Twilio not configured' };
    if (!twilioNumber) return { success: false, provider: 'twilio', error: 'Twilio source number not configured' };
    try {
        await client.messages.create({ body: message, from: twilioNumber, to: toNumber });
        return { success: true, provider: 'twilio' };
    } catch (err) {
        console.error(`[SMS] Twilio failed: ${err.message}`);
        return { success: false, provider: 'twilio', error: err.message };
    }
}

// ── AUTH / OTP STORAGE (in-memory, fine for serverless) ──
let otps = {};
let resetTokens = {};

async function sendSmsAlert(message) {
    const twilioResult = await sendSmsViaTwilio(message);
    if (twilioResult.success) return twilioResult;
    if (fast2smsKey) {
        try {
            const phoneClean = ownerPhoneNumber.replace(/\D/g, '');
            const phone10 = phoneClean.length > 10 ? phoneClean.slice(-10) : phoneClean;
            const res = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
                route: 'q', message: message, numbers: phone10
            }, {
                headers: { 'authorization': fast2smsKey, 'Content-Type': 'application/json' }
            });
            if (res.data && res.data.return === true) return { success: true, provider: 'fast2sms' };
        } catch (err) { console.warn(`[SMS] Fast2SMS failed: ${err.message}`); }
    }
    return { success: false };
}

// ── EMAIL NOTIFICATION HELPER ──
const emailUser = process.env.EMAIL_USER || '';
const emailPass = process.env.EMAIL_PASS || '';

let mailTransporter = null;
if (emailUser && emailPass && !emailUser.includes('your-email')) {
    mailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: emailUser, pass: emailPass }
    });
}

async function sendStatusEmail(toEmail, itemName, status) {
    if (!toEmail || !mailTransporter) return;
    const isApproved = status === 'approved';
    const emoji = isApproved ? '✅' : '❌';
    const statusText = isApproved ? 'Approved' : 'Rejected';
    const color = isApproved ? '#10b981' : '#ef4444';
    const message = isApproved
        ? `Great news! Your item "${itemName}" has been approved and is now live on the GearGo marketplace.`
        : `We're sorry, your item "${itemName}" did not meet our listing criteria and has been rejected.`;
    const html = `<div style="font-family:'Segoe UI',sans-serif;max-width:500px;margin:auto;background:#0b0d12;border-radius:16px;overflow:hidden;border:1px solid #2a3143;padding:30px;color:#fff;">
        <h2 style="color:${color}">${statusText} ${emoji}</h2>
        <p>${message}</p>
        <p><b>Item:</b> ${itemName}</p>
    </div>`;
    try {
        await mailTransporter.sendMail({
            from: `"GearGo" <${emailUser}>`, to: toEmail,
            subject: `${emoji} Your item "${itemName}" has been ${statusText}`, html
        });
    } catch (err) { console.error(`[Email] Failed: ${err.message}`); }
}

async function sendBookingEmail(toEmail, userName, itemName, bookingId, totalPrice) {
    if (!toEmail || !mailTransporter) return;
    const html = `<div style="font-family:'Segoe UI',sans-serif;max-width:500px;margin:auto;background:#0b0d12;border-radius:16px;overflow:hidden;border:1px solid #2a3143;padding:30px;color:#fff;">
        <h2>Booking Confirmed ✅</h2>
        <p>Hello ${userName}, your order for <b>${itemName}</b> is confirmed.</p>
        <p><b>Booking ID:</b> #${bookingId}</p>
        <p><b>Total:</b> ${totalPrice}</p>
    </div>`;
    try {
        await mailTransporter.sendMail({
            from: `"GearGo" <${emailUser}>`, to: toEmail,
            subject: `✅ Booking Confirmed: ${itemName} (#${bookingId})`, html
        });
    } catch (err) { console.error(`[Email] Failed: ${err.message}`); }
}

// ══════════════════════════════════════════════════════════
//  API ROUTES — All using PostgreSQL
// ══════════════════════════════════════════════════════════

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

// ── SEARCH / ITEMS ──
app.get('/api/search', async (req, res) => {
    const query = (req.query.q || '').toLowerCase();
    const { storeId } = req.query;
    try {
        let sql = 'SELECT * FROM items WHERE 1=1';
        const params = [];
        let idx = 1;

        if (storeId && storeId !== 'null') {
            sql += ` AND store_id = $${idx++}`;
            params.push(storeId);
        }
        if (query) {
            sql += ` AND (LOWER(name) LIKE $${idx} OR LOWER(COALESCE(brand,'')) LIKE $${idx} OR LOWER(cat) LIKE $${idx})`;
            params.push(`%${query}%`);
            idx++;
        }
        sql += ' ORDER BY id DESC';

        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error("Search Error:", err.message);
        res.status(500).json([]);
    }
});

app.get('/api/items', async (req, res) => {
    const { storeId } = req.query;
    try {
        let sql = 'SELECT * FROM items';
        const params = [];
        if (storeId && storeId !== 'null') {
            sql += ' WHERE store_id = $1';
            params.push(storeId);
        }
        sql += ' ORDER BY id DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error("Items Error:", err.message);
        res.status(500).json([]);
    }
});

app.post('/api/add-item', async (req, res) => {
    const { name, cat, type, price, image, info, store_id } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO items (name, cat, type, price, image, info, store_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [name, cat || 'other', type || 'Single', parseInt(price) || 0, image, info, store_id || null]
        );
        res.json({ success: true, item: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── SCRAP / SELL ──
app.post('/api/sell-scrap', async (req, res) => {
    const { item_name, category, expected_price, condition, info, image, user_phone, user_email, store_id } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO scrap_requests (item_name, category, expected_price, item_condition, info, image, user_phone, user_email, store_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [item_name, category, parseInt(expected_price) || 0, condition, info, image, user_phone, user_email || null, store_id || null]
        );
        res.json({ success: true, item: rows[0], message: "Request submitted for admin review." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── ADMIN ENDPOINTS ──
app.get('/api/admin/scrap-requests', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM scrap_requests ORDER BY id DESC');
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/admin/scrap-requests/:id/approve', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: scrapRows } = await pool.query('SELECT * FROM scrap_requests WHERE id = $1', [id]);
        if (scrapRows.length === 0) return res.status(404).json({ success: false, message: 'Request not found.' });

        const reqData = scrapRows[0];
        await pool.query('UPDATE scrap_requests SET status = $1 WHERE id = $2', ['approved', id]);

        const { rows: itemRows } = await pool.query(
            `INSERT INTO items (name, cat, price, image, info, type, store_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [reqData.item_name, reqData.category, reqData.expected_price, reqData.image, reqData.info, 'User-Sale', reqData.store_id]
        );

        sendStatusEmail(reqData.user_email, reqData.item_name, 'approved');
        res.json({ success: true, item: itemRows[0] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/admin/scrap-requests/:id/reject', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query('SELECT * FROM scrap_requests WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Request not found.' });

        await pool.query('UPDATE scrap_requests SET status = $1 WHERE id = $2', ['rejected', id]);
        sendStatusEmail(rows[0].user_email, rows[0].item_name, 'rejected');
        res.json({ success: true, message: 'Request rejected.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── AUTH FLOW ENDPOINTS ──
app.post('/api/auth-flow/dispatch-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const token = Math.random().toString(36).substring(2, 15);
    otps[email] = { otp, expiry: Date.now() + 600000 };
    resetTokens[token] = { email, expiry: Date.now() + 3600000 };

    const resetLink = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;

    if (mailTransporter) {
        try {
            await mailTransporter.sendMail({
                from: `"GearGo" <${emailUser}>`, to: email,
                subject: 'Reset Your GearGo Password',
                html: `<div style="font-family:sans-serif;max-width:500px;padding:20px;border:1px solid #eee;border-radius:10px;">
                    <h2>Password Reset Request</h2>
                    <p>Click the button below to reset your password:</p>
                    <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#f0e040;color:#000;text-decoration:none;border-radius:5px;font-weight:bold;">Reset Password</a>
                    <p style="margin-top:20px;font-size:12px;color:#666;">Or use this code: <b>${otp}</b></p>
                </div>`
            });
            res.json({ success: true });
        } catch (err) {
            console.error('Email Error:', err);
            res.status(500).json({ success: false, message: 'Failed to send email' });
        }
    } else {
        res.json({ success: true, simulated: true, otp, token, link: resetLink });
    }
});

app.post('/api/auth-flow/confirm-otp', (req, res) => {
    const { email, otp } = req.body;
    const record = otps[email];
    if (record && record.otp === otp && record.expiry > Date.now()) {
        delete otps[email];
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }
});

app.post('/api/auth-flow/verify-token', (req, res) => {
    const { token } = req.body;
    const record = resetTokens[token];
    if (record && record.expiry > Date.now()) {
        res.json({ success: true, email: record.email });
    } else {
        res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
    }
});

// ── STORES ──
app.get('/api/stores', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM stores ORDER BY id');
        res.json(rows);
    } catch (err) { res.json([]); }
});

// ── BOOKINGS ──
app.post('/book', async (req, res) => {
    const { userName, userPhone, userEmail, itemName, address, price, days, bookingDate, bookingTime, bookingDay, paymentMode, signature } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO rentals (name, item, phone, address, price, days, booking_date, booking_time, booking_day, payment_mode, status, email, signature)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [userName, itemName, userPhone, address,
             parseInt(String(price).replace(/\D/g, '')) || 0,
             parseInt(days) || 1,
             bookingDate || null, bookingTime || null, bookingDay || null,
             paymentMode, 'pending', userEmail, signature]
        );
        const booking = rows[0];
        if (userEmail) sendBookingEmail(userEmail, userName, itemName, booking.id, price);
        res.json({ success: true, bookingId: booking.id });
    } catch (err) {
        console.error('Booking Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DB EXPLORER (generic table read) ──
app.get('/api/db/:table', async (req, res) => {
    const { table } = req.params;
    const allowed = ['rentals', 'items', 'delivery_boys', 'stores', 'reviews', 'scrap_requests', 'support_requests'];
    if (!allowed.includes(table)) return res.status(400).json({ error: 'Invalid table name' });
    try {
        const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

// ── DELIVERY BOYS ──
app.get('/api/delivery-boys', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM delivery_boys ORDER BY id DESC');
        res.json(rows);
    } catch (err) { res.json([]); }
});

app.get('/api/view-bookings', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM rentals ORDER BY id DESC');
        res.json(rows);
    } catch (err) { res.json([]); }
});

app.get('/api/reviews', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM reviews ORDER BY id DESC');
        res.json(rows);
    } catch (err) { res.json([]); }
});

app.get('/api/my-orders', async (req, res) => {
    const { phone, email } = req.query;
    try {
        const { rows } = await pool.query(
            'SELECT * FROM rentals WHERE phone = $1 OR email = $2 ORDER BY id DESC',
            [phone, email]
        );
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/reviews', async (req, res) => {
    const { name, city, category, title, body, rating, tags, helpful } = req.body;
    try {
        const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
        const { rows } = await pool.query(
            `INSERT INTO reviews (name, city, category, title, body, rating, tags, helpful)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [name, city, category, title, body, parseInt(rating) || 5, tagsStr, parseInt(helpful) || 0]
        );
        res.json({ success: true, reviewId: rows[0].id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/register-delivery', async (req, res) => {
    const b = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO delivery_boys (first_name, last_name, dob, gender, mobile, alternate_mobile, email, assigned_store_id, address, city, state, pincode, landmark, vehicle_type, vehicle_brand, vehicle_model, registration_number, year_of_manufacture, insurance_valid_until, fuel_type, ownership, work_type, experience, delivery_zones, time_slots, expected_salary, languages, emergency_name, emergency_relationship, emergency_mobile, bank_holder_name, account_number, ifsc_code, bank_name, upi_id, payment_preference, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37) RETURNING *`,
            [
                b.first_name || '', b.last_name || '', b.dob || null, b.gender || null,
                b.mobile, b.alternate_mobile || null, b.email || null, b.assigned_store_id || null,
                b.address || null, b.city || null, b.state || null, b.pincode || null, b.landmark || null,
                b.vehicle_type || null, b.vehicle_brand || null, b.vehicle_model || null,
                b.registration_number || null, b.year_of_manufacture ? parseInt(b.year_of_manufacture) : null,
                b.insurance_valid_until || null, b.fuel_type || null, b.ownership || null,
                b.work_type || null, b.experience || null, b.delivery_zones || null,
                b.time_slots || null, b.expected_salary ? parseInt(b.expected_salary) : null,
                b.languages || null, b.emergency_name || null, b.emergency_relationship || null,
                b.emergency_mobile || null, b.bank_holder_name || null, b.account_number || null,
                b.ifsc_code || null, b.bank_name || null, b.upi_id || null,
                b.payment_preference || null, 'active'
            ]
        );
        res.json({ success: true, partnerId: rows[0].id });
    } catch (err) {
        console.error('Register Delivery Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/delivery-requests', async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM rentals WHERE status = 'pending' ORDER BY id DESC");
        res.json(rows);
    } catch (err) { res.json([]); }
});

app.post('/api/accept-delivery/:id', async (req, res) => {
    const { id } = req.params;
    const { partnerName, partnerPhone } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE rentals SET status = 'assigned', delivery_boy_name = $1, delivery_boy_phone = $2
             WHERE id = $3 AND status = 'pending' RETURNING *`,
            [partnerName, partnerPhone, id]
        );
        if (rows.length > 0) {
            res.json({ success: true, order: rows[0] });
        } else {
            res.json({ success: false, message: 'Request already accepted or not found.' });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/my-trips', async (req, res) => {
    const { partnerId } = req.query;
    try {
        const { rows: boys } = await pool.query('SELECT * FROM delivery_boys WHERE id = $1', [partnerId]);
        if (boys.length === 0) return res.json([]);
        const { rows } = await pool.query(
            "SELECT * FROM rentals WHERE delivery_boy_phone = $1 AND status != 'delivered' ORDER BY id DESC",
            [boys[0].mobile]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/update-tracking/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const { rows } = await pool.query(
            'UPDATE rentals SET track_status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        if (rows.length > 0) res.json({ success: true, order: rows[0] });
        else res.status(404).json({ success: false });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/booking-status/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query('SELECT * FROM rentals WHERE id = $1', [id]);
        if (rows.length > 0) res.json(rows[0]);
        else res.status(404).json({ error: 'Not found' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── STATIC FILES ──
app.use(express.static(path.join(__dirname, '..')));

// ── START SERVER ──
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
