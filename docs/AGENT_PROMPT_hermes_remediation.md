# PROMPT UNTUK AI AGENT — Remediasi Audit Hermes Virtual Office (target: patch v1.0.14)

Kamu adalah engineer senior yang mengerjakan repo **dhikoh/Hermes-Virtual-Office** (Next.js 16 + custom Node server + adapter WebSocket `server/hermes-gateway-adapter.js`). Sebuah audit independen menemukan bahwa `PATCH_NOTES.md` memuat klaim yang tidak cocok dengan kode, ada gap integrasi, duplikasi, dan dead code. Tugasmu: **memperbaiki semuanya, membuktikan setiap perbaikan dengan bukti yang bisa diverifikasi, lalu menulis ulang patch notes secara jujur.**

Bahasa kerja: Indonesia untuk laporan dan dokumen; identifier, komentar kode, dan pesan commit dalam bahasa Inggris.

---

## 0. ATURAN MUTLAK (pelanggaran = pekerjaan ditolak)

1. **Protokol bukti.** Kamu tidak boleh menulis "lulus", "0 error", "semua tes pass", "sudah terintegrasi", atau klaim serupa di patch notes, commit message, atau laporan **kecuali** kamu menjalankan perintahnya di sesi ini dan menempelkan perintah beserta ringkasan output aslinya (jumlah file/tes, exit code). Perintah yang tidak bisa dijalankan ditulis `NOT RUN — <alasan>`. Jangan menebak angka.
2. **Reproduksi dulu, baru perbaiki.** Setiap temuan di bagian 3 harus kamu konfirmasi sendiri lebih dulu (grep/baca kode/jalankan). Jika temuan ternyata tidak terbukti, tulis `NOT REPRODUCED` beserta buktinya, jangan "memperbaiki" sesuatu yang tidak rusak.
3. **Nomor baris di dokumen ini hanya petunjuk** (diambil dari snapshot repo, bisa bergeser). Cari lokasi dengan `grep`, jangan edit berdasarkan nomor baris saja.
4. **Dilarang melemahkan tes agar lulus**: tidak boleh menghapus assertion, menambah `.skip`, atau menurunkan ekspektasi. Tes hanya boleh diubah bila perilaku sengaja berubah, dan alasannya dicatat di commit.
5. **Dilarang** menambahkan `typescript.ignoreBuildErrors`, `eslint-disable` massal, `// @ts-nocheck`, atau `|| true` untuk menyembunyikan kegagalan.
6. **Tidak ada scope creep.** Hanya kerjakan paket kerja (WP) di bawah. Ide tambahan masuk ke `Known Limits` / daftar saran di laporan akhir, bukan ke kode.
7. **Jangan menulis ulang sejarah patch notes secara diam-diam.** Klaim lama yang salah dikoreksi lewat bagian `Corrections to earlier notes`, bukan dihapus.
8. **Satu WP = satu commit** (atau satu PR kecil) di branch `fix/audit-remediation-v1.0.14`. Sebelum setiap commit jalankan Gate Standar (bagian 1.2). Jika gate gagal, perbaiki dulu; jangan commit dalam keadaan merah.
9. **Keputusan desain yang ambigu** (ditandai `DECISION`): pilih opsi default yang tertulis, catat di `docs/verification/v1.0.14.md` bagian "Decisions", dan lanjutkan. Jangan berhenti menunggu.
10. **Keamanan data:** jangan pernah mencetak, meng-commit, atau menyalin isi `api_providers.json`, `.env`, atau token ke log/laporan.

---

## 1. FASE 0 — BASELINE (wajib sebelum mengubah apa pun)

### 1.1 Setup
```bash
git checkout -b fix/audit-remediation-v1.0.14
node --version        # harus v22.x (sesuai Dockerfile)
npm ci                # jika package-lock.json tidak ada: STOP, lihat WP7.0
```

### 1.2 Gate Standar (jalankan di baseline dan sebelum setiap commit)
```bash
npm run lint
npm run typecheck          # tsc --noEmit
npm test                   # vitest run
npm run test:e2e-adapter   # node tests/e2e-adapter-persistence.mjs
npm run build              # next build (type-check ikut berjalan)
```
Simpan ringkasan output tiap perintah (exit code, jumlah file/tes, 20 baris terakhir bila gagal) ke `docs/verification/baseline.md`.

### 1.3 Pertanyaan yang harus dijawab oleh baseline (jangan lanjut sebelum terjawab)
- **Q1:** Apakah `npm run typecheck` dan `npm run build` benar-benar bersih? Jika ada error Phaser (`src/features/office/**`, `src/features/pixel-office/**`) catat jumlah dan contoh pesannya. Jawaban ini menentukan WP8.
- **Q2:** Berapa jumlah tes yang dilaporkan vitest (file dan tes)? PATCH_NOTES mengklaim 201 file / 1316 tes; hitungan statis `it(` hanya ~1305. Catat angka asli.
- **Q3:** Apakah `shellExecutor.test.ts` lulus di working tree **tanpa** `.git` (salin repo ke folder baru tanpa `.git`, jalankan tes itu)? Audit menemukan tes `git status` gagal di luar repo git.
- **Q4:** `npm ci --omit=dev` lalu `npm ls playwright-core camoufox` — apakah `playwright-core` terpasang dan memenuhi peer `<1.63`?
- **Q5:** `docker build .` berhasil? (Jika Docker tidak tersedia: `NOT RUN`.)

