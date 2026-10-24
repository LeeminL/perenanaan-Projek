/*
 * contoh.js — Dua data contoh siap muat untuk alat perencanaan proyek.
 * Dipakai oleh halaman utama (tombol "Muat contoh") dan halaman tes.
 */
(function (global) {
  'use strict';

  function id(acak) {
    var r = Math.random().toString(36).slice(2, 8);
    return (acak || 'x') + '-' + r + '-' + Date.now().toString(36).slice(-4);
  }

  /* ------------------------------------------------------------------ *
   * Contoh 1 — Proyek toko online "Roti Manis Gorontalo"
   * Mulai 5 Okt 2026 s.d. 6 Nov 2026, libur akhir pekan + 28 Okt 2026.
   * ------------------------------------------------------------------ */
  function rotiManis() {
    var k1 = id('k'), k2 = id('k'), k3 = id('k'), k4 = id('k'), k5 = id('k'), k6 = id('k');
    var a1 = id('a'), a2 = id('a'), a3 = id('a');
    return {
      proyek: {
        nama: 'Toko Online Roti Manis Gorontalo',
        organisasi: 'Program Studi Sistem Informasi',
        deskripsi: 'Perencanaan pengembangan toko online roti (katalog, keranjang, pembayaran) beserta pengujian dan pelatihan admin.',
        tanggalMulai: '2026-10-05',
        tanggalRencana: '2026-11-06',
        liburMingguan: [0, 6],
        gunakanLiburPribadi: false,
        liburKhusus: [
          { id: id('lk'), tanggal: '2026-10-28', nama: 'Libur khusus 28 Oktober', berulang: 'sekali' }
        ]
      },
      kegiatan: [
        {
          id: k1, nama: 'Survei Kebutuhan Pelanggan', durasi: 4, warna: '#2563eb',
          sub: [
            { nama: 'Penyusunan kuesioner', durasi: 1 },
            { nama: 'Penyebaran survei', durasi: 1 },
            { nama: 'Analisis hasil survei', durasi: 2 }
          ],
          dependensi: []
        },
        {
          id: k2, nama: 'Desain Basis Data dan Alur Pesanan', durasi: 6, warna: '#7c3aed',
          sub: [
            { nama: 'Perancangan ERD', durasi: 3 },
            { nama: 'Penyusunan alur pesanan', durasi: 3 }
          ],
          dependensi: [{ kegiatanId: k1, tipe: 'SS', jeda: 2 }]
        },
        {
          id: k3, nama: 'Desain Antarmuka Katalog dan Keranjang', durasi: 5, warna: '#0891b2',
          sub: [
            { nama: 'Wireframe halaman', durasi: 2 },
            { nama: 'Desain UI katalog & keranjang', durasi: 3 }
          ],
          dependensi: [{ kegiatanId: k2, tipe: 'SS', jeda: 3 }]
        },
        {
          id: k4, nama: 'Pengembangan Fitur Katalog, Keranjang, dan Pembayaran', durasi: 7, warna: '#16a34a',
          sub: [
            { nama: 'Modul katalog produk', durasi: 2 },
            { nama: 'Modul keranjang & checkout', durasi: 3 },
            { nama: 'Integrasi pembayaran', durasi: 2 }
          ],
          dependensi: [{ kegiatanId: k3, tipe: 'FS', jeda: 0 }]
        },
        {
          id: k5, nama: 'Pengujian dan Perbaikan Bug', durasi: 3, warna: '#ea580c',
          sub: [
            { nama: 'Pengujian fungsional', durasi: 2 },
            { nama: 'Perbaikan bug', durasi: 1 }
          ],
          dependensi: [{ kegiatanId: k4, tipe: 'FS', jeda: 0 }]
        },
        {
          id: k6, nama: 'Peluncuran dan Pelatihan Admin Toko', durasi: 2, warna: '#dc2626',
          sub: [
            { nama: 'Peluncuran situs', durasi: 1 },
            { nama: 'Pelatihan admin', durasi: 1 }
          ],
          dependensi: [{ kegiatanId: k5, tipe: 'FS', jeda: 0 }]
        }
      ],
      tim: [
        { id: a1, nama: 'Nadia Rahman', peran: 'Analis Sistem', kontak: 'nadia@example.com', libur: ['2026-10-15'] },
        { id: a2, nama: 'Fajar Ismail', peran: 'Perancang Basis Data', kontak: '0812-0000-0001', libur: [] },
        { id: a3, nama: 'Siti Ayu', peran: 'Pengembang Web', kontak: 'siti@example.com', libur: ['2026-10-26', '2026-10-27'] }
      ],
      penugasan: [
        { kegiatanId: k1, anggotaId: a1, peran: 'Ketua tim' },
        { kegiatanId: k2, anggotaId: a2, peran: 'Perancang ERD' },
        { kegiatanId: k4, anggotaId: a3, peran: 'Pengembang utama' },
        { kegiatanId: k5, anggotaId: a1, peran: 'Penguji' }
      ]
    };
  }

  /* ------------------------------------------------------------------ *
   * Contoh 2 — Jalur kritis: proyek aplikasi kasir dan stok toko.
   * Durasi murni hari kerja (tanpa dependensi berjeda):
   *   A=2, B=3, C=1 (tanpa pendahulu); D=4 (A); E=6 (B); F=5 (B);
   *   G=9 (C); H=14 (D,E); I=3 (G); J=2 (F,H,I)
   * Jalur kritis B-E-H-J = 25 hari.
   * ------------------------------------------------------------------ */
  function kasir() {
    function k(acak, nama, durasi, warna, dependensi) {
      return {
        id: id(acak), nama: nama, durasi: durasi, warna: warna,
        sub: [], dependensi: dependensi || []
      };
    }
    var A = k('a', 'A — Wawancara Pemilik', 2, '#2563eb', []);
    var B = k('a', 'B — Analisis Proses Bisnis', 3, '#7c3aed', []);
    var C = k('a', 'C — Survei Perangkat', 1, '#0891b2', []);
    var D = k('a', 'D — Rancang ERD', 4, '#16a34a', [{ kegiatanId: A.id, tipe: 'FS', jeda: 0 }]);
    var E = k('a', 'E — Rancang Modul Kasir', 6, '#ea580c', [{ kegiatanId: B.id, tipe: 'FS', jeda: 0 }]);
    var F = k('a', 'F — Rancang Laporan', 5, '#ca8a04', [{ kegiatanId: B.id, tipe: 'FS', jeda: 0 }]);
    var G = k('a', 'G — Pengadaan Perangkat', 9, '#0d9488', [{ kegiatanId: C.id, tipe: 'FS', jeda: 0 }]);
    var H = k('a', 'H — Implementasi Modul', 14, '#dc2626', [
      { kegiatanId: D.id, tipe: 'FS', jeda: 0 },
      { kegiatanId: E.id, tipe: 'FS', jeda: 0 }
    ]);
    var I = k('a', 'I — Instalasi Perangkat', 3, '#9333ea', [{ kegiatanId: G.id, tipe: 'FS', jeda: 0 }]);
    var J = k('a', 'J — Uji Coba di Toko', 2, '#1f2937', [
      { kegiatanId: F.id, tipe: 'FS', jeda: 0 },
      { kegiatanId: H.id, tipe: 'FS', jeda: 0 },
      { kegiatanId: I.id, tipe: 'FS', jeda: 0 }
    ]);

    return {
      proyek: {
        nama: 'Aplikasi Kasir dan Stok Toko',
        organisasi: 'Program Studi Sistem Informasi',
        deskripsi: 'Contoh perhitungan jalur kritis: semua dependensi FS berjeda 0, durasi dalam hari kerja.',
        tanggalMulai: '2026-01-05',
        tanggalRencana: '',
        liburMingguan: [0, 6],
        gunakanLiburPribadi: false,
        liburKhusus: []
      },
      kegiatan: [A, B, C, D, E, F, G, H, I, J],
      tim: [],
      penugasan: []
    };
  }

  var Contoh = { rotiManis: rotiManis, kasir: kasir };
  if (typeof module !== 'undefined' && module.exports) module.exports = Contoh;
  if (global) global.Contoh = Contoh;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));