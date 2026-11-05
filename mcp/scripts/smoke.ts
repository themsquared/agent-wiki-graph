import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const mcpRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(mcpRoot, '..');
const tsxCli = resolve(mcpRoot, 'node_modules/tsx/dist/cli.mjs');

const EXPECTED_TOOLS = [
  'brain_health',
  'brain_inbox_write',
  'brain_read',
  'brain_refuse_check',
  'brain_schema',
  'brain_search',
];

function fail(message: string): never {
  console.error(`smoke FAIL: ${message}`);
  process.exit(1);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  fail(`expected object, got ${typeof value}`);
}

function textPayload(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const block = result.content.find((item) => item.type === 'text' && item.text);
  if (!block?.text) fail('tool result had no text content');
  return JSON.parse(block.text);
}

function payload(result: { structuredContent?: unknown; content: Array<{ type: string; text?: string }> }) {
  return asRecord(result.structuredContent ?? textPayload(result));
}

function copyVault(): string {
  const dest = mkdtempSync(join(tmpdir(), 'wiki-mcp-smoke-'));
  cpSync(repoRoot, dest, {
    recursive: true,
    filter: (src) => {
      const n = src.replace(/\\/g, '/');
      return !n.includes('/.git/') && !n.endsWith('/.git') && !n.includes('/node_modules/');
    },
  });
  return dest;
}

