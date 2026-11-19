# Sea-Finance — System Design

## 1. Tujuan

Sea-Finance mengubah e-Statement SeaBank bulanan menjadi ledger transaksi yang dapat diaudit, dikategorikan, dan ditampilkan dalam laporan keuangan pribadi.

Prinsip utama:
- PDF asli disimpan di Google Drive pribadi, bukan di GitHub.
- Google Sheets menjadi penyimpanan data awal.
- Google Apps Script menangani impor, parsing, validasi, kategorisasi aturan, dan agregasi laporan.
- Web App menjadi antarmuka untuk upload, review transaksi, kategori, dan dashboard.
- GitHub hanya menyimpan source code dan dokumentasi; repository harus Private.

## 2. Temuan dari contoh e-Statement

Sampel gabungan `ilovepdf_merged.pdf` berisi beberapa e-Statement bulanan. Struktur halaman yang terlihat konsisten:
- Header `BANK STATEMENT`, nomor seri, dan tanggal penerbitan.
- `ACCOUNT SUMMARY`: periode, saldo awal, total outgoing, total incoming, saldo akhir.
- `TIME DEPOSIT`: tenor, maturity date, suku bunga, dan placement amount.
- `SAVINGS - TRANSACTION DETAILS`: tanggal, deskripsi transaksi, outgoing, incoming, end balance.
- `TIME DEPOSIT - INTEREST & TAX DETAILS`: pembayaran bunga deposito dan pajak, atau `NO TRANSACTION`.

Contoh Januari 2026:
- Saldo awal: Rp6.166.001
- Total outgoing: Rp3.423.237
- Total incoming: Rp5.311.185
- Saldo akhir: Rp8.053.949
- Deposito aktif yang tercantum: Rp10.000.000

PDF memiliki teks yang dapat diekstrak; OCR tidak perlu menjadi jalur utama. Parser tetap harus memvalidasi hasil ekstraksi terhadap ringkasan bulanan dan saldo berjalan.

## 3. Arsitektur

```
User
  |
  v
Sea-Finance Web App (HTML/CSS/JavaScript)
  |
  v
Google Apps Script
  |---- Drive: arsip PDF asli
  |---- Parser: ekstraksi teks dan pemetaan transaksi
  |---- Validator: rekonsiliasi dan deteksi duplikasi
  |---- Categorizer: rules + review manual
  |---- Google Sheets: ledger, kategori, impor, deposito
  |
  v
Dashboard & laporan bulanan/tahunan
```

## 4. Alur impor

1. Pengguna mengunggah e-Statement SeaBank melalui Web App.
2. Backend memeriksa tipe file, ukuran, periode laporan, dan nomor seri.
3. PDF disimpan ke folder Google Drive privat.
4. Apps Script mengekstrak teks PDF. Jika format ekspor berubah atau teks tidak terbaca, impor dihentikan dan ditandai untuk pemeriksaan; OCR menjadi fallback, bukan asumsi awal.
5. Parser memisahkan ringkasan rekening, transaksi tabungan, dan detail deposito.
6. Setiap transaksi dinormalisasi ke struktur ledger.
7. Sistem menghitung hash transaksi untuk idempotensi dan mencegah impor ganda.
8. Validator mencocokkan saldo akhir transaksi, saldo awal/akhir periode, serta total incoming/outgoing dengan ringkasan statement.
9. Kategori otomatis diterapkan berdasarkan aturan. Transaksi yang ambigu masuk antrean review.
10. Setelah lolos validasi, data disimpan dan dashboard diperbarui.

## 5. Model data Google Sheets

### Transactions
Kolom minimum:
- transaction_id
- transaction_date
- description_raw
- transaction_type
- direction (IN/OUT)
- amount
- balance_after
- category_id
- counterparty
- classification_status (AUTO/REVIEW/MANUAL)
- import_id
- transaction_hash
- notes

Simpan nilai uang sebagai integer Rupiah, bukan floating point.

