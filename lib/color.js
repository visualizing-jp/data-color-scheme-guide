// 色計算。ブラウザでも Node でも読み込める（Node 専用の API は使わない）。
// 約束事：RGB は「ガンマ補正済み sRGB、各成分 0〜1」の配列 [r, g, b]。
// 'linear' と付くものは線形 sRGB。hex は '#rrggbb'（小文字、先頭の # つき）。
//
// 出典
// - sRGB の伝達関数：CSS Color Module Level 4 の lin_sRGB / gam_sRGB（しきい値 0.04045 / 0.0031308、指数 2.4）
//   https://www.w3.org/TR/css-color-4/#color-conversion-code
// - OKLab：Björn Ottosson, "A perceptual color space for image processing"（2021-01-25 更新の係数）
//   https://bottosson.github.io/posts/oklab/
// - 色覚シミュレーション：Machado, Oliveira, Fernandes (2009)
//   "A Physiologically-based Model for Simulation of Color Vision Deficiency"
//   行列の表 https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html

/** @typedef {[number, number, number]} Triple */

// ---- Machado ほか (2009) の行列 ------------------------------------------------
// 重症度 0.0, 0.1, …, 1.0 の 11 個ずつ（P型・D型・T型で計 33 個）。各行列は行優先で、out = M · [r, g, b]。
// 出典は上記の行列ページ（colour-science v0.4.6 の machado2010.py と全 297 値が一致することを確認済み）。
// 注意：論文は、この行列を掛ける色空間（線形 RGB かガンマ補正済み RGB か）を明記していない。
// 行列は RGB 原色の分光分布から作られており、RGB を光の量とみなす線形モデルなので、
// 理論上の前提から「線形 sRGB に掛ける」ことにした。
// 実行時に外部から取得せず、値はここに埋め込む。
const MACHADO = {
  protan: [
    [[1.000000, 0.000000, 0.000000], [0.000000, 1.000000, 0.000000], [0.000000, 0.000000, 1.000000]],  // 0.0
    [[0.856167, 0.182038, -0.038205], [0.029342, 0.955115, 0.015544], [-0.002880, -0.001563, 1.004443]],  // 0.1
    [[0.734766, 0.334872, -0.069637], [0.051840, 0.919198, 0.028963], [-0.004928, -0.004209, 1.009137]],  // 0.2
    [[0.630323, 0.465641, -0.095964], [0.069181, 0.890046, 0.040773], [-0.006308, -0.007724, 1.014032]],  // 0.3
    [[0.539009, 0.579343, -0.118352], [0.082546, 0.866121, 0.051332], [-0.007136, -0.011959, 1.019095]],  // 0.4
    [[0.458064, 0.679578, -0.137642], [0.092785, 0.846313, 0.060902], [-0.007494, -0.016807, 1.024301]],  // 0.5
    [[0.385450, 0.769005, -0.154455], [0.100526, 0.829802, 0.069673], [-0.007442, -0.022190, 1.029632]],  // 0.6
    [[0.319627, 0.849633, -0.169261], [0.106241, 0.815969, 0.077790], [-0.007025, -0.028051, 1.035076]],  // 0.7
    [[0.259411, 0.923008, -0.182420], [0.110296, 0.804340, 0.085364], [-0.006276, -0.034346, 1.040622]],  // 0.8
    [[0.203876, 0.990338, -0.194214], [0.112975, 0.794542, 0.092483], [-0.005222, -0.041043, 1.046265]],  // 0.9
    [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],  // 1.0
  ],
  deutan: [
    [[1.000000, 0.000000, 0.000000], [0.000000, 1.000000, 0.000000], [0.000000, 0.000000, 1.000000]],  // 0.0
    [[0.866435, 0.177704, -0.044139], [0.049567, 0.939063, 0.011370], [-0.003453, 0.007233, 0.996220]],  // 0.1
    [[0.760729, 0.319078, -0.079807], [0.090568, 0.889315, 0.020117], [-0.006027, 0.013325, 0.992702]],  // 0.2
    [[0.675425, 0.433850, -0.109275], [0.125303, 0.847755, 0.026942], [-0.007950, 0.018572, 0.989378]],  // 0.3
    [[0.605511, 0.528560, -0.134071], [0.155318, 0.812366, 0.032316], [-0.009376, 0.023176, 0.986200]],  // 0.4
    [[0.547494, 0.607765, -0.155259], [0.181692, 0.781742, 0.036566], [-0.010410, 0.027275, 0.983136]],  // 0.5
    [[0.498864, 0.674741, -0.173604], [0.205199, 0.754872, 0.039929], [-0.011131, 0.030969, 0.980162]],  // 0.6
    [[0.457771, 0.731899, -0.189670], [0.226409, 0.731012, 0.042579], [-0.011595, 0.034333, 0.977261]],  // 0.7
    [[0.422823, 0.781057, -0.203881], [0.245752, 0.709602, 0.044646], [-0.011843, 0.037423, 0.974421]],  // 0.8
    [[0.392952, 0.823610, -0.216562], [0.263559, 0.690210, 0.046232], [-0.011910, 0.040281, 0.971630]],  // 0.9
    [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],  // 1.0
  ],
  tritan: [
    [[1.000000, 0.000000, 0.000000], [0.000000, 1.000000, 0.000000], [0.000000, 0.000000, 1.000000]],  // 0.0
    [[0.926670, 0.092514, -0.019184], [0.021191, 0.964503, 0.014306], [0.008437, 0.054813, 0.936750]],  // 0.1
    [[0.895720, 0.133330, -0.029050], [0.029997, 0.945400, 0.024603], [0.013027, 0.104707, 0.882266]],  // 0.2
    [[0.905871, 0.127791, -0.033662], [0.026856, 0.941251, 0.031893], [0.013410, 0.148296, 0.838294]],  // 0.3
    [[0.948035, 0.089490, -0.037526], [0.014364, 0.946792, 0.038844], [0.010853, 0.193991, 0.795156]],  // 0.4
    [[1.017277, 0.027029, -0.044306], [-0.006113, 0.958479, 0.047634], [0.006379, 0.248708, 0.744913]],  // 0.5
    [[1.104996, -0.046633, -0.058363], [-0.032137, 0.971635, 0.060503], [0.001336, 0.317922, 0.680742]],  // 0.6
    [[1.193214, -0.109812, -0.083402], [-0.058496, 0.979410, 0.079086], [-0.002346, 0.403492, 0.598854]],  // 0.7
    [[1.257728, -0.139648, -0.118081], [-0.078003, 0.975409, 0.102594], [-0.003316, 0.501214, 0.502102]],  // 0.8
    [[1.278864, -0.125333, -0.153531], [-0.084748, 0.957674, 0.127074], [-0.000989, 0.601151, 0.399838]],  // 0.9
    [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],  // 1.0
  ],
};