---

## 2. KONTEKS YANG SUDAH TERVERIFIKASI AUDIT

**Valid (jangan diubah tanpa alasan):** persistensi roster `hermes3d-agents.json`, `STATE_DIR` di adapter, `writeFileAtomic`, `mergeHistory`, flush pada SIGINT/SIGTERM/exit, role guard untuk 5 tool orkestrasi, 5 tes `agentRegistryPersistence`, `tests/e2e-adapter-persistence.mjs` (lulus), perbaikan CSS `ui-thinking-summary`, `%~dp0` di launcher `.bat`, access-gate `required` + CSWSH + 10 tesnya, `escapePosixShellArg`, `remove-local.ts`, file mati yang sudah dihapus.

**Dikonfirmasi bermasalah:** lihat WP1–WP12.

---

## 3. PAKET KERJA

Urutan pengerjaan: **WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP8 → WP9 → WP10 → WP11 → WP12**. Jangan melompat; WP2 memengaruhi WP3, WP6 memengaruhi WP4.

---

### WP1 — Karakter rusak (mojibake) di adapter  ·  PRIORITAS TINGGI

**Masalah.** `server/hermes-gateway-adapter.js` berisi 29 baris teks double-encoded: `â€¦`, `â€”`, `âœ“`, `â†’`, `ðŸ¤–`, `ðŸ“‹`, `ðŸ“»`, `âœ…`, dll. Terlihat di emoji daftar skill (`HERMES_BUILTIN_SKILLS`), emoji identitas di `agents.list`, teks status "Executing: …", log startup, **dan system prompt orchestrator yang dikirim ke LLM** (`ORCHESTRATOR_SYSTEM_PROMPT`). File lain bersih.

**Langkah.**
1. Temukan semuanya: `grep -rnE "â€|ðŸ|âœ|â†|Ã.|\xEF\xBF\xBD" server src scripts`.
2. Ganti setiap kemunculan dengan karakter yang benar. **Gunakan escape Unicode di source** agar kebal masalah encoding editor: `"\u2026"` (…), `"\u2014"` (—), `"\u2713"` (✓), `"\u2192"` (→), `"\u{1F916}"` (🤖), `"\u2705"` (✅). Untuk emoji skill, **sumber kebenarannya adalah `src/lib/skills/catalog.ts`** — samakan tiap `skillKey` di adapter dengan emoji di catalog (ada satu emoji, caveman, yang terpotong dan memuat karakter kontrol tak terlihat; jangan ditebak).
3. Pastikan file disimpan UTF-8 tanpa BOM dan line-ending konsisten. Tambahkan `.gitattributes` (`* text=auto eol=lf`, `*.bat text eol=crlf`) dan `.editorconfig` (`charset = utf-8`).
4. Tambahkan tes `tests/unit/sourceEncoding.test.ts`: telusuri `server/**`, `src/**`, `scripts/**` (`.js .mjs .ts .tsx .css .md`), gagal bila menemukan pola `â€|ðŸ|âœ|â†|Ã[\x80-\xBF]` atau U+FFFD, atau BOM di awal file. Tes ini harus **gagal sebelum perbaikan** dan **lulus sesudahnya** (tunjukkan kedua hasil).
5. Pastikan prompt orchestrator dan teks status kini bersih: tulis assertion kecil di tes yang sama (`ORCHESTRATOR_SYSTEM_PROMPT` tidak memuat karakter di luar ASCII kecuali `—` dan `…` yang disengaja, atau gunakan ASCII `-` dan `...` bila lebih aman untuk LLM).

**Acceptance.** Grep di langkah 1 kosong; tes baru lulus; skills.status mengembalikan emoji yang sama dengan `catalog.ts`.

---

### WP2 — Integrasi role ↔ tool ↔ workflow delegasi  ·  PRIORITAS TINGGI

**Masalah (terverifikasi dari kode).**
- A. `chat.send` memberi tool hanya ke orchestrator: `const tools = isOrchestrator ? TEAM_TOOLS : [];` dan `execDelegateTask` memanggil `streamOneTurn(messages, model, [], …)`. Akibatnya peran **developer, researcher, qa, writer tidak pernah punya tool**; workflow "PM spawn → delegasi → developer mengeksekusi" tidak lengkap, dan role matrix v1.0.4 untuk 4 peran itu praktis dead.
- B. `TEAM_TOOLS` berisi 14 tool (termasuk `read_file`, `write_file`, `execute_command`) yang ditawarkan ke PM, padahal matrix melarang PM membaca/menulis/shell → selalu error dan membuang putaran tool.
- C. Nama tool di `ROLE_DEFINITIONS[*].tools` tidak cocok dengan adapter: matrix memakai `web_search`, `fetch_web_content`, `save_research`, `write_plan`, `write_docs`, `browse_localhost` (tidak ada implementasi), sedangkan adapter memakai `web_search_and_read`, `save_research_note`, `list_snapshots`, `rollback_workspace` (tidak ada di matrix).
- D. `web_search_and_read`, `save_research_note`, `list_snapshots`, `rollback_workspace` **tidak melewati cek role sama sekali**. PM bisa `rollback_workspace` dan browsing; `fetchIsolatedPage` selalu mengevaluasi sebagai `ROLES.RESEARCHER` tanpa peduli pemanggil.
- E. **Eskalasi privilese:** peran ditentukan dari string bebas `agent.role`. `spawn_agent` (diisi LLM) menerima `role` bebas; `role: "pm"` memberi capability orkestrasi. Role tak dikenal jatuh ke `developer` (punya write + shell) — tidak fail-closed.
- F. `runAgenticLoop`: bila `MAX_TOOL_ROUNDS` (8) habis saat model masih memanggil tool, `finalText` tetap `""` dan pesan assistant kosong disimpan ke history.
- G. Klaim notes "non-PM bisa menjangkau tool via prompt injection" terlalu kuat karena sub-agent tidak pernah diberi tool; guard bersifat defense-in-depth (lihat WP11).

