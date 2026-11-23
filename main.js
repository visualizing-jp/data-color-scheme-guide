// 図の登録簿。ページ内の [data-widget] を見つけ、widgets/<名前>/index.js を読み込んで mount する。
// 図のモジュールが無い名前のときは、名前入りのプレースホルダを出す（エラーにはしない）。
// 9つの図はすべて実装済みなので、現在のページでプレースホルダが出ることはない。
// なお、無いモジュールを import するとブラウザ自身が 404 をコンソールに出すため、
// マウント点を足すときは、先に widgets/<名前>/index.js を置く。
import { loadDeps } from './lib/deps.js';
import { mountPlaceholder } from './widgets/_placeholder.js';

/** 図の契約：widgets/<名前>/index.js が export する mount(el, deps) は、{ destroy() } か、それを解決する Promise を返す。 */
const instances = new Map();

function showError(el, name) {
  el.dataset.state = 'error';
  const box = document.createElement('div');
  box.className = 'widget-error';
  box.setAttribute('role', 'alert');
  box.textContent = `図（${name}）を表示できませんでした`;
  el.replaceChildren(box);
}

/** widgets/<名前>/index.js があるかを、取得して確かめる。 */
async function moduleExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

async function mountWidget(el, deps) {
  const name = el.dataset.widget;
  const url = new URL(`./widgets/${encodeURIComponent(name)}/index.js`, import.meta.url);

  let module;
  try {
    module = await import(url.href);
  } catch (error) {
    // モジュールが無いだけなら正常（プレースホルダ）。あるのに読み込めないなら本物のエラー。
    if (!(await moduleExists(url))) return void mountPlaceholder(el, name);
    console.error(`図（${name}）の読み込みに失敗しました`, error);
    return showError(el, name);
  }

  try {
    el.dataset.state = 'mounted';
    instances.set(el, (await module.mount(el, deps)) ?? { destroy() {} });
  } catch (error) {
    console.error(`図（${name}）の mount に失敗しました`, error);
    showError(el, name);
  }
}

async function main() {
  const targets = [...document.querySelectorAll('[data-widget]')];
  if (targets.length === 0) return;
  let deps;
  try {
    deps = await loadDeps();
  } catch (error) {
    console.error('図に渡す deps を準備できませんでした', error);
    for (const el of targets) showError(el, el.dataset.widget);
    return;
  }
  await Promise.all(targets.map((el) => mountWidget(el, deps)));
  document.documentElement.dataset.widgetsReady = 'true';
}

main();
