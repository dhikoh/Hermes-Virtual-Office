# Changelog

## [1.0.14] - 2026-10-10

### Fixed
- **Audit Remediation & Encoding Hygiene**:
  - Eliminated mojibake and non-standard UTF-8 encoding in `server/hermes-gateway-adapter.js` using Unicode escapes; enforced LF and UTF-8 via `.gitattributes` and `.editorconfig`.
  - Integrated role matrix with tool capabilities and agentic delegation loops in `execDelegateTask`.
  - Upgraded roster persistence to v2 schema with backward compatibility for legacy arrays.
  - Implemented graceful IPC shutdown and synchronous roster persistence.
  - Unified stack launcher into `server/start-stack.js` with backoff supervisor and clean IPC shutdown.
  - Unified state directory resolution across server and client via `server/lib/state-dir.js` and `paths.ts`.
  - Restored `playwright-core` runtime dependency and declared `postcss` devDependency.

## [1.0.13] - 2026-10-10

### Added
- **Agent Roster Persistence**:
  - Persisted spawned, configured, and dismissed sub-agents to `hermes3d-agents.json` with synchronous atomic writes.
  - Resolved adapter state from `HERMES_STATE_DIR` falling back to `~/.hermes`.
  - Integrated role guard for team tools and eliminated multiple history fallback copies.
  - Replaced Tailwind CSS arbitrary variant with standard CSS class `ui-thinking-summary`.

## [1.0.12] - 2026-10-10

### Security
- Hardened access gate with `required` mode in multi-user deployments.
- Implemented strict POSIX argument escaping in OpenSSH client bridge.
- Restricted skill removal targets strictly to authorized skills root.
- Added same-origin and loopback origin validation for WebSocket upgrades.
- Stripped WHATWG IPv6 bracket representations to prevent SSRF bypass.
- Added `zustand` to runtime dependencies and moved `selfsigned` to runtime dependencies.

## [1.0.11] - 2026-10-10

### Added
- **Security Access Gate & Cyber Login Interface**:
  - Implemented standalone `/login` interface with futuristic cyber-office aesthetic, Hermes pulsing branding, password visibility toggle, and instant error handling.
  - Implemented secure authentication API routes (`/api/auth/login`, `/api/auth/logout`, `/api/auth/status`).
  - Added session management in `src/lib/auth/session.ts` with constant-time verification, SHA-256 session token hashing, and 30-day `HttpOnly` cookie retention.
  - Upgraded `server/access-gate.js` with path bypass for auth assets, seamless 302 redirect to `/login` for unauthenticated browser sessions, and JSON 401 response for API requests.
  - Added "Security & Session" management in `SettingsPanel.tsx` with one-click **Log Out** button.
  - Supported `STUDIO_ADMIN_USER` and `STUDIO_ADMIN_PASSWORD` (with `STUDIO_ACCESS_TOKEN` backwards compatibility) in `.env.example` and `docker-compose.yml`.
  - Added comprehensive unit tests in `tests/unit/authSession.test.ts` and `tests/unit/accessGate.test.ts`.

## [1.0.10] - 2026-10-10

### Added
- **Coolify & Production Cloud Deployment Suite**:
  - Implemented `server/start-production.js` multi-process orchestrator running both Hermes Gateway Adapter (port 18789) and Next.js Web Server (port 3000) inside a single container with graceful signal management (`SIGTERM`/`SIGINT`).
  - Updated `Dockerfile` runner stage to bundle `api_providers.json`, create persistent directory paths (`/app/_AI`, `/app/.hermes`), and execute `server/start-production.js`.
  - Added production-grade `docker-compose.yml` pre-configured for Coolify with named volume persistence for agent brains, notes, and session state.

## [1.0.9] - 2026-10-10

