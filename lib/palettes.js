// パレット。実装は後続の担当（共有モジュール担当）が行う。いまはスタブ。
// 出典：ColorBrewer（Apache 2.0）と Okabe & Ito（2008）。帰属表示は ATTRIBUTION に入れる。
// パレット ID は ColorBrewer の名前（'Blues' など）と、Okabe–Ito の 'OkabeIto'。

/**
 * @typedef {'qualitative'|'sequential'|'diverging'} PaletteType
 * @typedef {{ id: string, label: string, type: PaletteType, source: 'colorbrewer'|'okabe-ito', classCounts: number[] }} PaletteInfo
 */

/**
 * パレットの一覧。
 * @param {PaletteType} [type] 省略すると全部
 * @returns {PaletteInfo[]} id は get / scale に渡す ID（例：'Blues'、'OkabeIto'）、label は画面に出す表示名（例：'Blues'、'Okabe–Ito'）、
 *   classCounts は、そのパレットで選べる色数
 */
export function list(type) {
  throw new Error('未実装: list');
}

/**
 * パレットから n 色を取り出す。
 * ColorBrewer のパレットは、ColorBrewer の定義どおりの順（sequential は明るい色から暗い色へ、
 * diverging は一方の端から他方の端へ）で返す。
 * Okabe–Ito（'OkabeIto'）は、オレンジ、スカイブルー、青みがかった緑、黄、青、朱、赤紫、黒の順で、先頭から n 色を返す。
 * @param {string} id パレット ID（例：'Blues'、'OkabeIto'）
 * @param {number} n 色数（classCounts に含まれる値）
 * @returns {string[]} '#rrggbb' の配列（長さ n）
 */
export function get(id, n) {
  throw new Error('未実装: get');
}

/**
 * 数値をパレットの色に対応づける。区切りは等間隔。
 * 同じ地図を複数の図が同じ区切りで塗れるように、階級分けはこの関数に一本化する。
 * - center を指定しない場合：domain の最小値〜最大値を n 等分する。値が小さい階級ほど colors の先頭側。
 * - center を指定した場合（分岐的な使い方）：center から最小値・最大値までの距離の大きいほうを h として、
 *   [center - h, center + h] を n 等分する。n が奇数なら中央の階級が center をまたぐ。
 * @param {string} id パレット ID
 * @param {number} n 階級数
 * @param {[number, number]} domain データの最小値と最大値
 * @param {{ center?: number }} [options]
 * @returns {{ color(value: number): string, index(value: number): number, thresholds: number[], colors: string[] }}
 *   thresholds は階級の境界（n - 1 個）、colors は n 色、index は 0〜n-1 の階級番号
 */
export function scale(id, n, domain, options) {
  throw new Error('未実装: scale');
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
