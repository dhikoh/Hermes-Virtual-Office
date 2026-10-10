# Audit Review Checklist: Hermes3D

Status: draft untuk review tim developer (agent).
Keputusan: deployment **multi-user**. Item S1 (auth default off) dianggap **blocker**.

## Ringkasan Keputusan

- Q1 (single vs multi user): **multi-user**.
- Konsekuensi: S1 blocker. Fase 0 (security) dikerjakan sebelum fitur atau refactor lain. S2-S10 tetap CRITICAL.

## Checklist Item

### Security (prioritas tertinggi)

| ID | Item | Lokasi |
|----|------|--------|
| S1 | Auth default off saat `STUDIO_ADMIN_PASSWORD` dan `STUDIO_ACCESS_TOKEN` kosong. Blocker untuk multi-user. | `server/access-gate.js:109`, `server/index.js:90-92` |
| S2 | Command injection via argv ssh (user input masuk shell remote). | `src/app/api/gateway/media/route.ts:204-212`, `src/lib/ssh/gateway-host.ts:160,162`, `src/app/api/gateway/agent-state/route.ts:97-107`, `src/lib/ssh/skills-remove.ts:72-86` |
| S3 | Recursive delete dengan root dari client. | `src/lib/skills/remove-local.ts:38-47,83` |
| S4 | Token exfiltration via `gateway.url` tanpa validasi. | `server/gateway-proxy.js:249-254,300`, `src/app/api/studio/route.ts:50` |
| S5 | WebSocket tanpa Origin check. | `server/gateway-proxy.js:105,196`, `server/hermes-gateway-adapter.js:2044` |
| S6 | Brain import/export tanpa auth dan tanpa body cap. | `server/hermes-gateway-adapter.js:2005-2039`, `server/system/brain-manager.js:235-304` |
| S7 | Shell YELLOW regex prefix-only, bisa dilewati dengan `&&` atau `;`. | `server/security/permission-gate.js:45-49,180-188`, `server/execution/shell-executor.js:94-96` |
| S8 | SSRF IPv6 bracket tidak terdeteksi. | `src/lib/security/urlSafety.ts:28-36,46` |
| S9 | SSRF custom runtime tanpa allowlist di non-production. | `src/app/api/runtime/custom/route.ts:18-19,89` |
| S10 | Session cookie sha256 deterministik, tidak revoke saat logout. | `src/lib/auth/session.ts:5,58`, `src/app/api/auth/logout/route.ts` |

### Runtime & Data Flow

| ID | Item | Lokasi |
|----|------|--------|
| R1 | Request gateway tanpa timeout, pending tidak dibersihkan, guard in-flight tidak reset. | `src/lib/gateway/protocol/GatewayBrowserClient.ts:693-704`, `src/features/office/hooks/useRemoteOfficePresence.ts:143,249`, `src/features/office/tasks/useTaskBoardController.ts:890-914` |
| R2 | `connectTimer` tidak dibersihkan, token device terhapus saat drop di handshake. | `GatewayBrowserClient.ts:489-491,615-617,725-727` |
| R3 | Cast `as unknown as T` pada response text. | `src/lib/runtime/custom/http.ts:60` |
| R4 | Body API tanpa validasi runtime (~19 route). | `src/app/api/office/route.ts:41`, `src/app/api/runtime/custom/route.ts:74`, `src/app/api/auth/login/route.ts:12`, `src/app/api/task-store/route.ts:31,72` |
| R5 | Race: GET poll menimpa PUT optimistik. | `src/features/office/tasks/useTaskBoardController.ts:885-917` |
| R6 | Layout snapshot wipe saat parse gagal, write non-atomic. Standup `JSON.parse` tanpa guard. | `src/lib/office/layoutSnapshotStore.ts:32-56`, `src/lib/office/standup/store.ts:59-78` |
| R7 | Hydration mismatch. | `src/features/office/screens/AtmImmersiveScreen.tsx:18-27` |
| R8 | Connect race, socket hermes lama tidak ditutup. | `src/lib/gateway/GatewayClient.ts:869-990` |
| R9 | Provider runtime di-recreate saat connect, session in-memory hilang. | `src/lib/runtime/useRuntimeConnection.ts:27-30`, `src/lib/runtime/custom/provider.ts:83-90` |
| R10 | Settings tidak di-flush saat `pagehide`. | `src/lib/studio/coordinator.ts:468-501` |

### Konsistensi & Duplikasi

