/*
 * tes.js — Pengecekan otomatis atas kedua contoh.
 * Berjalan di browser (buka tes.html) maupun Node: node tes.js
 */
(function (global) {
  'use strict';

  var hasRequire = typeof require === 'function' && typeof window === 'undefined';
  var Hitung = hasRequire ? require('./hitung.js') : global.Hitung;
  var Contoh = hasRequire ? require('./contoh.js') : global.Contoh;

  /* ------------------------------ alat bantu ------------------------------ */

  function pesan(ok, teks) { return { ok: !!ok, teks: teks }; }

  function ket(actual, expected) {
    return JSON.stringify(actual) + ' (diharapkan ' + JSON.stringify(expected) + ')';
  }

  function cariKegiatan(data, awalan) {
    for (var i = 0; i < data.kegiatan.length; i++) {
      var k = data.kegiatan[i];
      if (k.nama === awalan || k.nama.indexOf(awalan) === 0) return k;
    }
    return null;
  }

  function hurufKegiatan(data, huruf) {
    for (var i = 0; i < data.kegiatan.length; i++) {
      if (data.kegiatan[i].nama.charAt(0) === huruf) return data.kegiatan[i];
    }
    return null;
  }

  /* --------------------------- kelompok pengujian ------------------------- */

  function kelompokRotiManis() {
    var data = Contoh.rotiManis();
    var h = Hitung.hitung(data.proyek, data.kegiatan, data.penugasan, data.tim);
    if (h.error) return [pesan(false, 'Tidak boleh ada error: ' + h.error)];

    var urutan = ['Survei Kebutuhan Pelanggan', 'Desain Basis Data dan Alur Pesanan',
      'Desain Antarmuka Katalog dan Keranjang', 'Pengembangan Fitur Katalog',
      'Pengujian dan Perbaikan Bug', 'Peluncuran dan Pelatihan Admin Toko'];
    var keg = urutan.map(function (n) { return cariKegiatan(data, n); });
    var ekspektasi = [
      ['2026-10-05', '2026-10-08'],
      ['2026-10-07', '2026-10-14'],
      ['2026-10-12', '2026-10-16'],
      ['2026-10-19', '2026-10-27'],
      ['2026-10-29', '2026-11-02'],
      ['2026-11-03', '2026-11-04']
    ];
    var hasil = [];

    keg.forEach(function (k, i) {
      if (!k) { hasil.push(pesan(false, 'Kegiatan "' + urutan[i] + '" tidak ditemukan')); return; }
      var j = h.jadwal[k.id];
      hasil.push(pesan(j.mulai === ekspektasi[i][0],
        urutan[i] + ': mulai ' + j.mulai + ket(j.mulai, ekspektasi[i][0])));
      hasil.push(pesan(j.selesai === ekspektasi[i][1],
        urutan[i] + ': selesai ' + j.selesai + ket(j.selesai, ekspektasi[i][1])));
    });

    hasil.push(pesan(Hitung.isHariLibur('2026-10-10', data.proyek) === true,
      'Sabtu 10 Okt 2026 termasuk hari libur mingguan'));
    hasil.push(pesan(Hitung.isHariLibur('2026-10-28', data.proyek) === true,
      '28 Okt 2026 termasuk libur khusus'));
    hasil.push(pesan(Hitung.isHariLibur('2026-10-05', data.proyek) === false,
      '5 Okt 2026 (Senin) bukan hari libur'));

    // Tidak ada kegiatan yang jatuh pada hari libur
    var jatuhLibur = [];
    keg.forEach(function (k) {
      var j = h.jadwal[k.id];
      [j.mulai, j.selesai].forEach(function (t) {
        if (Hitung.isHariLibur(t, data.proyek)) jatuhLibur.push(k.nama + '@' + t);
      });
    });
    hasil.push(pesan(jatuhLibur.length === 0,
      'Tidak ada jadwal kegiatan pada hari libur' + (jatuhLibur.length ? ': ' + jatuhLibur.join(', ') : '')));

    hasil.push(pesan(h.selesaiProyek === '2026-11-04',
      'Proyek selesai 2026-11-04' + ket(h.selesaiProyek, '2026-11-04')));
    hasil.push(pesan(h.lamaHariKerja === 22,
      'Lama proyek 22 hari kerja' + ket(h.lamaHariKerja, 22)));
    hasil.push(pesan(h.jumlahJalur === 1,
      'Jumlah jalur awal-ke-akhir = 1' + ket(h.jumlahJalur, 1)));
    hasil.push(pesan(h.jalurTerpanjang && h.jalurTerpanjang.total === 27,
      'Total durasi jalur = 27 hari' + ket(h.jalurTerpanjang ? h.jalurTerpanjang.total : null, 27)));
    hasil.push(pesan(h.kritis.length === keg.length,
      'Seluruh kegiatan menjadi jalur kritis (SS berantai)' + ket(h.kritis.length, keg.length)));

    // Uji libur pribadi: bila diaktifkan, jadwal berubah
    var dataPribadi = Contoh.rotiManis();
    dataPribadi.proyek.gunakanLiburPribadi = true;
    var hPribadi = Hitung.hitung(dataPribadi.proyek, dataPribadi.kegiatan, dataPribadi.penugasan, dataPribadi.tim);
    hasil.push(pesan(hPribadi.selesaiProyek > h.selesaiProyek,
      'Aktivasi libur pribadi memundurkan selesai proyek (' + h.selesaiProyek + ' -> ' + hPribadi.selesaiProyek + ')'));

    return hasil;
  }

  function kelompokJalurKritis() {
    var data = Contoh.kasir();
    var h = Hitung.hitung(data.proyek, data.kegiatan, data.penugasan, data.tim);
    if (h.error) return [pesan(false, 'Tidak boleh ada error: ' + h.error)];
    var hasil = [];

    var yang = function (c) { return hurufKegiatan(data, c); };
    var idB = yang('B').id, idE = yang('E').id, idH = yang('H').id, idJ = yang('J').id;

    hasil.push(pesan(data.kegiatan.length === 10, 'Jumlah kegiatan = 10' + ket(data.kegiatan.length, 10)));
    hasil.push(pesan(h.jumlahJalur === 4,
      'Jumlah semua jalur awal-ke-akhir = 4' + ket(h.jumlahJalur, 4)));

    var total = {};
    h.jalur.forEach(function (j) { total[j.nama] = j.total; });
    var daftar = h.jalur.map(function (j) { return j.nama + ' = ' + j.total; }).join(' | ');
    hasil.push(pesan(total['A — Wawancara Pemilik → D — Rancang ERD → H — Implementasi Modul → J — Uji Coba di Toko'] === 22,
      'Jalur A-D-H-J = 22 | ' + daftar));
    hasil.push(pesan(total['B — Analisis Proses Bisnis → E — Rancang Modul Kasir → H — Implementasi Modul → J — Uji Coba di Toko'] === 25,
      'Jalur B-E-H-J = 25 | ' + daftar));
    hasil.push(pesan(total['B — Analisis Proses Bisnis → F — Rancang Laporan → J — Uji Coba di Toko'] === 10,
      'Jalur B-F-J = 10 | ' + daftar));
    hasil.push(pesan(total['C — Survei Perangkat → G — Pengadaan Perangkat → I — Instalasi Perangkat → J — Uji Coba di Toko'] === 15,
      'Jalur C-G-I-J = 15 | ' + daftar));

    var jp = h.jalurTerpanjang;
    hasil.push(pesan(!!jp && jp.total === 25,
      'Jalur terpanjang total 25' + ket(jp ? jp.total : null, 25)));
    hasil.push(pesan(!!jp && jp.kritis === true,
      'Jalur terpanjang ditandai kritis (merah)'));
    hasil.push(pesan(!!jp && jp.ids.length === 4 &&
      jp.ids[0] === idB && jp.ids[1] === idE && jp.ids[2] === idH && jp.ids[3] === idJ,
      'Jalur kritis adalah B-E-H-J' + (jp ? ' (dapat: ' + jp.nama + ')' : '')));

    var kritisUrut = h.kritis.slice().sort();
    var diharapkan = [idB, idE, idH, idJ].sort();
    hasil.push(pesan(JSON.stringify(kritisUrut) === JSON.stringify(diharapkan),
      'Kegiatan kritis (float 0) = B, E, H, J (dapat ' + kritisUrut.length + ' kegiatan)'));

    hasil.push(pesan(h.lamaHariKerja === 25,
      'Estimasi lama proyek = 25 hari kerja' + ket(h.lamaHariKerja, 25)));
    hasil.push(pesan(h.mulaiProyek === '2026-01-05',
      'Proyek mulai 2026-01-05' + ket(h.mulaiProyek, '2026-01-05')));
    hasil.push(pesan(h.selesaiProyek === '2026-02-06',
      'Proyek selesai 2026-02-06' + ket(h.selesaiProyek, '2026-02-06')));

    // Float beberapa kegiatan non-kritis
    hasil.push(pesan(h.jadwal[yang('A').id].float === 3, 'Float A = 3' + ket(h.jadwal[yang('A').id].float, 3)));
    hasil.push(pesan(h.jadwal[yang('D').id].float === 3, 'Float D = 3' + ket(h.jadwal[yang('D').id].float, 3)));
    hasil.push(pesan(h.jadwal[yang('F').id].float === 15, 'Float F = 15' + ket(h.jadwal[yang('F').id].float, 15)));
    hasil.push(pesan(h.jadwal[yang('G').id].float === 10, 'Float G = 10' + ket(h.jadwal[yang('G').id].float, 10)));

    return hasil;
  }

  function kelompokTambahan() {
    var hasil = [];
    var proyek = {
      nama: 'Uji Ketergantungan', organisasi: '', deskripsi: '',
      tanggalMulai: '2026-01-05', liburMingguan: [0, 6], liburKhusus: [], gunakanLiburPribadi: false
    };
    var X = { id: 'x', nama: 'X', durasi: 3, warna: '#000', sub: [], dependensi: [] };
    var Y = { id: 'y', nama: 'Y', durasi: 2, warna: '#000', sub: [], dependensi: [{ kegiatanId: 'x', tipe: 'FF', jeda: 0 }] };
    var W = { id: 'w', nama: 'W', durasi: 2, warna: '#000', sub: [], dependensi: [{ kegiatanId: 'x', tipe: 'FS', jeda: 1 }] };
    var Z = { id: 'z', nama: 'Z', durasi: 1, warna: '#000', sub: [], dependensi: [{ kegiatanId: 'x', tipe: 'SF', jeda: 4 }] };
    var h = Hitung.hitung(proyek, [X, Y, W, Z], [], []);
    if (h.error) return [pesan(false, 'Tidak boleh ada error: ' + h.error)];

    hasil.push(pesan(h.jadwal.x.mulai === '2026-01-05' && h.jadwal.x.selesai === '2026-01-07',
      'X (3 hari) 2026-01-05 s.d. 2026-01-07'));
    hasil.push(pesan(h.jadwal.y.mulai === '2026-01-06' && h.jadwal.y.selesai === '2026-01-07',
      'Y (FF, jeda 0) selesai bersama X: 2026-01-06 s.d. 2026-01-07'));
    hasil.push(pesan(h.jadwal.w.mulai === '2026-01-09',
      'W (FS, jeda 1) mulai 2026-01-09 (melewati Sabtu/Minggu)' + ket(h.jadwal.w.mulai, '2026-01-09')));
    hasil.push(pesan(h.jadwal.z.mulai === '2026-01-09' && h.jadwal.z.selesai === '2026-01-09',
      'Z (SF, jeda 4) selesai >= mulai X + 4 hari kerja, yaitu 2026-01-09' + ket(h.jadwal.z.mulai, '2026-01-09')));

    // SS + jeda melewati libur khusus
    var p2 = {
      nama: 'Uji Libur Khusus', organisasi: '', deskripsi: '',
      tanggalMulai: '2026-10-05', liburMingguan: [0, 6],
      liburKhusus: [{ id: 'lk', tanggal: '2026-10-08', nama: 'Libur', berulang: 'sekali' }],
      gunakanLiburPribadi: false
    };
    var P = { id: 'p', nama: 'P', durasi: 2, warna: '#000', sub: [], dependensi: [] };
    var Q = { id: 'q', nama: 'Q', durasi: 3, warna: '#000', sub: [], dependensi: [{ kegiatanId: 'p', tipe: 'SS', jeda: 3 }] };
    var h2 = Hitung.hitung(p2, [P, Q], [], []);
    hasil.push(pesan(h2.jadwal.p.selesai === '2026-10-06',
      'P selesai 2026-10-06' + ket(h2.jadwal.p.selesai, '2026-10-06')));
    hasil.push(pesan(h2.jadwal.q.mulai === '2026-10-09',
      'Q (SS, jeda 3) mulai 2026-10-09, melewati 8 Okt libur & akhir pekan' + ket(h2.jadwal.q.mulai, '2026-10-09')));
    hasil.push(pesan(h2.jadwal.q.selesai === '2026-10-13',
      'Q selesai 2026-10-13' + ket(h2.jadwal.q.selesai, '2026-10-13')));

    // Siklus dependensi harus dilaporkan sebagai error
    var c1 = { id: 'c1', nama: 'c1', durasi: 1, warna: '#000', sub: [], dependensi: [{ kegiatanId: 'c2', tipe: 'FS', jeda: 0 }] };
    var c2 = { id: 'c2', nama: 'c2', durasi: 1, warna: '#000', sub: [], dependensi: [{ kegiatanId: 'c1', tipe: 'FS', jeda: 0 }] };
    var h3 = Hitung.hitung(proyek, [c1, c2], [], []);
    hasil.push(pesan(!!h3.error, 'Siklus dependensi menghasilkan pesan error'));

    return hasil;
  }

  /* --------------------------------- eksekusi ------------------------------ */

  function jalankan() {
    var kelompok = [
      { nama: 'Contoh 1 — Toko Online Roti Manis Gorontalo', tes: kelompokRotiManis },
      { nama: 'Contoh 2 — Jalur kritis Aplikasi Kasir dan Stok Toko', tes: kelompokJalurKritis },
      { nama: 'Kasus tambahan — FS/SS/FF/SF, libur & siklus', tes: kelompokTambahan }
    ];
    var laporan = [];
    kelompok.forEach(function (g) {
      var hasil;
      try {
        hasil = g.tes();
      } catch (e) {
        hasil = [pesan(false, 'Lempar exception: ' + (e && e.message ? e.message : e))];
      }
      var lulus = hasil.filter(function (t) { return t.ok; }).length;
      laporan.push({ nama: g.nama, hasil: hasil, lulus: lulus, gagal: hasil.length - lulus });
    });
    var totalLulus = 0, totalGagal = 0;
    laporan.forEach(function (g) { totalLulus += g.lulus; totalGagal += g.gagal; });
    return { laporan: laporan, totalLulus: totalLulus, totalGagal: totalGagal, sukses: totalGagal === 0 };
  }

  function tampilkan(laporan) {
    var app = document.getElementById('hasil');
    var ringkas = document.getElementById('ringkasan');
    ringkas.className = laporan.sukses ? 'ringkasan lulus' : 'ringkasan gagal';
    ringkas.textContent = laporan.sukses
      ? 'SEMUA TES LULUS — ' + laporan.totalLulus + ' pemeriksaan'
      : 'ADA TES GAGAL — ' + laporan.totalGagal + ' dari ' + (laporan.totalLulus + laporan.totalGagal) + ' pemeriksaan gagal';
    var html = '';
    laporan.laporan.forEach(function (g) {
      html += '<section class="kelompok"><h2>' + g.nama +
        ' <span class="' + (g.gagal ? 'tag gagal' : 'tag lulus') + '">' +
        g.lulus + '/' + (g.lulus + g.gagal) + ' lulus</span></h2><ul>';
      g.hasil.forEach(function (t) {
        html += '<li class="' + (t.ok ? 'lulus' : 'gagal') + '">' +
          '<span class="ikon">' + (t.ok ? '✔' : '✘') + '</span> ' +
          t.teks.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</li>';
      });
      html += '</ul></section>';
    });
    app.innerHTML = html;
    document.title = (laporan.sukses ? '[LULUS] ' : '[GAGAL] ') + 'Tes — Alat Perencanaan Proyek';
  }

  var API = { jalankan: jalankan, tampilkan: tampilkan };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.Tes = API;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { tampilkan(jalankan()); });
    } else {
      tampilkan(jalankan());
    }
  } else {
    var laporan = jalankan();
    console.log('Total lulus: ' + laporan.totalLulus + ', gagal: ' + laporan.totalGagal);
    laporan.laporan.forEach(function (g) {
      console.log('--- ' + g.nama + ' (' + g.lulus + '/' + (g.lulus + g.gagal) + ' lulus)');
      g.hasil.forEach(function (t) { console.log((t.ok ? '  ✔ ' : '  ✘ ') + t.teks); });
    });
    if (typeof process !== 'undefined' && process.exit) process.exit(laporan.sukses ? 0 : 1);
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));