**Desain target (ikuti, kecuali ada alasan teknis yang kamu catat).**

1. **Pisahkan *label* dari *capability*.** Tambahkan field `capability` (enum: `pm|developer|researcher|qa|writer`) di registry. `role` tetap label bebas untuk tampilan. Hanya `AGENT_ID` ("hermes") yang boleh `pm`; capability dari entry lain divalidasi dan `pm` ditolak. Fungsi tunggal `resolveCapability(agentId, agent)` di `server/roles/role-matrix.js` dipakai di **semua** tempat (menggantikan logika `rawRole === "orchestrator"` di `executeToolCall`).
   - Entry lama dari disk tanpa `capability`: `id === AGENT_ID → pm`; selain itu cocokkan `role.toLowerCase()` persis dengan enum non-pm; jika tidak cocok → `developer` **dengan `console.warn`** (kompatibilitas mundur), lalu tulis ulang ke disk.
   - `spawn_agent` mendapat parameter `capability` (enum tanpa `pm`, **required**); `role` tetap label. Update `TEAM_TOOLS` schema dan `ORCHESTRATOR_SYSTEM_PROMPT` (jelaskan enum + peran masing-masing).
   - `configure_agent` boleh mengubah `capability` hanya ke nilai non-pm; `agents.create` (UI) default `developer`; `agents.update` tidak boleh menyentuh capability orchestrator.
   - Role tak dikenal saat runtime → **fail-closed**: daftar tool kosong, semua tool ditolak.
2. **Satu sumber kebenaran nama tool.** Ekspor daftar definisi tool dari satu modul (mis. pindahkan `TEAM_TOOLS` ke `server/roles/tool-definitions.js` dan ekspor `ALL_TOOLS`, `toolNames`). Perbarui `ROLE_DEFINITIONS[*].tools` memakai **nama sebenarnya**. Matriks default (sesuaikan hanya bila ada alasan, catat di Decisions):
   | capability | tools |
   |---|---|
   | pm | `workspace_map, spawn_agent, delegate_task, list_team, configure_agent, dismiss_agent, read_agent_context` |
   | developer | `workspace_map, read_file, write_file, execute_command, list_snapshots, rollback_workspace, read_agent_context` |
   | researcher | `web_search_and_read, save_research_note, read_agent_context` |
   | qa | `workspace_map, read_file, execute_command, read_agent_context` |
   | writer | `workspace_map, read_file, read_agent_context` |
   - **DECISION D1 (default):** hapus nama yang tidak punya implementasi (`write_plan`, `write_docs`, `browse_localhost`, `fetch_web_content`, `web_search`, `save_research`) dan catat di Known Limits: "QA tidak punya browsing localhost; Writer belum punya tool tulis dokumen". Jangan mengimplementasikan fitur baru di patch ini.
   - Hapus `list_snapshots`/`rollback_workspace` dari PM (default di atas). `rollback_workspace` adalah operasi destruktif: tambahkan `console.warn` audit log, dan jika `permission-gate` punya tier RED yang cocok, minta approval ticket yang sama dengan `execute_command` (jika tidak sederhana, cukup batasi ke developer dan catat sebagai limit).
3. **Filter tool per capability.** Buat `toolsForCapability(capability)` yang mengembalikan subset `ALL_TOOLS` sesuai matrix. Pakai di (a) `chat.send` menggantikan `isOrchestrator ? TEAM_TOOLS : []`, dan (b) delegasi.
4. **Cek role generik di `executeToolCall`** untuk **semua** tool, bukan hanya 5: di awal fungsi, `if (!ROLE_DEFINITIONS[cap]?.tools.includes(tc.name)) return deny`. Hapus daftar `ORCHESTRATION_TOOLS` lokal (digantikan cek generik). Pertahankan `validateRoleAction` untuk cek berbasis path/perintah. Ubah `default:` di `validateRoleAction` menjadi **deny (fail-closed)** untuk action tak dikenal.
5. **`fetchIsolatedPage` menerima role pemanggil.** Tambahkan `options.role` dan ganti `validateRoleAction(ROLES.RESEARCHER, …)` (dua tempat di `browser-service.js`) dengan role yang diteruskan; `web_search_and_read` meneruskan capability pemanggil. Pertahankan signature lama (`fetchIsolatedPage(url, allowlist)`) untuk tes yang ada.
6. **Delegasi memakai agentic loop.** Ubah `execDelegateTask` agar memanggil `runAgenticLoop({ sessionKey, agentId: targetId, userMessage: message, model, tools: toolsForCapability(cap(target)), emitDelta, abortCheck: null, sendEvent })` sehingga developer/researcher/qa/writer benar-benar bisa bekerja. **Hapus** `history.push(...)` ganda di `execDelegateTask` (loop sudah menyimpan history). Pertahankan event `delta/final/error` per `runId` agar UI 3D tetap bergerak. Guard rekursi: karena hanya `pm` punya `delegate_task`/`spawn_agent`, sub-agent tidak bisa mendelegasi lagi — buktikan dengan tes.
7. **Perbaiki habisnya putaran tool.** Setelah loop, jika `finalText === ""` dan putaran habis: lakukan satu `streamOneTurn(messages, model, [], …)` tanpa tool untuk meminta ringkasan; jika tetap kosong, set `finalText` ke pesan eksplisit ("Reached the maximum number of tool rounds (8) without a final answer."). Jangan menyimpan pesan assistant kosong ke history.
8. Rapikan: hapus parameter `sendEvent` yang tidak dipakai dari `execSpawnAgent`/`execDelegateTask` (atau pakai bila memang dibutuhkan).

