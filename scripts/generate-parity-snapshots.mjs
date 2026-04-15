/**
 * One-off script to generate parity snapshot JSON files.
 * Run: node scripts/generate-parity-snapshots.mjs
 * Output: tests/fixtures/parity/<fixture-name>.expected.json
 *
 * Uses the legacy parser directly so snapshots capture the canonical output.
 * Re-run this script only when the parser intentionally changes behaviour.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const fixturesDir = join(repoRoot, 'tests', 'fixtures');
const parityDir = join(repoRoot, 'tests', 'fixtures', 'parity');

// Import the compiled parser.
// We use the TypeScript source via tsx or ts-node when available,
// otherwise the pre-built dist. This script is invoked by the test
// setup helper which compiles first.
const { parseJsonlContent } = await import('../src/shared/parser.js');

mkdirSync(parityDir, { recursive: true });

const fixtures = [
  'simple-session.jsonl',
  'session-with-agents.jsonl',
  'session-with-errors.jsonl',
  'session-with-compaction.jsonl',
  'session-with-failure.jsonl',
  'session-with-api-error.jsonl',
];

/**
 * Stable JSON stringify: sorts object keys recursively so output is
 * deterministic regardless of insertion order.
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]));
    return '{' + pairs.join(',') + '}';
  }
  return JSON.stringify(value);
}

for (const fixture of fixtures) {
  const content = readFileSync(join(fixturesDir, fixture), 'utf-8');
  const rows = parseJsonlContent(content);
  const snapshot = stableStringify(rows);
  const outFile = join(parityDir, fixture.replace('.jsonl', '.expected.json'));
  writeFileSync(outFile, snapshot, 'utf-8');
  console.log(`Generated ${fixture.replace('.jsonl', '.expected.json')} (${snapshot.length} bytes)`);
}

console.log('Done.');
