# RestoOS — QR Self-Ordering System & Kitchen Display (KDS)

Aplikasi web *full-stack* pemesanan mandiri restoran berbasis QR Code meja dengan arsitektur **Pay-First**, terintegrasi dengan **Midtrans Snap Payment Gateway**, **PostgreSQL (Neon.tech)**, serta **Kitchen Display System (KDS)** yang tersinkronisasi secara *real-time*.

🔗 **Live Demo:** [https://qr-self-ordering-system.vercel.app](https://qr-self-ordering-system.vercel.app)

---

## Fitur Utama

### 1. Pelanggan (Scan QR Meja — Tanpa Login)
- **Akses Instan via QR Code:** Validasi nomor meja dan token unik otomatis saat pelanggan memindai QR Code.
- **Pencarian & Filter Kategori Real-Time:** Pencarian menu cepat tanpa *reload* halaman dilengkapi ringkasan keranjang (*drawer modal*) dan catatan khusus per item.
- **Pembayaran Digital (Midtrans Snap):** Mendukung pembayaran QRIS, Virtual Account, dan E-Wallet dengan verifikasi otomatis.
- **Pelacakan Status Pesanan & Struk Digital:** Indikator progres langsung (*Diterima* $\rightarrow$ *Dimasak* $\rightarrow$ *Diantar*) yang terhubung dengan layar dapur.

### 2. Dapur / Kitchen Display System (`/kitchen.html`)
- **Antrean Pesanan Lunas Real-Time:** Pesanan otomatis muncul begitu pembayaran terkonfirmasi menggunakan Socket.io dan *polling fallback*.
- **Manajemen Status Masak:** Pembaruan status satu klik (*Mulai Masak* & *Selesai & Antar*) dengan tampilan layar gelap (*Dark KDS*) yang nyaman dibaca staf dapur.

### 3. Admin & Manajemen Restoran (`/admin.html`)
- **Portal Login Staf & Keamanan Sesi:** Dilindungi halaman autentikasi khusus (`/login.html`) dengan *Signed HttpOnly Cookie* dan komparasi kredensial *constant-time*.
- **Generator & Reset Token QR Meja:** Pembuatan QR Code dinamis per meja serta fitur *Reset Token* untuk mencegah penyalahgunaan tautan dari luar restoran.
- **Manajemen Katalog Menu:** Penambahan menu dengan unggah foto wajib terkompresi otomatis di sisi klien, pemformatan harga Rupiah otomatis, serta *toggle* status stok instan.
- **Laporan Omzet:** Ringkasan total pendapatan lunas dan riwayat transaksi terkini.

---

## Teknologi yang Digunakan

- **Backend:** Node.js, Express.js, Socket.io
- **Database:** PostgreSQL (Neon.tech Serverless)
- **Payment Gateway:** Midtrans Snap API
- **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript (Optimistic UI)
- **Deployment:** Vercel Serverless

---

## Struktur Proyek

```text
qr-order-system/
├── config/
│   └── db.js                 # Konfigurasi koneksi PostgreSQL (SSL Neon.tech)
├── database/
│   └── schema.sql            # Skema tabel & data awal kategori/menu
├── public/
│   ├── admin.html            # Dashboard Admin (QR Meja, Menu, Laporan)
│   ├── kitchen.html          # Kitchen Display System (KDS)
│   ├── login.html            # Halaman autentikasi staf
│   ├── menu.html             # Antarmuka pemesanan pelanggan
│   └── order-status.html     # Struk digital & pelacakan status pesanan
├── routes/
│   └── orderRoutes.js        # Endpoint REST API, Midtrans & validasi QR
├── server.js                 # Entry point Express, Socket.io & Auth Middleware
├── vercel.json               # Konfigurasi routing deployment Vercel
└── package.json