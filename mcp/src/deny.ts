import { DENY_RULES, type DenyRule } from './config.ts';
import type { RefuseReason } from './errors.ts';

export type DenyHit = {
  id: string;
  description: string;
  field: string;
};

function matches(rule: DenyRule, field: string, value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (field === 'path' || field === 'suggested_home') {
    return rule.path.test(text) || rule.topic.test(text);
  }
  return rule.topic.test(text);
}

export function denyHits(input: {
  path?: string;
  topic?: string;
  about?: string;
  body?: string;
  suggested_home?: string;
  area?: string;
  query?: string;
}): DenyHit[] {
  const fields = Object.entries(input).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );
  const hits: DenyHit[] = [];
  for (const [field, value] of fields) {
    for (const rule of DENY_RULES) {
      if (matches(rule, field, value)) {
        hits.push({ id: rule.id, description: rule.description, field });
      }
    }
  }
  return hits;
}

export function denyReasons(input: Parameters<typeof denyHits>[0]): RefuseReason[] {
  return denyHits(input).map((hit) => ({
    code: `DENY_${hit.id.toUpperCase().replace(/-/g, '_')}`,
    message: `${hit.description} are out of bounds (matched on ${hit.field})`,
  }));
}

export function documentedDenyList(): Array<{ id: string; description: string }> {
  return DENY_RULES.map(({ id, description }) => ({ id, description }));
}
