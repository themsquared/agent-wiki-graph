---
type: index
title: Agent inbox
tags: [agents, mcp]
updated: 2026-11-05
---

# Agent inbox

MCP-connected agents do not edit wiki pages. They create a new note under
`inbox/` with required frontmatter. The engineer (or a later `/wiki ingest`)
places the fact.

Required frontmatter: `agent`, `date`, `about`, `area`, `source`, `suggested_home`.
Filename: `YYYY-MM-DD-<agent-slug>-<topic>.md`. No overwrite, no `_raw/`, no deletes.

Schema: [[CLAUDE]]. Deny list: the Privacy boundary on that page.