### Fixed
- **Full Interactivity Activation for All Office Boards (Whiteboard & Kanban Board)**:
  - Fixed issue where clicking Kanban boards in CX Team and Product Team appeared unresponsive because the sidebar remained collapsed (`setSidebarOpen(true)` was missing).
  - Wired automatic slide-in expansion of the Headquarters sidebar directly upon clicking Kanban boards and Whiteboards in both 2D Pixel Office (`PixelOffice2D`) and 3D Retro Office (`RetroOffice3D`).
  - Added interactive station registration for `whiteboard` objects in Meeting Room and Ops Corner in `PixelOfficeScene.ts`, enabling hover pointer, blue highlight tint (`#bfe8ff`), and click triggers.
  - Extended `PixelInteractiveStationKind` in `PixelSceneBridge.ts` to include `"whiteboard"`, and wired `onWhiteboardInteract` prop through `PixelOffice2D.tsx`.
  - Verified end-to-end with real browser test and visual artifacts confirming smooth sidebar slide-in and active Kanban columns.

## [1.0.8] - 2026-10-10

### Fixed
- **Kanban Task Manager Skill Resolution & Runtime Fix**:
  - Fixed runtime TypeError `Cannot read properties of undefined (reading 'trim')` when clicking **Install TASK-MANAGER skill** from the Kanban desk prompt modal.
  - Hardened `src/lib/skills/install-gateway.ts` (`normalizeRequired`) to safely handle `undefined` and `null` values without throwing uncaught exceptions.
  - Added automatic fallback recovery for missing `workspaceDir` in `installPackagedSkillViaGatewayAgent` using agent file provenance.
  - Upgraded `server/hermes-gateway-adapter.js` to implement full `skills.status`, `skills.update`, and `skills.install` RPC methods, reporting accurate workspace paths and pre-configured Virtual Office skills as ready and eligible.
  - Added synchronous fast-path file materialization in `hermes-gateway-adapter.js` for installer messages, completing skill installations instantly.
  - Enhanced 2D Pixel Office (`PixelOffice2D`) station click handler in `OfficeScreen.tsx` to automatically open the Kanban task board sidebar when `kanbanDeskEnabled` is active.
  - Defensively protected skill key and name lookups across `OfficeScreen.tsx` to prevent runtime crashes from malformed external reports.

## [1.0.7] - 2026-10-10

### Added
- **1-Click Brain Migration Engine (Option 1)** (`server/system/brain-manager.js`): Pure Node.js streaming POSIX/GNU TAR + GZIP (`.tar.gz`) backup and restore engine for complete portability of AI notes (`_AI/`), chat history and Kanban tasks (`.hermes/`), browser profiles and cookies (`_AI/browser-profiles/`), and core memory files (`MEMORY.md`, `USER.md`, `SOUL.md`, `IDENTITY.md`, `api_providers.json`).
- **CLI Migration Commands & REST Endpoints**: Added `npm run brain:export` (`scripts/brain-export.mjs`) and `npm run brain:import` (`scripts/brain-import.mjs`), alongside HTTP routes (`/api/system/brain/status`, `/api/system/brain/export`, `/api/system/brain/import`) and WebSocket RPCs (`brain.status`, `brain.export`, `brain.import`).
- **Security Anti-Traversal Guard**: Safe archive unpacker rejecting directory escape (`..`) and absolute paths.
- **Hermes Virtual Office Ecosystem Skills**: Packaged 8 standardized skills into `assets/skills/`, `src/lib/skills/packaged.ts`, and `src/lib/skills/catalog.ts` (`caveman`, `telegram-remote`, `web-research`, `agent-reach`, `obsidian-skills`, `superpowers`, `humanizer`, `marketing-skills`).
- **Master SOUL Template** (`assets/personality/SOUL.md`): Office personality specification enforcing empirical skepticism, secret safety, concise vibe, and memory continuity.
- **Docker & Coolify Runner Hardening** (`Dockerfile`): Added `assets/` and `scripts/` directory bundle copy into runner stage for immediate readiness on container deployment.
- **Automated Unit Testing**: Added `tests/unit/brainMigration.test.ts` and updated `tests/unit/packagedSkills.test.ts` with 44 passing unit tests.

## [1.0.6] - 2026-10-10

