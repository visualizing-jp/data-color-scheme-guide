// 導入図「同じデータなのに、見え方がちがう」。
// 65歳以上人口の割合を、同じ階級の区切りで 2 通りの配色（定性的な配色・連続的な配色）に塗り、タイル地図を並べて見比べる。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

const SVG_NS = 'http://www.w3.org/2000/svg';
const CLASS_COUNT = 5;
const DEFAULT_INFO = 'マスに触れると、県名と値が出ます。';
const MARK_COLOR = '#262626'; // 印の枠（濃いグレー）
const MARK_HALO = '#ffffff'; // 濃い塗りの上でも枠が見えるように、枠の内側に添える白

const fmt = (value) => value.toFixed(1);

/** 印を描く SVG 要素を作る（地図の SVG と同じ viewBox を持たせて重ねる）。 */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * @param {HTMLElement} el マウント点
 * @param {{ d3: object, color: object, palettes: object, prefectures: object, tilemap: object }} deps
 * @returns {{ destroy(): void }}
 */
export function mount(el, { palettes, prefectures, tilemap }) {
  const list = prefectures.prefectures;
  const unit = prefectures.meta?.units?.aged65 ?? '%';
  const values = list.map((p) => p.aged65);
  const domain = [Math.min(...values), Math.max(...values)];
  const highest = list.reduce((a, b) => (b.aged65 > a.aged65 ? b : a));
  const lowest = list.reduce((a, b) => (b.aged65 < a.aged65 ? b : a));
  const byCode = new Map(list.map((p) => [p.code, p]));

  // 2 つの地図は同じ区切り（domain と階級数が同じ）で塗る
  const schemes = [
    { key: 'a', title: '配色A', caption: '色の種類がばらばら', id: palettes.DEFAULTS.qualitative },
    { key: 'b', title: '配色B', caption: '濃いほど割合が高い', id: palettes.DEFAULTS.sequential },
  ].map((s) => ({ ...s, scale: palettes.scale(s.id, CLASS_COUNT, domain) }));

  // --- 組み立て ---------------------------------------------------------
  const infoId = uid('intro-compare-info');
  const info = h('p', { class: 'intro-compare__info', id: infoId }, DEFAULT_INFO);
  const answer = h('p', { class: 'intro-compare__answer', 'aria-live': 'polite' });
  const button = h('button', { class: 'intro-compare__button', type: 'button' }, '答えを見る');

  const panels = schemes.map((s) => {
    const mapHost = h('div', { class: 'intro-compare__map' });
    const legend = buildLegend(s.scale, domain, s.title);
    const panel = h('div', { class: 'intro-compare__panel', dataset: { scheme: s.key } }, [
      h('p', { class: 'intro-compare__panel-title' }, [
        h('strong', {}, s.title),
        h('span', {}, `：${s.caption}`),
      ]),
      mapHost,
      legend,
    ]);
    return { ...s, panel, mapHost };
  });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, '同じデータなのに、見え方がちがう'),
    h('p', { class: 'intro-compare__lead' }, '左右は、65歳以上人口の割合の同じデータです。違うのは、色の付け方だけです。'),
    h('div', { class: 'intro-compare__maps' }, panels.map((p) => p.panel)),
    info,
    h('p', { class: 'intro-compare__question' }, '割合がいちばん高い県と、いちばん低い県は、どこでしょう。まず配色Aで探してみてください。'),
    h('div', { class: 'ctl' }, button),
    answer,
    h('p', { class: 'fig-note' }, 'データ：総務省統計局『人口推計（2024年10月1日現在）』の65歳以上人口の割合。'),
  );

  // --- 地図 -------------------------------------------------------------
  const cleanups = [];
  for (const p of panels) {
    const handle = tilemap.render(p.mapHost, {
      prefectures,
      fill: (pref) => p.scale.color(pref.aged65),
      labels: 'auto',
      ariaLabel: `65歳以上人口の割合を、${p.title}（${p.caption}）で塗り分けたタイル地図`,
    });
    cleanups.push(() => handle.destroy());
    p.svg = p.mapHost.querySelector('svg');
    p.overlay = buildOverlay(p.svg);
    p.marks = p.overlay.querySelector('.intro-compare__marks');
    p.focusRing = p.overlay.querySelector('.intro-compare__focus-ring');
    p.mapHost.append(p.overlay);
    cleanups.push(setupTiles(p));
  }

  /** 地図のマスに、操作（ホバー、タップ、フォーカス、矢印キー）を付ける。 */
  function setupTiles(p) {
    const tiles = [...p.svg.querySelectorAll('rect[data-code]')].map((rect) => {
      const pref = byCode.get(rect.dataset.code);
      rect.setAttribute('role', 'img');
      rect.setAttribute('aria-label', `${pref.name} ${pref.aged65}${unit}`);
      rect.setAttribute('tabindex', '-1');
      return { pref, rect };
    });
    // Tab の停止位置は 1 つだけにし、地図の中は矢印キーで動く
    const start = tiles.find((t) => t.pref.code === highest.code) ?? tiles[0];
    start.rect.setAttribute('tabindex', '0');

    const show = (pref) => { info.textContent = `${pref.name}：${pref.aged65}${unit}`; };
    const clear = () => { info.textContent = DEFAULT_INFO; };
    const tileOf = (target) => (target instanceof Element ? target.closest('rect[data-code]') : null);

    const onOver = (event) => {
      const rect = tileOf(event.target);
      if (rect) show(byCode.get(rect.dataset.code));
    };
    const onOut = (event) => {
      // 指を離したときに表示が消えないよう、消すのはマウスのときだけにする
      if (event.pointerType === 'mouse' && tileOf(event.target)) clear();
    };
    const onClick = (event) => {
      const rect = tileOf(event.target);
      if (rect) show(byCode.get(rect.dataset.code));
    };
    const onFocusIn = (event) => {
      const rect = tileOf(event.target);
      if (!rect) return;
      for (const t of tiles) t.rect.setAttribute('tabindex', t.rect === rect ? '0' : '-1');
      show(byCode.get(rect.dataset.code));
      // キーボードで来たときだけ、フォーカスの枠を重ねて描く
      p.focusRing.replaceChildren(...(rect.matches(':focus-visible') ? buildRing(rect, 3, 1.5) : []));
    };
    const onFocusOut = (event) => {
      if (!tileOf(event.target)) return;
      p.focusRing.replaceChildren();
      clear();
    };
    const onKey = (event) => {
      const rect = tileOf(event.target);
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!rect || !dir) return;
      event.preventDefault();
      const here = byCode.get(rect.dataset.code);
      let best = null;
      let bestScore = Infinity;
      for (const t of tiles) {
        const dx = t.pref.x - here.x;
        const dy = t.pref.y - here.y;
        const along = dx * dir[0] + dy * dir[1];
        if (along <= 0) continue;
        const score = along + 2 * Math.abs(dx * dir[1] + dy * dir[0]); // 進む向きに近いマスを優先する
        if (score < bestScore) { best = t; bestScore = score; }
      }
      best?.rect.focus();
    };

    p.svg.addEventListener('pointerover', onOver);
    p.svg.addEventListener('pointerout', onOut);
    p.svg.addEventListener('click', onClick);
    p.svg.addEventListener('focusin', onFocusIn);
    p.svg.addEventListener('focusout', onFocusOut);
    p.svg.addEventListener('keydown', onKey);
    return () => {
      p.svg.removeEventListener('pointerover', onOver);
      p.svg.removeEventListener('pointerout', onOut);
      p.svg.removeEventListener('click', onClick);
      p.svg.removeEventListener('focusin', onFocusIn);
      p.svg.removeEventListener('focusout', onFocusOut);
      p.svg.removeEventListener('keydown', onKey);
    };
  }

  // --- 答えを見る / もう一度 ---------------------------------------------
  let revealed = false;

  function setRevealed(next) {
    revealed = next;
    for (const p of panels) {
      p.marks.replaceChildren();
      if (!revealed) continue;
      for (const pref of [highest, lowest]) {
        const rect = p.svg.querySelector(`rect[data-code="${pref.code}"]`);
        if (rect) p.marks.append(...buildMark(rect));
      }
    }
    button.textContent = revealed ? 'もう一度' : '答えを見る';
    answer.textContent = revealed
      ? `いちばん高いのは${highest.name}（${highest.aged65}${unit}）、いちばん低いのは${lowest.name}（${lowest.aged65}${unit}）です。`
        + '配色Aでは、色の順序がわからないので、凡例を何度も見比べることになります。配色Bでは、濃さの順に高低が読めます。'
      : '';
  }
  const onButton = () => setRevealed(!revealed);
  button.addEventListener('click', onButton);

  return {
    destroy() {
      button.removeEventListener('click', onButton);
      cleanups.forEach((fn) => fn());
      el.replaceChildren();
    },
  };
}

