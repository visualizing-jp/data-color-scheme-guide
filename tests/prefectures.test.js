// data/prefectures.json（都道府県データ）の確定値の検査。
// 数値は総務省統計局「人口推計（2024年（令和6年）10月1日現在）結果の概要」表6・表10から転記したもの。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const REGION_IDS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'];

const data = JSON.parse(await readFile(new URL('../data/prefectures.json', import.meta.url), 'utf8'));
const prefs = data.prefectures;
const byName = (name) => prefs.find((p) => p.name === name);

test('47 件あり、code は 01〜47 で重複がない', () => {
  assert.equal(prefs.length, 47);
  const codes = prefs.map((p) => p.code);
  assert.equal(new Set(codes).size, 47, 'code に重複がある');
  assert.deepEqual(codes, Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0')));
});

test('(x, y) に重複がなく、x は 0〜12、y は 0〜11 の整数', () => {
  const cells = new Set();
  for (const p of prefs) {
    assert.ok(Number.isInteger(p.x) && p.x >= 0 && p.x <= 12, `${p.name}.x=${p.x}`);
    assert.ok(Number.isInteger(p.y) && p.y >= 0 && p.y <= 11, `${p.name}.y=${p.y}`);
    cells.add(`${p.x},${p.y}`);
  }
  assert.equal(cells.size, 47, '(x, y) に重複がある');
});

test('region は 8 つの地方 ID のどれかである', () => {
  assert.deepEqual(data.regions.map((r) => r.id), REGION_IDS);
  for (const p of prefs) assert.ok(REGION_IDS.includes(p.region), `${p.name}.region=${p.region}`);
});

test('検算値が原典の表記どおりである', () => {
  const expected = [
    ['北海道', -0.97, 33.3],
    ['秋田県', -1.87, 39.5],
    ['東京都', 0.66, 22.7],
    ['大阪府', -0.07, 27.6],
    ['沖縄県', -0.11, 24.2],
  ];
  for (const [name, popChange, aged65] of expected) {
    const p = byName(name);
    assert.ok(p, `${name} がない`);
    assert.equal(p.popChange, popChange, `${name}.popChange`);
    assert.equal(p.aged65, aged65, `${name}.aged65`);
  }
});

test('最小値と最大値が原典と一致する', () => {
  const change = prefs.map((p) => p.popChange);
  const aged = prefs.map((p) => p.aged65);
  assert.equal(Math.min(...change), -1.87);
  assert.equal(Math.max(...change), 0.66);
  assert.equal(Math.min(...aged), 22.7);
  assert.equal(Math.max(...aged), 39.5);
});

test('人口増減率が正の都道府県は東京都と埼玉県の 2 つだけ', () => {
  const positive = prefs.filter((p) => p.popChange > 0).map((p) => p.name).sort();
  assert.deepEqual(positive, ['埼玉県', '東京都']);
});

test('meta に出典と注記があり、仮の値の注記は残っていない', () => {
  assert.ok(data.meta.sources.length >= 1);
  const s = data.meta.sources[0];
  for (const key of ['name', 'url', 'publishedAt', 'license']) assert.ok(s[key], `sources[0].${key}`);
  assert.ok(s.url.startsWith('https://www.stat.go.jp/'));
  assert.ok(!data.meta.note.includes('仮'), 'meta.note に仮の値の注記が残っている');
});
