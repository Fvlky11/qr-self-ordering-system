require('dotenv').config({ override: true });
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const midtransClient = require('midtrans-client');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const snap = new midtransClient.Snap({
    isProduction: (process.env.MIDTRANS_IS_PRODUCTION || '').trim() === 'true',
    serverKey: (process.env.MIDTRANS_SERVER_KEY || '').trim(),
    clientKey: (process.env.MIDTRANS_CLIENT_KEY || '').trim()
});

// Ambil konfigurasi Client Key Midtrans untuk frontend
router.get('/config', (req, res) => {
    res.json({ clientKey: (process.env.MIDTRANS_CLIENT_KEY || '').trim() });
});

// ADMIN: Ambil semua meja beserta QR Code-nya
router.get('/tables', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tables ORDER BY table_number ASC');
        const tablesWithQr = await Promise.all(result.rows.map(async (t) => {
            const url = `${process.env.BASE_URL}/menu.html?table=${t.table_number}&token=${t.qr_token}`;
            const qrImage = await QRCode.toDataURL(url);
            return { ...t, orderUrl: url, qrImage };
        }));
        res.json(tablesWithQr);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Buat meja baru
router.post('/tables', async (req, res) => {
    const { table_number } = req.body;
    const qr_token = uuidv4();
    try {
        const result = await pool.query(
            'INSERT INTO tables (table_number, qr_token) VALUES ($1, $2) RETURNING *',
            [table_number, qr_token]
        );
        const orderUrl = `${process.env.BASE_URL}/menu.html?table=${table_number}&token=${qr_token}`;
        const qrImage = await QRCode.toDataURL(orderUrl);
        res.status(201).json({ ...result.rows[0], orderUrl, qrImage });
    } catch (err) {
        console.error('Error saat buat meja:', err);
        res.status(500).json({ error: err.message });
    }
});

// PELANGGAN: Validasi QR & Ambil Menu
router.get('/menu', async (req, res) => {
    const { table, token } = req.query;
    try {
        const tableCheck = await pool.query(
            'SELECT * FROM tables WHERE table_number = $1 AND qr_token = $2 AND is_active = true',
            [table, token]
        );
        if (tableCheck.rows.length === 0) {
            return res.status(403).json({ error: 'QR Code meja tidak valid.' });
        }
        const menu = await pool.query(`
            SELECT p.*, c.name AS category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.is_available = true 
            ORDER BY c.id, p.name
        `);
        res.json({ table: tableCheck.rows[0], products: menu.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PELANGGAN: Checkout & Generate Snap Token
router.post('/checkout', async (req, res) => {
    const { table_number, qr_token, customer_name, items } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const tableRes = await client.query(
            'SELECT id FROM tables WHERE table_number = $1 AND qr_token = $2',
            [table_number, qr_token]
        );
        if (tableRes.rows.length === 0) throw new Error('Meja tidak valid');
        const tableId = tableRes.rows[0].id;

        let totalAmount = 0;
        const itemDetails = [];

        for (const item of items) {
            const prodRes = await client.query('SELECT name, price FROM products WHERE id = $1', [item.product_id]);
            if (prodRes.rows.length === 0) throw new Error('Produk tidak ditemukan');
            const product = prodRes.rows[0];
            totalAmount += product.price * item.quantity;

            itemDetails.push({
                product_id: item.product_id,
                name: product.name,
                price: product.price,
                quantity: item.quantity,
                notes: item.notes || ''
            });
        }

        const orderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const orderRes = await client.query(
            `INSERT INTO orders (order_code, table_id, customer_name, total_amount) 
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [orderCode, tableId, customer_name, totalAmount]
        );
        const orderId = orderRes.rows[0].id;

        for (const detail of itemDetails) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderId, detail.product_id, detail.quantity, detail.price, detail.notes]
            );
        }

        const parameter = {
            transaction_details: { order_id: orderCode, gross_amount: totalAmount },
            customer_details: { first_name: customer_name },
            item_details: itemDetails.map(i => ({
                id: String(i.product_id),
                price: i.price,
                quantity: i.quantity,
                name: i.name
            }))
        };

        const transaction = await snap.createTransaction(parameter);
        await client.query('UPDATE orders SET snap_token = $1 WHERE id = $2', [transaction.token, orderId]);
        await client.query('COMMIT');

        res.json({ order_code: orderCode, snap_token: transaction.token });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// VERIFIKASI LANGSUNG DARI FRONTEND (Fallback jika webhook localhost belum aktif)
router.post('/orders/:orderCode/verify', async (req, res) => {
    const { orderCode } = req.params;
    try {
        const statusResponse = await snap.transaction.status(orderCode);
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        if ((transactionStatus === 'capture' || transactionStatus === 'settlement') && (fraudStatus === 'accept' || !fraudStatus)) {
            const updateRes = await pool.query(
                `UPDATE orders SET payment_status = 'paid', order_status = 'new' 
                 WHERE order_code = $1 AND payment_status != 'paid' RETURNING *`,
                [orderCode]
            );

            if (updateRes.rows.length > 0) {
                const fullOrder = await pool.query(`
                    SELECT o.id, o.order_code, o.customer_name, o.total_amount, o.order_status, o.created_at, t.table_number,
                           json_agg(json_build_object('name', p.name, 'quantity', oi.quantity, 'notes', oi.notes)) AS items
                    FROM orders o
                    JOIN tables t ON o.table_id = t.id
                    JOIN order_items oi ON o.id = oi.order_id
                    JOIN products p ON oi.product_id = p.id
                    WHERE o.id = $1
                    GROUP BY o.id, t.table_number
                `, [updateRes.rows[0].id]);

                req.io.to('kitchen_room').emit('new_paid_order', fullOrder.rows[0]);
            }
            return res.json({ status: 'paid' });
        }
        res.json({ status: transactionStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// MIDTRANS WEBHOOK: Konfirmasi Pembayaran Otomatis
router.post('/midtrans-webhook', async (req, res) => {
    try {
        const statusResponse = await snap.transaction.notification(req.body);
        const orderCode = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        let paymentStatus = 'pending';
        let orderStatus = 'waiting_payment';

        if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
            if (fraudStatus === 'accept' || !fraudStatus) {
                paymentStatus = 'paid';
                orderStatus = 'new';
            }
        } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
            paymentStatus = 'failed';
        }

        const updateRes = await pool.query(
            `UPDATE orders SET payment_status = $1, order_status = $2 WHERE order_code = $3 RETURNING *`,
            [paymentStatus, orderStatus, orderCode]
        );

        if (paymentStatus === 'paid' && updateRes.rows.length > 0) {
            const orderData = updateRes.rows[0];
            const fullOrder = await pool.query(`
                SELECT o.id, o.order_code, o.customer_name, o.total_amount, o.order_status, o.created_at, t.table_number,
                       json_agg(json_build_object('name', p.name, 'quantity', oi.quantity, 'notes', oi.notes)) AS items
                FROM orders o
                JOIN tables t ON o.table_id = t.id
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE o.id = $1
                GROUP BY o.id, t.table_number
            `, [orderData.id]);

            req.io.to('kitchen_room').emit('new_paid_order', fullOrder.rows[0]);
        }

        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send('Webhook Error');
    }
});

// DAPUR: Ambil daftar pesanan aktif (yang sudah lunas)
router.get('/kitchen/orders', async (req, res) => {
    try {
        const orders = await pool.query(`
            SELECT o.id, o.order_code, o.customer_name, o.total_amount, o.order_status, o.created_at, t.table_number,
                   json_agg(json_build_object('name', p.name, 'quantity', oi.quantity, 'notes', oi.notes)) AS items
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE o.payment_status = 'paid' AND o.order_status != 'served'
            GROUP BY o.id, t.table_number
            ORDER BY o.created_at ASC
        `);
        res.json(orders.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DAPUR: Update status masak -> selesai disajikan + kirim notifikasi real-time ke pelanggan
router.patch('/kitchen/orders/:id', async (req, res) => {
    const { status } = req.body; // 'cooking' atau 'served'
    try {
        const result = await pool.query(
            'UPDATE orders SET order_status = $1 WHERE id = $2 RETURNING order_code, order_status',
            [status, req.params.id]
        );
        if (result.rows.length > 0) {
            const { order_code, order_status } = result.rows[0];
            req.io.to(`order_${order_code}`).emit('order_status_updated', { order_status });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// PELANGGAN: Ambil Detail Struk & Status Pesanan
router.get('/orders/:orderCode', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.id, o.order_code, o.customer_name, o.total_amount, o.payment_status, o.order_status, o.created_at,
                   t.table_number, t.qr_token,
                   json_agg(json_build_object(
                       'name', p.name,
                       'quantity', oi.quantity,
                       'unit_price', oi.unit_price,
                       'notes', oi.notes
                   )) AS items
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE o.order_code = $1
            GROUP BY o.id, t.table_number, t.qr_token
        `, [req.params.orderCode]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ADMIN: Ambil semua kategori & daftar seluruh produk (termasuk yang stoknya habis)
router.get('/admin/products', async (req, res) => {
    try {
        const categories = await pool.query('SELECT * FROM categories ORDER BY id ASC');
        const products = await pool.query(`
            SELECT p.*, c.name AS category_name 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            ORDER BY p.id DESC
        `);
        res.json({ categories: categories.rows, products: products.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Tambah produk/menu baru
router.post('/admin/products', async (req, res) => {
    const { category_id, name, price, image_url } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO products (category_id, name, price, image_url, is_available) 
             VALUES ($1, $2, $3, $4, true) RETURNING *`,
            [category_id, name, price, image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Toggle status stok menu (Tersedia / Habis)
router.patch('/admin/products/:id/toggle', async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE products SET is_available = NOT is_available WHERE id = $1 RETURNING *',
            [req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Reset Token QR Meja (Keamanan agar link lama tidak bisa dipakai dari luar resto)
router.patch('/admin/tables/:id/reset-token', async (req, res) => {
    const newToken = uuidv4();
    try {
        const result = await pool.query(
            'UPDATE tables SET qr_token = $1 WHERE id = $2 RETURNING *',
            [newToken, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN: Laporan Penjualan & Ringkasan Omzet
router.get('/admin/reports', async (req, res) => {
    try {
        const summary = await pool.query(`
            SELECT 
                COUNT(*) AS total_orders,
                COALESCE(SUM(total_amount), 0) AS total_revenue
            FROM orders 
            WHERE payment_status = 'paid'
        `);

        const recentOrders = await pool.query(`
            SELECT o.order_code, o.customer_name, o.total_amount, o.order_status, o.created_at, t.table_number
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            WHERE o.payment_status = 'paid'
            ORDER BY o.created_at DESC
            LIMIT 20
        `);

        res.json({
            summary: summary.rows[0],
            recentOrders: recentOrders.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;