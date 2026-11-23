// 図に渡す deps を組み立てる。main.js と各 widgets/*/demo.html が共用する。
import * as color from './color.js';
import * as palettes from './palettes.js';
import * as tilemap from './tilemap.js';

let cache = null;

/**
 * 図に渡す deps を組み立てる。結果はキャッシュされ、何度呼んでも同じ読み込みを共有する。
 * 事前に `vendor/d3/d3.min.js` を <script> で読み込んでおくこと（`globalThis.d3` を使う）。
 * @returns {Promise<{ d3: object, color: object, palettes: object, prefectures: object, tilemap: object }>}
 */
export function loadDeps() {
  cache ??= build().catch((error) => {
    cache = null; // 失敗は覚えない（次の呼び出しでやり直せる）
    throw error;
  });
  return cache;
}

async function build() {
  const d3 = globalThis.d3;
  if (!d3) {
    throw new Error('D3 が見つかりません。vendor/d3/d3.min.js を、このモジュールより先に <script> で読み込んでください。');
  }
  const url = new URL('../data/prefectures.json', import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`都道府県データを読み込めません（${response.status}）: ${url.pathname}`);
  const prefectures = await response.json();
  return { d3, color, palettes, prefectures, tilemap };
}
