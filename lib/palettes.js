// パレット。実装は後続の担当（共有モジュール担当）が行う。いまはスタブ。
// 出典：ColorBrewer（Apache 2.0）と Okabe & Ito（2008）。帰属表示は ATTRIBUTION に入れる。

/**
 * @typedef {'qualitative'|'sequential'|'diverging'} PaletteType
 * @typedef {{ id: string, type: PaletteType, source: 'colorbrewer'|'okabe-ito', classCounts: number[] }} PaletteInfo
 */

/**
 * パレットの一覧。
 * @param {PaletteType} [type] 省略すると全部
 * @returns {PaletteInfo[]} classCounts は、そのパレットで選べる色数
 */
export function list(type) {
  throw new Error('未実装: list');
}

/**
 * パレットから n 色を取り出す。
 * @param {string} id パレット ID（例：'Blues'、'okabe-ito'）
 * @param {number} n 色数（classCounts に含まれる値）
 * @returns {string[]} '#rrggbb' の配列（長さ n）
 */
export function get(id, n) {
  throw new Error('未実装: get');
}

/**
 * 色覚の多様性に配慮した配色かどうか（ColorBrewer の colorblind-safe 判定、Okabe-Ito は常に真）。
 * @param {string} id
 * @param {number} n
 * @returns {boolean}
 */
export function isColorblindSafe(id, n) {
  throw new Error('未実装: isColorblindSafe');
}

/**
 * ページ内で既定に使うパレット ID。
 * @type {{ qualitative: string, qualitativeSafe: string, sequential: string, diverging: string }}
 */
export const DEFAULTS = Object.freeze({
  qualitative: '',
  qualitativeSafe: '',
  sequential: '',
  diverging: '',
});

/**
 * 出典欄に表示する帰属表示の文字列。
 * @type {string}
 */
export const ATTRIBUTION = '';
