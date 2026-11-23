// 「錐体エクスプローラ」と「光の混合」（どちらも第1章）が共有する計算。
// データ（cones.json）は Stockman & Sharpe (2000) の2°視野の錐体分光感度と CIE 1931 等色関数を 390〜700nm・5nm刻みで持つ。

export const CONES = ['L', 'M', 'S'];

/**
 * 錐体のデータ（cones.json）を読み込み、波長から反応量・XYZ を引く道具を返す。
 * @returns {Promise<{ data: object, wls: number[], indexOf: Map<number, number>,
 *   at(cone: string, wl: number): number, xyzAt(wl: number): number[] }>}
 */
export async function loadCones() {
  const url = new URL('./cones.json', import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`錐体のデータを読み込めません（${response.status}）: ${url.pathname}`);
  const data = await response.json();

  const wls = data.wavelengths;
  const indexOf = new Map(wls.map((w, i) => [w, i]));
  const at = (cone, w) => data[cone][indexOf.get(w)];
  const xyzAt = (w) => {
    const i = indexOf.get(w);
    return [data.xbar[i], data.ybar[i], data.zbar[i]];
  };
  return { data, wls, indexOf, at, xyzAt };
}

/**
 * XYZ（CIE 1931）→ 画面の近似色。負の成分を 0 に切り、最大成分を 1 にそろえ、sRGB のガンマをかける。
 *
 * lib/color.js を使わずに、ここで計算している。単色光（スペクトル上の純粋な色）は
 * sRGB の色域の外にあり、色空間の変換だけでは表示できる色にならない。そのため、この図に固有の
 * 近似（色域の外へ出た負の成分を 0 に切り、最大成分を 1 にそろえて明るさを保つ）が要る。
 * lib/color.js の色域への収め方（明度と色相を保って彩度を下げる）とは目的が違うので、共有せずにここへ置く。
 */
export function xyzToHex([x, y, z]) {
  const lin = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.2040 * y + 1.0570 * z,
  ].map((v) => Math.max(0, v));
  const max = Math.max(...lin);
  const norm = max > 0 ? lin.map((v) => v / max) : lin;
  const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return '#' + norm.map((c) => Math.round(Math.min(1, Math.max(0, enc(c))) * 255).toString(16).padStart(2, '0')).join('');
}