### Added
- **Camoufox Anti-Detect Browser Engine** (`server/research/browser-service.js`): Integrated `camoufox` with automated canvas/WebGL/audio fingerprinting evasion, humanized viewport handling, and headless/virtual Xvfb modes.
- **Per-Agent Persistent Profile Isolation**: Supported persistent profile directories under `_AI/browser-profiles/<agentId>` via Playwright's `userDataDir`, enabling agents and sub-agents to persist login sessions and cookies.
- **Graceful Fallback Mechanism**: Built-in fallback ensuring that if Camoufox binaries are not pre-downloaded, the browser research service gracefully uses safe isolated Node HTTP/HTTPS transport.
- **Docker & Coolify Support** (`Dockerfile`): Enhanced production runner container with complete Linux shared libraries for Firefox/Camoufox (`libgtk-3-0`, `xvfb`, `libasound2`, `libx11-xcb1`, etc.) and pre-fetched browser binaries via `npx camoufox fetch`.
- **Gateway Browser RPCs & REST Endpoints**: Implemented `browser.status`, `browser.profiles.list`, and `browser.navigate` in WebSocket RPCs and HTTP routes (`/api/browser/status`, `/api/browser/profiles`).
- **UI Capability Indication**: Added "Camoufox Anti-Detect" badge in `AgentSettingsPanel.tsx` under Agent Capabilities.
- **Comprehensive Unit Testing**: Added `tests/unit/camoufoxAdapter.test.ts` and enhanced `tests/unit/vaultAndBrowser.test.ts`.

## [1.0.5] - 2026-10-10

### Fixed
- **Session History & Chat Transcript Auto-Hydration**: Fixed issue in `/office` (`OfficeScreen.tsx`) where switching sessions or refreshing the page left the chat empty. `requestAgentHistoryRefresh` now properly builds full `transcriptEntries` from `chat.history` messages using `buildTranscriptEntriesFromLines`.
- **Immediate History Sync on Session Switch**: Updated `handleSessionSwitch` in `OfficeScreen.tsx` and `AgentsPageScreen.tsx` to automatically trigger history retrieval upon selecting a session from the Chat History modal.
- **Auto-Hydrate on Connect/Agent Select**: Added an effect in `OfficeScreen.tsx` that automatically fetches history for the focused agent upon gateway connection or selection if its transcript has not yet been loaded.
- **Cross-Drive History Merge & Windows Normalization**: Enhanced `server/hermes-gateway-adapter.js` to normalize the home path across Windows systems (`USERPROFILE` / `HOME` / `cwd`) and merge conversation histories from candidate locations (`D:/tmp/.hermes`, `/tmp/.hermes`, `USERPROFILE/.hermes`), preserving all past messages and syncing them to canonical storage.

## [1.0.4] - 2026-10-09

### Added
- **4-Tier Permission Gate with Deny-Wins** (`server/security/permission-gate.js`): Categorizes operations into Green, Yellow, Red, and Black tiers with absolute protection against sensitive credential leakage (`.env`, `.ssh`, tokens, browser profiles) and path traversal prevention.
- **Role Capability Matrix** (`server/roles/role-matrix.js`): Strict enforcement of tool and access boundaries for PM, Developer, Researcher, QA, and Writer roles.
- **Pre-Mutation Snapshot & 1-Click Rollback** (`server/workspace/snapshot-manager.js`): Automated workspace snapshots in `.hermes/snapshots/` before mutations with SHA256 integrity and 1-click restore.
- **Shell / CLI Execution Tool & Approval Ticket Loop** (`server/execution/shell-executor.js`): Safe CLI runner with 128KB output truncation and interactive approval tickets for Red-tier commands.
- **Isolated Browser Service & Obsidian Knowledge Vault** (`server/research/browser-service.js`, `server/vault/vault-manager.js`): Cookie-free web researcher and Obsidian Markdown vault with YAML frontmatter under `_AI/`.
- **Gateway RPCs & Tool Suite**: Integrated 8 new LLM tools and 6 gateway RPCs (`exec.approvals.get`, `exec.approval.resolve`, `workspace.snapshots.list`, `workspace.rollback`, `vault.documents.list`, `roles.matrix.get`) into `server/hermes-gateway-adapter.js`.
- **UI Approval Flow**: Integrated `pendingExecApprovals` state and approval events in `OfficeScreen.tsx` connecting seamlessly to `AgentChatPanel.tsx` `ExecApprovalCard`.
- **Automated Verification**: Comprehensive unit test suites (`tests/unit/permissionGate.test.ts`, `tests/unit/snapshotManager.test.ts`, `tests/unit/shellExecutor.test.ts`, `tests/unit/vaultAndBrowser.test.ts`, `tests/unit/gatewayNewCapabilities.test.ts`).

