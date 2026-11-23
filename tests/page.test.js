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

/**
 * 最も外側の <section>（章）を取り出す。本文の中に入れ子の <section> があっても、章の終わりを取り違えない。
 * @returns {Array<{ id: string|null, body: string }>} body は開きタグと閉じタグの間（入れ子の <section> を含む）
 */
function topLevelSections(source) {
  const text = source.replace(/<!--[\s\S]*?-->/g, '');
  const sections = [];
  let depth = 0;
  let start = 0;
  let id = null;
  for (const m of text.matchAll(/<section\b([^>]*)>|<\/section\s*>/g)) {
    if (m[0].startsWith('</')) {
      assert.ok(depth > 0, '閉じ </section> が多い');
      depth -= 1;
      if (depth === 0) sections.push({ id, body: text.slice(start, m.index) });
    } else {
      if (depth === 0) {
        start = m.index + m[0].length;
        id = /\bid="([^"]+)"/.exec(m[1])?.[1] ?? null;
      }
      depth += 1;
    }
  }
  assert.equal(depth, 0, '閉じていない <section> がある');
  return sections;
}

test('章と図のマウント点が約束どおり並んでいる', () => {
  const sections = topLevelSections(html);
  assert.deepEqual(sections.map((s) => s.id), Object.keys(EXPECTED));
  for (const { id, body } of sections) {
    const widgets = [...body.matchAll(/data-widget="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(widgets, EXPECTED[id], `${id} のマウント点`);
    assert.match(body, new RegExp(`class="prose" data-prose="${id}"`), `${id} に data-prose がない`);
    assert.match(body, /<h2>/, `${id} に h2 がない`);
  }
});

test('本文の中に入れ子の <section> があっても、章の構造を読み違えない', () => {
  const sample = `<section id="a"><h2>A</h2><div class="prose" data-prose="a"><section><h3>x</h3></section></div>
    <figure data-widget="w"></figure></section><!-- <section id="c"> --><section id="b"></section>`;
  const sections = topLevelSections(sample);
  assert.deepEqual(sections.map((s) => s.id), ['a', 'b']);
  assert.ok(sections[0].body.includes('data-widget="w"'), '入れ子の後ろにある図も、同じ章に入る');
});

test('ページにタイトル（h1）と目次がある', () => {
  assert.match(html, /<h1>データの性質で選ぶ、色の使い方<\/h1>/);
  for (const id of Object.keys(EXPECTED)) assert.ok(html.includes(`href="#${id}"`), `目次に #${id} がない`);
});
