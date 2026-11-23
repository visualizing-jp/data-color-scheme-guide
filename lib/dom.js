// 図どうしで共用する、小さな DOM 関数。

const loadedStyles = new Set();

/**
 * 同じ URL のスタイルシートを、ページ内で一度だけ <link> として読み込む。
 * @param {URL|string} url スタイルシートの URL（`new URL('./style.css', import.meta.url)` など）
 * @returns {HTMLLinkElement} 読み込んだ（または既にある）<link> 要素
 */
export function ensureStyle(url) {
  const href = new URL(url, document.baseURI).href;
  if (!loadedStyles.has(href)) {
    loadedStyles.add(href);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
  return [...document.head.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href === href);
}

/**
 * 要素を作る。
 * - attrs の `class` は className、`text` は textContent、`dataset` と `style`（オブジェクト。'--swatch' のようなカスタムプロパティも可）は個別に設定する
 * - `on` で始まる関数（例：onclick）はイベントリスナとして登録する
 * - 値が false / null / undefined の属性は付けない。true は空属性（例：checked）にする。
 *   ただし `aria-` で始まる属性は、false も true も文字列（"false" / "true"）として付ける（null / undefined は付けない）
 * - children は文字列・Node・それらの配列（入れ子可）を受け取る
 * @param {string} tag タグ名（例：'div'）。SVG 要素は作れない（SVG は d3 で作る）
 * @param {Record<string, any>} [attrs]
 * @param {Array<Node|string|null|false>|Node|string} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (key.startsWith('aria-') && value != null) {
      node.setAttribute(key, String(value)); // aria-expanded={false} は "false" として付ける
      continue;
    }
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, v); // カスタムプロパティ（例：'--swatch'）
        else node.style[prop] = v;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  const list = Array.isArray(children) ? children.flat(Infinity) : [children];
  for (const child of list) {
    if (child === false || child == null) continue;
    node.append(child);
  }
  return node;
}

let uidCounter = 0;

/**
 * ラベルと入力を結び付けるための、ページ内で一意な ID を返す。
 * @param {string} [prefix] ID の接頭辞（図の名前など）
 * @returns {string} 例：'cone-explorer-3'
 */
export function uid(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}