## [1.0.3] - 2026-10-09

### Added
- Real-time model catalog refresh when activating API Provider profiles via `ApiSettingsModal`.
- `onProviderActivated` callback propagation connecting `ApiSettingsModal.tsx` to `OfficeScreen.tsx`, dynamically refreshing model choices in the Chat Panel without page reloads.
- Automatic agent model migration in `OfficeScreen.tsx` that replaces obsolete models with the new provider's default model whenever the active provider changes.
- Persistent `HERMES_MODEL` synchronization to `.env` upon provider profile activation.
- Dedicated unit test in `tests/unit/apiSettingsModal.test.ts` verifying `onProviderActivated` lifecycle and data delivery.

### Fixed
- Fixed obsolete fallback model lingering in chat headers when switching away from default providers.
- Corrected `GatewayModelChoice` provider type mapping in `OfficeScreen.tsx`.

## [1.0.2] - 2026-10-09

### Added
- Session History UI (`SessionHistoryModal`) accessible directly from the Chat Panel header, supporting session browsing, switching, and deletion.
- Clipboard image paste (`Ctrl+V`) for chat composer with automatic image detection and `/api/files/upload` handling.
- Active Provider Indicator in `ApiSettingsModal` with visual `● Active` badges, profile header status, and dynamic activation button state.
- Comprehensive unit test coverage for URL normalization, Session History Modal, API Settings Modal, and Clipboard Image Paste.

### Fixed
- Resolved "New Session" issue where starting a new session cleared existing conversation history; now generates unique timestamped session keys (`agent:<id>:<timestamp>`).
- Added robust URL endpoint normalization in both `ApiSettingsModal.tsx` and `hermes-gateway-adapter.js`, automatically stripping trailing `/models`, `/chat/completions`, and repeated `/v1/v1` loops so any pasted endpoint variation works seamlessly.
- Fixed `.env` variable replacement in `hermes-gateway-adapter.js` using line-anchored regex matching to prevent overriding commented templates and ensure provider activation persists across reboots without reverting to OpenRouter defaults.
- Added `api_providers.json` to `.gitignore` to safeguard local credentials.
- Fixed TypeScript compiler errors, declared `SessionListEntry` types, and resolved missing Gateway context imports.
- Consolidated documentation by removing duplicate spec files in `docs/` and cleaned obsolete root test scripts.

## [1.0.1] - 2026-10-09

### Added
- API Settings Modal (`ApiSettingsModal`) and Provider Manager for configuring custom LLM endpoints (OpenRouter, Groq, LMStudio, Ollama, OpenAI).
- Real-time `config.test` gateway endpoint to verify model endpoint credentials before saving.
- Local provider configuration persistence and dynamic environment updater.

## [0.1.4] - 2026-04-23

Runtime Profiles, Multi-Floor Offices, Remote Collaboration, and Diagnostics.

This release converges the runtime-profiles, office-systems, hermes3doctor, and selective `vera_lane` work into one branch. Backends become named profiles, the office becomes a multi-floor building, remote offices gain server-backed messaging and handoffs, and a new diagnostics CLI makes setup and troubleshooting first-class.

### Added

