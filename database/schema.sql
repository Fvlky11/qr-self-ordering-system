-- Hapus tabel lama jika ada agar struktur sesuai dengan orderRoutes.js
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS tables CASCADE;

-- 1. Tabel Meja Restoran (memiliki kolom is_active)
CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    table_number VARCHAR(20) UNIQUE NOT NULL,
    qr_token VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Kategori Menu
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

-- 3. Tabel Produk / Menu
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Pesanan
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_code VARCHAR(50) UNIQUE NOT NULL,
    table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    total_amount INTEGER NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    order_status VARCHAR(20) DEFAULT 'waiting_payment',
    snap_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel Rincian Item Pesanan (memiliki kolom product_id)
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    notes TEXT
);

-- Data Awal Kategori & Menu
INSERT INTO categories (name) VALUES
('Makanan Utama'),
('Camilan'),
('Minuman');

INSERT INTO products (category_id, name, price, image_url, is_available) VALUES
(1, 'Nasi Goreng Spesial', 28000, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500', TRUE),
(1, 'Ayam Bakar Madu', 32000, 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500', TRUE),
(1, 'Mie Goreng Jawa', 25000, 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500', TRUE),
(2, 'Kentang Goreng Crispy', 18000, 'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=500', TRUE),
(3, 'Es Kopi Susu Gula Aren', 20000, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500', TRUE),
(3, 'Es Teh Leci Segar', 15000, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500', TRUE);