---
name: agent-reach
description: Social media intel and public community extraction playbook for Twitter/X, Reddit, and LinkedIn. Uses Camoufox persistent browser profiles to retain logins and prevent bot detection.
metadata: {"hermes":{"skillKey":"agent-reach"}}
---

# Agent Reach: Social Intelligence & Community Monitoring

Use this skill when monitoring community sentiment, competitor announcements, trending topics, or public discussions on Twitter/X, Reddit, or LinkedIn.

## Trigger

```json
{
  "activation": {
    "anyPhrases": [
      "agent reach",
      "pantau sosmed",
      "social media research",
      "scrape twitter",
      "scrape reddit",
      "scrape linkedin",
      "community sentiment"
    ]
  },
  "movement": {
    "target": "desk",
    "skipIfAlreadyThere": true
  }
}
```

## Platform Playbooks

1. **Twitter / X Public Intelligence**:
   - Navigate target profiles or search queries via persistent Camoufox profile to maintain session auth.
   - Extract top thread metrics: Views, Retweets, Likes, and dominant audience sentiment.
   - Ignore promoted ads, sponsored spam, and unrelated bot replies.

2. **Reddit Community Discussions**:
   - Focus on discussion subreddits (`r/programming`, `r/selfhosted`, `r/MachineLearning`, etc.).
   - Extract upvoted pain points, feature requests, and authentic developer reviews.

3. **LinkedIn Public Posts**:
   - Extract industry trends, hiring signals, and partner announcements.

4. **Storage & Output**:
   - Save dossiers to `_AI/research/social/<platform>-<topic-slug>.md`.
   - Provide concise synthesis: Key takeaway, Community sentiment ratio (Positive/Neutral/Negative), and Direct Quotes.
