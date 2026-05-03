require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');
const app = express();

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
    res.setHeader('X-Backend', 'GearGo-Express-Static');
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// SMS Setup
const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const twilioNumber = (process.env.TWILIO_PHONE_NUMBER || '').trim();
const ownerPhoneNumber = (process.env.OWNER_PHONE_NUMBER || '+918185951564').trim();
const fast2smsKey = (process.env.FAST2SMS_API_KEY || '').trim();
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').trim();

let client = null;
if (accountSid && authToken) {
    client = twilio(accountSid, authToken);
}

// ── LOCAL JSON STORAGE HELPERS ──
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function getData(file) {
    const filePath = path.join(DATA_DIR, `${file}.json`);
    if (!fs.existsSync(filePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`Error reading ${file}.json:`, e);
        return [];
    }
}

function saveData(file, data) {
    const filePath = path.join(DATA_DIR, `${file}.json`);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error(`Error saving ${file}.json:`, e);
        return false;
    }
}

async function sendSmsViaTwilio(message, toNumber = ownerPhoneNumber) {
    if (!client) {
        console.error('[SMS] Twilio client is not configured.');
        return { success: false, provider: 'twilio', error: 'Twilio not configured' };
    }
    if (!twilioNumber) {
        console.error('[SMS] Twilio source number is not configured.');
        return { success: false, provider: 'twilio', error: 'Twilio source number not configured' };
    }
    try {
        await client.messages.create({ body: message, from: twilioNumber, to: toNumber });
        console.log(`[SMS] Twilio Success.`);
        return { success: true, provider: 'twilio' };
    } catch (err) {
        console.error(`[SMS] Twilio failed: ${err.message}`);
        return { success: false, provider: 'twilio', error: err.message };
    }
}

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

// Fallback games list
const games = [
    { id: 1, emoji: '♟️', name: 'Chess Set Pro', brand: 'ChessKing™', cat: 'indoor', price: 149, rating: 4.9, avail: true, players: '2', age: '6+', deposit: 500 },
    { id: 2, emoji: '🎯', name: 'Carrom Board', brand: 'Precise™', cat: 'indoor', price: 179, rating: 4.8, avail: true, players: '4', age: '5+', deposit: 600 },
    { id: 3, emoji: '🎱', name: 'Mini Billiards Table', brand: 'BallRoom™', cat: 'indoor', price: 399, rating: 4.7, avail: false, players: '2-4', age: '12+', deposit: 1500 },
    { id: 4, emoji: '🎳', name: 'Bowling Set', brand: 'StrikeKing™', cat: 'indoor', price: 199, rating: 4.6, avail: true, players: '2-6', age: '5+', deposit: 700 },
    { id: 5, emoji: '🏓', name: 'Table Tennis Table', brand: 'Stag™', cat: 'indoor', price: 349, rating: 4.9, avail: true, players: '2-4', age: '7+', deposit: 1200 },
    { id: 6, emoji: '🎮', name: 'Air Hockey Table', brand: 'FunZone™', cat: 'indoor', price: 449, rating: 4.8, avail: true, players: '2', age: '6+', deposit: 1500 },
    { id: 7, emoji: '🎲', name: 'Giant Jenga', brand: 'WoodCraft™', cat: 'indoor', price: 149, rating: 4.7, avail: true, players: '2-8', age: '4+', deposit: 500 },
    { id: 8, emoji: '🃏', name: 'UNO Card Set', brand: 'Mattel™', cat: 'indoor', price: 99, rating: 4.9, avail: true, players: '2-10', age: '7+', deposit: 300 },
    { id: 9, emoji: '🎡', name: 'Foosball Table', brand: 'Champion™', cat: 'indoor', price: 399, rating: 4.8, avail: false, players: '2-4', age: '8+', deposit: 1400 },
    { id: 10, emoji: '🎰', name: 'Spin Top Battle Set', brand: 'SpinMaster™', cat: 'indoor', price: 129, rating: 4.6, avail: true, players: '2+', age: '5+', deposit: 400 },
    { id: 26, emoji: '⚽', name: 'Football (Size 5)', brand: 'Nivia™', cat: 'outdoor', price: 149, rating: 4.9, avail: true, players: '2-22', age: '5+', deposit: 500 },
    { id: 27, emoji: '🏸', name: 'Badminton Set (2 Rackets)', brand: 'Yonex™', cat: 'outdoor', price: 199, rating: 4.8, avail: true, players: '2-4', age: '7+', deposit: 700 },
    { id: 30, emoji: '🏏', name: 'Cricket Bat Full Size', brand: 'SG™', cat: 'outdoor', price: 229, rating: 4.8, avail: true, players: '2-22', age: '8+', deposit: 800 },
    { id: 31, emoji: '🏒', name: 'Cricket Set Full Kit', brand: 'MRF™', cat: 'outdoor', price: 349, rating: 4.9, avail: true, players: '2-22', age: '8+', deposit: 1200 },
    { id: 46, emoji: '🎲', name: 'Ludo Deluxe', brand: 'FunZone™', cat: 'board', price: 119, rating: 4.8, avail: true, players: '2-4', age: '5+', deposit: 400 },
    { id: 52, emoji: '💰', name: 'Monopoly Classic', brand: 'Hasbro™', cat: 'board', price: 149, rating: 4.9, avail: true, players: '2-8', age: '8+', deposit: 500 },
    { id: 81, emoji: '🎮', name: 'PlayStation 5', brand: 'Sony™', cat: 'console', price: 699, rating: 4.9, avail: true, players: '1-4', age: '12+', deposit: 3000 },
    { id: 92, emoji: '✈️', name: 'Drone DJI Mini 3', brand: 'DJI™', cat: 'toy', price: 599, rating: 4.9, avail: true, players: '1', age: '14+', deposit: 2500 }
];

