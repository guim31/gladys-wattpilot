// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the tables of the code,
// and the four documentation files, which share the same sections. German
// says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import {
  CAR_LABELS,
  ERROR_LABELS,
  MESSAGES,
  NAMES,
  OPTION_LABELS,
  WIDGET_TEXT,
} from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  sectionDescription: 1000,
  message: 200,
  featureName: 40,
  option: 24,
  statusValue: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key, parent) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key, parent));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      let max = MAX[key] ?? MAX.label;
      if (path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)) {
        max = MAX.catalog;
      } else if (/^manifest\.widgets\[\d+\]\.label$/.test(path)) {
        max = MAX.widgetLabel;
      } else if (key === 'description' && parent?.type === 'section') {
        max = MAX.sectionDescription;
      }
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child, value);
    }
  };
  walk(root, 'manifest', null, null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(value, `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

/** Every multi-language object of MESSAGES, functions called with samples. */
function messageTexts(node, path) {
  if (typeof node === 'function') {
    const args =
      node.length === 1
        ? ['192.0.2.10']
        : node.length === 2
          ? [6, { en: 'Next Trip', fr: 'Next Trip', de: 'Next Trip', es: 'Next Trip' }]
          : ['Garage', '90000022', '38.5'];
    return [[node(...args), path]];
  }
  if (node && typeof node === 'object' && !LANGS.some((lang) => lang in node)) {
    return Object.entries(node).flatMap(([key, child]) => messageTexts(child, `${path}.${key}`));
  }
  return [[node, path]];
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 40, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the same in every language, the description at least 10 characters', () => {
  assert.equal(typeof manifest.name, 'string');
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('the tables of the code have the four languages', () => {
  assert.deepEqual(
    [
      ...tableProblems(NAMES, 'NAMES', MAX.featureName),
      ...tableProblems(OPTION_LABELS, 'OPTION_LABELS', MAX.option),
      ...tableProblems(CAR_LABELS, 'CAR_LABELS', MAX.statusValue),
      ...tableProblems(ERROR_LABELS, 'ERROR_LABELS', MAX.statusValue),
      ...tableProblems(WIDGET_TEXT, 'WIDGET_TEXT', MAX.message),
    ],
    [],
  );
  // Widget pills and tiles are short.
  for (const lang of LANGS) {
    for (const key of ['charge', 'stop', 'auto', 'settings', 'power', 'session', 'current']) {
      assert.ok(WIDGET_TEXT[lang][key].length <= 24, `WIDGET_TEXT.${lang}.${key}`);
    }
  }
});

test('every message of the code has the four languages', () => {
  const found = messageTexts(MESSAGES, 'MESSAGES').flatMap(([value, path]) =>
    // A status may join a few of them: each stays under 200 characters.
    problems(value, path, MAX.message),
  );
  assert.deepEqual(found, []);
});

// --- Documentation ------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The outline of a doc: the level of each heading, in order. */
const outline = (text) =>
  text
    .split('\n')
    .filter((line) => /^#{1,4} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four docs exist, are complete and share the same sections', () => {
  for (const lang of LANGS) {
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
  }
  for (const lang of LANGS) {
    assert.deepEqual(outline(docs[lang]), outline(docs.en), `docs/${lang}.md sections differ`);
  }
  assert.ok(outline(docs.en).filter((level) => level === 2).length >= 8);
});

test('the docs say it was developed without the hardware', () => {
  assert.match(docs.en, /Developed without the hardware/);
  assert.match(docs.fr, /Développée sans le matériel/);
  assert.match(docs.de, /Ohne die Hardware entwickelt/);
  assert.match(docs.es, /Desarrollada sin el hardware/);
});

test('the German doc says "du"', () => {
  const polite = docs.de
    .split('\n')
    .filter((line) => POLITE_GERMAN.test(line) && !line.startsWith('    '));
  assert.deepEqual(polite, []);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Power', fr: 'Puissance', de: 'Leistung' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre IP', 'mit Ihrem', 'Ihren', 'Ihrer']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  assert.notDeepEqual(outline('## A\n## B\n'), outline('## A\n### B\n'));
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[1].fields[1].label.de;
  assert.deepEqual(
    manifestTexts(forgotten).flatMap(({ path, value, max }) => problems(value, path, max)),
    ['manifest.scene_actions[1].fields[1].label has [en,fr,es], expected exactly [en,fr,de,es]'],
  );
});
