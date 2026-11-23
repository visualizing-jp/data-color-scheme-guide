// lib/tilemap.js のうち、DOM を使わない部分（マスの位置、文字色の選択）の検査。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tileRect, viewBoxSize, relativeLuminance, labelColor, labelFontSize } from '../lib/tilemap.js';

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
