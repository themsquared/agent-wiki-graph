import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { resolveVaultRoot } from './vault.ts';
import { createServer } from './server.ts';

const vaultRoot = resolveVaultRoot();

void serveStdio(() => createServer(vaultRoot), {
  onerror: (error) => {
    console.error('agent-wiki-graph-mcp stdio error:', error);
  },
});

console.error(`agent-wiki-graph-mcp v1 running on stdio (VAULT_ROOT=${vaultRoot})`);
