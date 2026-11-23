// 色計算。実装は後続の担当（共有モジュール担当）が行う。いまはスタブ。
// 約束事：RGB は「ガンマ補正済み sRGB、各成分 0〜1」の配列 [r, g, b]。
// 'linear' と付くものは線形 sRGB。hex は '#rrggbb'（小文字、先頭の # つき）。

/** @typedef {[number, number, number]} Triple */

/**
 * '#rrggbb'（または '#rgb'）を sRGB に変換する。
 * @param {string} hex
 * @returns {Triple} [r, g, b]（ガンマ補正済み sRGB、0〜1）
 */
export function hexToRgb(hex) {
  throw new Error('未実装: hexToRgb');
}

/**
 * sRGB を '#rrggbb' に変換する。各成分は 0〜1 に丸める。
 * @param {Triple} rgb ガンマ補正済み sRGB（0〜1）
 * @returns {string} '#rrggbb'
 */
export function rgbToHex(rgb) {
  throw new Error('未実装: rgbToHex');
}

/**
 * ガンマ補正済み sRGB を線形 sRGB に変換する。
 * @param {Triple} rgb
 * @returns {Triple} 線形 sRGB
 */
export function srgbToLinear(rgb) {
  throw new Error('未実装: srgbToLinear');
}

/**
 * 線形 sRGB をガンマ補正済み sRGB に変換する。
 * @param {Triple} rgb 線形 sRGB
 * @returns {Triple} ガンマ補正済み sRGB
 */
export function linearToSrgb(rgb) {
  throw new Error('未実装: linearToSrgb');
}

/**
 * 線形 sRGB を OKLab に変換する。
 * @param {Triple} rgb 線形 sRGB
 * @returns {Triple} [L, a, b]
 */
export function linearToOklab(rgb) {
  throw new Error('未実装: linearToOklab');
}

/**
 * OKLab を線形 sRGB に変換する（色域外の値はそのまま返してよい）。
 * @param {Triple} lab [L, a, b]
 * @returns {Triple} 線形 sRGB
 */
export function oklabToLinear(lab) {
  throw new Error('未実装: oklabToLinear');
}

/**
 * '#rrggbb' を OKLCH に変換する。彩度がほぼ 0 の色（c < 0.0001）では、色相が決まらないので h を 0 にする。
 * @param {string} hex
 * @returns {{ l: number, c: number, h: number }} l: 明るさ（0〜1）、c: 彩度、h: 色相（度、0〜360）
 */
export function hexToOklch(hex) {
  throw new Error('未実装: hexToOklch');
}

/**
 * OKLCH を '#rrggbb' に変換する。sRGB の色域外になる場合は、l と h を保ったまま c を下げて収める。
 * @param {{ l: number, c: number, h: number }} lch h は度
 * @returns {string} '#rrggbb'
 */
export function oklchToHex(lch) {
  throw new Error('未実装: oklchToHex');
}

/**
 * ある明るさ l と色相 h で、sRGB の色域に収まる最大の彩度。
 * @param {number} l 明るさ（0〜1）
 * @param {number} h 色相（度）
 * @returns {number} 最大の彩度 c（oklchToHex({ l, c, h }) が c を下げずに済む上限）
 */
export function maxChroma(l, h) {
  throw new Error('未実装: maxChroma');
}

/**
 * 見た目の明るさ。OKLab の L（0〜1）。ページでは「明るさ」としてこれを使う。
 * @param {string} hex
 * @returns {number} 0（黒）〜1（白）
 */
export function lightness(hex) {
  throw new Error('未実装: lightness');
}

/**
 * 同じ L で彩度 0 のグレーにする（白黒印刷・グレースケール表示の確認用）。
 * @param {string} hex
 * @returns {string} '#rrggbb'
 */
export function toGray(hex) {
  throw new Error('未実装: toGray');
}

/**
 * 2 色の差。OKLab 上のユークリッド距離。
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function deltaE(hexA, hexB) {
  throw new Error('未実装: deltaE');
}

/**
 * 色覚シミュレーション用の 3×3 行列（線形 sRGB に左から掛ける）。
 * @param {'protan'|'deutan'|'tritan'} type P型（1型）／D型（2型）／T型（3型）
 * @param {number} severity 程度。0（定型色覚）〜1（完全な欠如）
 * @returns {number[][]} 3×3 の配列（行優先）
 */
export function cvdMatrix(type, severity) {
  throw new Error('未実装: cvdMatrix');
}

/**
 * 色覚シミュレーション。ある色が、指定した色覚タイプの人にどう見えるかを近似する。
 * @param {string} hex
 * @param {'protan'|'deutan'|'tritan'} type
 * @param {number} severity 0〜1
 * @returns {string} '#rrggbb'
 */
export function simulateCvd(hex, type, severity) {
  throw new Error('未実装: simulateCvd');
}