**Tes wajib** (`tests/unit/roleToolIntegration.test.ts` + `tests/e2e-adapter-roles.mjs`):
- Tabel 5 capability × 14 tool: tepat tool yang diizinkan matrix yang lolos `executeToolCall`; sisanya `ok:false`.
- Konsistensi: setiap nama di `ROLE_DEFINITIONS[*].tools` ada di `ALL_TOOLS` **dan** di `switch` `executeToolCall`; setiap tool di `ALL_TOOLS` dimiliki ≥1 capability.
- `spawn_agent` dengan `capability:"pm"` ditolak; `role:"pm"` sebagai label **tidak** memberi akses orkestrasi.
- Entry legacy tanpa `capability` dimigrasi + warning; capability tak dikenal → daftar tool kosong.
- Developer tanpa approval tidak bisa menjalankan perintah RED; researcher tidak bisa `read_file`; PM tidak bisa `rollback_workspace`.
- E2E: jalankan **fake OpenAI-compatible server** lokal (node:http, SSE) sebagai `HERMES_API_URL` yang mengembalikan `tool_calls` lalu jawaban akhir. Skenario: PM `spawn_agent(developer)` → `delegate_task` → developer memanggil `write_file` → file muncul + snapshot dibuat. Skenario kedua: model terus mengembalikan `tool_calls` 9×, hasilnya pesan eksplisit (bukan kosong) dan history tidak berisi assistant kosong.
- Tambahkan skrip `test:e2e-roles` di `package.json`.

**Acceptance.** Semua tes di atas lulus; jalankan `grep -n "isOrchestrator ? TEAM_TOOLS" server/` → kosong; tidak ada nama tool di matrix yang tidak diimplementasikan.

---

### WP3 — Persistensi & registry: gap kecil yang tersisa

**Masalah.** (a) `writeAgentsFile` memfilter `a.id !== AGENT_ID` sehingga perubahan nama/model/settings orchestrator utama hilang saat restart; (b) workspace memakai `slug` nama (bukan id): dua agent bernama sama berbagi folder, nama non-ASCII menghasilkan slug kosong (`workspace-`, id `-abc123`); (c) logika pembuatan entry registry dan slug **diduplikasi** di `execSpawnAgent` dan `agents.create`; (d) blok broadcast presence (`byAgent: [...agentRegistry.keys()]…`) **tiga kali** (spawn, configure, dan handler lain ±baris 1827); (e) `loadHistoryFromDisk` punya loop atas array berelemen tunggal `candidateFiles = [HISTORY_FILE]` (dead structure); (f) `agents.create`/`agents.update` menerima `workspace` dari klien tanpa validasi.

**Langkah.**
1. Ekstrak helper: `slugify(name)` (fallback `"agent"` jika kosong), `createAgentEntry({ name, label, capability, instructions, settings, workspace })`, `broadcastPresence()`. Pakai di spawn, `agents.create`, configure, dan handler ±1827. Hapus duplikat.
2. Workspace baru: `path.join(STATE_DIR, "workspace-" + newId)` (id unik). **Entry lama mempertahankan `workspace` yang tersimpan** (jangan migrasi folder).
3. Skema file roster v2, **baca kompatibel mundur** (array lama tetap terbaca):
   ```json
   { "version": 2,
     "main":   { "name": "...", "settings": { "model": "...", "wipe": false, "continuity": true } },
     "agents": [ { "id": "...", "name": "...", "role": "...", "capability": "developer", "workspace": "...", "systemPrompt": "...", "settings": {} } ] }
   ```
   `loadAgentsFromDisk` menerapkan `main` ke entry `hermes` (hanya `name` dan `settings`; **jangan** izinkan mengubah capability `pm`). Validasi tiap field, entry rusak dilewati dengan warning (perilaku sekarang dipertahankan).
