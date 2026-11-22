const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = require('./config/db');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
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

// Jalankan server lokal hanya jika tidak sedang berjalan di environment serverless Vercel
if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server aktif di http://localhost:${PORT}`);
    });
}

module.exports = app;