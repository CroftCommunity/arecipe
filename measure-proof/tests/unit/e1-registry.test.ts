import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPanel,
  generateClientSource,
  lintEmitSites,
  parseRegistry,
  RegistryError,
  type PanelEntry,
} from '../../src/registry/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const REGISTRY_YAML = readFileSync(join(root, 'registry', 'metrics.yaml'), 'utf8');

function withoutField(yaml: string, metric: string, field: string): string {
  // Delete a single `    field: ...` line inside a metric block. Crude but the
  // registry is 2-space-indented and single-line-valued by construction.
  const lines = yaml.split('\n');
  let inMetric = false;
  const out: string[] = [];
  for (const line of lines) {
    if (line.match(new RegExp(`^  ${metric}:\\s*$`))) inMetric = true;
    else if (/^  \S/.test(line)) inMetric = false;
    if (inMetric && line.match(new RegExp(`^    ${field}:`))) continue;
    out.push(line);
  }
  return out.join('\n');
}

describe('E1 registry — parse + validate', () => {
  it('parses the canonical registry and preserves unknown fields (open-world)', () => {
    const reg = parseRegistry(REGISTRY_YAML);
    expect(reg.metrics.length).toBeGreaterThan(20);
    const home = reg.byName.get('page_home');
    expect(home?.type).toBe('page');
    // Unknown/optional field `info` is preserved, not dropped or rejected.
    expect(home?.extra['info']).toBe('route');
  });

  // NAMED INVARIANT — must never be deleted.
  it('registry-entry-without-disclosure-fails', () => {
    const broken = withoutField(REGISTRY_YAML, 'page_home', 'disclosure');
    expect(() => parseRegistry(broken)).toThrow(RegistryError);
    try {
      parseRegistry(broken);
    } catch (e) {
      expect((e as RegistryError).message).toMatch(/page_home/);
      expect((e as RegistryError).message).toMatch(/disclosure/);
    }
  });

  it('fails loud on a missing required field (expires) and on edge without from/to', () => {
    expect(() => parseRegistry(withoutField(REGISTRY_YAML, 'page_home', 'expires'))).toThrow(
      /page_home.*expires|expires.*page_home/,
    );
    expect(() =>
      parseRegistry(withoutField(REGISTRY_YAML, 'nav_home__to__browse', 'from')),
    ).toThrow(/nav_home__to__browse/);
  });
});

describe('E1 registry — emit-without-registry-entry (the typed-call gate)', () => {
  // NAMED INVARIANT — must never be deleted.
  it('emit-without-registry-entry-fails', () => {
    const reg = parseRegistry(REGISTRY_YAML);
    const declared = reg.metrics.map((m) => m.name);
    // All-declared emit sites: clean.
    expect(lintEmitSites(declared, reg)).toEqual([]);
    // One undeclared counter: build fails, error names the offender.
    const errs = lintEmitSites([...declared, 'page_ghost'], reg);
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch(/page_ghost/);
  });

  it('drift both directions fails the build', () => {
    const reg = parseRegistry(REGISTRY_YAML);
    // Direction 1: instrumentation adds a counter the registry never declared.
    expect(lintEmitSites(['page_home', 'feat_new_undeclared'], reg).length).toBe(1);
    // Direction 2: registry drops a counter that instrumentation still emits.
    const shrunk = parseRegistry(withoutField(REGISTRY_YAML, 'page_settings', 'type').replace(/^  page_settings:$/m, '  # removed'));
    // page_settings no longer parses as a metric; emitting it now fails.
    expect(lintEmitSites(['page_home', 'page_settings'], shrunk).length).toBe(1);
  });
});

describe('E1 registry — generated client', () => {
  it('emits a typed call and a name set for every declared metric', () => {
    const reg = parseRegistry(REGISTRY_YAML);
    const src = generateClientSource(reg);
    for (const m of reg.metrics) {
      expect(src).toContain(m.name);
    }
    expect(src).toMatch(/METRIC_NAMES/);
    // Edge metrics carry from/to so aggregate flow is recoverable.
    expect(src).toMatch(/nav_home__to__browse/);
  });
});

describe('E1 registry — panel-matches-registry (golden)', () => {
  const goldenPath = join(root, 'generated', 'panel.golden.json');

  function loadGolden(): PanelEntry[] {
    return JSON.parse(readFileSync(goldenPath, 'utf8')) as PanelEntry[];
  }

  // NAMED INVARIANT — must never be deleted.
  it('panel-matches-registry', () => {
    const reg = parseRegistry(REGISTRY_YAML);
    const built = buildPanel(reg);
    const golden = loadGolden();
    expect(built).toEqual(golden);
  });

  it('a hand-edited panel breaks the test (drift is caught)', () => {
    const reg = parseRegistry(REGISTRY_YAML);
    const built = buildPanel(reg);
    const tampered = structuredClone(built);
    // Someone edits the disclosure copy directly in the panel instead of the registry.
    tampered[0]!.disclosure = 'hand-edited, not from the registry';
    expect(tampered).not.toEqual(built);
  });

  it('every panel entry carries plain-language disclosure + expiry, no internal description', () => {
    const reg = parseRegistry(REGISTRY_YAML);
    const built = buildPanel(reg);
    for (const entry of built) {
      expect(entry.disclosure.length).toBeGreaterThan(0);
      expect(entry.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(entry)).not.toContain('description');
    }
  });
});
