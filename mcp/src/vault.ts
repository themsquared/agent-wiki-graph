import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { SKIP_DIRS, MAX_READ_BYTES, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from './config.ts';
import { denyHits } from './deny.ts';
import { RefuseError } from './errors.ts';

export function resolveVaultRoot(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  if (env.VAULT_ROOT) return resolve(env.VAULT_ROOT);
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, 'CLAUDE.md')) && existsSync(join(dir, 'accounts'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(cwd);
}

export function normalizeRel(rel: string): string {
  const cleaned = rel.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!cleaned) {
    throw new RefuseError('INVALID_PATH', 'path is empty');
  }
  if (cleaned.includes('\0')) {
    throw new RefuseError('PATH_ESCAPE', 'path contains a NUL byte');
  }
  const parts = cleaned.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) {
    throw new RefuseError('PATH_ESCAPE', `path escapes the vault: ${rel}`);
  }
  return parts.join('/');
}

export function resolveInside(root: string, rel: string): string {
  const logical = normalizeRel(rel);
  const abs = resolve(root, logical);
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new RefuseError('PATH_ESCAPE', `path escapes the vault: ${rel}`);
  }
  return abs;
}

function skipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.env');
}

export function isAlwaysDeniedPath(rel: string): boolean {
  const parts = rel.split('/');
  if (parts.some((part) => skipDir(part))) return true;
  const base = parts[parts.length - 1] ?? '';
  return base === '.env' || base.startsWith('.env.');
}

export function assertReadable(rel: string): void {
  if (isAlwaysDeniedPath(rel)) {
    throw new RefuseError('DENY_PATH', `path is not readable: ${rel}`);
  }
  const hits = denyHits({ path: rel });
  if (hits.length > 0) {
    throw new RefuseError(
      `DENY_${hits[0].id.toUpperCase().replace(/-/g, '_')}`,
      `${hits[0].description} are out of bounds (path ${rel})`,
    );
  }
}

export function listMarkdown(root: string): string[] {
  const out: string[] = [];
  const walk = (absDir: string, relDir: string) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDir(entry.name)) continue;
        const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (isAlwaysDeniedPath(childRel) || denyHits({ path: childRel }).length > 0) continue;
        walk(join(absDir, entry.name), childRel);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (isAlwaysDeniedPath(rel) || denyHits({ path: rel }).length > 0) continue;
      out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}

export function pageTitle(text: string, fallback: string): string {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const titled = fm[1].match(/^(?:title|account|name|topic):\s*["']?(.+?)["']?\s*$/m);
    if (titled?.[1]) return titled[1].trim();
  }
  const heading = text.match(/^#\s+(.+)$/m);
  return heading?.[1].trim() ?? fallback;
}

export type SearchHit = {
  path: string;
  title: string;
  excerpt: string;
  score: number;
};

function excerptAround(text: string, query: string, width = 160): string {
  const lower = text.toLowerCase();
  const at = lower.indexOf(query.toLowerCase());
  if (at < 0) {
    const first = text.trim().replace(/\s+/g, ' ');
    return first.slice(0, width);
  }
  const start = Math.max(0, at - Math.floor(width / 3));
  const slice = text.slice(start, start + width).replace(/\s+/g, ' ').trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = start + width < text.length ? '…' : '';
  return `${prefix}${slice}${suffix}`;
}

export function searchPages(
  root: string,
  query: string,
  opts: { area?: string; limit?: number } = {},
): SearchHit[] {
  const q = query.trim();
  if (q) {
    const hits = denyHits({ query: q, topic: q });
    if (hits.length > 0) {
      throw new RefuseError(
        `DENY_${hits[0].id.toUpperCase().replace(/-/g, '_')}`,
        `${hits[0].description} are out of bounds (search query)`,
      );
    }
  }
  const area = opts.area?.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') ?? '';
  if (area) {
    normalizeRel(area);
    const areaHits = denyHits({ path: area, area });
    if (areaHits.length > 0) {
      throw new RefuseError(
        `DENY_${areaHits[0].id.toUpperCase().replace(/-/g, '_')}`,
        `${areaHits[0].description} are out of bounds (area filter)`,
      );
    }
  }
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const hits: SearchHit[] = [];
  for (const rel of listMarkdown(root)) {
    if (area && rel !== area && !rel.startsWith(`${area}/`) && !rel.startsWith(`${area}.`)) {
      continue;
    }
    let text: string;
    try {
      text = readFileSync(join(root, rel), { encoding: 'utf8' });
    } catch {
      continue;
    }
    const title = pageTitle(text, rel);
    if (!q) {
      let mtime = 0;
      try {
        mtime = statSync(join(root, rel)).mtimeMs;
      } catch {
        mtime = 0;
      }
      hits.push({
        path: rel,
        title,
        excerpt: excerptAround(text, title),
        score: mtime,
      });
      continue;
    }
    const ql = q.toLowerCase();
    const titleHit = title.toLowerCase().includes(ql);
    const pathHit = rel.toLowerCase().includes(ql);
    const bodyHit = text.toLowerCase().includes(ql);
    if (!titleHit && !pathHit && !bodyHit) continue;
    let score = 0;
    if (titleHit) score += 10;
    if (pathHit) score += 5;
    if (bodyHit) score += 1;
    hits.push({
      path: rel,
      title,
      excerpt: excerptAround(text, q),
      score,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return hits.slice(0, limit);
}

export function resolveReadPath(root: string, requested: string): string {
  let rel = normalizeRel(requested);
  let abs = resolveInside(root, rel);
  if (!existsSync(abs) && !rel.endsWith('.md')) {
    rel = `${rel}.md`;
    abs = resolveInside(root, rel);
  }
  assertReadable(rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new RefuseError('NOT_FOUND', `no file at ${rel}`);
  }
  return rel;
}

export function readPage(root: string, requested: string): { path: string; title: string; body: string } {
  const rel = resolveReadPath(root, requested);
  const abs = resolveInside(root, rel);
  const stat = statSync(abs);
  if (stat.size > MAX_READ_BYTES) {
    throw new RefuseError('TOO_LARGE', `file exceeds ${MAX_READ_BYTES} bytes: ${rel}`);
  }
  const body = readFileSync(abs, { encoding: 'utf8' });
  if (body.includes('\0')) {
    throw new RefuseError('NOT_TEXT', `file is not text: ${rel}`);
  }
  return { path: rel, title: pageTitle(body, rel), body };
}

export function listInboxNotes(root: string, inboxDir: string): string[] {
  const abs = join(root, inboxDir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((name) => name.endsWith('.md'))
    .map((name) => `${inboxDir}/${name}`)
    .sort();
}

export function relativeToVault(root: string, abs: string): string {
  return relative(root, abs).replace(/\\/g, '/');
}
