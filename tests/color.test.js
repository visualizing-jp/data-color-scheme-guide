// lib/color.js のテスト。期待値は、調査担当が一次情報（CSS Color 4、Ottosson、Machado ほか 2009）から
// 独立に計算した参照値（倍精度）。許容誤差は表の丸め（小数6桁）と 8bit への丸めに合わせている。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb, rgbToHex, srgbToLinear, linearToSrgb, linearToOklab, oklabToLinear,
  hexToOklch, oklchToHex, maxChroma, lightness, toGray, deltaE, cvdMatrix, simulateCvd,
} from '../lib/color.js';

const near = (actual, expected, tol, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label} 実際 ${actual}、期待 ${expected}（許容 ${tol}）`);
const nearArr = (actual, expected, tol, label = '') =>
  expected.forEach((e, i) => near(actual[i], e, tol, `${label}[${i}]`));
const hexChannels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const nearHex = (actual, expected, tol, label = '') =>
  hexChannels(expected).forEach((e, i) => near(hexChannels(actual)[i], e, tol, `${label} ${actual} と ${expected} の成分${i}`));

test('hexToRgb / rgbToHex：基本と丸め', () => {
  assert.deepEqual(hexToRgb('#ff8000'), [1, 128 / 255, 0]);
  assert.deepEqual(hexToRgb('#FFF'), [1, 1, 1]);
  assert.deepEqual(hexToRgb('#0a0'), [0, 170 / 255, 0]);
  assert.throws(() => hexToRgb('red'), TypeError);
  assert.equal(rgbToHex([1, 0.5, 0]), '#ff8000'); // 0.5*255 = 127.5 → 128（切り上げ）
  assert.equal(rgbToHex([-0.2, 1.7, 0.2]), '#00ff33'); // 0〜1 に丸める
  for (let i = 0; i < 256; i++) {
    const hex = '#' + i.toString(16).padStart(2, '0').repeat(3);
    assert.equal(rgbToHex(hexToRgb(hex)), hex);
  }
});

test('srgbToLinear / linearToSrgb：既知の値と往復', () => {
  nearArr(srgbToLinear([0.5, 0, 1]), [0.214041, 0, 1], 1e-5);
  nearArr(srgbToLinear(hexToRgb('#808080')), [0.215861, 0.215861, 0.215861], 1e-5);
  nearArr(srgbToLinear([0.04, 0.05, 0.5]), [0.04 / 12.92, 0.003935, 0.214041], 1e-5);
  nearArr(linearToSrgb([0.003, 0.0031308, 0.5]), [12.92 * 0.003, 12.92 * 0.0031308, 0.735357], 1e-5);
  // 区分のしきい値（0.04045 と 0.0031308）は桁数が有限なので、境目の付近だけ往復が 1e-7 ほどずれる
  for (const v of [0, 0.01, 0.04045, 0.2, 0.5, 0.9, 1]) {
    near(linearToSrgb(srgbToLinear([v, v, v]))[0], v, 1e-6);
  }
  // 範囲外の値は符号を保って扱う（CSS Color 4 の拡張伝達関数）
  near(srgbToLinear([-0.5, 0, 0])[0], -0.214041, 1e-5);
  near(linearToSrgb([-0.214041, 0, 0])[0], -0.5, 1e-5);
});

const OKLAB = [
  ['#ffffff', 1, 0, 0],
  ['#000000', 0, 0, 0],
  ['#ff0000', 0.627955, 0.224863, 0.125846],
  ['#00ff00', 0.86644, -0.233888, 0.179498],
  ['#0000ff', 0.452014, -0.032457, -0.311528],
  ['#808080', 0.599871, 0, 0],
  ['#e69f00', 0.752664, 0.036076, 0.153426],
  ['#56b4e9', 0.73452, -0.065333, -0.097509],
  ['#ffa500', 0.792688, 0.056611, 0.161385],
];

test('hex → OKLab（O1〜O9）と lightness', () => {
  for (const [hex, L, a, b] of OKLAB) {
    nearArr(linearToOklab(srgbToLinear(hexToRgb(hex))), [L, a, b], 1e-5, hex);
    near(lightness(hex), L, 1e-5, `lightness(${hex})`);
  }
});

test('oklabToLinear は linearToOklab の逆変換', () => {
  for (const [hex] of OKLAB) {
    const lin = srgbToLinear(hexToRgb(hex));
    nearArr(oklabToLinear(linearToOklab(lin)), lin, 1e-6, hex); // 係数は 10 桁なので往復は 1e-7 ほどずれる
  }
  // 色域外の値はそのまま返す
  const out = oklabToLinear([0.7, 0.4 * Math.cos(Math.PI / 6), 0.4 * Math.sin(Math.PI / 6)]);
  assert.ok(out.some((v) => v < 0 || v > 1));
});

const ROUNDTRIP = [
  ['#e69f00', 0.752664, 0.157611, 76.7682],
  ['#56b4e9', 0.73452, 0.117373, 236.1773],
  ['#009e73', 0.61977, 0.129516, 165.4589],
  ['#cc79a7', 0.679438, 0.117734, 346.3242],
  ['#ffa500', 0.792688, 0.171026, 70.6699],
  ['#123456', 0.319168, 0.072455, 251.1684],
  ['#808080', 0.599871, 0, null],
  ['#ff0000', 0.627955, 0.257683, 29.2339], // 色域の境界（ε が必要）
  ['#0000ff', 0.452014, 0.313214, 264.052],
];

test('hexToOklch（R1〜R9）と oklchToHex の往復', () => {
  for (const [hex, l, c, h] of ROUNDTRIP) {
    const lch = hexToOklch(hex);
    near(lch.l, l, 1e-5, `${hex} l`);
    near(lch.c, c, 1e-5, `${hex} c`);
    if (h !== null) near(lch.h, h, 0.01, `${hex} h`);
    assert.ok(lch.h >= 0 && lch.h < 360);
    assert.equal(oklchToHex(lch), hex, `往復 ${hex}`);
  }
});

test('hexToOklch：無彩色（c < 0.0001）では h が 0', () => {
  for (const hex of ['#000000', '#ffffff', '#808080', '#777777', '#fefefe']) {
    const { c, h } = hexToOklch(hex);
    assert.ok(c < 0.0001, `${hex} の c = ${c}`);
    assert.equal(h, 0, `${hex} の h`);
  }
});

test('oklchToHex の往復：全 256 グレーと、粗く刻んだ全色', () => {
  for (let i = 0; i < 256; i++) {
    const hex = '#' + i.toString(16).padStart(2, '0').repeat(3);
    assert.equal(oklchToHex(hexToOklch(hex)), hex);
  }
  for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
    const hex = rgbToHex([r / 255, g / 255, b / 255]);
    assert.equal(oklchToHex(hexToOklch(hex)), hex, `往復 ${hex}`);
  }
});

const GAMUT = [
  // 入力 {l,c,h}, 出力 hex, c_max
  [{ l: 0.7, c: 0.4, h: 30 }, '#ff6551', 0.191512],
  [{ l: 0.9, c: 0.3, h: 140 }, '#89ff6d', 0.213748],
  [{ l: 0.5, c: 0.5, h: 264 }, '#033fff', 0.281029],
  [{ l: 0.6, c: 0.15, h: 30 }, '#ca5747', 0.15], // 色域内：変更なし
];

test('oklchToHex：色域外は l と h を保って c を下げる（G1〜G4）', () => {
  for (const [lch, hex, cMax] of GAMUT) {
    nearHex(oklchToHex(lch), hex, 1, JSON.stringify(lch));
    const back = hexToOklch(oklchToHex(lch));
    near(back.l, lch.l, 0.002, `${hex} l`);
    near(back.h, lch.h, 0.5, `${hex} h`);
    near(back.c, Math.min(lch.c, cMax), 0.002, `${hex} c`);
    if (lch.c > cMax) near(maxChroma(lch.l, lch.h), cMax, 1e-3, `${hex} maxChroma`);
  }
});

test('maxChroma：返した彩度は色域内、少し超えると色域外', () => {
  const linAt = (l, c, h) => oklabToLinear([l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]);
  for (const l of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    for (let h = 0; h < 360; h += 15) {
      const c = maxChroma(l, h);
      assert.ok(c > 0, `l=${l} h=${h}`);
      assert.ok(linAt(l, c, h).every((v) => v >= -1e-6 && v <= 1 + 1e-6), `色域内 l=${l} h=${h} c=${c}`);
      assert.ok(linAt(l, c + 0.002, h).some((v) => v < -1e-6 || v > 1 + 1e-6), `色域外 l=${l} h=${h}`);
      // oklchToHex は maxChroma の彩度を下げずに通す
      nearHex(oklchToHex({ l, c, h }), oklchToHex({ l, c: c + 1e-4, h }), 1, `l=${l} h=${h}`);
    }
  }
  near(maxChroma(0.628, 29.2339), 0.2577, 2e-3); // sRGB の赤の付近
  // 黒と白では色域に余裕がない（判定の ε があるので、ちょうど 0 にはならない）
  assert.ok(maxChroma(0, 100) < 0.01);
  assert.ok(maxChroma(1, 100) < 0.01);
  assert.equal(maxChroma(-0.5, 100), 0); // l が範囲外なら下げる彩度がない
});

test('toGray（T1〜T7）', () => {
  const T = [['#ff0000', '#888888'], ['#00ff00', '#d3d3d3'], ['#0000ff', '#565656'], ['#e69f00', '#afafaf'],
    ['#808080', '#808080'], ['#ffffff', '#ffffff'], ['#000000', '#000000']];
  for (const [input, gray] of T) {
    assert.equal(toGray(input), gray, input);
    near(lightness(toGray(input)), lightness(input), 0.003, `L(${input})`);
    const [r, g, b] = hexChannels(toGray(input));
    assert.ok(r === g && g === b);
  }
});

test('deltaE（D1〜D4）', () => {
  near(deltaE('#ffffff', '#000000'), 1, 1e-5);
  near(deltaE('#ff0000', '#00ff00'), 0.519813, 1e-5);
  near(deltaE('#e69f00', '#56b4e9'), 0.271259, 1e-5);
  assert.equal(deltaE('#808080', '#808080'), 0);
  near(deltaE('#e69f00', '#56b4e9'), deltaE('#56b4e9', '#e69f00'), 1e-12);
});

test('cvdMatrix：格子点・補間・範囲', () => {
  // 重症度 1.0 の行列（調査結果 3.5）
  nearArr(cvdMatrix('protan', 1).flat(), [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998], 1e-9);
  nearArr(cvdMatrix('deutan', 1).flat(), [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881], 1e-9);
  nearArr(cvdMatrix('tritan', 1).flat(), [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039], 1e-9);
  // 重症度 0 は単位行列
  for (const t of ['protan', 'deutan', 'tritan']) {
    nearArr(cvdMatrix(t, 0).flat(), [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-12, t);
  }
  // 0.55 は 0.5 と 0.6 の平均
  nearArr(cvdMatrix('protan', 0.55)[0], [0.421757, 0.724292, -0.146048], 1e-6);
  const mid = (t, a, b) => cvdMatrix(t, a).map((row, i) => row.map((v, j) => (v + cvdMatrix(t, b)[i][j]) / 2));
  for (const t of ['protan', 'deutan', 'tritan']) {
    nearArr(cvdMatrix(t, 0.55).flat(), mid(t, 0.5, 0.6).flat(), 1e-9, t);
  }
  // 0.15：0.1 と 0.2 の線形補間（外挿ではない）
  nearArr(cvdMatrix('protan', 0.15)[0], [0.795467, 0.258455, -0.053921], 1e-6);
  // 全重症度で各行の和が 1、範囲外は 0〜1 に丸める
  for (const t of ['protan', 'deutan', 'tritan']) {
    for (let k = 0; k <= 100; k++) for (const row of cvdMatrix(t, k / 100)) near(row[0] + row[1] + row[2], 1, 2e-6, `${t} ${k / 100}`);
  }
  assert.deepEqual(cvdMatrix('protan', 2), cvdMatrix('protan', 1));
  assert.deepEqual(cvdMatrix('protan', -1), cvdMatrix('protan', 0));
  assert.throws(() => cvdMatrix('x', 0.5), RangeError);
  // 呼ぶたびに別の配列（内部の表を書き換えられない）
  cvdMatrix('protan', 1)[0][0] = 99;
  near(cvdMatrix('protan', 1)[0][0], 0.152286, 1e-9);
});

// [入力, type, severity, 期待 hex, 許容（各チャンネル）]
const CVD = [
  ['#ff0000', 'protan', 1, '#6d5f00'], ['#ff0000', 'protan', 0.5, '#b45600'], ['#ff0000', 'protan', 0.55, '#ae5800'],
  ['#ff0000', 'deutan', 1, '#a39000'], ['#ff0000', 'deutan', 0.5, '#c37600'], ['#ff0000', 'deutan', 0.55, '#bf7a00'],
  ['#ff0000', 'tritan', 1, '#ff000f'], ['#ff0000', 'tritan', 0.5, '#ff0013'], ['#ff0000', 'tritan', 0.55, '#ff000d'],
  ['#00ff00', 'protan', 1, '#ffe500'], ['#00ff00', 'protan', 0.5, '#d7ed00'], ['#00ff00', 'protan', 0.55, '#ddec00'],
  ['#00ff00', 'deutan', 1, '#efd63a'], ['#00ff00', 'deutan', 0.5, '#cde52e'], ['#00ff00', 'deutan', 0.55, '#d2e330'],
  ['#00ff00', 'tritan', 1, '#00f7d9'], ['#00ff00', 'tritan', 0.5, '#2efa89'], ['#00ff00', 'tritan', 0.55, '#00fb91'],
  ['#ffa500', 'protan', 1, '#c3ac00'], ['#ffa500', 'protan', 0.5, '#dcac00'], ['#ffa500', 'protan', 0.55, '#d9ac00'],
  ['#ffa500', 'deutan', 1, '#d9c10e'], ['#ffa500', 'deutan', 0.5, '#e4b700'], ['#ffa500', 'deutan', 0.55, '#e3b901', 1], // C24：丸めの境目
  ['#ffa500', 'tritan', 1, '#ff8e8d'], ['#ffa500', 'tritan', 0.5, '#ffa159'], ['#ffa500', 'tritan', 0.55, '#ff9e5d'],
  ['#0000ff', 'protan', 1, '#0059ff'], ['#0000ff', 'protan', 0.5, '#0046ff'], ['#0000ff', 'protan', 0.55, '#0048ff'],
  ['#0000ff', 'deutan', 1, '#003dfb'], ['#0000ff', 'deutan', 0.5, '#0036fd'], ['#0000ff', 'deutan', 0.55, '#0037fd'],
  ['#0000ff', 'tritan', 1, '#006b96'], ['#0000ff', 'tritan', 0.5, '#003ee0'], ['#0000ff', 'tritan', 0.55, '#0042dc'],
];

test('simulateCvd：参照値 C1〜C36（線形 RGB で適用、線形の段階でクリップ）', () => {
  assert.equal(CVD.length, 36);
  CVD.forEach(([input, type, severity, expected, tol = 0], i) => {
    const actual = simulateCvd(input, type, severity);
    if (tol === 0) assert.equal(actual, expected, `C${i + 1} ${input} ${type} ${severity}`);
    else nearHex(actual, expected, tol, `C${i + 1}`);
  });
});

test('simulateCvd：白・黒・グレーは変わらない', () => {
  for (const hex of ['#ffffff', '#000000', '#808080', '#777777']) {
    for (const type of ['protan', 'deutan', 'tritan']) {
      for (const severity of [0.3, 0.55, 1]) {
        assert.equal(simulateCvd(hex, type, severity), hex, `${hex} ${type} ${severity}`);
      }
    }
  }
  for (let i = 0; i < 256; i++) {
    const hex = '#' + i.toString(16).padStart(2, '0').repeat(3);
    for (const type of ['protan', 'deutan', 'tritan']) assert.equal(simulateCvd(hex, type, 1), hex);
  }
});

test('simulateCvd：重症度 0 は入力と同じ色を返す', () => {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#e69f00', '#56b4e9', '#009e73', '#cc79a7', '#123456', '#abcdef', '#fedcba'];
  for (const hex of colors) for (const type of ['protan', 'deutan', 'tritan']) {
    assert.equal(simulateCvd(hex, type, 0), hex, `${hex} ${type}`);
  }
});
