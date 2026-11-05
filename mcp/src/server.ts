import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  CONTRACT_PATH,
  DEFAULT_SEARCH_LIMIT,
  INBOX_DIR,
  INBOX_FIELDS,
  MAX_SEARCH_LIMIT,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_TITLE,
  SERVER_VERSION,
} from './config.ts';
import { documentedDenyList } from './deny.ts';
import { RefuseError } from './errors.ts';
import { runHealth } from './health.ts';
import { checkInboxWrite, writeInboxNote, type InboxDraft } from './inbox.ts';
import { readPage, resolveVaultRoot, searchPages } from './vault.ts';

const reasonSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const searchHitSchema = z.object({
  path: z.string(),
  title: z.string(),
  excerpt: z.string(),
  score: z.number(),
});

const searchOutputSchema = z.object({
  query: z.string(),
  area: z.string().optional(),
  count: z.number().int(),
  hits: z.array(searchHitSchema),
});

const readOutputSchema = z.object({
  path: z.string(),
  title: z.string(),
  body: z.string(),
});

const writeInputSchema = z.object({
  agent: z.string().describe('Agent name. Slugged into the filename.'),
  date: z.string().describe('Note date as YYYY-MM-DD. Must match the filename date.'),
  about: z.string().describe('One-line summary of the proposed fact.'),
  area: z
    .string()
    .describe('Routing hint such as accounts/acme-robotics, concepts, products, or root.'),
  source: z.string().describe('Where this came from (meeting, chat, observation).'),
  suggested_home: z
    .string()
    .describe('Vault-relative wiki path the engineer should consider, not _raw/.'),
  topic: z.string().describe('Kebab topic used in YYYY-MM-DD-<agent-slug>-<topic>.md.'),
  body: z.string().describe('Markdown body after frontmatter. Do not edit existing pages here.'),
});

const writeOutputSchema = z.object({
  path: z.string(),
  created: z.boolean(),
});

const refuseInputSchema = writeInputSchema.extend({
  path: z
    .string()
    .optional()
    .describe('Optional proposed destination. Anything outside _agents/inbox/ is refused.'),
  body: z.string().optional().describe('Optional body to check against the deny list.'),
  topic: z.string().optional(),
  agent: z.string().optional(),
  date: z.string().optional(),
  about: z.string().optional(),
  area: z.string().optional(),
  source: z.string().optional(),
  suggested_home: z.string().optional(),
});

const refuseOutputSchema = z.object({
  allowed: z.boolean(),
  path: z.string().optional(),
  reasons: z.array(reasonSchema),
});

const healthOutputSchema = z.object({
  pages: z.number().int(),
  edges: z.number().int(),
  broken_targets: z.number().int(),
  orphans: z.number().int(),
  inbox_backlog: z.number().int(),
  inbox: z.array(z.string()),
  top_hubs: z.array(z.tuple([z.string(), z.number()])),
  broken: z.record(z.string(), z.array(z.string())),
  orphan_list: z.array(z.string()),
});

const schemaOutputSchema = z.object({
  contract_path: z.string(),
  contract: z.string(),
  write_rules: z.object({
    read: z.string(),
    write: z.string(),
    filename: z.string(),
    required_frontmatter: z.array(z.string()),
    never: z.array(z.string()),
  }),
  deny_list: z.array(z.object({ id: z.string(), description: z.string() })),
});

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

function toolResult<T>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function fail(error: unknown, fallback: string): ReturnType<typeof toolError> {
  if (error instanceof RefuseError) return toolError(`${error.code}: ${error.message}`);
  return toolError(error instanceof Error ? error.message : fallback);
}

function draftFrom(args: z.infer<typeof refuseInputSchema>): InboxDraft {
  return {
    agent: args.agent ?? '',
    date: args.date ?? '',
    about: args.about ?? '',
    area: args.area ?? '',
    source: args.source ?? '',
    suggested_home: args.suggested_home ?? '',
    topic: args.topic ?? '',
    body: args.body ?? '',
    ...(args.path ? { path: args.path } : {}),
  };
}

