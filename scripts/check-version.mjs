#!/usr/bin/env node
// Verifies the project version in package.json matches every other place
// a version is hardcoded. Exits nonzero on drift.
//
// Add new version sites here when new files start declaring a version.
// Run before every release: `npm run version:check` (wired via prerelease).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const sourceOfTruth = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;

// Each entry: { file, pattern, describe }. Pattern must capture the version in group 1.
const sites = [
  {
    file: '.claude-plugin/plugin.json',
    pattern: /"version":\s*"([\d.]+)"/,
    describe: 'Claude Code plugin manifest version',
  },
  {
    file: 'site/index.html',
    pattern: /"softwareVersion":\s*"([\d.]+)"/,
    describe: 'JSON-LD softwareVersion in landing page',
  },
  {
    file: 'site/index.html',
    pattern: /"v(\d+\.\d+\.\d+)"[^"]*\/\/.*nav-badge|,"v(\d+\.\d+\.\d+)"\),/,
    describe: 'Version badge in landing page nav',
  },
];

let drift = 0;
for (const site of sites) {
  const content = readFileSync(resolve(root, site.file), 'utf8');
  const match = content.match(site.pattern);
  if (!match) {
    console.error(`FAIL: could not find version in ${site.file} (${site.describe})`);
    drift++;
    continue;
  }
  const found = match[1] || match[2];
  if (found !== sourceOfTruth) {
    console.error(
      `DRIFT: ${site.file} has "${found}" but package.json has "${sourceOfTruth}" (${site.describe})`,
    );
    drift++;
  }
}

if (drift > 0) {
  console.error(`\n${drift} version drift(s) found. Run: npm run version:bump ${sourceOfTruth}`);
  process.exit(1);
}

console.log(`OK: all version sites match package.json (${sourceOfTruth})`);
