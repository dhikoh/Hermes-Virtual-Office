---
name: obsidian-skills
description: Structure and maintain the workspace knowledge base as a connected Obsidian Vault. Enforces [[wikilinks]], callouts, frontmatter tags, and canvas diagrams under _AI/.
metadata: {"hermes":{"skillKey":"obsidian-skills"}}
---

# Obsidian Vault Architecture & Knowledge Management

Use this skill when reading, creating, or updating notes in the `_AI/` directory to ensure full compatibility with Obsidian.

## Trigger

```json
{
  "activation": {
    "anyPhrases": [
      "obsidian",
      "vault",
      "wikilink",
      "knowledge graph",
      "catat di vault",
      "buat canvas"
    ]
  },
  "movement": {
    "target": "desk",
    "skipIfAlreadyThere": true
  }
}
```

## Vault Taxonomy

Organize files according to the three-tier office knowledge structure:

- `_AI/research/`: External scraping reports, competitor breakdowns, market intel.
- `_AI/plans/`: Implementation plans, architecture roadmaps, technical specs.
- `_AI/adr/`: Architecture Decision Records (immutable records of why a technical choice was made).

## Note Formatting Standards

1. **YAML Frontmatter**:
   ```yaml
   ---
   title: "Note Title"
   aliases: ["Alternative Name"]
   tags: ["category/subtag"]
   created: "YYYY-MM-DD"
   updated: "YYYY-MM-DD"
   ---
   ```

2. **Wikilinks**:
   - Link related concepts with double square brackets: `[[Note Name]]` or `[[Note Name|Display Label]]`.
   - Never use relative markdown paths like `[Note](../research/note.md)` when a `[[wikilink]]` is appropriate.

3. **Callout Boxes**:
   - Use standard Obsidian callout syntax:
     ```markdown
     > [!NOTE]
     > Key insight or contextual information.
     ```
     Supported callouts: `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`.

4. **JSON Canvas (.canvas)**:
   - Mind maps and workflow state transitions should be saved as valid `.canvas` JSON files containing `nodes` and `edges`.
