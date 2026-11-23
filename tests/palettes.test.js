import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { list, get, scale, isColorblindSafe, DEFAULTS, ATTRIBUTION } from '../lib/palettes.js';

const HEX = /^#[0-9a-f]{6}$/;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('種別ごとのパレット数（定性的は Okabe–Ito を加えて9）', () => {
  assert.equal(list('qualitative').length, 9);
  assert.equal(list('sequential').length, 18);
  assert.equal(list('diverging').length, 9);
  assert.equal(list().length, 36);
  assert.equal(list('qualitative').filter((p) => p.source === 'colorbrewer').length, 8);
  assert.equal(new Set(list().map((p) => p.id)).size, 36, 'ID は重複しない');
});

test('list は id・label・type・source・classCounts を返す', () => {
  const blues = list('sequential').find((p) => p.id === 'Blues');
  assert.deepEqual(blues, { id: 'Blues', label: 'Blues', type: 'sequential', source: 'colorbrewer', classCounts: range(3, 9) });
  const oi = list('qualitative').find((p) => p.id === 'OkabeIto');
  assert.deepEqual(oi, { id: 'OkabeIto', label: 'Okabe–Ito', type: 'qualitative', source: 'okabe-ito', classCounts: range(2, 8) });
  assert.deepEqual(list('diverging').find((p) => p.id === 'RdBu').classCounts, range(3, 11));
  // 返した配列を書き換えても内部データは変わらない
  blues.classCounts.length = 0;
  assert.equal(list('sequential').find((p) => p.id === 'Blues').classCounts.length, 7);
});

