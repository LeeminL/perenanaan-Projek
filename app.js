/*
 * app.js — lapisan antarmuka: state, localStorage, ekspor/impor JSON,
 * dan seluruh rendering (tabel, Gantt, PERT, diagram jaringan, jalur kritis).
 * Perhitungan murni ada di hitung.js.
 */
(function () {
  'use strict';

  var KUNCI_SIMPAN = 'perencanaan-proyek.v1';
  var WARNA_URUT = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#ca8a04',
    '#dc2626', '#9333ea', '#0d9488', '#4f46e5', '#db2777', '#65a30d'];

  var state = null;
  var hasilHitung = null;
  var tabAktif = 'proyek';
  var visualAktif = 'gantt';
  var liburForm = [];      // libur pribadi sementara pada form anggota
  var idEditKegiatan = null;
  var idEditAnggota = null;

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function potong(teks, maks) {
    teks = String(teks || '');
    return teks.length > maks ? teks.slice(0, maks - 1) + '…' : teks;
  }

  function pendek(tgl) { return tgl ? tgl.slice(8) + '/' + tgl.slice(5, 7) : '—'; }

  /* ============================== STATE ================================== */

  function proyekKosong() {
    return {
      nama: 'Proyek Baru',
      organisasi: '',
      deskripsi: '',
      tanggalMulai: Hitung.formatTanggal(new Date()),
      tanggalRencana: '',
      liburMingguan: [0, 6],
      liburKhusus: [],
      gunakanLiburPribadi: false
    };
  }

  function dataKosong() {
    return { proyek: proyekKosong(), kegiatan: [], tim: [], penugasan: [] };
  }

  function normalisasi(data) {
    var s = dataKosong();
    if (data && typeof data === 'object') {
      if (data.proyek && typeof data.proyek === 'object') {
        Object.keys(data.proyek).forEach(function (k) { s.proyek[k] = data.proyek[k]; });
      }
      if (Array.isArray(data.kegiatan)) {
        data.kegiatan.forEach(function (k) {
          if (!k || !k.nama) return;
          s.kegiatan.push({
            id: k.id || uid('k'),
            nama: String(k.nama),
            durasi: Math.max(1, Math.round(Number(k.durasi) || 1)),
            warna: k.warna || '#2563eb',
            sub: (Array.isArray(k.sub) ? k.sub : []).filter(function (x) { return x && x.nama; })
              .map(function (x) { return { nama: String(x.nama), durasi: Math.max(1, Math.round(Number(x.durasi) || 1)) }; }),
            dependensi: (Array.isArray(k.dependensi) ? k.dependensi : [])
              .filter(function (d) { return d && d.kegiatanId; })
              .map(function (d) {
                return {
                  kegiatanId: d.kegiatanId,
                  tipe: ['FS', 'SS', 'FF', 'SF'].indexOf(d.tipe) !== -1 ? d.tipe : 'FS',
                  jeda: Math.max(0, Math.round(Number(d.jeda) || 0))
                };
              })
          });
        });
      }
      if (Array.isArray(data.tim)) {
        data.tim.forEach(function (a) {
          if (!a || !a.nama) return;
          s.tim.push({
            id: a.id || uid('a'),
            nama: String(a.nama),
            peran: String(a.peran || ''),
            kontak: String(a.kontak || ''),
            libur: (Array.isArray(a.libur) ? a.libur : []).filter(function (t) { return Hitung.parseTanggal(t); })
          });
        });
      }
      if (Array.isArray(data.penugasan)) {
        data.penugasan.forEach(function (p) {
          if (p && p.kegiatanId && p.anggotaId) {
            s.penugasan.push({ kegiatanId: p.kegiatanId, anggotaId: p.anggotaId, peran: String(p.peran || '') });
          }
        });
      }
    }
    if (!Array.isArray(s.proyek.liburMingguan)) s.proyek.liburMingguan = [0, 6];
    if (!Array.isArray(s.proyek.liburKhusus)) s.proyek.liburKhusus = [];
    s.proyek.liburKhusus = s.proyek.liburKhusus.filter(function (l) { return l && Hitung.parseTanggal(l.tanggal); })
      .map(function (l) {
        return {
          id: l.id || uid('lk'), tanggal: l.tanggal, nama: String(l.nama || 'Libur khusus'),
          berulang: ['sekali', 'tahunan', 'bulanan'].indexOf(l.berulang) !== -1 ? l.berulang : 'sekali'
        };
      });
    return s;
  }

  function muatDariPenyimpanan() {
    try {
      var teks = localStorage.getItem(KUNCI_SIMPAN);
      if (teks) { state = normalisasi(JSON.parse(teks)); return; }
    } catch (e) {
      console.warn('Gagal membaca localStorage:', e);
    }
    state = normalisasi(Contoh.rotiManis()); // kunjungan pertama: contoh 1
    simpan();
  }

  function simpan() {
    try {
      localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(state));
    } catch (e) {
      tampilkanPesan('Gagal menyimpan ke localStorage: ' + e.message, 'gagal');
    }
  }

  function ubah(fn) {
    fn(state);
    simpan();
    renderSemua();
  }

  function cariKegiatan(id) {
    for (var i = 0; i < state.kegiatan.length; i++) if (state.kegiatan[i].id === id) return state.kegiatan[i];
    return null;
  }

  function cariAnggota(id) {
    for (var i = 0; i < state.tim.length; i++) if (state.tim[i].id === id) return state.tim[i];
    return null;
  }

  var pesanTimer = null;
  function tampilkanPesan(teks, jenis) {
    var p = $('#pesan');
    p.textContent = teks;
    p.className = 'pesan ' + (jenis || '');
    p.hidden = false;
    if (pesanTimer) clearTimeout(pesanTimer);
    pesanTimer = setTimeout(function () { p.hidden = true; }, 6000);
  }

  /* ============================== RENDER ================================= */

  function hitungUlang() {
    hasilHitung = Hitung.hitung(state.proyek, state.kegiatan, state.penugasan, state.tim);
    if (hasilHitung.error) tampilkanPesan(hasilHitung.error, 'gagal');
  }

  function renderSemua() {
    hitungUlang();
    renderKop();
    renderProyek();
    renderKegiatan();
    renderTim();
    renderVisual();
    renderJalur();
    renderData();
  }

  function renderKop() {
    $('#judulProyek').textContent = state.proyek.nama || 'Alat Perencanaan Proyek';
    var sub = [];
    if (state.proyek.organisasi) sub.push(state.proyek.organisasi);
    sub.push(state.kegiatan.length + ' kegiatan · ' + state.tim.length + ' anggota tim');
    $('#subProyek').textContent = sub.join(' · ');
  }

  /* ------------------------------ tab proyek ------------------------------ */

  function renderProyek() {
    var f = $('#formProyek');
    f.nama.value = state.proyek.nama || '';
    f.organisasi.value = state.proyek.organisasi || '';
    f.deskripsi.value = state.proyek.deskripsi || '';
    f.tanggalMulai.value = state.proyek.tanggalMulai || '';
    f.tanggalRencana.value = state.proyek.tanggalRencana || '';
    f.gunakanLiburPribadi.checked = !!state.proyek.gunakanLiburPribadi;
    $$('#pilHariLibur input').forEach(function (cb) {
      cb.checked = state.proyek.liburMingguan.indexOf(Number(cb.value)) !== -1;
    });

    var daftar = $('#daftarLibur');
    if (!state.proyek.liburKhusus.length) {
      daftar.innerHTML = '<li class="kosong">Belum ada libur khusus.</li>';
      return;
    }
    daftar.innerHTML = state.proyek.liburKhusus.map(function (l) {
      var ket = l.berulang === 'tahunan' ? 'setiap tahun'
        : l.berulang === 'bulanan' ? 'setiap bulan' : 'sekali';
      return '<li><span><b>' + esc(Hitung.formatTanggalIndo(l.tanggal)) + '</b> — ' + esc(l.nama) +
        ' <span class="lencana">' + ket + '</span></span>' +
        '<button type="button" class="kecil telat" data-hapus-libur="' + esc(l.id) + '">Hapus</button></li>';
    }).join('');
  }

  /* ----------------------------- tab kegiatan ----------------------------- */

  function barisSubHTML(i, sub) {
    sub = sub || { nama: '', durasi: 1 };
    return '<div class="baris sub" data-i="' + i + '">' +
      '<input type="text" data-f="nama" placeholder="Nama sub-kegiatan" value="' + esc(sub.nama) + '">' +
      '<input type="number" data-f="durasi" min="1" step="1" value="' + Math.max(1, sub.durasi || 1) + '" title="Durasi hari kerja">' +
      '<button type="button" class="kecil telat" data-hapus-sub="' + i + '">Hapus</button>' +
      '</div>';
  }

  function barisDepHTML(i, dep, idKegiatan) {
    dep = dep || { kegiatanId: '', tipe: 'FS', jeda: 0 };
    var opsi = '<option value="" class="kosong-pilih">— pilih kegiatan —</option>' +
      state.kegiatan.filter(function (k) { return k.id !== idKegiatan; })
        .map(function (k) {
          var dipilih = k.id === dep.kegiatanId ? ' selected' : '';
          return '<option value="' + esc(k.id) + '"' + dipilih + '>' + esc(potong(k.nama, 46)) + '</option>';
        }).join('');
    var tipe = ['FS', 'SS', 'FF', 'SF'].map(function (t) {
      var dipilih = t === (dep.tipe || 'FS') ? ' selected' : '';
      return '<option value="' + t + '"' + dipilih + '>' + t + '</option>';
    }).join('');
    return '<div class="baris" data-i="' + i + '">' +
      '<select data-f="kegiatanId">' + opsi + '</select>' +
      '<select data-f="tipe" title="Jenis hubungan">' + tipe + '</select>' +
      '<input type="number" data-f="jeda" min="0" step="1" value="' + Math.max(0, dep.jeda || 0) + '" title="Jeda hari kerja">' +
      '<button type="button" class="kecil telat" data-hapus-dep="' + i + '">Hapus</button>' +
      '</div>';
  }

  function bacaBaris(selector) {
    return $$(selector + ' .baris').map(function (baris) {
      var obj = {};
      Array.prototype.forEach.call(baris.querySelectorAll('[data-f]'), function (inp) {
        obj[inp.getAttribute('data-f')] = inp.value;
      });
      return obj;
    });
  }

  function bacaBarisSub() {
    return bacaBaris('#barisSub').map(function (x) {
      return { nama: String(x.nama || '').trim(), durasi: Math.max(1, Math.round(Number(x.durasi) || 1)) };
    }).filter(function (x) { return x.nama; });
  }

  /** Versi mentah (baris kosong ikut terbaca) — untuk menambah/menghapus baris. */
  function bacaBarisSubMentah() {
    return bacaBaris('#barisSub').map(function (x) {
      return { nama: String(x.nama || ''), durasi: Math.max(1, Math.round(Number(x.durasi) || 1)) };
    });
  }

  function bacaBarisDepMentah() {
    return bacaBaris('#barisDep').map(function (x) {
      return {
        kegiatanId: x.kegiatanId || '',
        tipe: ['FS', 'SS', 'FF', 'SF'].indexOf(x.tipe) !== -1 ? x.tipe : 'FS',
        jeda: Math.max(0, Math.round(Number(x.jeda) || 0))
      };
    });
  }

  function bacaBarisDep() {
    return bacaBaris('#barisDep')
      .filter(function (x) { return x.kegiatanId; })
      .map(function (x) {
        return {
          kegiatanId: x.kegiatanId,
          tipe: ['FS', 'SS', 'FF', 'SF'].indexOf(x.tipe) !== -1 ? x.tipe : 'FS',
          jeda: Math.max(0, Math.round(Number(x.jeda) || 0))
        };
      });
  }

  /** Gambar ulang baris sub-kegiatan & dependensi dari data eksplisit. */
  function gambarBaris(subs, deps) {
    subs = subs || [];
    deps = deps || [];
    $('#barisSub').innerHTML = subs.length
      ? subs.map(function (s, i) { return barisSubHTML(i, s); }).join('')
      : '<p class="catatan">Belum ada sub-kegiatan.</p>';
    $('#barisDep').innerHTML = deps.length
      ? deps.map(function (d, i) { return barisDepHTML(i, d, idEditKegiatan); }).join('')
      : '<p class="catatan">Belum ada hubungan; kegiatan dimulai dari awal proyek (atau setelah pendahulunya).</p>';
  }

  function tambahBarisKosong(jenis) {
    if (jenis === 'sub') {
      var subs = bacaBarisSubMentah();
      subs.push({ nama: '', durasi: 1 });
      gambarBaris(subs, bacaBarisDepMentah());
      var semua = $$('#barisSub input[data-f="nama"]');
      if (semua.length) semua[semua.length - 1].focus();
    } else {
      var deps = bacaBarisDepMentah();
      deps.push({ kegiatanId: '', tipe: 'FS', jeda: 0 });
      gambarBaris(bacaBarisSubMentah(), deps);
    }
  }

  function renderKegiatan() {
    var tbody = $('#tabelKegiatan tbody');
    if (!state.kegiatan.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="kosong">Belum ada kegiatan. Tambahkan pada formulir di sebelah kiri, atau muat contoh dari tab Data.</td></tr>';
    } else {
      tbody.innerHTML = state.kegiatan.map(function (k, i) {
        var j = hasilHitung.jadwal && hasilHitung.jadwal[k.id];
        var hub = (k.dependensi || []).map(function (d) {
          var p = cariKegiatan(d.kegiatanId);
          return '<span class="lencana hub">' + d.tipe + (d.jeda ? ' +' + d.jeda : '') + ' ← ' +
            esc(potong(p ? p.nama : '?', 24)) + '</span>';
        }).join('') || '<span class="catatan">—</span>';
        var baris = (j && j.kritis) ? ' class="baris-kritis"' : '';
        return '<tr' + baris + '>' +
          '<td>' + (i + 1) + '</td>' +
          '<td><span class="sampel-warna" style="background:' + esc(k.warna) + '"></span>' + esc(k.nama) +
          (k.sub && k.sub.length ? '<br><span class="catatan">' + k.sub.length + ' sub-kegiatan</span>' : '') + '</td>' +
          '<td class="kiri">' + k.durasi + ' hr</td>' +
          '<td>' + hub + '</td>' +
          '<td>' + (j ? esc(Hitung.formatTanggalIndo(j.mulai)) + '<br><span class="catatan">' + esc(Hitung.namaHari(j.mulai)) + '</span>' : '—') + '</td>' +
          '<td>' + (j ? esc(Hitung.formatTanggalIndo(j.selesai)) + '<br><span class="catatan">' + esc(Hitung.namaHari(j.selesai)) + '</span>' : '—') + '</td>' +
          '<td class="kiri">' + (j ? j.float : '—') + '</td>' +
          '<td>' + (j ? (j.kritis ? '<span class="lencana kritis">KRITIS</span>' : '<span class="lencana aman">fleksibel</span>') : '—') + '</td>' +
          '<td class="aksi-cell">' +
          '<button type="button" class="kecil" data-ubah="' + esc(k.id) + '">Ubah</button> ' +
          '<button type="button" class="kecil telat" data-hapus="' + esc(k.id) + '">Hapus</button>' +
          '</td></tr>';
      }).join('');
    }

    var catatan = [];
    if (hasilHitung.mulaiProyek) catatan.push('Proyek dihitung mulai ' + Hitung.formatTanggalIndo(hasilHitung.mulaiProyek) +
      ' dan selesai ' + Hitung.formatTanggalIndo(hasilHitung.selesaiProyek) + ' (' + hasilHitung.lamaHariKerja + ' hari kerja).');
    if (hasilHitung.dibatasi) catatan.push('Jumlah jalur sangat banyak; daftar jalur dibatasi 20.000 entri.');
    $('#catatanKegiatan').textContent = catatan.join(' ');
  }

  function resetFormKegiatan() {
    idEditKegiatan = null;
    var f = $('#formKegiatan');
    f.reset();
    f.elements.id.value = '';
    f.durasi.value = 1;
    f.warna.value = WARNA_URUT[state.kegiatan.length % WARNA_URUT.length];
    $('#judulFormKegiatan').textContent = 'Tambah Kegiatan';
    gambarBaris([], []);
  }

  /* -------------------------------- tab tim -------------------------------- */

  function renderTim() {
    // tabel anggota
    var tbody = $('#tabelAnggota tbody');
    if (!state.tim.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="kosong">Belum ada anggota tim.</td></tr>';
    } else {
      tbody.innerHTML = state.tim.map(function (a) {
        var libur = (a.libur || []).length
          ? a.libur.map(function (t) { return '<span class="chip-libur">' + esc(Hitung.formatTanggalIndo(t)) + '</span>'; }).join('')
          : '<span class="catatan">—</span>';
        var tugas = state.penugasan.filter(function (p) { return p.anggotaId === a.id; }).length;
        return '<tr>' +
          '<td><b>' + esc(a.nama) + '</b></td>' +
          '<td>' + esc(a.peran || '—') + (tugas ? '<br><span class="catatan">' + tugas + ' penugasan</span>' : '') + '</td>' +
          '<td>' + esc(a.kontak || '—') + '</td>' +
          '<td>' + libur + '</td>' +
          '<td class="aksi-cell">' +
          '<button type="button" class="kecil" data-ubah-anggota="' + esc(a.id) + '">Ubah</button> ' +
          '<button type="button" class="kecil telat" data-hapus-anggota="' + esc(a.id) + '">Hapus</button>' +
          '</td></tr>';
      }).join('');
    }

    // chips libur pribadi pada form
    var chips = $('#daftarLiburPribadi');
    chips.innerHTML = liburForm.length
      ? liburForm.slice().sort().map(function (t) {
        return '<li>' + esc(Hitung.formatTanggalIndo(t)) +
          ' <button type="button" class="kecil telat" data-hapus-libur-pribadi="' + esc(t) + '">✕</button></li>';
      }).join('')
      : '<li class="kosong">Tidak ada libur pribadi.</li>';

    // select pada form penugasan
    var selK = $('#formPenugasan [name="kegiatanId"]');
    var selA = $('#formPenugasan [name="anggotaId"]');
    var nilaiK = selK.value, nilaiA = selA.value;
    selK.innerHTML = state.kegiatan.length
      ? state.kegiatan.map(function (k) { return '<option value="' + esc(k.id) + '">' + esc(potong(k.nama, 50)) + '</option>'; }).join('')
      : '<option value="">— belum ada kegiatan —</option>';
    selA.innerHTML = state.tim.length
      ? state.tim.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nama) + '</option>'; }).join('')
      : '<option value="">— belum ada anggota —</option>';
    if (nilaiK) selK.value = nilaiK;
    if (nilaiA) selA.value = nilaiA;

    // tabel penugasan
    var tb2 = $('#tabelPenugasan tbody');
    if (!state.penugasan.length) {
      tb2.innerHTML = '<tr><td colspan="4" class="kosong">Belum ada penugasan.</td></tr>';
    } else {
      tb2.innerHTML = state.penugasan.map(function (p, i) {
        var k = cariKegiatan(p.kegiatanId), a = cariAnggota(p.anggotaId);
        if (!k || !a) return '';
        return '<tr><td>' + esc(k.nama) + '</td><td><b>' + esc(a.nama) + '</b><br><span class="catatan">' + esc(a.peran || '') + '</span></td>' +
          '<td>' + esc(p.peran || '—') + '</td>' +
          '<td class="aksi-cell"><button type="button" class="kecil telat" data-hapus-tugas="' + i + '">Hapus</button></td></tr>';
      }).join('');
    }
  }

  function resetFormAnggota() {
    idEditAnggota = null;
    var f = $('#formAnggota');
    f.reset();
    f.elements.id.value = '';
    liburForm = [];
    $('#judulFormAnggota').textContent = 'Tambah Anggota Tim';
    renderTim();
  }

  /* ------------------------------ visualisasi ----------------------------- */

  function renderVisual() {
    $$('#pilVisual button').forEach(function (b) {
      b.classList.toggle('aktif', b.getAttribute('data-visual') === visualAktif);
    });
    $('#wadahGantt').closest('.kartu').hidden = visualAktif !== 'gantt';
    $('#wadahPert').hidden = visualAktif !== 'pert';
    $('#wadahJaringan').hidden = visualAktif !== 'jaringan';
    if (visualAktif === 'gantt') gambarGantt();
    else if (visualAktif === 'pert') gambarPERT();
    else gambarJaringan();
  }

  function kotakKosong(wadah, pesan) {
    wadah.innerHTML = '<div class="kosong">' + esc(pesan) + '</div>';
  }

  function gambarGantt() {
    var wadah = $('#wadahGantt');
    if (hasilHitung.error) return kotakKosong(wadah, hasilHitung.error);
    if (!state.kegiatan.length) return kotakKosong(wadah, 'Belum ada kegiatan untuk ditampilkan.');
    if (!hasilHitung.mulaiProyek) return kotakKosong(wadah, 'Jadwal belum dapat dihitung.');

    // daftar tanggal dari mulai sampai selesai proyek
    var tanggal = [], t = hasilHitung.mulaiProyek, jaga = 0;
    while (t && t <= hasilHitung.selesaiProyek && jaga++ < 3000) {
      tanggal.push(t);
      t = Hitung.geserHari(t, 1);
    }
    if (!tanggal.length) return kotakKosong(wadah, 'Rentang tanggal kosong.');
    var idx = {};
    tanggal.forEach(function (d, i) { idx[d] = i; });

    var LABEL = 250, LEBAR = 26, KEPALA = 44, BARIS_T = 38, BAR_T = 22;
    var lebarTotal = LABEL + tanggal.length * LEBAR + 30;
    var tinggiTotal = KEPALA + state.kegiatan.length * BARIS_T + 16;
    var s = [];

    s.push('<svg width="' + lebarTotal + '" height="' + tinggiTotal + '" viewBox="0 0 ' + lebarTotal + ' ' + tinggiTotal + '" xmlns="http://www.w3.org/2000/svg">');
    s.push('<defs><marker id="panah0" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker>' +
      '<marker id="panah0k" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/></marker></defs>');

    // latar kolom + kepala
    var bulanTerakhir = null;
    tanggal.forEach(function (d, i) {
      var x = LABEL + i * LEBAR;
      var tgl = Hitung.parseTanggal(d);
      var akhirPekan = state.proyek.liburMingguan.indexOf(tgl.getDay()) !== -1;
      var khusus = false;
      state.proyek.liburKhusus.forEach(function (l) {
        var ld = Hitung.parseTanggal(l.tanggal);
        if (!ld) return;
        if (l.berulang === 'tahunan') { if (ld.getMonth() === tgl.getMonth() && ld.getDate() === tgl.getDate()) khusus = true; }
        else if (l.berulang === 'bulanan') { if (ld.getDate() === tgl.getDate()) khusus = true; }
        else if (Hitung.formatTanggal(ld) === d) khusus = true;
      });
      if (khusus || akhirPekan) {
        s.push('<rect x="' + x + '" y="' + KEPALA + '" width="' + LEBAR + '" height="' + (tinggiTotal - KEPALA) +
          '" class="' + (khusus ? 'gantt-libur' : 'gantt-akhirpekan') + '"/>');
      }
      if (i % 2 === 0 && !khusus && !akhirPekan) {
        s.push('<rect x="' + x + '" y="' + KEPALA + '" width="' + LEBAR + '" height="' + (tinggiTotal - KEPALA) + '" fill="#f8fafc" opacity=".55"/>');
      }
      var kunci = tgl.getFullYear() + '-' + tgl.getMonth();
      if (kunci !== bulanTerakhir) {
        bulanTerakhir = kunci;
        s.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + tinggiTotal + '" class="gantt-grid"/>');
        s.push('<text x="' + (x + 4) + '" y="15" class="gantt-bulan">' +
          esc(Hitung.NAMA_BULAN[tgl.getMonth()] + ' ' + tgl.getFullYear()) + '</text>');
      }
      s.push('<text x="' + (x + LEBAR / 2) + '" y="34" text-anchor="middle" class="gantt-tgl">' + tgl.getDate() + '</text>');
    });

    // kepala kolom label
    s.push('<rect x="0" y="0" width="' + LABEL + '" height="' + KEPALA + '" fill="#f8fafc"/>');
    s.push('<line x1="0" y1="' + KEPALA + '" x2="' + lebarTotal + '" y2="' + KEPALA + '" class="gantt-grid"/>');
    s.push('<text x="10" y="27" class="gantt-bulan">Kegiatan</text>');

    // baris kegiatan
    var barisY = [];
    state.kegiatan.forEach(function (k, i) {
      var y = KEPALA + i * BARIS_T;
      barisY[k.id] = y;
      if (i % 2 === 1) s.push('<rect x="0" y="' + y + '" width="' + LABEL + '" height="' + BARIS_T + '" fill="#f8fafc"/>');
      s.push('<rect x="8" y="' + (y + BARIS_T / 2 - 5) + '" width="10" height="10" rx="2" fill="' + esc(k.warna) + '"/>');
      s.push('<text x="24" y="' + (y + BARIS_T / 2 - 1) + '" class="gantt-nama">' + esc(potong(k.nama, 30)) + '</text>');
      s.push('<text x="24" y="' + (y + BARIS_T / 2 + 13) + '" class="gantt-kecil" fill="#94a3b8" font-size="10">' +
        k.durasi + ' hari kerja' + (hasilHitung.jadwal[k.id] && hasilHitung.jadwal[k.id].kritis ? ' · KRITIS' : '') + '</text>');
      s.push('<line x1="0" y1="' + (y + BARIS_T) + '" x2="' + lebarTotal + '" y2="' + (y + BARIS_T) + '" class="gantt-grid"/>');
    });

    // bar + float
    state.kegiatan.forEach(function (k) {
      var j = hasilHitung.jadwal[k.id];
      if (!j) return;
      var i0 = idx[j.mulai]; if (i0 == null) i0 = 0;
      var i1 = idx[j.selesai]; if (i1 == null) i1 = tanggal.length - 1;
      var y = barisY[k.id] + (BARIS_T - BAR_T) / 2;
      var x = LABEL + i0 * LEBAR + 1;
      var w = (i1 - i0 + 1) * LEBAR - 3;

      if (j.float > 0 && j.akhirSelesai && idx[j.akhirSelesai] != null && idx[j.akhirSelesai] > i1) {
        var fx = LABEL + (i1 + 1) * LEBAR;
        var fw = (idx[j.akhirSelesai] - i1) * LEBAR - 3;
        s.push('<rect x="' + fx + '" y="' + y + '" width="' + fw + '" height="' + BAR_T + '" rx="4" class="gantt-float"/>');
      }

      s.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + BAR_T + '" rx="4" fill="' +
        (j.kritis ? '#dc2626' : esc(k.warna)) + '" class="' + (j.kritis ? 'gantt-kritis' : 'gantt-baru') + '"><title>' +
        esc(k.nama + ' — ' + Hitung.formatTanggalIndo(j.mulai) + ' s.d. ' + Hitung.formatTanggalIndo(j.selesai) +
          ' (' + j.durasi + ' hari kerja' + (j.kritis ? ', kritis' : ', float ' + j.float) + ')') +
        '</title></rect>');

      // pemisah sub-kegiatan
      var totalSub = (k.sub || []).reduce(function (a, b) { return a + (b.durasi || 0); }, 0);
      if (totalSub > 0 && w > 60) {
        var akum = 0;
        k.sub.forEach(function (sb, si) {
          akum += sb.durasi;
          if (si === k.sub.length - 1) return;
          var sx = x + (akum / totalSub) * w;
          s.push('<line x1="' + sx + '" y1="' + y + '" x2="' + sx + '" y2="' + (y + BAR_T) + '" stroke="rgba(255,255,255,.55)" stroke-width="1"/>');
        });
        k.sub.forEach(function (sb, si) {
          var awal = k.sub.slice(0, si).reduce(function (a, b) { return a + b.durasi; }, 0);
          var sw = ((awal + sb.durasi) / totalSub - awal / totalSub) * w;
          if (sw > 44) {
            s.push('<text x="' + (x + (awal / totalSub) * w + 4) + '" y="' + (y + BAR_T / 2 + 3.5) + '" class="gantt-label">' +
              esc(potong(sb.nama, Math.floor(sw / 6.4))) + '</text>');
          }
        });
      } else if (w > 44) {
        s.push('<text x="' + (x + 5) + '" y="' + (y + BAR_T / 2 + 3.5) + '" class="gantt-label">' + j.durasi + ' hr</text>');
      } else {
        s.push('<text x="' + (x + w + 4) + '" y="' + (y + BAR_T / 2 + 3.5) + '" class="gantt-tgl">' + j.durasi + ' hr</text>');
      }
    });

    // garis dependensi
    state.kegiatan.forEach(function (k) {
      var js = hasilHitung.jadwal[k.id];
      if (!js) return;
      (k.dependensi || []).forEach(function (d) {
        var jp = hasilHitung.jadwal[d.kegiatanId];
        if (!jp) return;
        var tipe = ['FS', 'SS', 'FF', 'SF'].indexOf(d.tipe) !== -1 ? d.tipe : 'FS';
        var x1 = LABEL + (idx[jp.mulai] != null ? idx[jp.mulai] : 0) * LEBAR + 1;
        var w1 = ((idx[jp.selesai] != null ? idx[jp.selesai] : 0) - (idx[jp.mulai] != null ? idx[jp.mulai] : 0) + 1) * LEBAR - 3;
        var x2 = LABEL + (idx[js.mulai] != null ? idx[js.mulai] : 0) * LEBAR + 1;
        var w2 = ((idx[js.selesai] != null ? idx[js.selesai] : 0) - (idx[js.mulai] != null ? idx[js.mulai] : 0) + 1) * LEBAR - 3;
        if (tipe === 'FS' || tipe === 'FF') x1 += w1;          // jangkar dari selesai pendahulu
        if (tipe === 'FF' || tipe === 'SF') x2 += w2;          // jangkar ke selesai penerus
        var y1 = barisY[d.kegiatanId] + BARIS_T / 2;
        var y2 = barisY[k.id] + BARIS_T / 2;
        var dx = (x2 >= x1) ? 9 : -9;
        var kritis = jp.kritis && js.kritis;
        var warna = kritis ? 'panah-kritis' : 'panah';
        var kepala = kritis ? 'panah0k' : 'panah0';
        var dpath = 'M ' + x1 + ' ' + y1 + ' L ' + (x1 + dx) + ' ' + y1 +
          ' L ' + (x1 + dx) + ' ' + y2 + ' L ' + (x2 - 4) + ' ' + y2;
        s.push('<path d="' + dpath + '" class="' + warna + '" marker-end="url(#' + kepala + ')"/>');
        var teksT = tipe + (d.jeda ? ' +' + d.jeda : ' +0');
        s.push('<text x="' + (x1 + dx + 3) + '" y="' + ((y1 + y2) / 2 - 3) + '" class="' + (kritis ? 'panah-teks-kritis' : 'panah-teks') + '">' +
          esc(teksT) + '</text>');
      });
    });

    s.push('</svg>');
    wadah.innerHTML = s.join('');
  }

  function kotakPERT(k, j, x, y, w, h) {
    var s = [];
    s.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" class="kotak-graf' + (j.kritis ? ' kritis' : '') + '"/>');
    s.push('<text x="' + (x + 10) + '" y="' + (y + 16) + '" class="graf-judul">' + esc(potong(k.nama, 24)) + '</text>');
    s.push('<text x="' + (x + 10) + '" y="' + (y + 31) + '" class="graf-detail">Durasi ' + j.durasi + ' hari kerja' +
      (j.kritis ? '  •  KRITIS' : '  •  float ' + j.float) + '</text>');
    s.push('<line x1="' + (x + 8) + '" y1="' + (y + 38) + '" x2="' + (x + w - 8) + '" y2="' + (y + 38) + '" stroke="#e2e8f0"/>');
    s.push('<text x="' + (x + 10) + '" y="' + (y + 52) + '" class="graf-detail">Mulai awal  ' + pendek(j.mulai) +
      '   Selesai awal  ' + pendek(j.selesai) + '</text>');
    s.push('<text x="' + (x + 10) + '" y="' + (y + 66) + '" class="graf-detail">Mulai akhir  ' + pendek(j.akhirMulai) +
      '   Selesai akhir  ' + pendek(j.akhirSelesai) + '</text>');
    s.push('<text x="' + (x + 10) + '" y="' + (y + 80) + '" class="graf-detail">Float total  ' + j.float + ' hari</text>');
    return s.join('');
  }

  function gambarPERT() {
    var wadah = $('#isiPert');
    if (hasilHitung.error) return kotakKosong(wadah, hasilHitung.error);
    if (!state.kegiatan.length) return kotakKosong(wadah, 'Belum ada kegiatan untuk ditampilkan.');

    // kolom berdasarkan tanggal mulai awal
    var kolomTanggal = {}, urutTanggal = [];
    state.kegiatan.forEach(function (k) {
      var j = hasilHitung.jadwal[k.id];
      if (!j) return;
      if (kolomTanggal[j.mulai] == null) { kolomTanggal[j.mulai] = 0; urutTanggal.push(j.mulai); }
    });
    urutTanggal.sort();
    var kolom = {};
    urutTanggal.forEach(function (t, i) { kolom[t] = i; });
    var isiKolom = {};
    var posisi = {};
    state.kegiatan.forEach(function (k) {
      var j = hasilHitung.jadwal[k.id];
      if (!j) return;
      var c = kolom[j.mulai] || 0;
      isiKolom[c] = isiKolom[c] || 0;
      posisi[k.id] = { col: c, row: isiKolom[c] };
      isiKolom[c] += 1;
    });

    var W = 268, H = 96, GX = 56, GY = 28, PAD = 16;
    var maksKolom = Math.max.apply(null, Object.keys(isiKolom).map(Number).concat([0]));
    var maksBaris = 1;
    Object.keys(isiKolom).forEach(function (c) { maksBaris = Math.max(maksBaris, isiKolom[c]); });
    var lebarTotal = PAD * 2 + (maksKolom + 1) * (W + GX);
    var tinggiTotal = PAD * 2 + maksBaris * (H + GY);

    var s = [];
    s.push('<svg width="' + lebarTotal + '" height="' + tinggiTotal + '" viewBox="0 0 ' + lebarTotal + ' ' + tinggiTotal + '" xmlns="http://www.w3.org/2000/svg">');
    s.push('<defs><marker id="panah1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker>' +
      '<marker id="panah1k" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/></marker></defs>');

    var titik = {};
    state.kegiatan.forEach(function (k) {
      var p = posisi[k.id];
      if (!p) return;
      titik[k.id] = { x: PAD + p.col * (W + GX), y: PAD + p.row * (H + GY) };
    });

    // panah dulu agar kotak menutupi ujungnya tidak masalah — digambar setelah? (kotak dulu, panah di atas)
    state.kegiatan.forEach(function (k) {
      var js = hasilHitung.jadwal[k.id];
      if (!js || !titik[k.id]) return;
      (k.dependensi || []).forEach(function (d) {
        var jp = hasilHitung.jadwal[d.kegiatanId];
        if (!jp || !titik[d.kegiatanId]) return;
        var a = titik[d.kegiatanId], b = titik[k.id];
        var kritis = jp.kritis && js.kritis;
        var kelas = kritis ? 'panah-kritis' : 'panah';
        var kepala = kritis ? 'panah1k' : 'panah1';
        var dpath;
        if (b.x > a.x) {
          var x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x - 6, y2 = b.y + H / 2;
          dpath = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 30) + ' ' + y1 + ', ' + (x2 - 30) + ' ' + y2 + ', ' + x2 + ' ' + y2;
        } else {
          var xx1 = a.x + W / 2, yy1 = a.y + H, xx2 = b.x + W / 2, yy2 = b.y - 6;
          dpath = 'M ' + xx1 + ' ' + yy1 + ' C ' + xx1 + ' ' + (yy1 + 24) + ', ' + xx2 + ' ' + (yy2 - 24) + ', ' + xx2 + ' ' + yy2;
        }
        s.push('<path d="' + dpath + '" class="' + kelas + '" marker-end="url(#' + kepala + ')"/>');
        var t = (d.tipe || 'FS') + (d.jeda ? ' +' + d.jeda : ' +0');
        s.push('<text x="' + (b.x > a.x ? a.x + W + 8 : a.x + W / 2 + 8) + '" y="' +
          (b.y > a.y ? a.y + H / 2 - 6 : a.y + H + 14) + '" class="' + (kritis ? 'panah-teks-kritis' : 'panah-teks') + '">' + esc(t) + '</text>');
      });
    });

    state.kegiatan.forEach(function (k) {
      var j = hasilHitung.jadwal[k.id], p = titik[k.id];
      if (!j || !p) return;
      s.push('<title>' + esc(k.nama) + '</title>');
      s.push(kotakPERT(k, j, p.x, p.y, W, H));
    });

    s.push('</svg>');
    wadah.innerHTML = s.join('');
  }

  function kedalaman(id, peta, byId, sedang) {
    if (peta[id] != null) return peta[id];
    if (sedang[id]) return 0; // pengaman siklus
    sedang[id] = true;
    var k = byId[id];
    var dasar = 0;
    (k.dependensi || []).forEach(function (d) {
      if (byId[d.kegiatanId]) dasar = Math.max(dasar, kedalaman(d.kegiatanId, peta, byId, sedang) + 1);
    });
    peta[id] = dasar;
    return dasar;
  }

  function gambarJaringan() {
    var wadah = $('#isiJaringan');
    if (hasilHitung.error) return kotakKosong(wadah, hasilHitung.error);
    if (!state.kegiatan.length) return kotakKosong(wadah, 'Belum ada kegiatan untuk ditampilkan.');

    var byId = {};
    state.kegiatan.forEach(function (k) { byId[k.id] = k; });
    var peta = {}, sedang = {};
    state.kegiatan.forEach(function (k) { kedalaman(k.id, peta, byId, sedang); });

    var isiKolom = {}, titik = {};
    state.kegiatan.forEach(function (k) {
      var c = peta[k.id] || 0;
      isiKolom[c] = isiKolom[c] || 0;
      titik[k.id] = { col: c, row: isiKolom[c] };
      isiKolom[c] += 1;
    });

    var W = 210, H = 74, GX = 78, GY = 34, PAD = 16;
    var maksKolom = Math.max.apply(null, Object.keys(isiKolom).map(Number).concat([0]));
    var maksBaris = 1;
    Object.keys(isiKolom).forEach(function (c) { maksBaris = Math.max(maksBaris, isiKolom[c]); });
    var lebarTotal = PAD * 2 + (maksKolom + 1) * (W + GX);
    var tinggiTotal = PAD * 2 + maksBaris * (H + GY);

    var s = [];
    s.push('<svg width="' + lebarTotal + '" height="' + tinggiTotal + '" viewBox="0 0 ' + lebarTotal + ' ' + tinggiTotal + '" xmlns="http://www.w3.org/2000/svg">');
    s.push('<defs><marker id="panah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker>' +
      '<marker id="panah2k" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/></marker></defs>');

    function kotak(id) {
      var k = byId[id], j = hasilHitung.jadwal[id], p = titik[id];
      if (!k || !j || !p) return '';
      var x = PAD + p.col * (W + GX), y = PAD + p.row * (H + GY);
      var out = [];
      out.push('<title>' + esc(k.nama) + '</title>');
      out.push('<rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" rx="8" class="kotak-graf' + (j.kritis ? ' kritis' : '') + '"/>');
      out.push('<rect x="' + x + '" y="' + y + '" width="7" height="' + H + '" rx="3" fill="' + esc(k.warna) + '"/>');
      out.push('<text x="' + (x + 16) + '" y="' + (y + 20) + '" class="graf-judul">' + esc(potong(k.nama, 27)) + '</text>');
      out.push('<text x="' + (x + 16) + '" y="' + (y + 37) + '" class="graf-detail">' + j.durasi + ' hari kerja · float ' + j.float + '</text>');
      out.push('<text x="' + (x + 16) + '" y="' + (y + 54) + '" class="graf-kecil">' + pendek(j.mulai) + ' → ' + pendek(j.selesai) +
        (j.kritis ? '  •  KRITIS' : '') + '</text>');
      return out.join('');
    }

    state.kegiatan.forEach(function (k) {
      var js = hasilHitung.jadwal[k.id];
      if (!js || !titik[k.id]) return;
      (k.dependensi || []).forEach(function (d) {
        var jp = hasilHitung.jadwal[d.kegiatanId];
        if (!jp || !titik[d.kegiatanId]) return;
        var a = titik[d.kegiatanId], b = titik[k.id];
        var kritis = jp.kritis && js.kritis;
        var kelas = kritis ? 'panah-kritis' : 'panah';
        var kepala = kritis ? 'panah2k' : 'panah2';
        var ax = PAD + a.col * (W + GX), ay = PAD + a.row * (H + GY);
        var bx = PAD + b.col * (W + GX), by = PAD + b.row * (H + GY);
        var dpath, lx, ly;
        if (b.col > a.col) {
          var x1 = ax + W, y1 = ay + H / 2, x2 = bx - 6, y2 = by + H / 2;
          dpath = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + 34) + ' ' + y1 + ', ' + (x2 - 34) + ' ' + y2 + ', ' + x2 + ' ' + y2;
          lx = (x1 + x2) / 2 - 12; ly = (y1 + y2) / 2 - 5;
        } else {
          var xx1 = ax + W / 2, yy1 = ay + H, xx2 = bx + W / 2, yy2 = by - 6;
          dpath = 'M ' + xx1 + ' ' + yy1 + ' C ' + xx1 + ' ' + (yy1 + 26) + ', ' + xx2 + ' ' + (yy2 - 26) + ', ' + xx2 + ' ' + yy2;
          lx = xx1 + 8; ly = yy1 + 16;
        }
        s.push('<path d="' + dpath + '" class="' + kelas + '" marker-end="url(#' + kepala + ')"/>');
        s.push('<text x="' + lx + '" y="' + ly + '" class="' + (kritis ? 'panah-teks-kritis' : 'panah-teks') + '">' +
          esc((d.tipe || 'FS') + (d.jeda ? ' +' + d.jeda : ' +0')) + '</text>');
      });
    });

    state.kegiatan.forEach(function (k) { s.push(kotak(k.id)); });
    s.push('</svg>');
    wadah.innerHTML = s.join('');
  }

  /* ----------------------------- tab jalur kritis -------------------------- */

  function renderJalur() {
    var ringkas = $('#ringkasJalur');
    if (hasilHitung.error) {
      ringkas.innerHTML = '<div class="ringkas merah"><div class="label">Perhitungan gagal</div><div class="nilai" style="font-size:1rem">' +
        esc(hasilHitung.error) + '</div></div>';
      $('#tabelJalur tbody').innerHTML = '<tr><td colspan="4" class="kosong">Perhitungan tidak dapat dijalankan.</td></tr>';
      $('#tabelWaktu tbody').innerHTML = '<tr><td colspan="8" class="kosong">Perhitungan tidak dapat dijalankan.</td></tr>';
      return;
    }
    if (!state.kegiatan.length) {
      ringkas.innerHTML = '<div class="ringkas"><div class="label">Status</div><div class="nilai" style="font-size:1rem">Belum ada kegiatan.</div></div>';
      $('#tabelJalur tbody').innerHTML = '<tr><td colspan="4" class="kosong">Belum ada kegiatan.</td></tr>';
      $('#tabelWaktu tbody').innerHTML = '<tr><td colspan="8" class="kosong">Belum ada kegiatan.</td></tr>';
      return;
    }

    var jp = hasilHitung.jalurTerpanjang;
    var capaian = [];
    if (state.proyek.tanggalRencana) {
      capaian = hasilHitung.selesaiProyek <= state.proyek.tanggalRencana
        ? ['hijau', 'Selesai sesuai/Sebelum target (' + Hitung.formatTanggalIndo(state.proyek.tanggalRencana) + ')']
        : ['merah', 'Melewati target (' + Hitung.formatTanggalIndo(state.proyek.tanggalRencana) + ')'];
    }

    ringkas.innerHTML =
      '<div class="ringkas"><div class="label">Estimasi lama proyek</div><div class="nilai">' + hasilHitung.lamaHariKerja +
      ' hari kerja</div><div class="catatan">' + esc(Hitung.formatTanggalIndo(hasilHitung.mulaiProyek)) + ' → ' +
      esc(Hitung.formatTanggalIndo(hasilHitung.selesaiProyek)) + '</div></div>' +
      '<div class="ringkas ' + (capaian[0] || '') + '"><div class="label">Target selesai</div><div class="nilai" style="font-size:1.15rem">' +
      (state.proyek.tanggalRencana ? esc(Hitung.formatTanggalIndo(state.proyek.tanggalRencana)) : 'belum diatur') +
      '</div><div class="catatan">' + esc(capaian[1] || 'Atur tanggal target di tab Pengaturan Proyek.') + '</div></div>' +
      '<div class="ringkas ' + (jp ? 'merah' : '') + '"><div class="label">Jalur kritis terpanjang</div><div class="nilai">' +
      (jp ? jp.total + ' hari' : '—') + '</div><div class="catatan">' + (jp ? jp.ids.length + ' kegiatan · ' + esc(potong(jp.nama, 70)) : 'tidak ada') + '</div></div>' +
      '<div class="ringkas"><div class="label">Jumlah jalur awal → akhir</div><div class="nilai">' + hasilHitung.jumlahJalur +
      '</div><div class="catatan">Kegiatan kritis: ' + hasilHitung.kritis.length + ' dari ' + state.kegiatan.length + '</div></div>';

    // tabel semua jalur
    var tbody = $('#tabelJalur tbody');
    if (!hasilHitung.jalur.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="kosong">Tidak ada jalur (periksa dependensi).</td></tr>';
    } else {
      tbody.innerHTML = hasilHitung.jalur.map(function (j, i) {
        return '<tr' + (j.kritis ? ' class="baris-kritis"' : '') + '>' +
          '<td class="kiri">' + (i + 1) + '</td>' +
          '<td>' + esc(j.nama) + '</td>' +
          '<td class="kiri"><b>' + j.total + ' hari</b></td>' +
          '<td>' + (j.kritis ? '<span class="lencana kritis">JALUR KRITIS (terpanjang)</span>' : '<span class="catatan">jalur alternatif — lebih pendek ' +
            (jp ? (jp.total - j.total) : 0) + ' hari</span>') + '</td></tr>';
      }).join('');
    }

    // tabel waktu kegiatan
    $('#tabelWaktu tbody').innerHTML = state.kegiatan.map(function (k) {
      var j = hasilHitung.jadwal[k.id];
      if (!j) return '';
      return '<tr' + (j.kritis ? ' class="baris-kritis"' : '') + '>' +
        '<td><span class="sampel-warna" style="background:' + esc(k.warna) + '"></span>' + esc(k.nama) + '</td>' +
        '<td class="kiri">' + j.durasi + '</td>' +
        '<td>' + esc(Hitung.formatTanggalIndo(j.mulai)) + '</td>' +
        '<td>' + esc(Hitung.formatTanggalIndo(j.selesai)) + '</td>' +
        '<td>' + esc(Hitung.formatTanggalIndo(j.akhirMulai)) + '</td>' +
        '<td>' + esc(Hitung.formatTanggalIndo(j.akhirSelesai)) + '</td>' +
        '<td class="kiri">' + j.float + '</td>' +
        '<td>' + (j.kritis ? '<span class="lencana kritis">KRITIS</span>' : '<span class="lencana aman">fleksibel</span>') + '</td></tr>';
    }).join('');
  }

  /* --------------------------------- data --------------------------------- */

  function renderData() {
    var teks = JSON.stringify(state, null, 2);
    $('#pratinjauJSON').textContent = teks.length > 200000 ? teks.slice(0, 200000) + '\n… (dipotong)' : teks;
  }

  function eksporJSON() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = ((state.proyek.nama || 'proyek').replace(/[^\w\-]+/g, '_').toLowerCase()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    tampilkanPesan('Data diekspor sebagai ' + a.download, 'ok');
  }

  function imporJSON(file) {
    var pembaca = new FileReader();
    pembaca.onload = function () {
      try {
        var data = JSON.parse(pembaca.result);
        state = normalisasi(data);
        simpan();
        resetFormKegiatan();
        resetFormAnggota();
        renderSemua();
        tampilkanPesan('Data berhasil diimpor: ' + (state.proyek.nama || 'tanpa nama'), 'ok');
      } catch (e) {
        tampilkanPesan('Impor gagal: file JSON tidak valid (' + e.message + ')', 'gagal');
      }
    };
    pembaca.onerror = function () { tampilkanPesan('Impor gagal: file tidak dapat dibaca.', 'gagal'); };
    pembaca.readAsText(file);
  }

  /* ============================== PERISTIWA =============================== */

  function pasangPeristiwa() {
    // --- navigasi tab ---
    $('#menu').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      tabAktif = btn.getAttribute('data-tab');
      $$('#menu button').forEach(function (b) { b.classList.toggle('aktif', b === btn); });
      $$('.tab').forEach(function (sec) { sec.hidden = sec.id !== 'tab-' + tabAktif; });
      if (tabAktif === 'visual') renderVisual();
    });

    // --- pengaturan proyek ---
    $('#formProyek').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      ubah(function (s) {
        s.proyek.nama = f.nama.value.trim() || 'Proyek Tanpa Nama';
        s.proyek.organisasi = f.organisasi.value.trim();
        s.proyek.deskripsi = f.deskripsi.value.trim();
        s.proyek.tanggalMulai = f.tanggalMulai.value || Hitung.formatTanggal(new Date());
        s.proyek.tanggalRencana = f.tanggalRencana.value || '';
        s.proyek.gunakanLiburPribadi = f.gunakanLiburPribadi.checked;
        s.proyek.liburMingguan = $$('#pilHariLibur input:checked').map(function (cb) { return Number(cb.value); });
      });
      tampilkanPesan('Pengaturan proyek disimpan. Jadwal dihitung ulang.', 'ok');
    });

    $('#formLibur').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!Hitung.parseTanggal(f.tanggal.value)) { tampilkanPesan('Tanggal libur tidak valid.', 'gagal'); return; }
      ubah(function (s) {
        s.proyek.liburKhusus.push({
          id: uid('lk'),
          tanggal: f.tanggal.value,
          nama: f.nama.value.trim() || 'Libur khusus',
          berulang: f.berulang.value
        });
      });
      f.reset();
      tampilkanPesan('Libur khusus ditambahkan.', 'ok');
    });

    $('#daftarLibur').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hapus-libur]');
      if (!btn) return;
      var id = btn.getAttribute('data-hapus-libur');
      ubah(function (s) {
        s.proyek.liburKhusus = s.proyek.liburKhusus.filter(function (l) { return l.id !== id; });
      });
    });

    // --- kegiatan ---
    $('#tambahSub').addEventListener('click', function () { tambahBarisKosong('sub'); });
    $('#tambahDep').addEventListener('click', function () { tambahBarisKosong('dep'); });

    $('#barisSub').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hapus-sub]');
      if (!btn) return;
      var subs = bacaBarisSubMentah();
      subs.splice(Number(btn.getAttribute('data-hapus-sub')), 1);
      gambarBaris(subs, bacaBarisDepMentah());
    });

    $('#barisDep').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hapus-dep]');
      if (!btn) return;
      var deps = bacaBarisDepMentah();
      deps.splice(Number(btn.getAttribute('data-hapus-dep')), 1);
      gambarBaris(bacaBarisSubMentah(), deps);
    });

    $('#formKegiatan').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var nama = f.nama.value.trim();
      if (!nama) { tampilkanPesan('Nama kegiatan wajib diisi.', 'gagal'); return; }
      var durasi = Math.max(1, Math.round(Number(f.durasi.value) || 1));
      var sub = bacaBarisSub();
      var dependensi = bacaBarisDep()
        .filter(function (d) { return d.kegiatanId !== f.elements.id.value; });

      if (dependensi.some(function (d) { return d.kegiatanId === f.elements.id.value; })) {
        tampilkanPesan('Kegiatan tidak boleh bergantung pada dirinya sendiri.', 'gagal');
        return;
      }

      ubah(function (s) {
        if (f.elements.id.value) {
          var k = null;
          s.kegiatan.forEach(function (x) { if (x.id === f.elements.id.value) k = x; });
          if (k) {
            k.nama = nama; k.durasi = durasi; k.warna = f.warna.value; k.sub = sub; k.dependensi = dependensi;
          }
        } else {
          s.kegiatan.push({
            id: uid('k'), nama: nama, durasi: durasi, warna: f.warna.value || WARNA_URUT[s.kegiatan.length % WARNA_URUT.length],
            sub: sub, dependensi: dependensi
          });
        }
      });
      resetFormKegiatan();
      tampilkanPesan('Kegiatan tersimpan. Jadwal dihitung ulang otomatis.', 'ok');
    });

    $('#batalKegiatan').addEventListener('click', resetFormKegiatan);

    $('#tabelKegiatan').addEventListener('click', function (e) {
      var ubahBtn = e.target.closest('[data-ubah]');
      if (ubahBtn) {
        var k = cariKegiatan(ubahBtn.getAttribute('data-ubah'));
        if (!k) return;
        idEditKegiatan = k.id;
        var f = $('#formKegiatan');
        f.elements.id.value = k.id;
        f.nama.value = k.nama;
        f.durasi.value = k.durasi;
        f.warna.value = k.warna;
        $('#judulFormKegiatan').textContent = 'Ubah Kegiatan';
        gambarBaris((k.sub || []).slice(), (k.dependensi || []).map(function (d) {
          return { kegiatanId: d.kegiatanId, tipe: d.tipe, jeda: d.jeda };
        }));
        $('#formKegiatan').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      var hapusBtn = e.target.closest('[data-hapus]');
      if (hapusBtn) {
        var id = hapusBtn.getAttribute('data-hapus');
        var kk = cariKegiatan(id);
        if (!kk) return;
        if (!confirm('Hapus kegiatan "' + kk.nama + '"?\nDependensi yang menunjuk ke kegiatan ini dan penugasan terkait ikut dihapus.')) return;
        ubah(function (s) {
          s.kegiatan = s.kegiatan.filter(function (x) { return x.id !== id; });
          s.kegiatan.forEach(function (x) {
            x.dependensi = (x.dependensi || []).filter(function (d) { return d.kegiatanId !== id; });
          });
          s.penugasan = s.penugasan.filter(function (p) { return p.kegiatanId !== id; });
        });
        if (idEditKegiatan === id) resetFormKegiatan();
        tampilkanPesan('Kegiatan "' + kk.nama + '" dihapus.', 'ok');
      }
    });

    // --- tim ---
    $('#tambahLiburPribadi').addEventListener('click', function () {
      var inp = $('#formAnggota [name="liburBaru"]');
      if (!Hitung.parseTanggal(inp.value)) { tampilkanPesan('Pilih tanggal libur pribadi terlebih dahulu.', 'gagal'); return; }
      if (liburForm.indexOf(inp.value) === -1) liburForm.push(inp.value);
      inp.value = '';
      renderTim();
    });

    $('#daftarLiburPribadi').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hapus-libur-pribadi]');
      if (!btn) return;
      var t = btn.getAttribute('data-hapus-libur-pribadi');
      liburForm = liburForm.filter(function (x) { return x !== t; });
      renderTim();
    });

    $('#formAnggota').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var nama = f.nama.value.trim();
      if (!nama) { tampilkanPesan('Nama anggota wajib diisi.', 'gagal'); return; }
      ubah(function (s) {
        if (f.elements.id.value) {
          var a = null;
          s.tim.forEach(function (x) { if (x.id === f.elements.id.value) a = x; });
          if (a) { a.nama = nama; a.peran = f.peran.value.trim(); a.kontak = f.kontak.value.trim(); a.libur = liburForm.slice().sort(); }
        } else {
          s.tim.push({ id: uid('a'), nama: nama, peran: f.peran.value.trim(), kontak: f.kontak.value.trim(), libur: liburForm.slice().sort() });
        }
      });
      resetFormAnggota();
      tampilkanPesan('Anggota tim tersimpan.', 'ok');
    });

    $('#batalAnggota').addEventListener('click', resetFormAnggota);

    $('#tabelAnggota').addEventListener('click', function (e) {
      var ubahBtn = e.target.closest('[data-ubah-anggota]');
      if (ubahBtn) {
        var a = cariAnggota(ubahBtn.getAttribute('data-ubah-anggota'));
        if (!a) return;
        idEditAnggota = a.id;
        var f = $('#formAnggota');
        f.elements.id.value = a.id;
        f.nama.value = a.nama;
        f.peran.value = a.peran;
        f.kontak.value = a.kontak;
        liburForm = (a.libur || []).slice();
        $('#judulFormAnggota').textContent = 'Ubah Anggota Tim';
        renderTim();
        $('#formAnggota').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      var hapusBtn = e.target.closest('[data-hapus-anggota]');
      if (hapusBtn) {
        var id = hapusBtn.getAttribute('data-hapus-anggota');
        var aa = cariAnggota(id);
        if (!aa) return;
        if (!confirm('Hapus anggota "' + aa.nama + '" beserta penugasannya?')) return;
        ubah(function (s) {
          s.tim = s.tim.filter(function (x) { return x.id !== id; });
          s.penugasan = s.penugasan.filter(function (p) { return p.anggotaId !== id; });
        });
        if (idEditAnggota === id) resetFormAnggota();
        tampilkanPesan('Anggota dihapus.', 'ok');
      }
    });

    $('#formPenugasan').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!f.kegiatanId.value || !f.anggotaId.value) {
        tampilkanPesan('Pilih kegiatan dan anggota terlebih dahulu.', 'gagal');
        return;
      }
      var ganda = state.penugasan.some(function (p) {
        return p.kegiatanId === f.kegiatanId.value && p.anggotaId === f.anggotaId.value;
      });
      if (ganda) { tampilkanPesan('Anggota tersebut sudah ditugaskan pada kegiatan ini.', 'gagal'); return; }
      ubah(function (s) {
        s.penugasan.push({ kegiatanId: f.kegiatanId.value, anggotaId: f.anggotaId.value, peran: f.peran.value.trim() });
      });
      f.peran.value = '';
      tampilkanPesan('Penugasan ditambahkan.', 'ok');
    });

    $('#tabelPenugasan').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hapus-tugas]');
      if (!btn) return;
      var i = Number(btn.getAttribute('data-hapus-tugas'));
      ubah(function (s) { s.penugasan.splice(i, 1); });
      tampilkanPesan('Penugasan dihapus.', 'ok');
    });

    // --- visualisasi ---
    $('#pilVisual').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-visual]');
      if (!btn) return;
      visualAktif = btn.getAttribute('data-visual');
      renderVisual();
    });

    // --- data ---
    $('#btnEkspor').addEventListener('click', eksporJSON);
    $('#fileImpor').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) imporJSON(file);
      e.target.value = '';
    });
    $('#btnContoh1').addEventListener('click', function () {
      if (!confirm('Muat Contoh 1 akan MENIMPA data yang ada. Lanjutkan?')) return;
      ubah(function () { state = normalisasi(Contoh.rotiManis()); });
      resetFormKegiatan();
      resetFormAnggota();
      renderSemua();
      tampilkanPesan('Contoh 1 (Toko Online Roti Manis Gorontalo) dimuat.', 'ok');
    });
    $('#btnContoh2').addEventListener('click', function () {
      if (!confirm('Muat Contoh 2 akan MENIMPA data yang ada. Lanjutkan?')) return;
      ubah(function () { state = normalisasi(Contoh.kasir()); });
      resetFormKegiatan();
      resetFormAnggota();
      renderSemua();
      tampilkanPesan('Contoh 2 (Jalur kritis Aplikasi Kasir dan Stok Toko) dimuat.', 'ok');
    });
    $('#btnHapus').addEventListener('click', function () {
      if (!confirm('Hapus SEMUA data proyek di browser ini? Tindakan ini tidak dapat dibatalkan.')) return;
      ubah(function () { state = normalisasi(null); });
      resetFormKegiatan();
      resetFormAnggota();
      renderSemua();
      tampilkanPesan('Semua data dihapus. Proyek kosong siap diisi.', 'ok');
    });
  }

  /* ================================ MULAI ================================= */

  document.addEventListener('DOMContentLoaded', function () {
    muatDariPenyimpanan();
    resetFormKegiatan();
    resetFormAnggota();
    pasangPeristiwa();
    renderSemua();
    $$('.tab').forEach(function (sec) { sec.hidden = sec.id !== 'tab-' + tabAktif; });
  });
})();