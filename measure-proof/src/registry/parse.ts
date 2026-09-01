import { parseYaml, type YamlNode } from './yaml.ts';
import {
  METRIC_TYPES,
  type Metric,
  type MetricType,
  type Registry,
} from './types.ts';

export class RegistryError extends Error {
  override name = 'RegistryError';
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`registry invalid:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

const REQUIRED = ['type', 'description', 'expires', 'disclosure'] as const;

function isNode(v: string | YamlNode | undefined): v is YamlNode {
  return typeof v === 'object' && v !== null;
}

export function parseRegistry(yamlText: string): Registry {
  const doc = parseYaml(yamlText);
  const metricsNode = doc['metrics'];
  const problems: string[] = [];

  if (!isNode(metricsNode)) {
    throw new RegistryError(['top-level `metrics:` mapping is missing']);
  }

  const metrics: Metric[] = [];
  for (const [name, raw] of Object.entries(metricsNode)) {
    if (!isNode(raw)) {
      problems.push(`${name}: entry must be a mapping of fields`);
      continue;
    }

    // Required fields — missing/mistyped fails LOUD (closed-world on required).
    for (const req of REQUIRED) {
      if (typeof raw[req] !== 'string' || (raw[req] as string).trim() === '') {
        problems.push(`${name}: missing required field \`${req}\``);
      }
    }

    const type = raw['type'];
    if (typeof type === 'string' && !METRIC_TYPES.includes(type as MetricType)) {
      problems.push(
        `${name}: unknown type \`${type}\` (permitted: ${METRIC_TYPES.join(', ')})`,
      );
    }
    if (type === 'edge') {
      for (const req of ['from', 'to'] as const) {
        if (typeof raw[req] !== 'string' || (raw[req] as string).trim() === '') {
          problems.push(`${name}: edge metric missing required field \`${req}\``);
        }
      }
    }

    // Expiry must be a real YYYY-MM-DD.
    const expires = raw['expires'];
    if (typeof expires === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
      problems.push(`${name}: expires must be YYYY-MM-DD, got \`${expires}\``);
    }

    // Only build the Metric if this entry has no fatal problems.
    if (problems.some((p) => p.startsWith(`${name}:`))) continue;

    // Open-world: preserve every field we did not consume into `extra`.
    const consumed = new Set([...REQUIRED, 'from', 'to']);
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!consumed.has(k) && typeof v === 'string') extra[k] = v;
    }

    metrics.push({
      name,
      type: type as MetricType,
      description: raw['description'] as string,
      expires: expires as string,
      disclosure: raw['disclosure'] as string,
      ...(type === 'edge'
        ? { from: raw['from'] as string, to: raw['to'] as string }
        : {}),
      extra,
    });
  }

  if (problems.length) throw new RegistryError(problems);

  const byName = new Map(metrics.map((m) => [m.name, m]));
  return { metrics, byName };
}
