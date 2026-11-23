// index.html の骨組み（章と図のマウント点）が約束どおりかの検査。本文担当・図担当が壊していないかの番人。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const EXPECTED = {
  ch0: ['intro-compare'],
  ch1: ['cone-explorer'],
  ch2: ['three-knobs'],
  ch3: ['scheme-matrix', 'scheme-anatomy'],
  ch4: ['cvd-simulator', 'problem-pairs'],
  ch5: ['decision-flow', 'quiz'],
  sources: [],
};

test('章と図のマウント点が約束どおり並んでいる', () => {
  const sections = [...html.matchAll(/<section id="([^"]+)">([\s\S]*?)<\/section>/g)];
  assert.deepEqual(sections.map((m) => m[1]), Object.keys(EXPECTED));
  for (const [, id, body] of sections) {
    const widgets = [...body.matchAll(/data-widget="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(widgets, EXPECTED[id], `${id} のマウント点`);
    assert.match(body, new RegExp(`class="prose" data-prose="${id}"`), `${id} に data-prose がない`);
    assert.match(body, /<h2>/, `${id} に h2 がない`);
  }
});

test('ページにタイトル（h1）と目次がある', () => {
  assert.match(html, /<h1>データの性質で選ぶ、色の使い方<\/h1>/);
  for (const id of Object.keys(EXPECTED)) assert.ok(html.includes(`href="#${id}"`), `目次に #${id} がない`);
});