async function main(): Promise<void> {
  const vault = copyVault();
  const indexBefore = readFileSync(join(vault, 'accounts/acme-robotics/index.md'), 'utf8');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, 'src/index.ts'],
    cwd: mcpRoot,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      NODE_PATH: process.env.NODE_PATH ?? '',
      VAULT_ROOT: vault,
    },
    stderr: 'pipe',
  });

  const stderr = transport.stderr;
  if (stderr && typeof stderr.on === 'function') {
    stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
  }

  const client = new Client({ name: 'agent-wiki-graph-mcp-smoke', version: '1.0.0' });
  try {
    await client.connect(transport);

    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    for (const tool of EXPECTED_TOOLS) {
      if (!names.includes(tool)) fail(`missing tool ${tool}, got ${names.join(', ') || '(none)'}`);
    }
    console.log(`tools: ${names.join(', ')}`);

    const schema = await client.callTool({ name: 'brain_schema', arguments: {} });
    if (schema.isError) fail(`brain_schema returned isError: ${JSON.stringify(schema.content)}`);
    const schemaBody = payload(schema);
    if (typeof schemaBody.contract !== 'string' || !schemaBody.contract.includes('Account wiki')) {
      fail('brain_schema did not return CLAUDE.md');
    }
    const writeRules = asRecord(schemaBody.write_rules);
    if (!String(writeRules.write ?? '').includes('_agents/inbox/')) {
      fail('brain_schema write rules missing inbox path');
    }
    if (!Array.isArray(schemaBody.deny_list) || schemaBody.deny_list.length < 4) {
      fail('brain_schema deny_list missing');
    }
    console.log('brain_schema: contract loaded');

    const search = await client.callTool({
      name: 'brain_search',
      arguments: { query: 'Kubernetes', area: 'accounts/acme-robotics', limit: 8 },
    });
    if (search.isError) fail(`brain_search returned isError: ${JSON.stringify(search.content)}`);
    const searchBody = payload(search);
    const hits = searchBody.hits;
    if (!Array.isArray(hits) || hits.length === 0) {
      fail('brain_search returned no hits for Kubernetes in accounts/acme-robotics');
    }
    console.log(`brain_search: ${hits.length} hits, first=${asRecord(hits[0]).path}`);

    const read = await client.callTool({
      name: 'brain_read',
      arguments: { path: 'CLAUDE.md' },
    });
    if (read.isError) fail(`brain_read returned isError: ${JSON.stringify(read.content)}`);
    const readBody = payload(read);
    if (readBody.path !== 'CLAUDE.md') fail(`brain_read path mismatch: ${readBody.path}`);
    console.log('brain_read: CLAUDE.md');

    const deniedRead = await client.callTool({
      name: 'brain_read',
      arguments: { path: 'secrets/api-keys.md' },
    });
    if (!deniedRead.isError) fail('brain_read should refuse a credentials path');
    console.log('brain_read secrets path: refused (expected)');

    const writeArgs = {
      agent: 'smoke-agent',
      date: '2026-11-05',
      about: 'POC success criteria already live in the sample vault',
      area: 'accounts/acme-robotics',
      source: 'mcp-smoke',
      suggested_home: 'accounts/acme-robotics/topics/gateway-poc.md',
      topic: 'poc-criteria-reminder',
      body: 'Reminder only. Per-team LLM budgets and tool-level access control are the POC criteria.\n',
    };

    const written = await client.callTool({ name: 'brain_inbox_write', arguments: writeArgs });
    if (written.isError) fail(`brain_inbox_write returned isError: ${JSON.stringify(written.content)}`);
    const writtenBody = payload(written);
    const inboxPath = '_agents/inbox/2026-11-05-smoke-agent-poc-criteria-reminder.md';
    if (writtenBody.path !== inboxPath) fail(`unexpected inbox path: ${writtenBody.path}`);
    const note = readFileSync(join(vault, inboxPath), 'utf8');
    for (const field of ['agent', 'date', 'about', 'area', 'source', 'suggested_home']) {
      if (!note.includes(`${field}:`)) fail(`inbox note missing ${field}`);
    }
    console.log(`brain_inbox_write: ${inboxPath}`);

    const again = await client.callTool({ name: 'brain_inbox_write', arguments: writeArgs });
    if (!again.isError) fail('brain_inbox_write should refuse overwrite');
    console.log('brain_inbox_write overwrite: refused (expected)');

    const outside = await client.callTool({
      name: 'brain_refuse_check',
      arguments: { ...writeArgs, path: 'accounts/acme-robotics/index.md' },
    });
    if (outside.isError) fail(`brain_refuse_check returned isError: ${JSON.stringify(outside.content)}`);
    const outsideBody = payload(outside);
    if (outsideBody.allowed === true) fail('write outside inbox should be refused');
    const outsideReasons = Array.isArray(outsideBody.reasons) ? outsideBody.reasons : [];
    const codes = outsideReasons.map((reason) => asRecord(reason).code);
    if (!codes.includes('NOT_INBOX')) {
      fail(`expected NOT_INBOX, got ${codes.join(', ')}`);
    }
    console.log(`brain_refuse_check outside inbox: ${codes.join(', ')}`);

    const denied = await client.callTool({
      name: 'brain_refuse_check',
      arguments: {
        agent: 'smoke-agent',
        date: '2026-11-05',
        about: 'Need the production API key',
        area: 'accounts/acme-robotics',
        source: 'mcp-smoke',
        suggested_home: 'accounts/acme-robotics/topics/gateway-poc.md',
        topic: 'production-api-key',
        body: 'Store the API key in the vault.',
      },
    });
    if (denied.isError) fail(`brain_refuse_check deny returned isError: ${JSON.stringify(denied.content)}`);
    const deniedBody = payload(denied);
    if (deniedBody.allowed === true) fail('credentials topic should be refused');
    console.log('brain_refuse_check credentials topic: refused (expected)');

    const afterIndex = readFileSync(join(vault, 'accounts/acme-robotics/index.md'), 'utf8');
    if (afterIndex !== indexBefore) fail('sample wiki page changed; writes must stay in the inbox');

    const health = await client.callTool({ name: 'brain_health', arguments: {} });
    if (health.isError) fail(`brain_health returned isError: ${JSON.stringify(health.content)}`);
    const healthBody = payload(health);
    for (const field of ['pages', 'edges', 'broken_targets', 'orphans', 'inbox_backlog']) {
      if (typeof healthBody[field] !== 'number') fail(`brain_health missing ${field}`);
    }
    if ((healthBody.inbox_backlog as number) < 1) fail('brain_health inbox_backlog should include the smoke note');
    if (!Array.isArray(healthBody.inbox) || !healthBody.inbox.includes(inboxPath)) {
      fail('brain_health inbox list missing the smoke note');
    }
    console.log(
      `brain_health: pages=${healthBody.pages} edges=${healthBody.edges} broken=${healthBody.broken_targets} orphans=${healthBody.orphans} inbox=${healthBody.inbox_backlog}`,
    );

    await client.close();
    console.log('smoke OK - schema, inbox write, outside-inbox refuse, health');
  } finally {
    try {
      await client.close();
    } catch {
      // already closed
    }
    rmSync(vault, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
});
