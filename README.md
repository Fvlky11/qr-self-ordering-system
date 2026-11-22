# QR Code Table Self-Ordering System (Pay-First Architecture)

Aplikasi web pemesanan mandiri (*self-ordering*) berbasis QR Code meja untuk restoran atau kafe dengan alur pembayaran instan (*Pay-First*) dan pembaruan pesanan *real-time* ke layar dapur.

## Fitur Utama
- **QR Code Table Validation**: Pembuatan QR Code unik per meja dengan token keamanan (`UUIDv4`) yang dapat di-reset admin untuk mencegah pemesanan palsu dari luar area restoran.
- **Customer Digital Menu**: Filter kategori menu, pengelolaan keranjang belanja, dan input catatan khusus per item (*item notes*).
- **Instant Online Payment**: Integrasi payment gateway **Midtrans Snap** (QRIS, Virtual Account, E-Wallet) dengan verifikasi otomatis.
- **Kitchen Display System (KDS)**: Layar antrean dapur *real-time* menggunakan **Socket.io** dengan status 2 tahap (*Baru* $\rightarrow$ *Dimasak* $\rightarrow$ *Selesai & Antar*).
- **Live Order Tracking & Digital Receipt**: Pelanggan dapat memantau progres masak secara *real-time* di ponsel tanpa perlu *refresh* halaman.
- **Admin Dashboard**: Manajemen QR meja, pengelolaan stok menu (*Tersedia / Habis*), serta ringkasan laporan omzet transaksi lunas.

## Tech Stack
- **Backend**: Node.js, Express.js, Socket.io
- **Database**: PostgreSQL (`pg`)
- **Payment Gateway**: Midtrans Snap API
- **Frontend**: HTML5, Vanilla JavaScript, Tailwind CSS

## Cara Menjalankan di Lokal
1. Clone repositori ini:
   ```bash
   git clone [https://github.com/Fvlky11/qr-self-ordering-system.git](https://github.com/Fvlky11/qr-self-ordering-system.git)
   cd qr-self-ordering-system