export interface JourneyStep {
  id: string;
  title: string;
  description: string;
  customer: string;
  response: string;
  detail: string;
}
export const journeySteps: readonly JourneyStep[] = [
  {
    id: 'halo',
    title: 'Mulai dari Halo.',
    description: 'Buka WhatsApp. Satu sapaan, lalu Bee-bot memandu pilihanmu.',
    customer: 'Halo',
    response:
      'Selamat datang di Beelicious!\n\nMau pilih tenant mana?\n1. Bakmi Effata',
    detail: 'Percakapan dimulai dengan Halo, Hi, atau Mulai.',
  },
  {
    id: 'pilih-tenant',
    title: 'Pilih tempatnya.',
    description:
      'Temukan tenant yang tersedia. Balas nomor untuk mulai menjelajahi menunya.',
    customer: '1',
    response:
      'Bakmi Effata\n\nPilih kategori:\n1. Bakmi\n2. Minuman\n3. Tambahan\n\n0. Kembali',
    detail: 'Pilihan bernomor. Tidak perlu menebak perintah.',
  },
  {
    id: 'pilih-menu',
    title: 'Ikuti seleramu.',
    description:
      'Buka kategori, lihat detail menu, lalu tentukan jumlah yang kamu inginkan.',
    customer: '2',
    response:
      'Bakmi Ayam Pangsit\nHarga: Rp30.000\n\nBerapa porsi?\nBalas jumlah (1–20).\n\n0. Kembali',
    detail: 'Contoh menu dan harga berasal dari katalog prototipe.',
  },
  {
    id: 'cek-keranjang',
    title: 'Pas? Cek lagi.',
    description:
      'Lihat pilihanmu dalam keranjang. Tambah menu, ubah jumlah, atau hapus yang tidak jadi.',
    customer: 'Keranjang',
    response:
      'Keranjang Beelicious\nBakmi Effata\n\n1× Bakmi Ayam Pangsit\nRp30.000\n\nSubtotal: Rp30.000',
    detail: 'Selesai memilih menyimpan keranjang sebelum checkout.',
  },
  {
    id: 'atur-pickup',
    title: 'Tentukan waktunya.',
    description:
      'Lanjut dari keranjang yang siap. Pilih slot pickup yang tersedia, lalu tinjau pesananmu.',
    customer: '2',
    response:
      'Pilih Waktu Pickup\nBakmi Effata\n\n1. 12.00 WIB\n2. 12.30 WIB\n3. 13.00 WIB\n\n0. Kembali',
    detail: 'Waktu ini ilustrasi. Slot asli mengikuti ketersediaan.',
  },
  {
    id: 'ikuti-instruksi',
    title: 'Lanjut dari chat.',
    description:
      'Konfirmasi checkout, lalu ikuti instruksi pembayaran. Konfirmasi hanya dikirim setelah verifikasi gateway.',
    customer: '1',
    response:
      'Pembayaran QRIS\n\nTotal: Rp30.000\n\nCEK — Periksa pembayaran\nBATAL — Minta pembatalan',
    detail:
      'Pilot menggunakan simulasi atau Midtrans Sandbox, bukan pembayaran produksi.',
  },
];