- Named runtime profiles for `hermes`, `demo`, `local`, `hermes3d`, and `custom` backends, each storing its own URL and token in Studio settings instead of a single global pair (`docs/runtime-profiles.md`, `src/lib/runtime/*`).
- Multi-floor office runtime model with one runtime binding per floor and persistent per-floor state, including `lobby`, `hermes-ground`, `hermes-first`, `local-runtime`, `hermes3d-runtime`, `custom-second`, `training`, `traders-floor`, and `campus` (`src/lib/office/floors.ts`, `docs/office_sys/multi-floor-runtime-architecture.md`).
- Floor roster persistence and a floor navigation HUD for moving between runtime-backed floors in a single session (`src/lib/office/floorRoster.ts`, `src/features/office/components/OfficeFloorNav.tsx`, `src/features/office/hooks/useOfficeFloorRuntimePersistence.ts`).
- Remote office messaging API for cross-office direct messages with structured assistant-history reply resolution (`src/app/api/office/remote-message/route.ts`).
- Remote office handoff API for sending task / context / deliverables / acceptance criteria to a remote agent through the runtime layer (`src/app/api/office/remote-handoff/route.ts`, `src/lib/runtime/agentMessaging.ts`).
- Local file upload route for chat attachments with allowlisted MIME types and a 10 MB upload cap (`src/app/api/files/upload/route.ts`).
- `hermes3doctor` diagnostics CLI with profile-scoped and `--all-profiles` runs, Hermes / demo / custom-runtime probes, gateway failure classification, JSON output, and a `npm run doctor` script (`scripts/hermes3doctor.mjs`, `scripts/lib/hermes3doctor-core.mjs`, `package.json`).
- New product and architecture docs covering runtime profiles, multi-floor architecture, the hermes3doctor spec, runtime profile architecture, the refreshed roadmap, multi-agent beta, and the bulletin-board, desk-progression, hierarchy-and-teams, meeting-room-workflow, QA-department, and whiteboard specs (`docs/`).

### Changed

- Runtime provider selection is now profile-aware across `hermes`, `demo`, `local`, `hermes3d`, and `custom` instead of collapsing into one generic path (`src/lib/runtime/createRuntimeProvider.ts`, `src/lib/runtime/{hermes,demo,custom}/provider.ts`).
- Studio settings now persist per-profile URL/token entries and an active profile selection, with coordinated bootstrap and hydration paths (`src/lib/studio/settings.ts`, `src/lib/studio/settings-store.ts`, `src/lib/studio/coordinator.ts`).
- Remote agent chat panel and remote office presence flows updated for the new server-backed delivery and reply behavior (`src/features/office/components/RemoteAgentChatPanel.tsx`, `src/features/office/hooks/useRemoteOfficePresence.ts`).
- Hardened production security headers: strict CSP with `'unsafe-eval'` only in dev, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, restrictive `Permissions-Policy`, `Cross-Origin-Resource-Policy: same-origin`, and HSTS in production (`next.config.ts`).
- Access gate rewritten with constant-time token comparison, a per-IP rate limiter (10 attempts / 60s), and `TRUSTED_PROXY=1`-gated `X-Forwarded-For` handling to prevent IP spoofing (`server/access-gate.js`).
- Custom runtime provider and proxy URL handling tightened around runtime boundaries and allowlists (`src/lib/runtime/custom/provider.ts`, `src/lib/gateway/proxy-url.ts`).

### Fixed

- Repaired merge-corrupted files and removed tracked merge artifacts left over from the earlier overlapping branch stack.
- Resolved a UTF-8 / Turbopack parsing issue and cleaned up Turbopack root and optional-dependency resolution warnings (`next.config.ts`).
- Office navigation and pathfinding behavior tightened around floor-aware routing and runtime persistence (`src/features/office/screens/OfficeScreen.tsx`, `src/features/retro-office/RetroOffice3D.tsx`).

### Tests

- Added unit coverage for `hermes3doctor`, office floors, floor roster, runtime connection, gateway connection, office floor runtime persistence, agent fleet hydration derivation, and studio settings coordinator behavior (`tests/unit/`).

### Docs

- Replaced top-level `MULTI_AGENT_BETA.md` and `ROADMAP.md` with stubs that point to canonical docs under `docs/`, and added a runtime profiles reference from `README.md`.
- Expanded `README.md` to describe `Local` and `Hermes3D` runtime modes and persistent backend profile configuration, including the additional `local` and `hermes3d` values for `HERMES3D_GATEWAY_ADAPTER_TYPE`.

### Notes

- This release bumps the in-repo app version to `0.1.4`. After merging, cut the GitHub release/tag as `v0.1.4`.
- This is still an early-stage release. Remote office workflows, runtime profiles, multi-floor offices, and the diagnostics CLI will continue to iterate quickly in upcoming versions.

