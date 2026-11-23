// 「図（名前）は準備中です」の枠。図がまだ無いときの正常な表示で、エラーではない。
// main.js と、S0 が置いた各図のスタブ（widgets/<名前>/index.js）が使う。

/**
 * @param {HTMLElement} el マウント点
 * @param {string} name 図の名前（data-widget の値）
 * @returns {{ destroy(): void }}
 */
export function mountPlaceholder(el, name) {
  el.dataset.state = 'placeholder';
  const box = document.createElement('div');
  box.className = 'widget-placeholder';
  box.setAttribute('role', 'note');
  box.textContent = `図（${name}）は準備中です`;
  el.replaceChildren(box);
  return { destroy: () => el.replaceChildren() };
}
