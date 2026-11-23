// 都道府県タイル地図（1県＝1マスの図）。実装は後続の担当（共有モジュール担当）が行う。いまはスタブ。
// 座標は data/prefectures.json の x, y（マス目の位置）を使う。

/**
 * タイル地図を el の中に描く。el の中身は、この関数が書き換える。
 * @param {HTMLElement} el 描画先
 * @param {object} options
 * @param {Array<object>} options.prefectures data/prefectures.json の `prefectures` 配列
 * @param {(pref: object) => string} options.fill 都道府県 1 件を受け取り、CSS の色を返す関数
 * @param {boolean} [options.labels] 県名の略称（short）をマスに表示するか
 * @param {string} [options.ariaLabel] 図全体の代替テキスト
 * @returns {{ update(options: { fill: (pref: object) => string }): void, destroy(): void }}
 *   update は塗り分けだけを差し替える。destroy は描いたものを取り除く。
 */
export function render(el, { prefectures, fill, labels, ariaLabel }) {
  throw new Error('未実装: render');
}