app.get('/', (_req, res) => res.send('GearGo API (Static Mode) is Running!'));

app.get('/api/search', async (req, res) => {
    const query = (req.query.q || '').toLowerCase();
    const { storeId } = req.query;
    try {
        const items = getData('items');
        let filtered = items;

        if (storeId && storeId !== 'null') {
            filtered = filtered.filter(item => item.store_id == storeId);
        }

        if (query) {
            filtered = filtered.filter(item => 
                item.name?.toLowerCase().includes(query) || 
                item.brand?.toLowerCase().includes(query) || 
                item.cat?.toLowerCase().includes(query)
            );
        }

        if (filtered.length > 0) return res.json(filtered);
        if (storeId && storeId !== 'null') return res.json([]);
        
        // Fallback to static games array
        const fallback = games.filter(g => {
            return !query || g.name.toLowerCase().includes(query) || 
                   g.brand?.toLowerCase().includes(query) || 
                   g.cat?.toLowerCase().includes(query);
        });
        res.json(fallback);
    } catch (err) {
        console.error("Search Error:", err.message);
        res.json(games.filter(g => !query || g.name.toLowerCase().includes(query)));
    }
});

app.get('/api/items', async (req, res) => {
    const { storeId } = req.query;
    try {
        const items = getData('items');
        let filtered = items;
        if (storeId && storeId !== 'null') {
            filtered = filtered.filter(item => item.store_id == storeId);
        }
        if (filtered.length > 0) return res.json(filtered);
        res.json(games);
    } catch (err) { 
        res.json(games); 
    }
});

app.post('/api/add-item', (req, res) => {
    const { name, cat, type, indoor_outdoor, price, image, info, store_id } = req.body;
    try {
        const items = getData('items');
        const newItem = {
            id: Date.now(),
            name, cat, type, indoor_outdoor, 
            price: parseInt(price) || 0, 
            image, info, 
            store_id: store_id || null,
            created_at: new Date().toISOString()
        };
        items.push(newItem);
        saveData('items', items);
        res.json({ success: true, item: newItem });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/sell-scrap', (req, res) => {
    const { item_name, category, expected_price, condition, info, image, user_phone, user_email, store_id } = req.body;
    try {
        const scrap = getData('scrap');
        const newRequest = {
            id: Date.now(),
            item_name, category, 
            expected_price: parseInt(expected_price) || 0, 
            item_condition: condition, 
            info, image, user_phone, 
            user_email: user_email || null, 
            store_id: store_id || null, 
            status: 'pending',
            created_at: new Date().toISOString()
        };
        scrap.push(newRequest);
        saveData('scrap', scrap);
        res.json({ success: true, item: newRequest, message: "Request submitted for admin review." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

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
            from: `"GearGo" <${emailUser}>`,
            to: toEmail,
            subject: `${emoji} Your item "${itemName}" has been ${statusText}`,
            html: html
        });
    } catch (err) { console.error(`[Email] Failed to send: ${err.message}`); }
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
            from: `"GearGo" <${emailUser}>`,
            to: toEmail,
            subject: `✅ Booking Confirmed: ${itemName} (#${bookingId})`,
            html: html
        });
    } catch (err) { console.error(`[Email] Failed to send booking email: ${err.message}`); }
}

// ── ADMIN ENDPOINTS ──

app.get('/api/admin/scrap-requests', (req, res) => {
    res.json(getData('scrap'));
});