// ---- 内部の補助 ------------------------------------------------------------------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 線形 sRGB の各成分が [0, 1] に収まるか（浮動小数の誤差を ε で許す）。 */
const GAMUT_EPS = 1e-7;
const inGamut = (rgb) => rgb.every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);

const toRad = (deg) => (deg * Math.PI) / 180;

/** 線形 sRGB を [0, 1] に丸めて '#rrggbb' にする。 */
const linearToHex = (lin) => rgbToHex(linearToSrgb(lin.map(clamp01)));

// ---- sRGB ------------------------------------------------------------------------

/**
 * '#rrggbb'（または '#rgb'）を sRGB に変換する。
 * @param {string} hex
 * @returns {Triple} [r, g, b]（ガンマ補正済み sRGB、0〜1）
 */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new TypeError(`hexToRgb: '#rrggbb' の形ではありません: ${hex}`);
  let s = m[1];
  if (s.length === 3) s = s.replace(/./g, '$&$&');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
}

/**
 * sRGB を '#rrggbb' に変換する。各成分は 0〜1 に丸める。
 * @param {Triple} rgb ガンマ補正済み sRGB（0〜1）
 * @returns {string} '#rrggbb'
 */
export function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * ガンマ補正済み sRGB を線形 sRGB に変換する。
 * @param {Triple} rgb
 * @returns {Triple} 線形 sRGB
 */
export function srgbToLinear(rgb) {
  return rgb.map((c) => {
    const a = Math.abs(c);
    return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
  });
}

/**
 * 線形 sRGB をガンマ補正済み sRGB に変換する。
 * @param {Triple} rgb 線形 sRGB
 * @returns {Triple} ガンマ補正済み sRGB
 */
export function linearToSrgb(rgb) {
  return rgb.map((c) => {
    const a = Math.abs(c);
    return a > 0.0031308 ? Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * c;
  });
}

// ---- OKLab -----------------------------------------------------------------------

/**
 * 線形 sRGB を OKLab に変換する。
 * @param {Triple} rgb 線形 sRGB
 * @returns {Triple} [L, a, b]
 */
export function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * OKLab を線形 sRGB に変換する（色域外の値はそのまま返してよい）。
 * @param {Triple} lab [L, a, b]
 * @returns {Triple} 線形 sRGB
 */
export function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const hexToOklab = (hex) => linearToOklab(srgbToLinear(hexToRgb(hex)));

