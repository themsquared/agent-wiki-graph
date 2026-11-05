import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INBOX_DIR } from './config.ts';
import { RefuseError } from './errors.ts';
import { listInboxNotes } from './vault.ts';

export type GraphReport = {
  pages: number;
  edges: number;
  broken_targets: number;
  orphans: number;
  top_hubs: Array<[string, number]>;
  broken: Record<string, string[]>;
  orphan_list: string[];
};

export type HealthReport = GraphReport & {
  inbox_backlog: number;
  inbox: string[];
};

function graphCheckScript(vaultRoot: string): string {
  const bundled = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'graph_check.py');
  const candidates = [join(vaultRoot, 'scripts', 'graph_check.py'), bundled];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new RefuseError('GRAPH_CHECK_MISSING', 'scripts/graph_check.py not found');
}

export function runHealth(vaultRoot: string): HealthReport {
  const script = graphCheckScript(vaultRoot);
  const result = spawnSync('python3', [script, vaultRoot, '--json'], {
    encoding: 'utf8',
    maxBuffer: 2_000_000,
  });
  if (result.error) {
    throw new RefuseError('GRAPH_CHECK_FAILED', result.error.message);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new RefuseError('GRAPH_CHECK_FAILED', detail || 'graph_check.py failed');
  }
  let parsed: GraphReport;
  try {
    parsed = JSON.parse(result.stdout) as GraphReport;
  } catch {
    throw new RefuseError('GRAPH_CHECK_FAILED', 'graph_check.py did not return JSON');
  }
  const inbox = listInboxNotes(vaultRoot, INBOX_DIR);
  return {
    pages: parsed.pages,
    edges: parsed.edges,
    broken_targets: parsed.broken_targets,
    orphans: parsed.orphans,
    top_hubs: parsed.top_hubs ?? [],
    broken: parsed.broken ?? {},
    orphan_list: parsed.orphan_list ?? [],
    inbox_backlog: inbox.length,
    inbox,
  };
}
