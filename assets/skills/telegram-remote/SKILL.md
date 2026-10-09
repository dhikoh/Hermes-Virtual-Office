---
name: telegram-remote
description: Format remote task updates, notifications, and approval cards for Telegram and mobile interfaces. Handles remote commands and compact actionable reports.
metadata: {"hermes":{"skillKey":"telegram-remote"}}
---

# Telegram Remote Control & Mobile Card Formatting

Use this skill when interacting through Telegram bots, mobile webhook channels, or remote status notifications.

## Trigger

```json
{
  "activation": {
    "anyPhrases": [
      "telegram",
      "mobile update",
      "kirim ke telegram",
      "status hp",
      "remote task",
      "mobile card"
    ]
  },
  "movement": {
    "target": "desk",
    "skipIfAlreadyThere": true
  }
}
```

## Mobile Card Format

When sending updates to Telegram or mobile:

1. **Card Header**:
   - `[HERMES REMOTE]` - `[AGENT_NAME]`
   - `Status`: `WORKING` | `BLOCKED` | `DONE` | `APPROVAL_REQUIRED`

2. **Card Body**:
   - **Task**: 1-line statement of the active goal.
   - **Progress**: Concise checkpoint or percentage (e.g. `Step 2/4`).
   - **Details**: Max 3 bullet points of high-level information.

3. **Card Footer / Action**:
   - If blocked on human approval, state the command and provide quick action tags:
     `Approve: /approve <id> | Reject: /reject <id>`

4. **Tone & Constraints**:
   - Keep messages under 300 characters when possible.
   - Use standard emoji sparingly as functional signifiers (✅ done, ⚠️ attention, ⏳ in-flight).
   - Never print raw stack traces; print 1-line sanitized error message instead.