## [0.1.3] - 2026-03-28

Remote Offices, Skills Marketplace, and Company Builder.

This release expands Hermes3D from a single-office viewer into a more complete AI workplace, with guided setup, richer agent operations, remote office support, and stronger security hardening.

### Added

- New onboarding wizard for first-time setup, including gateway connection, prerequisites, company details, and initial agent configuration.
- New packaged skills marketplace with trigger-driven office routing, including starter skills like Todo Board and SOUNDHERMES.
- New office agent management wizard for creating and managing agents directly from the office experience.
- New multi-agent beta support for remote office layouts, presence sync, and remote messaging.
- New company builder wizard with AI-assisted organization generation and bootstrap planning.
- Runtime gateway URL fallback through `/api/studio` for more reliable environment-specific setup.

### Changed

- Improved UI polish, responsiveness, and accessibility across the main app and office surfaces.
- Hardened access control so gating applies across all routes, not only `/api`.
- Enforced voice upload size limits before buffering.

### Fixed

- Closed multiple path traversal and file-path validation gaps in local file operations.
- Resolved symlink handling issues in path suggestions.
- Improved office navigation and pathfinding by fixing diagonal corner-cutting, metadata-driven blockers, collision-aware routing, and A* failure behavior.
- Removed a TypeScript TS2367 build blocker in `skillGymDirective`.

### Docs

- Added an Agent Bus integration guide for visualizing AI sessions in Hermes3D.
- Refreshed the public roadmap.

### Notes

- This is still an early-stage release. The platform is moving quickly, especially around remote office workflows, skills, and guided setup, so expect rapid iteration in upcoming versions.

## [0.1.2] - 2026-03-20

### Added

- An in-app avatar creator for agents with live 3D preview, appearance presets, and accessory controls for customizing office avatars.
- A unified agent editor modal in the office that lets you edit avatars alongside agent brain files such as `IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`, and `HEARTBEAT.md`.
- Structured avatar profile persistence and normalization so studio settings can store full avatar appearance data per gateway and agent instead of only avatar seeds.
- A `DEBUG` environment toggle for controlling the gateway event console in the office UI.

### Changed

- Reworked office avatar rendering so 3D agents reflect saved appearance profiles, including hair, clothing, hats, glasses, headsets, backpacks, and other visual variations.
- Replaced avatar shuffle entry points in the chat and office surfaces with avatar customization flows that open the editor directly.
- Updated the office HUD with a compact agent roster, overflow handling, and direct shortcuts into per-agent editing from the 3D office view.
- Expanded the brain editor so `IDENTITY.md` fields are edited in structured form and agent renames can be applied to the live gateway agent after saving.
- Defaulted the gateway event console to a collapsed state and made it optional from environment configuration.
- Updated hydration and store state to carry full avatar profiles through agent loading, persistence, and rendering.

### Fixed

- Fixed WebSocket gateway authentication during the upgrade handshake by wiring access control through the `ws` `verifyClient` flow.
- Fixed the gym release directive TypeScript error by adding explicit `"release"` support to office gym directives and aligning release-hold logic.
- Corrected studio settings merging and normalization for avatar data so saved office appearances survive reloads and patch updates.
- Kept skill gym hold state active for release directives during office animation trigger reconciliation.

### Tests

- Added unit coverage for avatar profile persistence, studio settings normalization, and fleet hydration with structured avatar data.
- Expanded end-to-end coverage for avatar settings fixtures, office header and sidebar flows, voice reply settings persistence, disconnected office settings surfaces, and office route expectations.

## [0.1.1] - 2026-03-19

### Added

- Uploaded entire repo

## [0.1.0] - 2026-03-16

### Added

- Initial public Hermes3D project documentation, including `README.md`, `VISION.md`, and `ARCHITECTURE.md`.
- A gateway-first web UI for connecting to backend agents, monitoring runtime activity, and managing agent workflows.
- A retro-office 3D environment for visualizing agent activity, spatial interactions, and immersive operational surfaces.
- An office builder flow for editing and publishing office layouts.
