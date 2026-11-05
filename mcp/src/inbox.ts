import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DATE_RE,
  INBOX_DIR,
  INBOX_FIELDS,
  MAX_SLUG_LEN,
  type InboxField,
} from './config.ts';
import { denyReasons } from './deny.ts';
import { RefuseError, type RefuseReason } from './errors.ts';
import { isAlwaysDeniedPath, normalizeRel, resolveInside } from './vault.ts';

export type InboxDraft = {
  agent: string;
  date: string;
  about: string;
  area: string;
  source: string;
  suggested_home: string;
  topic: string;
  body: string;
  path?: string;
};

export type RefuseCheck = {
  allowed: boolean;
  path?: string;
  reasons: RefuseReason[];
};

const RAW_RE = /(^|\/)_raw(\/|$)/;

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LEN);
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function stripIncomingFrontmatter(body: string): string {
  const trimmed = body.replace(/^\uFEFF/, '');
  const match = trimmed.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? trimmed.slice(match[0].length).replace(/^\r?\n/, '') : trimmed;
}

function missingFields(draft: InboxDraft): RefuseReason[] {
  const reasons: RefuseReason[] = [];
  for (const field of INBOX_FIELDS) {
    if (!String(draft[field] ?? '').trim()) {
      reasons.push({ code: 'INVALID_FRONTMATTER', message: `missing required frontmatter: ${field}` });
    }
  }
  if (!String(draft.topic ?? '').trim()) {
    reasons.push({ code: 'INVALID_FRONTMATTER', message: 'missing topic (used in the inbox filename)' });
  }
  if (!String(draft.body ?? '').trim()) {
    reasons.push({ code: 'INVALID_FRONTMATTER', message: 'missing body' });
  }
  return reasons;
}

function inboxFilename(date: string, agentSlug: string, topicSlug: string): string {
  return `${date}-${agentSlug}-${topicSlug}.md`;
}

export function plannedInboxPath(draft: InboxDraft): string {
  const date = draft.date.trim();
  const agentSlug = slugify(draft.agent);
  const topicSlug = slugify(draft.topic);
  return `${INBOX_DIR}/${inboxFilename(date, agentSlug, topicSlug)}`;
}

function pathReasons(proposed: string): RefuseReason[] {
  const reasons: RefuseReason[] = [];
  let rel: string;
  try {
    rel = normalizeRel(proposed);
  } catch (error) {
    if (error instanceof RefuseError) {
      return [{ code: error.code, message: error.message }];
    }
    throw error;
  }
  if (isAlwaysDeniedPath(rel)) {
    reasons.push({ code: 'DENY_PATH', message: `path is not writable: ${rel}` });
  }
  if (RAW_RE.test(rel)) {
    reasons.push({ code: 'RAW_IMMUTABLE', message: `_raw/ is immutable: ${rel}` });
  }
  if (!rel.startsWith(`${INBOX_DIR}/`) || rel === INBOX_DIR) {
    reasons.push({
      code: 'NOT_INBOX',
      message: `writes are create-only under ${INBOX_DIR}/, not ${rel}`,
    });
  }
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  if (!DATE_RE.test(base.slice(0, 10)) || !base.endsWith('.md') || base !== base.toLowerCase()) {
    reasons.push({
      code: 'INVALID_FILENAME',
      message: `filename must be YYYY-MM-DD-<agent-slug>-<topic>.md, got ${base}`,
    });
  }
  return reasons;
}

export function checkInboxWrite(root: string, draft: InboxDraft): RefuseCheck {
  const reasons: RefuseReason[] = [];
  reasons.push(...missingFields(draft));

  const date = draft.date.trim();
  if (date && !DATE_RE.test(date)) {
    reasons.push({ code: 'INVALID_FRONTMATTER', message: `date must be YYYY-MM-DD, got ${date}` });
  }

  const agentSlug = slugify(draft.agent);
  const topicSlug = slugify(draft.topic);
  if (draft.agent.trim() && !agentSlug) {
    reasons.push({ code: 'INVALID_FRONTMATTER', message: 'agent did not produce a kebab slug' });
  }
  if (draft.topic.trim() && !topicSlug) {
    reasons.push({ code: 'INVALID_FRONTMATTER', message: 'topic did not produce a kebab slug' });
  }

  if (draft.suggested_home.trim()) {
    try {
      const home = normalizeRel(draft.suggested_home);
      if (RAW_RE.test(home)) {
        reasons.push({
          code: 'RAW_IMMUTABLE',
          message: `suggested_home may not point at _raw/: ${home}`,
        });
      }
    } catch (error) {
      if (error instanceof RefuseError) {
        reasons.push({ code: error.code, message: `suggested_home ${error.message}` });
      } else {
        throw error;
      }
    }
  }

  reasons.push(
    ...denyReasons({
      topic: draft.topic,
      about: draft.about,
      body: draft.body,
      area: draft.area,
      suggested_home: draft.suggested_home,
      path: draft.path,
    }),
  );

  let planned: string | undefined;
  if (draft.path?.trim()) {
    reasons.push(...pathReasons(draft.path));
  }

  if (agentSlug && topicSlug && DATE_RE.test(date)) {
    planned = plannedInboxPath(draft);
    if (draft.path?.trim()) {
      try {
        const requested = normalizeRel(draft.path);
        if (requested !== planned) {
          reasons.push({
            code: 'PATH_MISMATCH',
            message: `proposed path ${requested} does not match required ${planned}`,
          });
        }
      } catch (error) {
        if (error instanceof RefuseError) {
          reasons.push({ code: error.code, message: error.message });
        } else {
          throw error;
        }
      }
    } else {
      reasons.push(...pathReasons(planned));
    }
    try {
      const abs = resolveInside(root, planned);
      if (existsSync(abs)) {
        reasons.push({
          code: 'OVERWRITE',
          message: `inbox note already exists (no overwrite): ${planned}`,
        });
      }
    } catch (error) {
      if (error instanceof RefuseError) {
        reasons.push({ code: error.code, message: error.message });
      } else {
        throw error;
      }
    }
  }

  const unique = new Map<string, RefuseReason>();
  for (const reason of reasons) {
    unique.set(`${reason.code}:${reason.message}`, reason);
  }
  return {
    allowed: unique.size === 0,
    ...(planned ? { path: planned } : {}),
    reasons: [...unique.values()],
  };
}

export function renderInboxNote(draft: InboxDraft): string {
  const fields: Record<InboxField, string> = {
    agent: draft.agent.trim(),
    date: draft.date.trim(),
    about: draft.about.trim(),
    area: draft.area.trim(),
    source: draft.source.trim(),
    suggested_home: normalizeRel(draft.suggested_home),
  };
  const lines = ['---', ...INBOX_FIELDS.map((field) => `${field}: ${yamlScalar(fields[field])}`), '---', ''];
  const body = stripIncomingFrontmatter(draft.body).replace(/\s+$/, '') + '\n';
  return `${lines.join('\n')}\n${body}`;
}

export function writeInboxNote(root: string, draft: InboxDraft): { path: string } {
  const check = checkInboxWrite(root, draft);
  if (!check.allowed || !check.path) {
    const first = check.reasons[0];
    throw new RefuseError(first?.code ?? 'REFUSED', first?.message ?? 'write refused');
  }
  const abs = resolveInside(root, check.path);
  mkdirSync(dirname(abs), { recursive: true });
  try {
    writeFileSync(abs, renderInboxNote(draft), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      throw new RefuseError('OVERWRITE', `inbox note already exists (no overwrite): ${check.path}`);
    }
    throw error;
  }
  return { path: check.path };
}