test('検算値：Blues 5階級', () => {
  assert.deepEqual(get('Blues', 5), ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']);
  assert.equal(isColorblindSafe('Blues', 5), true);
});

test('検算値：RdBu 7階級', () => {
  assert.deepEqual(get('RdBu', 7), ['#b2182b', '#ef8a62', '#fddbc7', '#f7f7f7', '#d1e5f0', '#67a9cf', '#2166ac']);
  assert.equal(isColorblindSafe('RdBu', 7), true);
});

test('検算値：Set2 8階級（フラグは 0 なので偽。安全なのは3階級だけ）', () => {
  assert.deepEqual(get('Set2', 8), ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3']);
  assert.equal(isColorblindSafe('Set2', 8), false);
  assert.equal(isColorblindSafe('Set2', 3), true);
  assert.equal(isColorblindSafe('Set2', 4), false, 'blind の値 2（要確認）は偽');
});

test('全パレット・全階級数で get は n 個の #rrggbb を返す', () => {
  let sets = 0;
  for (const p of list()) {
    for (const n of p.classCounts) {
      const colors = get(p.id, n);
      assert.equal(colors.length, n, `${p.id}/${n}`);
      for (const c of colors) assert.match(c, HEX, `${p.id}/${n}`);
      assert.equal(typeof isColorblindSafe(p.id, n), 'boolean');
      sets += 1;
    }
  }
  assert.equal(sets, 265 + 7, 'ColorBrewer 265 組 + Okabe–Ito 7 組');
});

test('get が返す配列を書き換えても内部データは変わらない', () => {
  get('Blues', 5)[0] = '#000000';
  assert.equal(get('Blues', 5)[0], '#eff3ff');
});

test('Okabe–Ito は先頭から n 色で、色覚安全フラグは全階級で真', () => {
  const all = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'];
  assert.deepEqual(get('OkabeIto', 8), all);
  for (const n of range(2, 8)) {
    assert.deepEqual(get('OkabeIto', n), all.slice(0, n));
    assert.equal(isColorblindSafe('OkabeIto', n), true);
  }
});

test('色覚安全フラグ：原典の値が 1 の階級数だけ真（調査結果の一覧表と照合）', () => {
  // 一覧表で true になる階級数。ここにないパレットは全階級で偽。
  const safe = {
    Set2: [3], Dark2: [3], Paired: [3, 4],
    RdBu: range(3, 11), PiYG: range(3, 11), PRGn: range(3, 11), RdYlBu: range(3, 11), BrBG: range(3, 11), PuOr: range(3, 11),
  };
  for (const p of list('sequential')) safe[p.id] = range(3, 9);
  for (const p of list().filter((q) => q.source === 'colorbrewer')) {
    for (const n of p.classCounts) {
      assert.equal(isColorblindSafe(p.id, n), (safe[p.id] ?? []).includes(n), `${p.id}/${n}`);
    }
  }
  assert.equal(isColorblindSafe('Paired', 12), false, 'blind 配列に値がない階級は偽');
});

test('同梱の D3 の ColorBrewer と色が一致する', () => {
  const ctx = {};
  vm.runInNewContext(readFileSync(new URL('../vendor/d3/d3.min.js', import.meta.url), 'utf8'), ctx);
  const d3 = ctx.d3 ?? ctx.exports;
  let checked = 0;
  for (const p of list().filter((q) => q.source === 'colorbrewer')) {
    const scheme = d3[`scheme${p.id}`];
    assert.ok(scheme, `d3.scheme${p.id}`);
    if (p.type === 'qualitative') {
      // d3 の定性的は最大階級数の1組だけ
      const max = Math.max(...p.classCounts);
      assert.deepEqual(get(p.id, max), [...scheme], `${p.id}/${max}`);
      checked += 1;
    } else {
      for (const n of p.classCounts) {
        // d3 は PuOr だけ ColorBrewer と逆の向き（紫が先頭）で持つ。ここは ColorBrewer の定義どおり（橙が先頭）
        const expected = p.id === 'PuOr' ? [...scheme[n]].reverse() : [...scheme[n]];
        assert.deepEqual(get(p.id, n), expected, `${p.id}/${n}`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 8 + 18 * 7 + 9 * 9);
});

test('不明な ID や選べない色数は RangeError', () => {
  assert.throws(() => get('Nope', 3), RangeError);
  assert.throws(() => get('Blues', 2), RangeError);
  assert.throws(() => get('Blues', 10), RangeError);
  assert.throws(() => get('OkabeIto', 1), RangeError);
  assert.throws(() => get('OkabeIto', 9), RangeError);
  assert.throws(() => scale('Nope', 3, [0, 1]), RangeError);
  assert.throws(() => isColorblindSafe('Blues', 2), RangeError);
});

test('scale（center なし）：domain [22.7, 39.5]・n=5 で境界が等間隔', () => {
  const s = scale('Blues', 5, [22.7, 39.5]);
  const step = (39.5 - 22.7) / 5;
  assert.equal(s.thresholds.length, 4);
  s.thresholds.forEach((t, i) => assert.ok(Math.abs(t - (22.7 + (i + 1) * step)) < 1e-9, `thresholds[${i}]`));
  assert.deepEqual(s.colors, get('Blues', 5));
  assert.equal(s.index(22.7), 0);
  assert.equal(s.index(39.5), 4);
  assert.equal(s.color(22.7), '#eff3ff');
  assert.equal(s.color(39.5), '#08519c');
  assert.equal(s.index(30), 2);
});

test('scale：境界ちょうどの値は上の階級、domain の外は端の階級', () => {
  const s = scale('Blues', 5, [0, 10]);
  assert.deepEqual(s.thresholds, [2, 4, 6, 8]);
  assert.deepEqual([0, 1.99, 2, 3.99, 4, 6, 8, 9.99, 10].map(s.index), [0, 0, 1, 1, 2, 3, 4, 4, 4]);
  assert.equal(s.index(-100), 0);
  assert.equal(s.index(100), 4);
  assert.equal(s.color(-100), s.colors[0]);
  assert.equal(s.color(100), s.colors[4]);
});

test('scale（center あり）：domain [-1.87, 0.66]・center 0・n=7', () => {
  const s = scale('RdBu', 7, [-1.87, 0.66], { center: 0 });
  const h = 1.87;
  const step = (2 * h) / 7;
  assert.equal(s.thresholds.length, 6);
  s.thresholds.forEach((t, i) => assert.ok(Math.abs(t - (-h + (i + 1) * step)) < 1e-9, `thresholds[${i}]`));
  assert.equal(s.index(0), 3, '0 は中央の階級');
  assert.equal(s.color(0), '#f7f7f7');
  assert.equal(s.index(-1.87), 0);
  assert.equal(s.index(0.66), 4);
  // 中央の階級は center の両側にまたがる
  assert.equal(s.index(-0.26), 3);
  assert.equal(s.index(0.26), 3);
  assert.equal(s.index(-0.27), 2);
  assert.equal(s.index(0.27), 4);
});

test('scale（center あり）：最大値側が遠いときも対称', () => {
  const s = scale('RdBu', 5, [-1, 4], { center: 0 });
  assert.deepEqual(s.thresholds.map((t) => Math.round(t * 1e9) / 1e9), [-2.4, -0.8, 0.8, 2.4]);
  assert.equal(s.index(-1), 1);
  assert.equal(s.index(4), 4);
  assert.equal(s.index(0), 2);
});

test('scale：境界の浮動小数点誤差で階級がずれない', () => {
  // 0.2 を5倍する形だと境界が 0.6000000000000001 になり、0.6 が階級2に入ってしまう
  const s = scale('Blues', 5, [0, 1]);
  assert.equal(s.index(0.6), 3);
  assert.equal(s.thresholds[2], 0.6);
  // n が偶数で center ありのとき、center は境界に乗り、上の階級に入る
  const e = scale('RdBu', 6, [-3.1, 3.1], { center: 0 });
  assert.equal(e.thresholds[2], 0);
  assert.equal(e.index(0), 3);
  assert.equal(e.index(-1e-9), 2);
});

test('scale：最小値と最大値が同じなら、中央の階級 Math.floor(n / 2) に入れる', () => {
  assert.equal(scale('RdBu', 7, [0, 0], { center: 0 }).index(0), 3);
  assert.equal(scale('Blues', 5, [4, 4]).index(4), 2);
  assert.equal(scale('Blues', 5, [4, 4]).color(100), get('Blues', 5)[2]);
  assert.equal(scale('RdBu', 6, [2, 2], { center: 2 }).index(2), 3);
  // center が最小値・最大値と違えば、幅は 0 にならない
  assert.equal(scale('RdBu', 7, [5, 5], { center: 0 }).index(5), 6);
});

test('list：未知の type は空の配列', () => {
  assert.deepEqual(list('nope'), []);
});

test('既定のパレットと帰属表示', () => {
  assert.deepEqual({ ...DEFAULTS }, { qualitative: 'Set2', qualitativeSafe: 'OkabeIto', sequential: 'Blues', diverging: 'RdBu' });
  assert.ok(Object.isFrozen(DEFAULTS));
  for (const id of Object.values(DEFAULTS)) assert.ok(list().some((p) => p.id === id), id);
  assert.match(ATTRIBUTION, /Cynthia Brewer \(http:\/\/colorbrewer\.org\/\)/);
  assert.match(ATTRIBUTION, /Apache License, Version 2\.0/);
  assert.match(ATTRIBUTION, /岡部正隆・伊藤啓/);
});

test('lib/palettes.js は Node 専用の API を使わない', () => {
  const src = readFileSync(new URL('../lib/palettes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(require|process|Buffer|__dirname|__filename)\b|from ['"]node:|import\(/);
});
