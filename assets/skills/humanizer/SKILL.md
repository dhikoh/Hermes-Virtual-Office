---
name: humanizer
description: Filter out repetitive AI patterns, robotic phrasing, and overused buzzwords. Rewrites text into engaging, authentic, human-sounding content.
metadata: {"hermes":{"skillKey":"humanizer"}}
---

# Humanizer: Anti-AI Slop & Authentic Writing Filter

Use this skill when composing documentation, articles, marketing copy, patch notes, or customer-facing communications.

## Trigger

```json
{
  "activation": {
    "anyPhrases": [
      "humanize",
      "humanizer",
      "hapus gaya ai",
      "tulis seperti manusia",
      "natural writing",
      "anti slop"
    ]
  },
  "movement": {
    "target": "desk",
    "skipIfAlreadyThere": true
  }
}
```

## Banned AI Tropes & Patterns

1. **Banned Words & Buzzwords**:
   - Do NOT use: "delve", "tapestry", "beacon", "testament to", "furthermore", "in conclusion", "it is crucial to remember", "embark on", "foster", "nuanced", "multifaceted".

2. **Banned Sentence Structures**:
   - Avoid excessive triads ("fast, reliable, and secure").
   - Avoid rhetorical summary intros ("In a world where...", "When it comes to...").
   - Avoid passive voice hedge phrases ("It could be argued that...").

3. **Human Phrasing Standards**:
   - Vary sentence lengths dramatically. Mix very short sentences with longer explanatory ones.
   - Use concrete nouns and active verbs.
   - Speak with opinionated clarity, pragmatic realism, and grounded experience.
