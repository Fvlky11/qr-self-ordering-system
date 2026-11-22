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
// SECURITY MIDDLEWARE: Proteksi Halaman & API Admin + Layar Dapur (KDS)
// =========================================================================
function requireStaffAuth(req, res, next) {
    const protectedPrefixes = [
        '/admin.html',
        '/kitchen.html',
        '/api/admin',
        '/api/kitchen',
        '/api/tables'
    ];

    const isProtected = req.path === '/' || protectedPrefixes.some(prefix => req.path.startsWith(prefix));
    if (!isProtected) return next();

    const expectedUser = (process.env.ADMIN_USER || 'admin').trim();
    const expectedPass = (process.env.ADMIN_PASSWORD || 'admin123').trim();

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="RestoOS Admin & Kitchen Area"');
        return res.status(401).send('Autentikasi diperlukan untuk mengakses halaman staf.');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const separatorIndex = credentials.indexOf(':');
    const user = separatorIndex !== -1 ? credentials.slice(0, separatorIndex) : '';
    const pass = separatorIndex !== -1 ? credentials.slice(separatorIndex + 1) : '';

    // Constant-time comparison untuk mencegah timing attack
    const userBuf = Buffer.from(user);
    const expUserBuf = Buffer.from(expectedUser);
    const passBuf = Buffer.from(pass);
    const expPassBuf = Buffer.from(expectedPass);

    const isUserValid = userBuf.length === expUserBuf.length && crypto.timingSafeEqual(userBuf, expUserBuf);
    const isPassValid = passBuf.length === expPassBuf.length && crypto.timingSafeEqual(passBuf, expPassBuf);

    if (!isUserValid || !isPassValid) {
        res.setHeader('WWW-Authenticate', 'Basic realm="RestoOS Admin & Kitchen Area"');
        return res.status(401).send('Username atau Password salah.');
    }

    next();
}

app.use(requireStaffAuth);
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