| ID | Item | Lokasi |
|----|------|--------|
| D1 | `AgentSkillsAccessMode` beda literal (`"selected"` vs `"allowlist"`). Kemungkinan bug nyata. | `src/lib/skills/presentation.ts:23`, `src/lib/gateway/agentConfig.ts:514` |
| D2 | Session key builder dobel dan template inline di banyak tempat. | `src/lib/gateway/GatewayClient.ts:85`, `src/lib/gateway/nodeGatewayClient.ts:175`, `server/hermes-gateway-adapter.js` (cari `agent:${`) |
| D3 | Path resolver dobel TS/JS. | `src/lib/hermes/paths.ts:8,22,35`, `server/studio-settings.js:7,17,27` |
| D4 | Type dobel: `GatewayStatus`, `GatewayConfigSnapshot`, `GatewayAgentStateMove`, frame types, `GatewayClientLike` (~15 file). | banyak file |
| D5 | Helper string dobel (`asString`, `trimString`, `normalizeText`) di ~8 file. | banyak file |
| D6 | `zustand` dipakai tapi tidak ada di `package.json`. | `src/features/spotify-jukebox/store.ts:3` |
| D7 | `selfsigned` di devDependencies tapi di-require saat runtime. | `server/index.js:38`, `package.json` |
| D8 | Token di settings patch, bertentangan dengan larangan token lewat browser API. | `GatewayClient.ts:968-976,1138` vs `:775-777` |

### Dead Code & Dependency

| ID | Item | Lokasi |
|----|------|--------|
| X1 | `multiavatar.js` vendor tidak di-import. | `src/lib/avatars/vendor/multiavatar.js` |
| X2 | `playwright-core` dan `class-variance-authority` tidak di-import langsung. | `package.json` |
| X3 | `transcription.ts` hanya dipakai test. | `src/lib/voice/transcription.ts` |
| X4 | Asset starter tidak direferensikan. | `public/next.svg`, `public/globe.svg` |

### Test

| ID | Item | Lokasi |
|----|------|--------|
| T1 | Vitest include hanya `*.test.ts`, `.tsx` terlewat. | `vitest.config.ts:13`, `tests/unit/agentAvatarCreatorModal.test.tsx` |
| T2 | Script `"test": "vitest"` jalan watch mode. | `package.json` |
| T3 | `playwright.kanban.config.ts` testDir sama dengan config utama. | `playwright.kanban.config.ts:5` |
| T4 | Tidak ada e2e untuk: login, gateway connect gagal, chat send, agent create/delete, offline ke online. | `tests/e2e/` |
| T5 | Tanpa test: `files/*`, `auth/*`, `health`, sebagian besar `office/*`, `urlSafety.ts`. | `src/app/api/**`, `src/lib/security/urlSafety.ts` |

## Pertanyaan untuk Tim

- **Q1.** Single-user atau multi-user? **Dijawab: multi-user.**
- **Q2.** D8: token di settings patch disengaja atau bug?
- **Q3.** Setujukah menghapus X1, X2, X4? Ada risiko tersembunyi (dynamic import, script, docker)?
- **Q4.** Urutan perbaikan: security dulu atau runtime dulu? Usulkan urutan dengan alasan.

## Prompt untuk Agent Tim

```
Kamu adalah reviewer teknis untuk project web app Next.js 16 + custom Node server di D:\Workspace Virtual\Hermes3D.

KONTEKS: Deployment adalah MULTI-USER. Jadi item S1 (auth default off) dianggap blocker.

ATURAN KETAT:
- READ-ONLY. Jangan edit, buat, atau hapus file. Jangan jalankan command yang mengubah state (no npm install, no git write, no build, no test run yang menulis file).
- Hanya boleh Read, Grep, Glob, dan command baca saja.

TUGAS:
Untuk setiap item di checklist (docs/audit-review-checklist.md), verifikasi klaim dengan membuka file dan baris yang disebutkan. Untuk tiap item beri:
1. Status: SETUJU / SEBAGIAN / TIDAK SETUJU / PERLU INFO
2. Bukti: kutipan kode singkat dengan path:baris yang kamu baca sendiri
3. Severity menurutmu: CRITICAL / WARNING / OPTIMIZATION
4. Usulan perbaikan paling kecil (satu-dua kalimat), atau alasan klaim salah
5. Risiko jika fix dilakukan (regresi yang mungkin, test yang harus ada)

Jika baris sudah berubah atau tidak ada, tulis "BASI" dan jelaskan kondisi sekarang.
Jangan terima klaim begitu saja. Jika ragu, tandai PERLU INFO dan jelaskan apa yang perlu dicek.

PERTANYAAN YANG HARUS DIJAWAB:
Q2. D8: token di settings patch disengaja atau bug?
Q3. Setujukah menghapus X1, X2, X4? Ada risiko tersembunyi (dynamic import, script, docker)?
Q4. Urutan perbaikan: security dulu atau runtime dulu? Usulkan urutan dengan alasan.

FORMAT OUTPUT:
A. Tabel ringkas: ID | Status | Severity | Ringkasan satu baris
B. Detail per item (hanya untuk TIDAK SETUJU, SEBAGIAN, PERLU INFO, BASI)
C. Temuan baru yang tidak ada di checklist (dengan path:baris)
D. Jawaban Q2-Q4
E. Urutan eksekusi final yang direkomendasikan

Tanpa pujian atau basa-basi. Fokus pada bukti dan kebenaran teknis.
```

## Catatan

- Audit ini static dan read-only. Belum ada test atau typecheck yang dijalankan.
- Beberapa temuan dari agent explore belum diverifikasi (lihat daftar PERLU INFO di atas).
