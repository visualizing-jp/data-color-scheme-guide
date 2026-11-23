// lib/tilemap.js のうち、DOM を使わない部分（マスの位置、文字色の選択、矢印キーの移動先、印の枠）の検査。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tileRect, viewBoxSize, relativeLuminance, labelColor, labelFontSize, nextTileCode, ringRects, ARROW_KEYS } from '../lib/tilemap.js';

test('tileRect：座標から、隙間を空けた正方形のマスの位置を求める', () => {
  const origin = tileRect(0, 0);
  assert.equal(origin.size, 38);
  assert.deepEqual([origin.x, origin.y], [1, 1]);
  const a = tileRect(3, 2);
  assert.deepEqual([a.x, a.y, a.size], [121, 81, 38]);
});

test('tileRect：隣り合うマスは重ならず、隙間が空いている', () => {
  const left = tileRect(4, 5);
  const right = tileRect(5, 5);
  const below = tileRect(4, 6);
  assert.equal(right.x - (left.x + left.size), 2);
  assert.equal(below.y - (left.y + left.size), 2);
});

test('tileRect：13 列 × 12 行のどのマスも viewBox の内側に収まる', () => {
  const { width, height } = viewBoxSize(13, 12);
  assert.deepEqual([width, height], [520, 480]);
  for (let x = 0; x < 13; x += 1) {
    for (let y = 0; y < 12; y += 1) {
      const t = tileRect(x, y);
      assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.size <= width && t.y + t.size <= height, `(${x}, ${y})`);
    }
  }
});

test('tileRect：異なる座標は異なる位置になる', () => {
  const seen = new Set();
  for (let x = 0; x < 13; x += 1) {
    for (let y = 0; y < 12; y += 1) {
      const t = tileRect(x, y);
      seen.add(`${t.x},${t.y}`);
    }
  }
  assert.equal(seen.size, 13 * 12);
});

test('relativeLuminance：黒は 0、白は 1、中間のグレーは WCAG の値になる', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.ok(Math.abs(relativeLuminance('#ffffff') - 1) < 1e-9);
  assert.ok(Math.abs(relativeLuminance('#808080') - 0.2159) < 1e-3);
  assert.ok(Math.abs(relativeLuminance('#ff0000') - 0.2126) < 1e-9);
  assert.equal(relativeLuminance('#fff'), relativeLuminance('#ffffff'));
});

test('relativeLuminance：読み取れない色は例外にする', () => {
  assert.throws(() => relativeLuminance('red'));
  assert.throws(() => relativeLuminance('#12345'));
});

test('labelColor：明るい塗りには濃いグレー、暗い塗りには白を選ぶ', () => {
  assert.equal(labelColor('#ffffff'), '#222222');
  assert.equal(labelColor('#f7fbff'), '#222222'); // Blues の最も明るい色
  assert.equal(labelColor('#ffff00'), '#222222');
  assert.equal(labelColor('#000000'), '#ffffff');
  assert.equal(labelColor('#08306b'), '#ffffff'); // Blues の最も暗い色
  assert.equal(labelColor('#0000ff'), '#ffffff');
});

test('labelColor：濃いグレーと白のうち、コントラスト比が高いほうを選び、どの塗りでも 4 以上になる', () => {
  const contrast = (a, b) => {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
  };
  const fills = [];
  for (let v = 0; v <= 255; v += 5) fills.push(`#${[v, v, v].map((c) => c.toString(16).padStart(2, '0')).join('')}`);
  fills.push('#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#999999');
  for (const hex of fills) {
    const chosen = labelColor(hex);
    const other = chosen === '#ffffff' ? '#222222' : '#ffffff';
    assert.ok(contrast(hex, chosen) >= contrast(hex, other), hex);
    assert.ok(contrast(hex, chosen) >= 4, hex); // 中間のグレーが最も低く、それでも 4 を超える
  }
});

test('labelFontSize：3 文字の県名がマスの幅の 8 割以内に収まり、文字サイズはマスの一辺の約 25%', () => {
  const size = tileRect(0, 0).size;
  const f3 = labelFontSize(3);
  assert.ok(3 * f3 <= size * 0.8);
  assert.ok(Math.abs(f3 / size - 0.25) < 0.01);
  assert.ok(labelFontSize(2) === f3); // 2 文字でも大きくしない
  assert.ok(4 * labelFontSize(4) <= size * 0.8); // 長い略称は小さくする
});

// --- 矢印キーの移動先（nextTileCode）と、印の枠（ringRects） ---------------------------------

const prefs = JSON.parse(readFileSync(new URL('../data/prefectures.json', import.meta.url), 'utf8')).prefectures;
const code = (name) => prefs.find((p) => p.name === name).code;
const nameOf = (c) => prefs.find((p) => p.code === c)?.name ?? null;
const move = (from, key) => nameOf(nextTileCode(prefs, code(from), key));

