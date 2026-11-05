export const SERVER_NAME = 'agent-wiki-graph';
export const SERVER_VERSION = '1.0.0';
export const SERVER_TITLE = 'Agent wiki graph';

export const INBOX_DIR = '_agents/inbox';
export const CONTRACT_PATH = 'CLAUDE.md';

export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;
export const MAX_READ_BYTES = 1_000_000;
export const MAX_SLUG_LEN = 80;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const INBOX_FIELDS = [
  'agent',
  'date',
  'about',
  'area',
  'source',
  'suggested_home',
] as const;

export type InboxField = (typeof INBOX_FIELDS)[number];

export const SKIP_DIRS = new Set([
  '.git',
  '.obsidian',
  '.trash',
  '.claude',
  '.cursor',
  'node_modules',
  'mcp',
  'dist',
]);

export const SERVER_INSTRUCTIONS = [
  'This vault is structured multi-agent memory, not a file store.',
  'Call brain_schema first and follow CLAUDE.md.',
  'Read with brain_search and brain_read.',
  'The only write is brain_inbox_write: a new file under _agents/inbox/ with required frontmatter.',
  'Do not edit existing wiki pages, do not touch _raw/, and do not delete.',
  'Call brain_refuse_check before a write if the topic might be out of bounds.',
].join(' ');

export type DenyRule = {
  id: string;
  description: string;
  path: RegExp;
  topic: RegExp;
};

/**
 * Generic deny categories. Documented in CLAUDE.md. No real private material
 * lives in this repo. Patterns are category names, not customer content.
 */
export const DENY_RULES: readonly DenyRule[] = [
  {
    id: 'credentials',
    description: 'Credentials, passwords, API keys, and secrets',
    path: /(^|\/)(\.env(\..+)?|credentials|secrets)(\/|$|\.)/i,
    topic: /\b(credentials?|passwords?|secrets?|api[_ -]?keys?|private[_ -]?keys?)\b/i,
  },
  {
    id: 'tokens',
    description: 'Access tokens and session tokens',
    path: /(^|\/)tokens?(\/|$|\.)/i,
    topic: /\b(access[_ -]?tokens?|refresh[_ -]?tokens?|bearer[_ -]?tokens?|oauth[_ -]?tokens?|session[_ -]?tokens?)\b/i,
  },
  {
    id: 'custody-family-legal',
    description: 'Custody and family-legal matters',
    path: /(^|\/)(custody|family-legal|family_legal)(\/|$|\.)/i,
    topic: /\b(custody|family[- ]legal|family law|guardianship)\b/i,
  },
  {
    id: 'hr-personnel',
    description: 'HR personnel matters',
    path: /(^|\/)(hr-personnel|personnel-file|personnel-files)(\/|$|\.)/i,
    topic:
      /\b(hr personnel|personnel (files?|matters?)|performance reviews?|disciplinary actions?)\b/i,
  },
];