export function createServer(vaultRoot = resolveVaultRoot()): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      title: SERVER_TITLE,
      websiteUrl: 'https://github.com/themsquared/agent-wiki-graph',
      description:
        'Schema-enforcing vault memory: read the wiki graph, write only a new _agents/inbox/ note.',
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { tools: {} },
    },
  );

  server.registerTool(
    'brain_schema',
    {
      title: 'Load the vault schema contract',
      description:
        'Return CLAUDE.md plus the inbox write rules and the generic deny list. Call this before writing.',
      inputSchema: z.object({}),
      outputSchema: schemaOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const page = readPage(vaultRoot, CONTRACT_PATH);
        return toolResult({
          contract_path: page.path,
          contract: page.body,
          write_rules: {
            read: 'Broad read under the vault root, except deny paths and .git / node_modules / .env.',
            write: `Create-only under ${INBOX_DIR}/. Existing pages, _raw/, and deletes are refused.`,
            filename: 'YYYY-MM-DD-<agent-slug>-<topic>.md',
            required_frontmatter: [...INBOX_FIELDS],
            never: ['edit existing wiki pages', 'touch _raw/', 'delete', 'overwrite an inbox note'],
          },
          deny_list: documentedDenyList(),
        });
      } catch (error) {
        return fail(error, 'brain_schema failed');
      }
    },
  );

  server.registerTool(
    'brain_search',
    {
      title: 'Search vault markdown',
      description:
        'Search markdown titles and bodies. Optional area is a vault-relative prefix such as accounts/acme-robotics or concepts.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Search string. Empty string returns recently modified pages.'),
        area: z
          .string()
          .optional()
          .describe('Optional path prefix filter, for example accounts/acme-robotics or concepts.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .optional()
          .describe(`Maximum hits (default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT}).`),
      }),
      outputSchema: searchOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, area, limit }) => {
      try {
        const hits = searchPages(vaultRoot, query, { area, limit });
        return toolResult({
          query,
          ...(area ? { area } : {}),
          count: hits.length,
          hits,
        });
      } catch (error) {
        return fail(error, 'brain_search failed');
      }
    },
  );

  server.registerTool(
    'brain_read',
    {
      title: 'Read one vault path',
      description:
        'Read one path-gated file under the vault. Denied paths, _private-style credential paths, and escapes are refused. _raw/ is readable and not writable.',
      inputSchema: z.object({
        path: z.string().min(1).describe('Vault-relative path, with or without .md.'),
      }),
      outputSchema: readOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path }) => {
      try {
        return toolResult(readPage(vaultRoot, path));
      } catch (error) {
        return fail(error, 'brain_read failed');
      }
    },
  );

  server.registerTool(
    'brain_inbox_write',
    {
      title: 'Create an inbox note',
      description:
        'The only write tool. Creates one new markdown file under _agents/inbox/ with required frontmatter. Refuses overwrite, paths outside the inbox, _raw/, and deny-list topics.',
      inputSchema: writeInputSchema,
      outputSchema: writeOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const created = writeInboxNote(vaultRoot, args);
        return toolResult({ path: created.path, created: true });
      } catch (error) {
        return fail(error, 'brain_inbox_write failed');
      }
    },
  );

  server.registerTool(
    'brain_refuse_check',
    {
      title: 'Dry-run a proposed write',
      description:
        'Return whether a proposed write or topic would be refused, and why. Does not write. Pass path to test a destination outside the inbox.',
      inputSchema: refuseInputSchema,
      outputSchema: refuseOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        return toolResult(checkInboxWrite(vaultRoot, draftFrom(args)));
      } catch (error) {
        return fail(error, 'brain_refuse_check failed');
      }
    },
  );

  server.registerTool(
    'brain_health',
    {
      title: 'Vault graph health',
      description:
        'Run scripts/graph_check.py and return pages, edges, broken targets, orphans, plus the _agents/inbox/ backlog count.',
      inputSchema: z.object({}),
      outputSchema: healthOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        return toolResult(runHealth(vaultRoot));
      } catch (error) {
        return fail(error, 'brain_health failed');
      }
    },
  );

  return server;
}
