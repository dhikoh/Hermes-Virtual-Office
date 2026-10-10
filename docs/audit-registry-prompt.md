# Prompt: Audit dan perbaikan persistensi agentRegistry

Kerjakan audit dan perbaikan di repo `D:\Workspace Virtual\Hermes3D`. Fokus file: `server/hermes-gateway-adapter.js`. Baca `AGENTS.md` dulu.

## Masalah yang dilaporkan

Sub-agen yang sudah di-spawn hilang setelah server mati, padahal chat sudah menyatakan perekrutan selesai. Chat history masih ada (tersimpan di `~/.hermes/hermes3d-history.json`), tapi `agentRegistry` hanya `Map` di memori. Akibatnya history jadi yatim dan orchestrator tidak sinkron dengan kenyataan.

## Tugas

1. **Verifikasi dulu.** Tunjukkan baris kode yang menyebabkan kehilangan state. Jangan asumsi.
2. **Audit ketidakintegrasian sejenis.** Cek minimal:
   - `agentRegistry`: `execSpawnAgent`, update, dan delete tidak persisten.
   - `loadHistoryFromDisk`: kandidat path hardcode (`/tmp`, `D:/tmp`) dan merge berdasarkan panjang array, bukan timestamp. Bisa memuat versi salah.
   - `saveHistoryToDisk`: debounce 500ms. Pesan terakhir bisa hilang jika proses mati sebelum timer jalan. Tambahkan flush saat SIGINT/SIGTERM/exit.
   - Workspace `${HOME}/.hermes/workspace-<slug>` dibuat saat spawn? Jika tidak, buat.
   - Sumber kebenaran roster: cek apakah frontend (`src/`) menyimpan roster sendiri (localStorage, state) yang bisa bertentangan dengan backend. Laporkan, jangan ubah frontend tanpa konfirmasi.
   - Apakah `list_team`, `delegate_task`, dan presence membaca registry yang sama setelah restart.
3. **Perbaiki:**
   - Simpan registry ke `~/.hermes/hermes3d-agents.json` setiap spawn, update, delete. Pakai pola debounce yang sama dengan history.
   - Load registry saat startup, sebelum `loadHistoryFromDisk` dan `startAdapter()`.
   - Hapus atau satukan fallback path. Jadikan satu sumber kebenaran.
   - Validasi isi JSON saat load. Jika korup, log warning dan jangan crash.
   - Jangan ubah perilaku di luar ruang lingkup ini.
4. **Aturan kerja:**
   - Diff sekecil mungkin. Jangan tambah abstraksi atau dependency baru.
   - Jangan commit. Jangan push.
   - Jangan ubah gateway protocol atau Hermes HTTP API (external contract).
   - Tambahkan satu cek yang bisa dijalankan untuk logika non-trivial (assert atau tes kecil di `tests/unit`, pakai vitest yang sudah ada).
   - Tandai penyederhanaan dengan komentar `ponytail:` yang menyebut batas dan jalur upgrade.
5. **Verifikasi wajib sebelum lapor selesai:**
   - `node --check server/hermes-gateway-adapter.js`
   - `npm run test -- --run` (catat kegagalan pra-existing, jangan tambah yang baru)
   - Simulasi: jalankan adapter, spawn agen lewat WS, matikan proses, jalankan ulang, pastikan agen masih ada di `list_team`.
6. **Laporan akhir, singkat:**
   - Akar masalah dengan `file:baris`.
   - Daftar perubahan per file.
   - Hasil verifikasi (perintah + output ringkas).
   - Hal yang sengaja tidak diubah dan alasannya.
   - Pertanyaan jika ada keputusan yang butuh persetujuan.