### Imports
- import_id
- source_file_id
- statement_serial
- period_start
- period_end
- opening_balance
- total_outgoing
- total_incoming
- ending_balance
- imported_at
- import_status
- validation_message

### Categories
- category_id
- category_name
- category_type (INCOME/EXPENSE/TRANSFER/ASSET/FEES/TAX)
- parent_category_id
- is_active

### Rules
- rule_id
- priority
- match_field
- match_operator
- match_value
- category_id
- transaction_type
- requires_review
- is_active

### TimeDeposits
- deposit_id
- statement_import_id
- deposit_reference
- principal
- tenure
- maturity_date
- interest_rate_pa
- status

### DepositInterest
- deposit_interest_id
- deposit_id
- payment_date
- gross_interest
- withholding_tax
- net_interest

## 6. Aturan akuntansi yang wajib

Jangan samakan total outgoing/incoming dari statement dengan pengeluaran/pendapatan konsumsi.

- Transfer antar rekening milik sendiri bukan pendapatan atau beban.
- Top up e-wallet perlu ditentukan: transfer ke saldo e-wallet atau pengeluaran, jangan dihitung dua kali.
- Bunga tabungan adalah pendapatan bunga.
- Pajak bunga dan biaya admin/top-up adalah beban/potongan.
- Refund harus dikaitkan ke transaksi asal jika memungkinkan.
- Penempatan/pencairan deposito adalah perpindahan aset, bukan pengeluaran/pendapatan.
- Deposito dan saldo tabungan dilaporkan sebagai aset terpisah.

Rekening BRI tujuan dengan nama AAN MAULANA telah dikonfirmasi pengguna sebagai rekening milik sendiri. Transaksi SeaBank ke rekening BRI tersebut diklasifikasikan sebagai TRANSFER_INTERNAL, bukan beban. Jika kelak ada rekening tujuan lain, kepemilikannya harus dikonfirmasi sebelum aturan otomatis dibuat.

## 7. Rekonsiliasi dan kualitas data

Untuk setiap statement:
- opening_balance + total_incoming - total_outgoing = ending_balance.
- Saldo berjalan setiap transaksi harus konsisten dengan arah dan nominal transaksi.
- Jumlah transaksi hasil parsing harus sama dengan jumlah baris transaksi yang terdeteksi.
- Import dengan nomor seri/periode yang sudah ada tidak boleh menggandakan data.
- Ketidaksesuaian harus membuat status impor REVIEW/FAILED; jangan diam-diam memasukkan data yang tidak valid.

## 8. Keamanan

- Jangan pernah meminta PIN, password, OTP, atau kredensial SeaBank.
- Batasi akses Web App dan Google Drive ke akun Google pengguna.
- Jangan commit PDF statement, nomor rekening, alamat, atau data transaksi ke GitHub.
- Simpan ID folder Drive dan Spreadsheet ID di Script Properties, bukan di source code.
- Repository GitHub harus Private.

## 9. Tahapan implementasi

1. PDF reconnaissance dan spesifikasi parser (tahap ini).
2. Buat spreadsheet database dan skema sheet.
3. Implementasikan parser dengan fixture yang sudah disamarkan.
4. Tambahkan rekonsiliasi, idempotensi, dan log impor.
5. Bangun UI upload dan review transaksi.
6. Bangun kategori, aturan otomatis, dan dashboard.
7. Uji beberapa periode statement dan deploy Web App.

## 10. Keputusan yang masih perlu dikonfirmasi

- Perlakuan top up DANA/LinkAja/ShopeePay: transfer ke akun dompet digital (dan pengeluaran dicatat saat saldo dipakai), atau langsung dicatat sebagai pengeluaran?
- Apakah top up DANA/LinkAja/ShopeePay ingin dicatat sebagai transfer ke dompet digital, lalu pengeluaran dicatat saat saldo dipakai, atau langsung dianggap pengeluaran?
- Kategori pengeluaran dan pemasukan final akan disepakati setelah contoh transaksi ditinjau.
