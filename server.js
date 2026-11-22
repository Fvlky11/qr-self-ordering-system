const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = require('./config/db');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// =========================================================================
// HELPER & MIDDLEWARE AUTENTIKASI SESSION COOKIE (Tanpa Paket Eksternal)
// =========================================================================
function getSessionToken() {
    const user = (process.env.ADMIN_USER || 'admin').trim();
    const pass = (process.env.ADMIN_PASSWORD || 'admin123').trim();
    const secret = (process.env.MIDTRANS_SERVER_KEY || 'restoos-secret-key').trim();
    return crypto.createHmac('sha256', secret).update(`${user}:${pass}`).digest('hex');
}

function parseCookies(cookieHeader = '') {
    const cookies = {};
    cookieHeader.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx > -1) {
            cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
        }
    });
    return cookies;
}

function isAuthenticated(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.restoos_session || '';
    const expected = getSessionToken();
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Endpoint Login Staf
app.post('/api/auth/login', (req, res) => {
    const { username = '', password = '' } = req.body;
    const expectedUser = (process.env.ADMIN_USER || 'admin').trim();
    const expectedPass = (process.env.ADMIN_PASSWORD || 'admin123').trim();

    const u1 = Buffer.from(username.trim()), u2 = Buffer.from(expectedUser);
    const p1 = Buffer.from(password), p2 = Buffer.from(expectedPass);

    const validUser = u1.length === u2.length && crypto.timingSafeEqual(u1, u2);
    const validPass = p1.length === p2.length && crypto.timingSafeEqual(p1, p2);

    if (!validUser || !validPass) {
        return res.status(401).json({ error: 'Nama pengguna atau kata sandi salah.' });
    }

    const token = getSessionToken();
    const isProd = process.env.VERCEL === '1';
    res.setHeader(
        'Set-Cookie',
        `restoos_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${isProd ? '; Secure' : ''}`
    );
    res.json({ success: true });
});

// Endpoint Logout Staf
app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'restoos_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ success: true });
});

// Middleware Proteksi Rute Staf (Admin & Dapur)
app.use((req, res, next) => {
    const protectedPages = ['/', '/admin.html', '/kitchen.html'];
    const protectedApis = ['/api/admin', '/api/kitchen', '/api/tables'];

    if (protectedPages.includes(req.path)) {
        if (!isAuthenticated(req)) {
            const target = req.path === '/' ? '/admin.html' : req.path;
            return res.redirect(`/login.html?redirect=${encodeURIComponent(target)}`);
        }
        return next();
    }

    if (protectedApis.some(prefix => req.path.startsWith(prefix))) {
        if (!isAuthenticated(req)) {
            return res.status(401).json({ error: 'Sesi berakhir. Silakan login kembali.' });
        }
    }

    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.get('/', (req, res) => {
    res.redirect('/admin.html');
});

app.use('/api', orderRoutes);

io.on('connection', (socket) => {
    socket.on('join_kitchen', () => socket.join('kitchen_room'));
    socket.on('join_order', (orderCode) => socket.join(`order_${orderCode}`));
});

async function initDatabase() {
    try {
        const check = await pool.query("SELECT to_regclass('public.tables')");
        if (!check.rows[0].to_regclass) {
            const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
            await pool.query(schema);
            console.log('Tabel database dan data menu awal berhasil dibuat!');
        }
    } catch (err) {
        console.error('Database init warning:', err.message);
    }
}

initDatabase();

if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server aktif di http://localhost:${PORT}`);
    });
}

module.exports = app;