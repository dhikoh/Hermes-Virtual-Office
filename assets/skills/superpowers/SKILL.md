---
name: superpowers
description: Enforce rigorous software engineering discipline: requirement planning before coding, test-driven development (TDD), and multi-gate verification before commit.
metadata: {"hermes":{"skillKey":"superpowers"}}
---

# Superpowers: Rigorous Software Engineering Discipline

Use this skill when developing code, debugging issues, modifying architectures, or creating software features.

## Trigger

```json
{
  "activation": {
    "anyPhrases": [
      "superpowers",
      "engineering plan",
      "tdd",
      "strict mode",
      "verifikasi kode",
      "quality gate"
    ]
  },
  "movement": {
    "target": "desk",
    "skipIfAlreadyThere": true
  }
}
```

## Non-Negotiable Engineering Rules

1. **No Coding Without a Plan**:
   - Write or update an implementation plan (`_AI/plans/`) before touching source code.
   - Clarify edge cases, dependencies, and rollback mechanisms beforehand.

2. **Test-Driven Discipline (TDD)**:
   - When introducing or altering functionality, write or update automated unit/integration tests first.
   - Run tests to prove failure on old code and success on new code.

3. **Zero-Error Verification Gate**:
   - Before completing any task or staging Git commits, verify:
     - Typecheck: `npx tsc --noEmit` (must exit with 0 errors).
     - Linter: `npx eslint` (must exit with 0 warnings/errors).
     - Test suite: `npx vitest run` (all tests must pass).

4. **No Code Bloat / Duplication**:
   - Always reuse existing utility functions rather than duplicating logic.
   - Remove dead code, obsolete imports, and temporary debug statements.
