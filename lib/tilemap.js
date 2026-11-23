// 都道府県タイル地図（1県＝1マスの図）。実装は後続の担当（共有モジュール担当）が行う。いまはスタブ。
// 座標は data/prefectures.json の x, y（マス目の位置）を使う。
//   x：左（西）から数えた列番号、0〜12 の整数。y：上（北）から数えた行番号、0〜11 の整数。
//   グリッドの大きさは data の meta.grid（columns: 13, rows: 12）。同じ (x, y) を 2 つの都道府県が持つことはない。

/**
 * タイル地図を el の中に描く。el の中身は、この関数が書き換える。
 * - SVG は viewBox つきで描き、幅は親要素いっぱいに伸縮する（高さは viewBox の比で決まる）。
 * - labels が真のとき、マスの文字色は塗りの明るさに応じて、濃い色か白かを自動で選ぶ。
 * - fill が返す色は '#rrggbb'。
 * @param {HTMLElement} el 描画先
 * @param {object} options
 * @param {Array<object>} options.prefectures data/prefectures.json の `prefectures` 配列
 * @param {(pref: object) => string} options.fill 都道府県 1 件を受け取り、'#rrggbb' を返す関数
 * @param {boolean} [options.labels] 県名の略称（short）をマスに表示するか
 * @param {string} [options.ariaLabel] 図全体の代替テキスト
 * @returns {{ update(options: { fill: (pref: object) => string }): void, destroy(): void }}
 *   update は塗り分けだけを差し替える。destroy は描いたものを取り除く。
 */
export function render(el, { prefectures, fill, labels, ariaLabel }) {
  throw new Error('未実装: render');
}
