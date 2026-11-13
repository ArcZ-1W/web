# Xozen Cloud - Sistem Pengumpulan Tugas & Drive Lokal (Flat Design & Mobile-Friendly)

Aplikasi web modern bertema Flat Design dan Mobile UI Friendly untuk mengelola tugas dan proyek sekolah atau kampus dengan penyimpanan drive lokal, gerbang login awal, akses khusus guru (tekan tahan 3 detik tanpa hint), sistem absen 16 siswa, dan penyimpanan progress otomatis (temp).

---

## 1. Gerbang Awal Login (Auth Gateway)

Saat halaman pertama kali dibuka, pengguna langsung diarahkan ke **Gerbang Masuk Xozen Cloud**:

### A. Login Siswa (16 Murid)
* Siswa memasukkan **Nomor Absen (1 sampai 16)** dan **Password Akses (Nomor Absen + 2 Huruf Random)**.
* Klik tombol **Lanjutkan** untuk langsung masuk ke dasbor siswa.
* Contoh akun absen 15: Password `15XG`.

| No. Absen | Akun Siswa | Password Akses |
| :---: | :--- | :---: |
| **01** | Siswa Absen 1 | `01KP` *(atau `1KP`)* |
| **02** | Siswa Absen 2 | `02BZ` *(atau `2BZ`)* |
| **03** | Siswa Absen 3 | `03TF` *(atau `3TF`)* |
| **04** | Siswa Absen 4 | `04ML` *(atau `4ML`)* |
| **05** | Siswa Absen 5 | `05RX` *(atau `5RX`)* |
| **06** | Siswa Absen 6 | `06JW` *(atau `6JW`)* |
| **07** | Siswa Absen 7 | `07HY` *(atau `7HY`)* |
| **08** | Siswa Absen 8 | `08VC` *(atau `8VC`)* |
| **09** | Siswa Absen 9 | `09QS` *(atau `9QS`)* |
| **10** | Siswa Absen 10 | `10BN` |
| **11** | Siswa Absen 11 | `11LK` |
| **12** | Siswa Absen 12 | `12WP` |
| **13** | Siswa Absen 13 | `13DX` |
| **14** | Siswa Absen 14 | `14ZC` |
| **15** | Siswa Absen 15 | `15XG` *(Sesuai Contoh)* |
| **16** | Siswa Absen 16 | `16VJ` |

### B. Akses Khusus Guru (Tahan Tombol: Getar di Detik 3, Masuk di Detik 4)
* Halaman login tampil bersih tanpa petunjuk (hint) untuk menjaga privasi.
* Guru cukup **menekan dan menahan tombol "Lanjutkan"**.
* Indikator garis aksen mikro di bagian bawah tombol mengisi secara halus.
* **Di detik ke-3 (3000 ms)**: Indikator layar getar (*screen vibration shake effect* dan haptic getar perangkat) aktif memberi sinyal fisik.
* **Di detik ke-4 (4000 ms)**: Panel **Mode Guru Terbuka** otomatis terbuka.
* Guru cukup memasukkan password guru:
  - Password Guru: `guru123`.
  - Klik **Masuk sebagai Guru**.

---

## 2. Fitur Penyimpanan Progress Lokal (Temp Auto-Save)

Sistem secara cerdas menjaga kemajuan pengerjaan pengguna agar tidak hilang saat peramban dimuat ulang atau tertutup secara tidak sengaja:
1. **Draf Tugas Guru (Temp Draft)**:
   - Saat guru mengetik judul, mapel, deskripsi instruksi, tanggal deadline, dan kebijakan keterlambatan, sistem otomatis menyimpannya ke memori lokal sementara (`temp`).
   - Jika formulir tertutup atau halaman disegarkan, draf akan otomatis dipulihkan kembali saat guru membuka modal *"Buat Tugas Baru"*.
   - Draf otomatis dibersihkan begitu tugas berhasil diterbitkan.
2. **Draf Catatan Siswa (Temp Notes)**:
   - Saat siswa mengetik catatan atau komentar pengumpulan tugas, sistem menyimpannya secara otomatis ke *temp*.
   - Jika modal pengumpulan ditutup, catatan sebelumnya akan otomatis terisi kembali.
   - Draf otomatis dibersihkan setelah tugas berhasil dikirimkan ke guru.

---

## 3. Dasbor Diagnostik Sistem & Ketepatan Pengumpulan (Halaman Terpisah & 2x2 Grid)

Tersedia dasbor monitoring performa perangkat, koneksi, dan analitik tugas yang berada di halaman terpisah melalui navigasi sidebar:
* **Halaman Terpisah**: Diakses melalui menu navigasi sidebar (pilihan antara **Daftar Tugas**, **Dashboard**, dan **Riwayat Tugas**).
* **Tata Letak Adaptif (2 Atas 2 Bawah)**:
  - Pada layar ponsel/HP: 4 box tersusun rapi dalam 2 baris (2 atas, 2 bawah).
  - Pada laptop/layar menengah: otomatis menyesuaikan menjadi 2 atas 2 bawah jika ruang horizontal tidak mencukupi untuk 4 kolom.
  - Pada layar desktop lebar: 4 box berdampingan dalam 1 baris.
* **Cek Baterai**: Membaca persentase baterai secara langsung via Battery API, indikator status pengisian daya (charging), dan meteran level daya visual.
* **Cek Jaringan & Ping**: Menampilkan status online/offline secara dinamis, jenis konektivitas (WiFi/4G), serta pengukuran latensi/ping riil.
* **Cek IP Publik**: Menampilkan alamat IP publik pengguna secara akurat dengan protokol terenkripsi dan tombol penyegaran instan.
* **Circle Bar Ketepatan Waktu**: Diagram donat melingkar (SVG Circular Progress Bar) yang diperbesar dengan tampilan angka persentase bersih di tengah lingkaran tanpa teks bertumpuk, serta rincian jumlah tugas tepat waktu dan terlambat di bagian bawah.

---

## 4. Fitur Utama Lainnya

* **Pop-up Riwayat Tugas**: Menu *"Riwayat Tugas"* di sidebar membuka jendela pop-up modal lengkap berisi riwayat tugas yang telah dikumpulkan, status ketepatan waktu, dan tautan unduh berkas.
* **Pengaturan Tenggat Waktu & Kebijakan Keterlambatan**:
  - *Tutup*: Form terkunci mutlak setelah deadline.
  - *Label Terlambat*: Menerima tugas dengan status otomatis **TERLAMBAT**.
* **Kelola Nama 16 Siswa**: Guru dapat mengubah nama asli murid pada menu *"Akun 16 Siswa (Password)"*.
* **Bebas Data Dummy**: Dimulai dengan daftar tugas kosong murni (0 tugas) siap pakai.

---

## Cara Menjalankan

Jalankan perintah di terminal:
```bash
npm start
```
atau
```bash
node server.js
```
Buka peramban di: `http://localhost:3000`
