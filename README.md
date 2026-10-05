# GoldPredict ANTAM

Dashboard hybrid untuk pemantauan dan prediksi harga emas ANTAM berdasarkan harga emas dunia (XAU/USD), USD/IDR, data historis ANTAM, dan model prediksi.

## Status
Versi awal / scaffold. Data pada `data/latest.json` masih contoh dan bukan sinyal investasi riil.

## Fitur awal
- Dashboard responsif
- PWA / offline cache
- Auto-refresh browser setiap 60 detik
- Struktur data prediksi ANTAM
- Siap dihubungkan ke GitHub Actions dan API pasar

## Deploy GitHub Pages
Aktifkan: **Settings → Pages → Deploy from a branch → main / root**.

Setelah aktif, aplikasi akan tersedia di:
`https://akhirobin.github.io/goldpredict-antam/`

## Tahap berikutnya
1. Hubungkan API XAU/USD.
2. Hubungkan API USD/IDR.
3. Tambahkan data harga resmi ANTAM.
4. Bangun historical dataset.
5. Tambahkan indikator teknikal dan model ensemble.
6. Backtest dan kalibrasi confidence.
7. Otomatisasi update via GitHub Actions.

> Decision-support only. Prediksi bukan jaminan keuntungan.