/** 地図の SVG と同じ viewBox の、印用の SVG を作る（クリックなどは地図に通す）。 */
function buildOverlay(mapSvg) {
  const overlay = svgEl('svg', { viewBox: mapSvg.getAttribute('viewBox'), 'aria-hidden': 'true', class: 'intro-compare__overlay' });
  overlay.append(svgEl('g', { class: 'intro-compare__marks' }), svgEl('g', { class: 'intro-compare__focus-ring' }));
  return overlay;
}

/** マス 1 つぶんの印：濃いグレーの太い枠（外側）と、その内側の白い細線。 */
function buildMark(rect) {
  return buildRing(rect, 4, 2);
}

/** マスの縁に沿った枠：外側に濃いグレー（太さ outer）、その内側に白い細線（太さ inner）。 */
function buildRing(rect, outer, inner) {
  const x = Number(rect.getAttribute('x'));
  const y = Number(rect.getAttribute('y'));
  const size = Number(rect.getAttribute('width'));
  const ring = (inset, width, color) => svgEl('rect', {
    x: x + inset, y: y + inset, width: size - inset * 2, height: size - inset * 2,
    fill: 'none', stroke: color, 'stroke-width': width,
  });
  return [ring(outer / 2, outer, MARK_COLOR), ring(outer + inner / 2, inner, MARK_HALO)];
}

