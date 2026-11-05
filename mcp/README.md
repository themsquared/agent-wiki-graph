# agent-wiki-graph MCP

Schema-enforcing [Model Context Protocol](https://modelcontextprotocol.io) server for an
[agent-wiki-graph](https://github.com/themsquared/agent-wiki-graph) vault.

Agents talk to this server instead of free-writing markdown. They may read the graph. The only
write is a new file under `_agents/inbox/` with required frontmatter. Existing pages, `_raw/`,
and deletes are refused.

This is not Mem0 and not a generic Obsidian MCP. Those treat a vault as file CRUD. The
schema in [`CLAUDE.md`](../CLAUDE.md) is the contract: where a fact goes, what is immutable,
and which topics are out of bounds.

Author: Mike Moore / themsquared. MIT.

## Tools

| Tool | Input | Behavior |
| --- | --- | --- |
| `brain_schema` | (none) | Returns `CLAUDE.md`, inbox write rules, and the deny list. Call this first. |
| `brain_search` | `query`, optional `area`, `limit` | Search markdown titles and bodies. `area` is a path prefix. |
| `brain_read` | `path` | Read one path-gated file. Denied paths and vault escapes are refused. `_raw/` is readable. |
| `brain_inbox_write` | `agent`, `date`, `about`, `area`, `source`, `suggested_home`, `topic`, `body` | Create `_agents/inbox/YYYY-MM-DD-<agent-slug>-<topic>.md`. No overwrite. |
| `brain_refuse_check` | same fields, all optional, plus optional `path` | Dry-run. Reports whether a write or topic would be refused and why. |
| `brain_health` | (none) | Runs `scripts/graph_check.py` and returns pages/edges/broken/orphans plus inbox backlog. |

## Deny list

Hard-refused paths and topics (generic categories, no real private material in this repo):

- Credentials, passwords, API keys, and secrets
- Access tokens and session tokens
- Custody and family-legal matters
- HR personnel matters

The same list lives in `CLAUDE.md` under Privacy boundary. A category that is not written there
does not exist.

## Requirements

- Node.js 20 or later
- Python 3, for `brain_health` (`scripts/graph_check.py`)

```bash
cd mcp
npm install
```

## Run locally

`VAULT_ROOT` defaults to the nearest parent directory that contains `CLAUDE.md` and `accounts/`,
otherwise the current working directory.

Stdio (what Cursor, Claude Desktop, and Claude Code spawn):

```bash
npx tsx src/index.ts
```

The process waits on stdin. Logs go to **stderr** only. stdout is the JSON-RPC channel.

Streamable HTTP (default `http://127.0.0.1:43148`):

```bash
npm run start:http
```

| Env | Default | Meaning |
| --- | --- | --- |
| `VAULT_ROOT` | repo root or cwd | Vault directory |
| `PORT` | `43148` | Listen port |
| `HOST` | `127.0.0.1` | Bind address |
| `MCP_PATH` | `/mcp` | MCP endpoint path |

`GET /` is a short status page. `GET /health` returns JSON. `POST /mcp` is the MCP endpoint.
This process can write inbox notes. Do not bind it to a public address.

## Smoke test

Copies the sample vault to a temp directory, then over stdio: loads the schema, writes one
inbox note, refuses a write outside the inbox, refuses a credentials topic, and runs health.

```bash
npm run smoke
```

The sample tree in git is not modified.

## Register as MCP

### Cursor

Add to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/agent-wiki-graph/mcp/src/index.ts"],
      "env": {
        "VAULT_ROOT": "/absolute/path/to/agent-wiki-graph"
      }
    }
  }
}
```

From this package you can also use `"command": "npm"` with `"args": ["start"]` and `"cwd"` set
to the `mcp/` directory.

### Claude Desktop / Claude Code

Same stdio shape in Claude Desktop's MCP config, or:

```bash
claude mcp add agent-wiki --env VAULT_ROOT=/absolute/path/to/agent-wiki-graph -- npx tsx /absolute/path/to/agent-wiki-graph/mcp/src/index.ts
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

## Project layout

```
src/index.ts     stdio entry
src/http.ts      Streamable HTTP + status page
src/server.ts    tool registration
src/vault.ts     path gating, read, search
src/inbox.ts     inbox-only create + frontmatter checks
src/deny.ts      generic deny list
src/health.ts    graph_check.py + inbox backlog
scripts/smoke.ts temp-copy MCP client check
```

## License

MIT. See the repo root `LICENSE`.
