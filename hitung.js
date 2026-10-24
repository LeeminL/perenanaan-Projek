/*
 * hitung.js — Logika perhitungan alat perencanaan proyek (tanpa DOM).
 * Dapat dipakai di browser (window.Hitung) maupun Node.js (require).
 *
 * Konsep:
 * - Semua durasi dalam HARI KERJA. Hari libur (mingguan & khusus) dilewati.
 * - Penjadwalan maju (forward pass) memakai tanggal, sehingga hari libur
 *   otomatis dilewati, termasuk libur pribadi anggota bila diaktifkan.
 * - Dependensi: FS, SS, FF, SF — masing-masing dengan jeda (lag) hari kerja.
 * - Pass mundur (backward pass) menghitung jadwal akhir danFLOAT total.
 * - Jalur kritis = aktivitas dengan float total = 0.
 */
(function (global) {
  'use strict';

  var TIPE_DEPENDENSI = ['FS', 'SS', 'FF', 'SF'];
  var NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var BATAS_ITERASI = 40000; // pengaman loop (±109 tahun)
  var BATAS_JALUR = 20000;   // batas jumlah jalur yang didaftar

  /* ============================ UTIL TANGGAL ============================ */

  function parseTanggal(teks) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks == null ? '' : teks).trim());
    if (!m) return null;
    var th = Number(m[1]), bl = Number(m[2]), hr = Number(m[3]);
    var d = new Date(th, bl - 1, hr);
    if (d.getFullYear() !== th || d.getMonth() !== bl - 1 || d.getDate() !== hr) return null;
    return d;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatTanggal(tgl) {
    var d = (tgl instanceof Date) ? tgl : parseTanggal(tgl);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatTanggalIndo(teks) {
    var d = parseTanggal(teks);
    if (!d) return String(teks || '');
    return d.getDate() + ' ' + NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function namaHari(teks) {
    var d = parseTanggal(teks);
    return d ? NAMA_HARI[d.getDay()] : '';
  }

  function geserHari(teks, n) {
    var d = parseTanggal(teks);
    if (!d) return teks;
    d.setDate(d.getDate() + n);
    return formatTanggal(d);
  }

  /* ============================== KALENDER ============================== */

  /** Apakah tanggal tersebut hari libur menurut pengaturan proyek? */
  function isHariLibur(teks, proyek) {
    var d = parseTanggal(teks);
    if (!d) return false;
    var mingguan = (proyek && proyek.liburMingguan) || [];
    if (mingguan.indexOf(d.getDay()) !== -1) return true;
    var khusus = (proyek && proyek.liburKhusus) || [];
    for (var i = 0; i < khusus.length; i++) {
      var l = khusus[i] || {};
      var ld = parseTanggal(l.tanggal);
      if (!ld) continue;
      if (l.berulang === 'tahunan') {
        if (ld.getMonth() === d.getMonth() && ld.getDate() === d.getDate()) return true;
      } else if (l.berulang === 'bulanan') {
        if (ld.getDate() === d.getDate()) return true;
      } else {
        if (formatTanggal(ld) === formatTanggal(d)) return true;
      }
    }
    return false;
  }

  /** Peta {kegiatanId: {tanggalLiburPribadi: true}} sesuai penugasan anggota. */
  function liburPribadiPerKegiatan(proyek, penugasan, tim) {
    var peta = {};
    if (!proyek || !proyek.gunakanLiburPribadi) return peta;
    var anggotaById = {};
    (tim || []).forEach(function (a) { if (a && a.id) anggotaById[a.id] = a; });
    (penugasan || []).forEach(function (p) {
      var anggota = anggotaById[p.anggotaId];
      if (!anggota) return;
      (anggota.libur || []).forEach(function (t) {
        if (!parseTanggal(t)) return;
        if (!peta[p.kegiatanId]) peta[p.kegiatanId] = {};
        peta[p.kegiatanId][t] = true;
      });
    });
    return peta;
  }

  /** Objek kalender sederhana: { isKerja(tanggal) }. */
  function buatKalender(proyek, liburPribadi, kegiatanId) {
    var pribadi = (liburPribadi && liburPribadi[kegiatanId]) || {};
    return {
      isKerja: function (teks) {
        return !isHariLibur(teks, proyek) && !pribadi[teks];
      }
    };
  }

  /* ========================== OPERASI HARI KERJA ========================= */

  function hariKerjaBerikutnya(teks, kal) {
    var d = geserHari(teks, 1), i = 0;
    while (!kal.isKerja(d) && i++ < BATAS_ITERASI) d = geserHari(d, 1);
    return d;
  }

  function hariKerjaSebelumnya(teks, kal) {
    var d = geserHari(teks, -1), i = 0;
    while (!kal.isKerja(d) && i++ < BATAS_ITERASI) d = geserHari(d, -1);
    return d;
  }

  /** Geser ke hari kerja terdekat pada atau setelah tanggal. */
  function keHariKerja(teks, kal) {
    if (kal.isKerja(teks)) return teks;
    return hariKerjaBerikutnya(teks, kal);
  }

  /** Geser ke hari kerja terdekat pada atau sebelum tanggal. */
  function keHariKerjaSebelumnya(teks, kal) {
    if (kal.isKerja(teks)) return teks;
    return hariKerjaSebelumnya(teks, kal);
  }

  /** Tambah (atau kurangi, bila n negatif) n hari kerja dari tanggal. */
  function tambahHariKerja(teks, n, kal) {
    var d = teks, i;
    n = Math.round(Number(n) || 0);
    if (n > 0) {
      for (i = 0; i < n; i++) { d = hariKerjaBerikutnya(d, kal); }
    } else if (n < 0) {
      for (i = 0; i < -n; i++) { d = hariKerjaSebelumnya(d, kal); }
    }
    return d;
  }

  /** Jumlah langkah hari kerja dari a menuju b (0 bila sama; negatif bila mundur). */
  function hitungHariKerja(a, b, kal) {
    if (a === b) return 0;
    var d = a, n = 0;
    if (a < b) {
      while (d < b && n < BATAS_ITERASI) { d = hariKerjaBerikutnya(d, kal); n++; }
      return d === b ? n : (n >= BATAS_ITERASI ? 0 : n);
    }
    while (d > b && n > -BATAS_ITERASI) { d = hariKerjaSebelumnya(d, kal); n--; }
    return n;
  }

  /* ============================ TOPOLOGI ============================== */

  function indeksKegiatan(kegiatan) {
    var byId = {};
    (kegiatan || []).forEach(function (k) { if (k && k.id) byId[k.id] = k; });
    return byId;
  }

  function dependensiValid(kegiatan, byId) {
    var hasil = [];
    (kegiatan.dependensi || []).forEach(function (dep) {
      if (!dep || !byId[dep.kegiatanId] || dep.kegiatanId === kegiatan.id) return;
      hasil.push({
        kegiatanId: dep.kegiatanId,
        tipe: TIPE_DEPENDENSI.indexOf(dep.tipe) !== -1 ? dep.tipe : 'FS',
        jeda: Math.max(0, Math.round(Number(dep.jeda) || 0))
      });
    });
    return hasil;
  }

  /** Urut topologi (Kahn). Mengembalikan { urutan: [id...], siklus: bool } */
  function urutTopologi(kegiatan, byId) {
    var masuk = {}, keluar = {}, urutan = [], antre = [];
    (kegiatan || []).forEach(function (k) {
      if (!byId[k.id]) return;
      if (masuk[k.id] == null) masuk[k.id] = 0;
      if (!keluar[k.id]) keluar[k.id] = [];
    });
    (kegiatan || []).forEach(function (k) {
      dependensiValid(k, byId).forEach(function (dep) {
        masuk[k.id] += 1;
        keluar[dep.kegiatanId].push(k.id);
      });
    });
    (kegiatan || []).forEach(function (k) { if (masuk[k.id] === 0) antre.push(k.id); });
    while (antre.length) {
      var id = antre.shift();
      urutan.push(id);
      (keluar[id] || []).forEach(function (s) {
        masuk[s] -= 1;
        if (masuk[s] === 0) antre.push(s);
      });
    }
    return { urutan: urutan, siklus: urutan.length !== Object.keys(byId).length };
  }

  /* =========================== PENJADWALAN ============================= */

  /**
   * Hitung seluruh jadwal, float total, jalur kritis, dan semua jalur.
   * Mengembalikan { error } bila ada siklus dependensi.
   */
  function hitung(proyek, kegiatan, penugasan, tim) {
    proyek = proyek || {};
    kegiatan = (kegiatan || []).filter(function (k) { return k && k.id; });
    var byId = indeksKegiatan(kegiatan);
    var topo = urutTopologi(kegiatan, byId);
    if (topo.siklus) {
      return { error: 'Terdeteksi siklus dependensi antar-kegiatan. Periksa hubungan FS/SS/FF/SF.' };
    }

    var liburPribadi = liburPribadiPerKegiatan(proyek, penugasan, tim);
    var kalGlobal = buatKalender(proyek, null, null);
    var kal = {};
    kegiatan.forEach(function (k) { kal[k.id] = buatKalender(proyek, liburPribadi, k.id); });

    var tanggalMulaiProyek = keHariKerja(
      parseTanggal(proyek.tanggalMulai) ? formatTanggal(proyek.tanggalMulai) : formatTanggal(new Date()),
      kalGlobal
    );

    /* ---- Pass maju: tanggal mulai & selesai paling awal ---- */
    var mulai = {}, selesai = {};
    topo.urutan.forEach(function (id) {
      var k = byId[id];
      var durasi = Math.max(1, Math.round(Number(k.durasi) || 1));
      var es = keHariKerja(tanggalMulaiProyek, kal[id]);
      dependensiValid(k, byId).forEach(function (dep) {
        var kandidat;
        if (dep.tipe === 'FS') {
          kandidat = tambahHariKerja(selesai[dep.kegiatanId], 1 + dep.jeda, kal[id]);
        } else if (dep.tipe === 'SS') {
          kandidat = tambahHariKerja(mulai[dep.kegiatanId], dep.jeda, kal[id]);
        } else if (dep.tipe === 'FF') {
          kandidat = tambahHariKerja(selesai[dep.kegiatanId], dep.jeda - (durasi - 1), kal[id]);
        } else { // SF
          kandidat = tambahHariKerja(mulai[dep.kegiatanId], dep.jeda - (durasi - 1), kal[id]);
        }
        kandidat = keHariKerja(kandidat, kal[id]);
        if (kandidat > es) es = kandidat;
      });
      mulai[id] = es;
      selesai[id] = tambahHariKerja(es, durasi - 1, kal[id]);
    });

    /* ---- Pass mundur: jadwal akhir paling lambat & float total ---- */
    var penerus = {};
    kegiatan.forEach(function (k) {
      dependensiValid(k, byId).forEach(function (dep) {
        if (!penerus[dep.kegiatanId]) penerus[dep.kegiatanId] = [];
        penerus[dep.kegiatanId].push({ kegiatanId: k.id, tipe: dep.tipe, jeda: dep.jeda });
      });
    });

    var selesaiProyek = tanggalMulaiProyek;
    kegiatan.forEach(function (k) { if (selesai[k.id] > selesaiProyek) selesaiProyek = selesai[k.id]; });

    var akhirMulai = {}, akhirSelesai = {}, float = {};
    topo.urutan.slice().reverse().forEach(function (id) {
      var k = byId[id];
      var durasi = Math.max(1, Math.round(Number(k.durasi) || 1));
      var kf = keHariKerjaSebelumnya(selesaiProyek, kal[id]);
      (penerus[id] || []).forEach(function (s) {
        var kandidatSelesai;
        if (s.tipe === 'FS') {
          kandidatSelesai = tambahHariKerja(akhirMulai[s.kegiatanId], -(1 + s.jeda), kal[id]);
        } else if (s.tipe === 'SS') {
          kandidatSelesai = tambahHariKerja(akhirMulai[s.kegiatanId], s.jeda - (durasi - 1), kal[id]);
        } else if (s.tipe === 'FF') {
          kandidatSelesai = tambahHariKerja(akhirSelesai[s.kegiatanId], -s.jeda, kal[id]);
        } else { // SF
          kandidatSelesai = tambahHariKerja(akhirSelesai[s.kegiatanId], s.jeda - (durasi - 1), kal[id]);
        }
        kandidatSelesai = keHariKerjaSebelumnya(kandidatSelesai, kal[id]);
        if (kandidatSelesai < kf) kf = kandidatSelesai;
      });
      if (kf < selesai[id]) kf = selesai[id]; // tidak boleh lebih awal dari jadwal maju
      akhirSelesai[id] = kf;
      var kls = tambahHariKerja(kf, -(durasi - 1), kal[id]);
      if (kls < mulai[id]) kls = mulai[id];   // tidak boleh lebih awal dari jadwal maju
      akhirMulai[id] = kls;
      float[id] = Math.max(0, hitungHariKerja(mulai[id], kls, kal[id]));
    });

    /* ---- Susun hasil per kegiatan ---- */
    var jadwal = {};
    var kritis = [];
    kegiatan.forEach(function (k) {
      jadwal[k.id] = {
        id: k.id,
        nama: k.nama,
        durasi: Math.max(1, Math.round(Number(k.durasi) || 1)),
        mulai: mulai[k.id],
        selesai: selesai[k.id],
        akhirMulai: akhirMulai[k.id],
        akhirSelesai: akhirSelesai[k.id],
        float: float[k.id],
        kritis: float[k.id] === 0
      };
      if (float[k.id] === 0) kritis.push(k.id);
    });

    /* ---- Semua jalur awal-ke-akhir ---- */
    var daftarJalur = semuaJalur(kegiatan, byId);
    var jalurTeratas = daftarJalur.jalur.length ? daftarJalur.jalur[0].total : 0;
    daftarJalur.jalur.forEach(function (j) { j.kritis = (j.total === jalurTeratas && jalurTeratas > 0); });

    var lamaHariKerja = kegiatan.length ? hitungHariKerja(tanggalMulaiProyek, selesaiProyek, kalGlobal) + 1 : 0;

    return {
      mulaiProyek: tanggalMulaiProyek,
      selesaiProyek: selesaiProyek,
      lamaHariKerja: lamaHariKerja,
      jadwal: jadwal,
      kritis: kritis,
      jalur: daftarJalur.jalur,
      jalurTerpanjang: daftarJalur.jalur.length ? daftarJalur.jalur[0] : null,
      jumlahJalur: daftarJalur.jalur.length,
      dibatasi: daftarJalur.dibatasi
    };
  }

  /** Semua jalur dari kegiatan sumber (tanpa pendahulu) ke kegiatan akhir. */
  function semuaJalur(kegiatan, byId) {
    byId = byId || indeksKegiatan(kegiatan);
    var adaMasuk = {}, keluar = {};
    kegiatan.forEach(function (k) {
      if (!byId[k.id]) return;
      if (adaMasuk[k.id] == null) adaMasuk[k.id] = false;
      if (!keluar[k.id]) keluar[k.id] = [];
    });
    kegiatan.forEach(function (k) {
      dependensiValid(k, byId).forEach(function (dep) {
        adaMasuk[k.id] = true;
        keluar[dep.kegiatanId].push(k.id);
      });
    });

    var hasil = [], dibatasi = false;
    var sumber = kegiatan.filter(function (k) { return byId[k.id] && !adaMasuk[k.id]; }).map(function (k) { return k.id; });

    function dfs(id, jalur, total) {
      if (dibatasi) return;
      var baru = jalur.concat([id]);
      var baruTotal = total + Math.max(1, Math.round(Number(byId[id].durasi) || 1));
      if (!keluar[id].length) {
        hasil.push({ ids: baru, nama: baru.map(function (i) { return byId[i].nama; }).join(' → '), total: baruTotal });
        if (hasil.length >= BATAS_JALUR) dibatasi = true;
        return;
      }
      keluar[id].forEach(function (s) { if (!dibatasi) dfs(s, baru, baruTotal); });
    }

    sumber.forEach(function (id) { if (!dibatasi) dfs(id, [], 0); });
    hasil.sort(function (a, b) { return b.total - a.total; });
    return { jalur: hasil, dibatasi: dibatasi };
  }

  var Hitung = {
    TIPE_DEPENDENSI: TIPE_DEPENDENSI,
    NAMA_BULAN: NAMA_BULAN,
    NAMA_HARI: NAMA_HARI,
    parseTanggal: parseTanggal,
    formatTanggal: formatTanggal,
    formatTanggalIndo: formatTanggalIndo,
    namaHari: namaHari,
    geserHari: geserHari,
    isHariLibur: isHariLibur,
    buatKalender: buatKalender,
    liburPribadiPerKegiatan: liburPribadiPerKegiatan,
    keHariKerja: keHariKerja,
    tambahHariKerja: tambahHariKerja,
    hitungHariKerja: hitungHariKerja,
    urutTopologi: urutTopologi,
    semuaJalur: semuaJalur,
    hitung: hitung
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Hitung;
  if (global) global.Hitung = Hitung;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
