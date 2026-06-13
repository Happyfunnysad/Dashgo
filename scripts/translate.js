#!/usr/bin/env node
/**
 * Translation sync script
 * Usage: node scripts/translate.js
 *
 * This script helps sync translations across locale files.
 * It compares keys between en.json and other locale files,
 * and reports missing or unused keys.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '../frontend/src/locales');

function flatten(obj, prefix = '') {
  const result = {};
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      Object.assign(result, flatten(obj[key], newKey));
    } else {
      result[newKey] = obj[key];
    }
  }
  return result;
}

function unflatten(obj) {
  const result = {};
  for (const key in obj) {
    const keys = key.split('.');
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = obj[key];
  }
  return result;
}

function getKeys(locale) {
  return new Set(Object.keys(flatten(locale)));
}

function syncLocales() {
  const files = readdirSync(localesDir).filter(f => f.endsWith('.json'));
  const locales = {};

  for (const file of files) {
    const lang = file.replace('.json', '');
    const content = readFileSync(join(localesDir, file), 'utf-8');
    locales[lang] = JSON.parse(content);
  }

  const enKeys = getKeys(locales.en);
  const results = {};

  for (const lang in locales) {
    if (lang === 'en') continue;
    const langKeys = getKeys(locales[lang]);
    const missing = [...enKeys].filter(k => !langKeys.has(k));
    const extra = [...langKeys].filter(k => !enKeys.has(k));

    results[lang] = { missing, extra };
  }

  return results;
}

function report() {
  console.log('Translation Sync Report\n' + '='.repeat(40));
  const results = syncLocales();

  let hasIssues = false;
  for (const lang in results) {
    const { missing, extra } = results[lang];
    if (missing.length > 0 || extra.length > 0) {
      hasIssues = true;
      console.log(`\n[${lang}]`);
      if (missing.length > 0) {
        console.log(`  Missing keys (${missing.length}):`);
        missing.slice(0, 10).forEach(k => console.log(`    - ${k}`));
        if (missing.length > 10) console.log(`    ... and ${missing.length - 10} more`);
      }
      if (extra.length > 0) {
        console.log(`  Extra keys (${extra.length}):`);
        extra.slice(0, 10).forEach(k => console.log(`    + ${k}`));
        if (extra.length > 10) console.log(`    ... and ${extra.length - 10} more`);
      }
    }
  }

  if (!hasIssues) {
    console.log('\nAll translations are in sync!');
  }
}

function fillPlaceholders() {
  console.log('\nFilling placeholder translations...\n');
  const results = syncLocales();
  const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));

  for (const lang in results) {
    const { missing } = results[lang];
    if (missing.length === 0) continue;

    const filePath = join(localesDir, `${lang}.json`);
    const locale = JSON.parse(readFileSync(filePath, 'utf-8'));

    for (const key of missing) {
      const keys = key.split('.');
      let current = locale;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = `[${key}]`;
    }

    writeFileSync(filePath, JSON.stringify(locale, null, 2) + '\n');
    console.log(`  Updated ${lang}.json with ${missing.length} placeholder keys`);
  }
}

const command = process.argv[2] || 'report';

if (command === 'report') {
  report();
} else if (command === 'fill') {
  fillPlaceholders();
} else if (command === 'sync') {
  report();
  fillPlaceholders();
} else {
  console.log('Usage: node translate.js [report|fill|sync]');
  console.log('  report - Show missing/extra translation keys');
  console.log('  fill   - Fill missing keys with placeholders');
  console.log('  sync   - Report then fill (default)');
}