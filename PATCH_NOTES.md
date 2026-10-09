# Hermes3D Patch Notes

## Patch v1.0.1 - API Settings UI & Dynamic Providers
- **Feature**: Added a new **API Settings** modal accessible from the top-right plug icon (🔌).
- **Feature**: Replaced the hardcoded `.env` usage with a dynamic UI config updater.
- **Feature**: Implemented a **Provider Manager** allowing users to create, edit, test, and save multiple API profiles (e.g. OpenRouter, Groq, LMStudio, OpenAI).
- **Security**: Added robust local persistence mechanism (`api_providers.json`) that bypasses browser storage, ensuring API keys are securely persisted on the local filesystem and don't get wiped upon clearing browser cache.
- **Backend Fix**: Fixed the `HERMES_API_URL` parsing bug in `hermes-gateway-adapter.js` that caused OpenRouter models to 404 (due to double `/v1/v1/models` appendage).
- **Improvement**: Added a real-time `config.test` endpoint to allow testing API credentials before saving them.

*(More patches coming soon!)*

## Patch v1.0.2 - Session History UI & Clipboard Images
- **Feature**: Added a full **Session History UI** directly accessible from the Chat Panel's header. You can now view previous chat sessions, switch to them, or delete them to manage history.
- **Backend Improvement**: Refactored the 'sessions.list' endpoint in 'hermes-gateway-adapter.js' to parse through 'conversationHistory' natively and return all active chat sessions across all profiles, rather than defaulting to only the single active 'main' session limit.
- **Feature**: Enabled Image Paste support for the Composer. Screenshots (e.g. from Print Screen) or clipboard image data can now be directly pasted using Ctrl+V.
- **Bug Fix**: Fixed a frontend rendering issue where refreshing the browser would incorrectly load a blank session due to lack of local session-list synchronization. Chat histories now properly persist and are queryable across hot-reloads.
- **Critical Bug Fix**: Fixed a severe logic flaw where clicking "New Session" would mistakenly delete the current session's history by incorrectly calling `sessions.reset`. "New Session" now correctly generates a unique session key (e.g. `agentId:timestamp`), preserving the old session history while opening a fresh slate.
- **UI Consistency Fix**: Ensured the 'History' button is globally accessible, specifically injecting the session modal into the main `/office` environment (`OfficeScreen.tsx`) in addition to the standalone `/agents` screen.