test('nextTileCode：まっすぐその向きにあるマスのうち、いちばん近いものへ移る', () => {
  assert.equal(move('北海道', 'ArrowDown'), '青森県'); // 同じ列（x=12）の下
  assert.equal(move('青森県', 'ArrowUp'), '北海道');
  assert.equal(move('福岡県', 'ArrowRight'), '山口県'); // 同じ行（y=7）の右
  assert.equal(move('山口県', 'ArrowLeft'), '福岡県');
  assert.equal(move('長崎県', 'ArrowUp'), '佐賀県'); // 同じ列（x=0）の上
  assert.equal(move('佐賀県', 'ArrowDown'), '長崎県');
});

test('nextTileCode：まっすぐのマスが遠くにあっても、斜めの近いマスより優先する', () => {
  // 沖縄（0, 11）の真上は、2 マス空けた長崎（0, 8）。斜めには熊本（1, 8）などもある
  assert.equal(move('沖縄県', 'ArrowUp'), '長崎県');
});

test('nextTileCode：まっすぐのマスがなければ、斜めのうちいちばん近いマスへ移る', () => {
  // 北海道（12, 0）の左：同じ行にマスはない。秋田（11, 2）が、距離がいちばん近い（青森・岩手は左ではなく真下）
  assert.equal(move('北海道', 'ArrowLeft'), '秋田県');
  // 沖縄（0, 11）の右：同じ行にマスはない。右にあるマスのうち、最も近いのは鹿児島（1, 9）
  assert.equal(move('沖縄県', 'ArrowRight'), '鹿児島県');
});

test('nextTileCode：その向きにマスが1つもなければ null（動かない）', () => {
  assert.equal(nextTileCode(prefs, code('北海道'), 'ArrowUp'), null);
  assert.equal(nextTileCode(prefs, code('北海道'), 'ArrowRight'), null);
  assert.equal(nextTileCode(prefs, code('沖縄県'), 'ArrowDown'), null);
  assert.equal(nextTileCode(prefs, code('沖縄県'), 'ArrowLeft'), null);
});

test('nextTileCode：向きは、キー名でも { dx, dy } でも指定できる。知らないキーや存在しないコードは null', () => {
  assert.equal(nextTileCode(prefs, code('福岡県'), ARROW_KEYS.ArrowRight), code('山口県'));
  assert.equal(nextTileCode(prefs, code('福岡県'), { dx: 1, dy: 0 }), code('山口県'));
  assert.equal(nextTileCode(prefs, code('福岡県'), 'Enter'), null);
  assert.equal(nextTileCode(prefs, '99', 'ArrowUp'), null);
});

test('nextTileCode：距離が同じなら、まっすぐな向きからのずれが小さいほう、それも同じならコードの小さいほうを選ぶ', () => {
  const tiles = [
    { code: '10', x: 5, y: 5 },
    { code: '11', x: 7, y: 6 }, // 右へ 2、ずれ 1：距離 5
    { code: '12', x: 6, y: 7 }, // 右へ 1、ずれ 2：距離 5（ずれが大きい）
    { code: '13', x: 7, y: 4 }, // 右へ 2、ずれ 1：距離 5（11 と同じ）
  ];
  assert.equal(nextTileCode(tiles, '10', 'ArrowRight'), '11');
});

test('nextTileCode：どのマスからでも、4 方向に動いて全 47 マスに行き着ける', () => {
  const seen = new Set([prefs[0].code]);
  const queue = [prefs[0].code];
  while (queue.length) {
    const here = queue.pop();
    for (const key of Object.keys(ARROW_KEYS)) {
      const next = nextTileCode(prefs, here, key);
      if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  assert.equal(seen.size, 47);
});

test('ringRects：外側の濃いグレーの太い枠と、その内側の白い線が、マスの内側に収まる', () => {
  const pos = tileRect(3, 2);
  const [outer, inner] = ringRects(pos);
  assert.equal(outer.stroke, '#262626');
  assert.equal(inner.stroke, '#ffffff');
  assert.ok(outer['stroke-width'] >= 3 && outer['stroke-width'] > inner['stroke-width']);
  for (const r of [outer, inner]) {
    // 線の外縁（中心線から線幅の半分）がマスの内側に収まる
    const half = r['stroke-width'] / 2;
    assert.ok(r.x - half >= pos.x - 1e-9 && r.y - half >= pos.y - 1e-9);
    assert.ok(r.x + r.width + half <= pos.x + pos.size + 1e-9 && r.y + r.height + half <= pos.y + pos.size + 1e-9);
  }
  // 白い線は濃い枠の内側に接する
  assert.ok(Math.abs(inner.x - inner['stroke-width'] / 2 - (outer.x + outer['stroke-width'] / 2)) < 1e-9);
});