/**
 * 凡例：階級の色を値の小さい順に左から並べ、階級の境界値を色の切れ目に添える。
 * 画面の読み上げでは、階級ごとの範囲を文で読む。
 */
function buildLegend(scale, domain, title) {
  const { colors, thresholds } = scale;
  const n = colors.length;
  const bounds = [domain[0], ...thresholds, domain[1]];
  const range = (i) => (i === n - 1 ? `${fmt(bounds[i])}以上${fmt(bounds[i + 1])}以下` : `${fmt(bounds[i])}以上${fmt(bounds[i + 1])}未満`);
  return h('div', { class: 'intro-compare__legend' }, [
    h('p', { class: 'intro-compare__legend-title', 'aria-hidden': 'true' }, '65歳以上人口の割合（%）'),
    h('ol', { class: 'intro-compare__classes', 'aria-label': `${title}の凡例（値の小さい階級から順）` },
      colors.map((color, i) => h('li', { style: { '--swatch': color } }, [
        h('span', { class: 'visually-hidden' }, `${range(i)}の階級`),
      ]))),
    h('div', { class: 'intro-compare__bounds', 'aria-hidden': 'true' },
      bounds.map((value, i) => h('span', { style: { left: `${(i / n) * 100}%` } }, fmt(value)))),
  ]);
}
