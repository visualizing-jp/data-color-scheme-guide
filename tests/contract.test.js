// 共有モジュールと都道府県データの「契約」の検査。実装が進んでも、ここの名前とデータの形は変えない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const FUNCTIONS = {
  color: ['hexToRgb', 'rgbToHex', 'srgbToLinear', 'linearToSrgb', 'linearToOklab', 'oklabToLinear',
    'hexToOklch', 'oklchToHex', 'lightness', 'toGray', 'deltaE', 'cvdMatrix', 'simulateCvd'],
  palettes: ['list', 'get', 'isColorblindSafe'],
  tilemap: ['render'],
};
const VALUES = { palettes: ['DEFAULTS', 'ATTRIBUTION'] };

for (const [name, functions] of Object.entries(FUNCTIONS)) {
  test(`lib/${name}.js は決められた名前を export している`, async () => {
    const module = await import(`../lib/${name}.js`);
    for (const fn of functions) {
      assert.equal(typeof module[fn], 'function', `${name}.${fn} が関数として export されていない`);
    }
    for (const value of VALUES[name] ?? []) {
      assert.ok(value in module, `${name}.${value} が export されていない`);
    }
  });
}

test('palettes.DEFAULTS は 4 つのキーを持つ', async () => {
  const { DEFAULTS } = await import('../lib/palettes.js');
  assert.deepEqual(Object.keys(DEFAULTS).sort(), ['diverging', 'qualitative', 'qualitativeSafe', 'sequential']);
});

const REGION_IDS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'];

test('data/prefectures.json はスキーマと整合している', async () => {
  const data = JSON.parse(await readFile(new URL('../data/prefectures.json', import.meta.url), 'utf8'));

  assert.ok(data.meta && typeof data.meta.asOf === 'string' && typeof data.meta.note === 'string');
  assert.ok(Array.isArray(data.meta.sources));

  assert.deepEqual(data.regions.map((r) => r.id), REGION_IDS);
  for (const r of data.regions) assert.ok(r.name, `地方 ${r.id} に name がない`);

  const prefs = data.prefectures;
  assert.equal(prefs.length, 47, '都道府県は 47 件');

  const codes = prefs.map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length, 'code に重複がある');
  assert.deepEqual(codes, Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0')));
  assert.equal(new Set(prefs.map((p) => p.name)).size, 47, 'name に重複がある');

  const regionIds = new Set(data.regions.map((r) => r.id));
  for (const p of prefs) {
    assert.ok(regionIds.has(p.region), `${p.name} の region「${p.region}」が regions にない`);
    assert.ok(p.name && p.short, `${p.code} の name / short が空`);
    for (const key of ['aged65', 'popChange', 'x', 'y']) {
      assert.equal(typeof p[key], 'number', `${p.name}.${key} が数値でない`);
    }
  }
  for (const id of regionIds) {
    assert.ok(prefs.some((p) => p.region === id), `地方 ${id} に属する都道府県がない`);
  }
});
