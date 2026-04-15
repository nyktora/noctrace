#!/usr/bin/env node
// Bumps the project version in every place it's hardcoded.
// Usage: node scripts/bump-version.mjs <new-version>
// Or via npm: npm run version:bump -- 1.3.0

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

if (!target || !/^\d+\.\d+\.\d+$/.test(target)) {
  console.error('Usage: node scripts/bump-version.mjs <new-version>');
  console.error('Example: node scripts/bump-version.mjs 1.3.0');
  process.exit(1);
}

// Each entry: { file, replacements: [{ from: RegExp, to: (v) => string }] }
const sites = [
  {
    file: 'package.json',
    replacements: [
      { from: /"version":\s*"[\d.]+"/, to: (v) => `"version": "${v}"` },
    ],
  },
  {
    file: '.claude-plugin/plugin.json',
    replacements: [
      { from: /"version":\s*"[\d.]+"/, to: (v) => `"version": "${v}"` },
    ],
  },
  {
    file: 'site/index.html',
    replacements: [
      { from: /"softwareVersion":\s*"[\d.]+"/, to: (v) => `"softwareVersion": "${v}"` },
      // Version badge in nav: ...padding:"1px 6px",borderRadius:2}},"v1.2.0")
      { from: /,"v\d+\.\d+\.\d+"\)/, to: (v) => `,"v${v}")` },
    ],
  },
];

let touched = 0;
for (const site of sites) {
  const path = resolve(root, site.file);
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const { from, to } of site.replacements) {
    after = after.replace(from, to(target));
  }
  if (after !== before) {
    writeFileSync(path, after);
    console.log(`UPDATED: ${site.file}`);
    touched++;
  } else {
    console.log(`UNCHANGED: ${site.file}`);
  }
}

console.log(`\nBumped ${touched} file(s) to ${target}.`);
console.log(`Next: update CHANGELOG.md, commit, tag v${target}, push.`);