app.post('/api/admin/scrap-requests/:id/approve', (req, res) => {
    const { id } = req.params;
    try {
        const scrap = getData('scrap');
        const items = getData('items');
        const index = scrap.findIndex(r => r.id == id);
        if (index === -1) return res.status(404).json({ success: false, message: 'Request not found.' });
        
        const reqData = scrap[index];
        reqData.status = 'approved';
        
        const newItem = {
            id: Date.now(),
            name: reqData.item_name,
            cat: reqData.category,
            price: reqData.expected_price,
            image: reqData.image,
            info: reqData.info,
            type: 'User-Sale',
            store_id: reqData.store_id,
            created_at: new Date().toISOString()
        };
        items.push(newItem);
        
        saveData('scrap', scrap);
        saveData('items', items);
        sendStatusEmail(reqData.user_email, reqData.item_name, 'approved');
        res.json({ success: true, item: newItem });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/admin/scrap-requests/:id/reject', (req, res) => {
    const { id } = req.params;
    try {
        const scrap = getData('scrap');
        const index = scrap.findIndex(r => r.id == id);
        if (index === -1) return res.status(404).json({ success: false, message: 'Request not found.' });
        
        scrap[index].status = 'rejected';
        saveData('scrap', scrap);
        sendStatusEmail(scrap[index].user_email, scrap[index].item_name, 'rejected');
        res.json({ success: true, message: 'Request rejected.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/stores', (req, res) => {
    // Stores are now static in Search page.html, but we keep this for compatibility
    res.json([]);
});

app.post('/book', (req, res) => {
    const { userName, userPhone, userEmail, itemName, address, price, days, bookingDate, bookingTime, bookingDay, paymentMode, signature, lat, lng } = req.body;
    try {
        const rentals = getData('rentals');
        const newBooking = {
            id: req.body.id || Date.now(),
            name: userName, item: itemName, phone: userPhone, address, 
            price: parseInt(price.toString().replace(/\D/g,'')) || 0, 
            days: parseInt(days) || 1, 
            booking_date: bookingDate, booking_time: bookingTime, booking_day: bookingDay, 
            payment_mode: paymentMode, status: 'pending', email: userEmail, signature, lat, lng,
            created_at: new Date().toISOString()
        };
        rentals.push(newBooking);
        saveData('rentals', rentals);
        
        if (userEmail) sendBookingEmail(userEmail, userName, itemName, newBooking.id, price);
        res.json({ success: true, bookingId: newBooking.id });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/db/:table', (req, res) => {
    const { table } = req.params;
    res.json(getData(table));
});

app.get('/api/delivery-boys', (req, res) => {
    res.json(getData('delivery_boys'));
});

app.get('/api/view-bookings', (req, res) => {
    res.json(getData('rentals'));
});

app.get('/api/reviews', (req, res) => {
    res.json(getData('reviews'));
});

app.get('/api/my-orders', (req, res) => {
    const { phone, email } = req.query;
    try {
        const rentals = getData('rentals');
        const filtered = rentals.filter(r => r.phone == phone || (email && r.email == email));
        res.json(filtered);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/reviews', (req, res) => {
    try {
        const reviews = getData('reviews');
        const newReview = {
            id: Date.now(),
            ...req.body,
            created_at: new Date().toISOString()
        };
        reviews.push(newReview);
        saveData('reviews', reviews);
        res.json({ success: true, reviewId: newReview.id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/register-delivery', (req, res) => {
    try {
        const boys = getData('delivery_boys');
        const newBoy = { ...req.body, id: Date.now(), status: 'active', created_at: new Date().toISOString() };
        boys.push(newBoy);
        saveData('delivery_boys', boys);
        res.json({ success: true, partnerId: newBoy.id });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/delivery-requests', (req, res) => {
    const rentals = getData('rentals');
    res.json(rentals.filter(r => r.status === 'pending'));
});

app.post('/api/accept-delivery/:id', (req, res) => {
    const { id } = req.params;
    const { partnerName, partnerPhone } = req.body;
    try {
        const rentals = getData('rentals');
        const index = rentals.findIndex(r => r.id == id);
        if (index !== -1 && rentals[index].status === 'pending') {
            rentals[index].status = 'assigned';
            rentals[index].delivery_boy_name = partnerName;
            rentals[index].delivery_boy_phone = partnerPhone;
            saveData('rentals', rentals);
            res.json({ success: true, order: rentals[index] });
        } else {
            res.json({ success: false, message: 'Request already accepted or not found.' });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/my-trips', (req, res) => {
    const { partnerId } = req.query;
    try {
        const boys = getData('delivery_boys');
        const boy = boys.find(b => b.id == partnerId);
        if (!boy) return res.json([]);
        const rentals = getData('rentals');
        res.json(rentals.filter(r => r.delivery_boy_phone === boy.mobile && r.status !== 'delivered'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/update-tracking/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const rentals = getData('rentals');
        const index = rentals.findIndex(r => r.id == id);
        if (index !== -1) {
            rentals[index].track_status = status;
            saveData('rentals', rentals);
            res.json({ success: true, order: rentals[index] });
        } else res.status(404).json({ success: false });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/booking-status/:id', (req, res) => {
    const { id } = req.params;
    const rentals = getData('rentals');
    const order = rentals.find(r => r.id == id);
    if (order) res.json(order);
    else res.status(404).json({ error: 'Not found' });
});

app.use(express.static('./'));

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