/** OKLCH（h は度）を線形 sRGB にする。色域外の値もそのまま返す。 */
const lchToLinear = (l, c, h) => oklabToLinear([l, c * Math.cos(toRad(h)), c * Math.sin(toRad(h))]);

/**
 * '#rrggbb' を OKLCH に変換する。彩度がほぼ 0 の色（c < 0.0001）では、色相が決まらないので h を 0 にする。
 * @param {string} hex
 * @returns {{ l: number, c: number, h: number }} l: 明るさ（0〜1）、c: 彩度、h: 色相（度、0〜360）
 */
export function hexToOklch(hex) {
  const [l, a, b] = hexToOklab(hex);
  const c = Math.hypot(a, b);
  if (c < 0.0001) return { l, c, h: 0 };
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c, h: ((h % 360) + 360) % 360 };
}

/**
 * ある明るさ l と色相 h で、sRGB の色域に収まる最大の彩度。
 * @param {number} l 明るさ（0〜1）
 * @param {number} h 色相（度）
 * @returns {number} 最大の彩度 c（oklchToHex({ l, c, h }) が c を下げずに済む上限）
 */
export function maxChroma(l, h) {
  // c = 0 でも色域外（l が 0〜1 の外）なら、下げられる彩度がない。
  if (!inGamut(lchToLinear(l, 0, h))) return 0;
  // sRGB の最大彩度はおよそ 0.33。余裕を見て 0.5 から二分探索する。
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(lchToLinear(l, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * OKLCH を '#rrggbb' に変換する。sRGB の色域外になる場合は、l と h を保ったまま c を下げて収める。
 * @param {{ l: number, c: number, h: number }} lch h は度
 * @returns {string} '#rrggbb'
 */
export function oklchToHex({ l, c, h }) {
  let chroma = Math.max(0, c);
  if (!inGamut(lchToLinear(l, chroma, h))) chroma = Math.min(chroma, maxChroma(l, h));
  return linearToHex(lchToLinear(l, chroma, h));
}

/**
 * 見た目の明るさ。OKLab の L（0〜1）。ページでは「明るさ」としてこれを使う。
 * @param {string} hex
 * @returns {number} 0（黒）〜1（白）
 */
export function lightness(hex) {
  return hexToOklab(hex)[0];
}

/**
 * 同じ L で彩度 0 のグレーにする（白黒印刷・グレースケール表示の確認用）。
 * @param {string} hex
 * @returns {string} '#rrggbb'
 */
export function toGray(hex) {
  // a = b = 0 のとき、線形 sRGB の 3 成分はどれも L³ になる。
  const y = lightness(hex) ** 3;
  return linearToHex([y, y, y]);
}

/**
 * 2 色の差。OKLab 上のユークリッド距離。
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function deltaE(hexA, hexB) {
  const [l1, a1, b1] = hexToOklab(hexA);
  const [l2, a2, b2] = hexToOklab(hexB);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---- 色覚シミュレーション --------------------------------------------------------

/**
 * 色覚シミュレーション用の 3×3 行列（線形 sRGB に左から掛ける）。
 * 重症度が 0.1 刻みの間にあるときは、隣り合う 2 つの行列を成分ごとに線形補間する。
 * @param {'protan'|'deutan'|'tritan'} type P型（1型）／D型（2型）／T型（3型）
 * @param {number} severity 程度。0（定型色覚）〜1（完全な欠如）。範囲外は 0〜1 に丸める
 * @returns {number[][]} 3×3 の配列（行優先）
 */
export function cvdMatrix(type, severity) {
  const table = Object.hasOwn(MACHADO, type) ? MACHADO[type] : null;
  if (!table) throw new RangeError(`cvdMatrix: 未知のタイプ: ${type}`);
  const x = clamp01(Number.isFinite(severity) ? severity : 0) * 10;
  const k = Math.min(Math.floor(x), 9); // 重症度 1.0 のときは k = 9, f = 1（行列[10]）
  const f = x - k;
  return table[k].map((row, i) => row.map((v, j) => (1 - f) * v + f * table[k + 1][i][j]));
}

/**
 * 色覚シミュレーション。ある色が、指定した色覚タイプの人にどう見えるかを近似する。
 * 線形 sRGB で行列を掛け、線形の段階で 0〜1 に丸めてからガンマ補正する。
 * @param {string} hex
 * @param {'protan'|'deutan'|'tritan'} type
 * @param {number} severity 0〜1
 * @returns {string} '#rrggbb'
 */
export function simulateCvd(hex, type, severity) {
  const M = cvdMatrix(type, severity);
  const lin = srgbToLinear(hexToRgb(hex));
  return linearToHex(M.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
}