4. `agents.create`/`agents.update`: **DECISION D2 (default)** — tolak `workspace` yang (i) bukan string, (ii) mengandung `..`, atau (iii) merupakan root sistem (`/`, `C:\`); selain itu terima. Catat bahwa ini bukan sandbox penuh.
5. Sederhanakan `loadHistoryFromDisk` (hapus array/loop semu), dan hapus fallback `/tmp` di `HOME` (lihat WP6 — akan digantikan helper bersama).
6. Dismiss/delete **tidak** menghapus folder workspace (keamanan data); dokumentasikan di Known Limits.

**Tes.** Tambah ke `agentRegistryPersistence.test.ts` (tes lama tetap lulus): rename orchestrator → restart → nama bertahan; dua agent bernama sama → dua workspace berbeda; nama `"名前"` → id/workspace valid; file array legacy terbaca; file v2 round-trip; workspace dengan `..` ditolak.

---

### WP4 — Shutdown, kehilangan data di Windows, dan supervisi proses

**Masalah.** Di Windows `start-local.js` memakai `taskkill /F` dan `stop-hermes.bat` memakai `Stop-Process -Force`; handler `SIGINT/SIGTERM/exit` tidak jalan sehingga perubahan dalam jendela debounce 500 ms bisa hilang (hanya Ctrl+C yang aman). `stop-hermes.bat` mematikan **proses apa pun** di port 3000/18789 dan selalu mencetak "Berhasil". `start-production.js`: adapter crash hanya di-log; web tetap hidup; container tidak restart.

**Langkah.**
1. **Kurangi risiko di sumbernya (wajib):**
   - Roster (`saveAgentsToDisk`) → tulis **langsung dan sinkron** (hapus debounce; frekuensinya rendah).
   - History → tetap debounce, tetapi panggil `flushPersistence()` di akhir setiap run (`final`/`error`/`aborted`) dan sesudah `delegate_task` selesai.
2. **Shutdown graceful via IPC** (setelah WP5 meleburkan launcher): spawn adapter dengan `stdio: ["inherit","inherit","inherit","ipc"]`; adapter: `if (process.send) process.on("message", (m) => { if (m && m.type === "shutdown") { flushPersistence(); httpServer.close(); process.exit(0); } })`. Launcher: kirim `{type:"shutdown"}`, tunggu event `exit` hingga 3 detik, baru `taskkill /T /F` (Windows) atau `SIGKILL`.
3. **Exit code EADDRINUSE** di adapter dibedakan (mis. `98`) agar supervisor tidak me-restart loop.
4. **`stop-hermes.bat`:** ganti penargetan berbasis port dengan penargetan berbasis command line:
   ```powershell
   Get-CimInstance Win32_Process |
     Where-Object { $_.CommandLine -match 'hermes-gateway-adapter\.js|server[\\/]index\.js|start-stack\.js' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }
   ```
   Cetak jumlah proses yang benar-benar dihentikan ("Tidak ada proses Hermes yang berjalan" bila 0). Tetap `cd /d "%~dp0"`.

**Tes.** Unit untuk handler pesan shutdown (spawn adapter dengan IPC, kirim pesan, assert file roster/history terbaru tertulis dan proses exit 0). Tes manual Windows dicatat sebagai `NOT RUN` bila tidak tersedia — jangan diklaim.

---

### WP5 — Satukan launcher (duplikasi)

**Masalah.** `server/start-local.js` dan `server/start-production.js` hampir identik (spawn adapter + web, cleanup, signal).

**Langkah.**
1. Buat `server/start-stack.js` (satu file) dengan flag `--dev` (menjalankan `index.js --dev`) dan `--open` (buka browser: `win32` → `start`, `darwin` → `open`, `linux` → `xdg-open`, bungkus try/catch). Implementasi supervisor:
   - adapter exit ≠ 0 dan ≠ 98 → restart dengan backoff 1s/2s/4s/8s/16s; bila >5 restart dalam 60 s atau exit 98 → shutdown seluruh stack dan `process.exit(1)` (supaya `restart: unless-stopped` Docker bekerja);
   - web exit (kode apa pun) → shutdown stack dengan kode yang sama;
   - shutdown graceful sesuai WP4.
2. Perbarui semua referensi: `package.json` (`dev:all` → `node server/start-stack.js --dev --open`), `Dockerfile` CMD (`node server/start-stack.js`), `start-hermes.bat`, dokumentasi (`grep -rn "start-local\|start-production" .` harus kosong kecuali CHANGELOG/PATCH_NOTES historis).
3. Hapus `start-local.js` dan `start-production.js`. Periksa juga `scripts/hermes3d-start.sh` dan `scripts/studio-setup.js`: bila fungsinya tumpang tindih dengan launcher, catat di laporan (jangan dihapus tanpa bukti tidak terpakai).

**Tes.** `tests/unit/startStack.test.ts` untuk logika backoff (ekstrak fungsi murni `nextRestartDelay`/`shouldGiveUp`); e2e: jalankan stack dengan adapter palsu yang `exit(1)` dua kali lalu sehat → stack tetap hidup.

---

### WP6 — Satu resolusi state dir + persistensi Docker yang benar

**Masalah.**
- State dir diimplementasikan di 4 tempat dengan fallback berbeda: adapter (`USERPROFILE||HOME||cwd||/tmp`), `server/studio-settings.js`, `src/lib/hermes/paths.ts`, serta `brain-manager`/`scripts/brain-*.mjs` yang memakai `cwd/.hermes`.
- Brain export lokal (tanpa `HERMES_STATE_DIR`) mengarsipkan `cwd/.hermes` padahal adapter menulis ke `~/.hermes` → roster/history/config terlewat. (Di Docker aman karena `/app/.hermes`.)
- `src/app/api/gateway/media/route.ts` membatasi akar media ke `os.homedir()/.hermes` dan **mengabaikan `HERMES_STATE_DIR`** → di Docker (`/app/.hermes`) file media workspace agent kemungkinan ditolak. **Verifikasi dulu** dengan tes sebelum memperbaiki.
- `api_providers.json` dibaca/ditulis di `process.cwd()` (`/app`), bukan di volume → hilang saat container dibuat ulang; `Dockerfile` men-`COPY /app/api_providers.json*` dan `.dockerignore` tidak mengecualikannya → **secret bisa ter-bake ke image** pada build lokal.

**Langkah.**
1. Buat `server/lib/state-dir.js` (CJS) mengekspor `resolveStateDir(env = process.env)` dengan algoritma **identik** `studio-settings.js` (override `HERMES_STATE_DIR` dengan ekspansi `~`; kalau tidak, `os.homedir()` bila ada, lain `os.tmpdir()`, + `.hermes`). Catatan: `os.homedir()` sudah menghormati `USERPROFILE`/`HOME`, jadi untuk pengguna yang ada lokasinya tidak berubah — buktikan dengan tes. Pakai di adapter, `studio-settings.js`, `brain-manager`, `scripts/brain-*.mjs`. Hapus konstanta `HOME`/fallback `/tmp` di adapter.
2. `src/lib/hermes/paths.ts` (TS) tidak bisa dengan mudah meng-import CJS → **pertahankan**, tetapi tambahkan `tests/unit/stateDirParity.test.ts` yang membandingkan hasil kedua implementasi untuk matriks (env override absolut, override dengan `~`, tanpa override, home tidak ada).
3. **Media route:** pakai `resolveStateDir()` dari `src/lib/hermes/paths.ts` sebagai `allowedRoot` (bukan `os.homedir()`), pertahankan pengecekan symlink. Tambah tes di `gatewayMediaRoute.test.ts`: `HERMES_STATE_DIR` kustom → file di dalamnya diterima, file di luar ditolak, path `..` ditolak.
4. **Brain manager:** parameterisasi `stateDir`. Layout arsip tetap `.hermes/…` (agar arsip lama tetap bisa diimpor), tetapi isinya diambil dari `resolveStateDir()` dan impor memulihkan ke `resolveStateDir()`. `_AI`, `MEMORY.md`, dst tetap relatif ke workspace (`cwd`). Snapshot (`<cwd>/.hermes/snapshots`) disertakan bila berbeda dari `stateDir`. Tes round-trip dengan `HERMES_STATE_DIR` ≠ `cwd/.hermes` ≠ `home/.hermes`, memverifikasi `hermes3d-agents.json` dan `hermes3d-history.json` ikut ter-export dan ter-import; pertahankan tes traversal dan nama panjang yang ada.
5. **`api_providers.json` → state dir.** Pindahkan lokasi baca/tulis ke `path.join(STATE_DIR, "api_providers.json")` dengan migrasi sekali jalan: bila file baru belum ada dan `cwd/api_providers.json` ada → salin (jangan hapus yang lama, jangan log isinya). Perbarui `brain-manager` (`CORE_FILES` membaca dari lokasi baru, fallback ke lama). Karena adapter sudah melakukan sinkronisasi `.env` dari providers saat boot, memindahkan file ke volume cukup agar provider aktif bertahan; **verifikasi dengan tes**: tulis provider → restart adapter dengan `HERMES_STATE_DIR` sama dan `cwd` berbeda → provider aktif tetap.
6. **Docker:** hapus baris `COPY --from=builder /app/api_providers.json* ./` dari `Dockerfile`; tambahkan ke `.dockerignore`: `api_providers.json`, `.hermes`, `_AI`, `hermes3d-*.json`, `*.log`. Verifikasi `/root/.camoufox` memang dipakai camoufox (`npx camoufox path` atau baca kode); bila tidak, hapus dari `mkdir`.
7. `.env.example`: tambahkan `HERMES_STATE_DIR` (dengan penjelasan Docker `=/app/.hermes`) dan `MULTI_USER`. **DECISION D3 (default):** hapus alias `STUDIO_MULTI_USER` dan `REQUIRE_AUTH` dari `server/index.js` **hanya jika** tidak ada referensi lain (`grep -rn`); bila ada, dokumentasikan ketiganya.

**Acceptance.** `grep -rn "process.cwd(), \"api_providers.json\"" server` kosong; tes parity, media, brain round-trip, dan providers lulus; `docker build` + `docker run` dengan volume menunjukkan roster, history, **dan** provider bertahan setelah `docker rm` + `docker run` ulang (jika Docker tidak tersedia: `NOT RUN`, jangan diklaim).

---

### WP7 — Dependensi, lockfile, dan sinkronisasi versi

**Masalah.** (a) `playwright-core` dihapus di v1.0.12 sebagai "unused", padahal `camoufox@0.5.8` mendeklarasikan peerDependency `playwright-core <1.63`; (b) `postcss` di-import `cssBuild.test.ts` tapi tidak dideklarasikan (phantom dependency, kelas masalah yang sama dengan `zustand` di D7); (c) versi: `package.json` 1.0.12, PATCH_NOTES 1.0.13, CHANGELOG berhenti di 1.0.11; (d) `package-lock.json` tidak terlihat di snapshot yang diaudit.

**Langkah.**
1. Pastikan `package-lock.json` ada dan ter-commit (Dockerfile memakai `npm ci`). Jika tidak ada, buat dengan `npm install --package-lock-only` dan jelaskan di laporan.
2. Tambahkan `playwright-core` ke `dependencies` dengan versi yang selaras dengan `@playwright/test` dan memenuhi `<1.63` (mis. `~1.58.x`; pilih patch yang sama dengan `npm ls playwright` agar tidak ada dua salinan). Buktikan: `npm ci --omit=dev && npm ls playwright-core` menampilkan satu versi tanpa `UNMET PEER`.
3. Tambahkan `postcss` ke `devDependencies` pada versi yang sama dengan yang dipakai Next/@tailwindcss/postcss (`npm ls postcss`; hindari duplikat).
4. Jalankan dependency scan sekali (tanpa menambah devDependency permanen): `npx knip --include dependencies,exports,files` dan tinjau hasilnya. **Jangan** menghapus `react-mentions-ts` (dipakai via `@import` CSS di `globals.css`) atau `tw-animate-css` (dipakai di `globals.css`). Catat dependensi yang benar-benar tak terpakai; hapus hanya yang dibuktikan tak terpakai (grep + build + test lulus).
5. Naikkan `package.json` ke `1.0.14`. Backfill `CHANGELOG.md` dengan entri `1.0.12`, `1.0.13`, `1.0.14` (isi diturunkan dari PATCH_NOTES **yang sudah dikoreksi**, tanggal sesuai tanggal sebenarnya).
6. Tambahkan `tests/unit/versionSync.test.ts`: versi `package.json` === heading teratas `CHANGELOG.md` === heading teratas `PATCH_NOTES.md`.

---

### WP8 — Kebenaran TypeScript, CI nyata, dan tes yang hermetik

**Masalah.** PATCH_NOTES v1.0.2–v1.0.9 mengklaim "0 TypeScript errors" sedangkan v1.0.13 menyebut error Phaser "pre-existing"; `next.config.ts` tidak mengabaikan error build, sehingga salah satunya pasti keliru. Klaim "CI/CD" tidak punya dasar: satu-satunya workflow adalah `docker-publish.yml`. `shellExecutor.test.ts` bergantung pada cwd yang berupa repo git.

**Langkah.**
1. Gunakan jawaban Q1 baseline. **Jika `typecheck`/`build` merah:** perbaiki error Phaser dengan perubahan tipe yang benar (jangan `any` massal, jangan `@ts-ignore` tanpa komentar alasan satu per satu); jika perbaikan terlalu besar, **berhenti dan laporkan** jumlah/jenis error — jangan menyembunyikannya. **Jika bersih:** koreksi klaim "pre-existing Phaser errors" di notes.
2. Buat `.github/workflows/ci.yml` (trigger `pull_request` dan `push` ke `main`): Node 22, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e-adapter`, `npm run test:e2e-roles`, `npm run build`. Cache npm. Tambahkan `permissions: contents: read`.
3. Hermetikkan `shellExecutor.test.ts`: buat direktori temp, jalankan `git init` di dalamnya, dan panggil `executeShellCommand(..., "git status", tempDir)`; `it.skipIf` hanya bila binary `git` tidak ada (bukan bila bukan repo). Hasil Q3 harus berubah dari gagal → lulus.

---

### WP9 — Dokumen & registry duplikat

**Langkah.**
1. Bandingkan `docs/office-systems-roadmap.md` (351 baris) dengan `docs/office_sys/office-systems-roadmap.md` (489 baris) dengan `diff`. Gabungkan konten unik ke versi kanonik `docs/office_sys/`, hapus yang lain, perbaiki semua tautan (`grep -rn "office-systems-roadmap" .`). Catat keputusan.
2. Periksa `MULTI_AGENT_BETA.md` (7 baris) dan `ROADMAP.md` (7 baris): bila hanya penunjuk ke `docs/…`, biarkan; bila isinya salinan, hapus dan perbaiki tautan.
3. Daftar 11 skill ada di `HERMES_BUILTIN_SKILLS` (adapter), `src/lib/skills/catalog.ts`, `assets/skills/*`, dan `packaged.ts`. **Jangan refaktor besar.** Tambahkan `tests/unit/skillRegistryParity.test.ts` yang memastikan himpunan `skillKey`, `name`, dan emoji di adapter identik dengan `catalog.ts` dan setiap `skillKey` punya folder di `assets/skills/`. (Ekspor `HERMES_BUILTIN_SKILLS` dari adapter bila perlu.)
4. Perbarui `ARCHITECTURE.md`/`README.md` bagian state dir, role/capability, dan launcher agar konsisten dengan WP2/WP5/WP6.

---

### WP10 — Dead code

**Langkah (verifikasi dengan grep di `src server scripts tests plugins` sebelum menghapus):**
- Hapus export `resolveHermesBaseUrl`, `readProvidersData`, `writeProvidersData` dari `module.exports` adapter **bila** tidak dipakai tes/skrip (jika dipakai, biarkan dan catat).
- Hapus parameter tak terpakai dan loop semu (WP2.8, WP3.5).
- Setelah WP2, pastikan tidak ada `case` di `validateRoleAction` yang tak pernah dipanggil (`browser_navigate` dipakai `browser-service`; `save_research` — hapus bila tak ada pemanggil).
- Jalankan `npm run lint` dan `npm run build` setelah penghapusan; bukti tak ada referensi tersisa dicantumkan di laporan.

---

### WP11 — Tulis ulang PATCH_NOTES secara jujur

Tambahkan entri **`Patch v1.0.14 — Audit Remediation`** di atas v1.0.13 dan **jangan menghapus entri lama**. Aturan penulisan:
- Setiap butir ≤ 2 kalimat, menyebut file/tes yang mengubahnya. Dilarang kata-kata superlatif ("seamlessly", "100%", "perfect") tanpa angka bukti.
- Bagian **`Verification`** berupa tabel: perintah | hasil | tanggal — angka disalin dari output asli (file/tes, exit code). Perintah yang tidak dijalankan ditulis `NOT RUN`.
- Bagian **`Corrections to earlier notes`** memuat minimal:
  1. v1.0.2–v1.0.9: klaim "0 TypeScript errors" — koreksi sesuai hasil Q1/WP8.
  2. v1.0.5: logika merge multi-lokasi (`D:/tmp`, `/tmp`, `USERPROFILE`) **digantikan** oleh v1.0.13 (sumber history tunggal).
  3. v1.0.6 vs v1.0.12: `playwright-core` ternyata dependensi peer wajib `camoufox`; dikembalikan.
  4. v1.0.10: "tidak pernah hilang saat redeploy" hanya benar untuk `_AI/` dan `.hermes/`; `api_providers.json` sebelumnya di luar volume (diperbaiki di WP6) dan sempat berisiko ter-bake ke image.
  5. v1.0.12 (T5): klaim "automated CI/CD" — baru benar setelah `ci.yml` dibuat di patch ini.
  6. v1.0.13: klaim role guard "mencegah prompt injection" — dipersempit menjadi defense-in-depth; sub-agent sebelumnya memang tidak diberi tool; kini diberi tool sesuai capability (WP2).
  7. v1.0.13: angka "201 files, 1316 tests" — ganti dengan angka dari output vitest sesungguhnya (Q2).
- Bagian **`Known Limits`** jujur, minimal: `write_docs`/`browse_localhost` belum diimplementasikan (D1); workspace agent tidak dihapus saat dismiss; validasi `workspace` bukan sandbox penuh (D2); tes manual Windows `NOT RUN`/hasilnya; hal lain yang kamu temukan.
- Mulai dari sekarang, setiap entri baru harus melewati cek WP12.

---

### WP12 — Pagar pengaman agar klaim palsu tidak terulang

1. **`tests/unit/patchNotesClaims.test.ts`:** parse entri teratas `PATCH_NOTES.md`; semua path berformat `` `path/with.ext` `` harus ada di repo, **kecuali** yang berada di butir yang diawali kata "Removed"/"Deleted" (untuk itu harus **tidak** ada). Gagal dengan daftar path yang bermasalah.
2. Tes `versionSync` (WP7) dan `sourceEncoding` (WP1) sudah menjadi bagian dari pagar ini.
3. Tambahkan template `docs/verification/TEMPLATE.md` (tabel perintah/hasil/tanggal + bagian Decisions) dan wajibkan lampiran `docs/verification/v1.0.14.md` yang diisi dari output asli. Tambahkan satu baris di `CONTRIBUTING.md`: "Klaim angka (tes/error) di patch notes harus disalin dari output perintah."

---

## 4. VERIFIKASI AKHIR (setelah semua WP)

1. Gate Standar (1.2) penuh — semua hijau, output dilampirkan.
2. `docker build` dan skenario volume (bila Docker ada): buat agent + provider → `docker rm -f` → `docker run` dengan volume yang sama → roster, history, provider tetap ada.
3. Smoke manual `npm run dev:all`: buka `/office`, spawn agent developer lewat PM, delegasikan tugas tulis file, konfirmasi file + snapshot + animasi agent; matikan lewat Ctrl+C dan lewat `stop-hermes.bat` (Windows, jika ada) lalu start lagi — roster utuh.
4. Grep penutup (semua harus kosong):
   ```bash
   grep -rnE "â€|ðŸ|âœ|â†" server src scripts
   grep -rn "isOrchestrator ? TEAM_TOOLS" server
   grep -rn "start-local\|start-production" . --include=*.json --include=*.js --include=*.bat --include=Dockerfile
   grep -rn "process.cwd(), \"api_providers.json\"" server
   ```
5. Pastikan `git status` bersih dari artefak (`hermes3d-*.json`, folder tes temp, `api_providers.json`).

---

## 5. FORMAT LAPORAN AKHIR (wajib, tanpa pengecualian)

Tulis `docs/verification/v1.0.14.md` dan ringkasannya di balasan akhir:

| ID | Temuan | Status (`FIXED` / `NOT REPRODUCED` / `DECISION` / `NOT DONE`) | Bukti (commit, file, nama tes, output perintah) |
|---|---|---|---|

Lalu: (1) daftar keputusan D1–D3 beserta alasannya; (2) daftar `NOT RUN` dengan alasan; (3) hal yang masih terbuka; (4) saran lanjutan di luar scope. **Jika ada satu pun baris berstatus `NOT DONE`, katakan terus terang di kalimat pertama laporan.** Laporan yang menyatakan "semua selesai" tanpa tabel bukti dianggap tidak valid.
