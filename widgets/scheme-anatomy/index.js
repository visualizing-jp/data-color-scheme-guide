// 図「スキーム解剖」：3種類のカラースキームの明度の並び方を、パレットを切り替えながら確かめる。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

const SCHEMES = [
  { type: 'qualitative', label: '定性的', defaultCount: 8 },
  { type: 'sequential', label: '連続的', defaultCount: 7 },
  { type: 'diverging', label: '分岐的', defaultCount: 7 },
];

/** 明度（0〜1）の最大と最小の差が、これ未満なら「差が小さい」とみなす。 */
const FLAT_RANGE = 0.1;
/** 隣り合う点の明度の差が、これ以内なら「同じ」とみなす（0.5% 未満）。 */
const EPS = 0.005;

/**
 * 明度の並びの形を判定する。
 * @param {number[]} L 明度（0〜1）。色の並び順
 * @returns {'flat'|'rising'|'falling'|'peak'|'other'}
 *   flat：差が小さい／rising・falling：一方向に変わる／peak：中央付近が最大で両端が暗い／other：上記以外
 */
export function classifyShape(L) {
  const n = L.length;
  if (Math.max(...L) - Math.min(...L) < FLAT_RANGE) return 'flat';
  const d = L.slice(1).map((v, i) => v - L[i]);
  if (d.every((x) => x > EPS)) return 'rising';
  if (d.every((x) => x < -EPS)) return 'falling';
  const max = Math.max(...L);
  const top = L.map((v, i) => (v >= max - EPS ? i : -1)).filter((i) => i >= 0);
  const mid = (n - 1) / 2;
  const centered = top.some((i) => Math.abs(i - mid) <= 0.5);
  // 最大の位置から両端へ向かって、単調に暗くなっていること
  const m = top[0];
  const leftOk = L.slice(0, m + 1).every((v, i, a) => i === 0 || v > a[i - 1] - EPS);
  const rightOk = L.slice(m).every((v, i, a) => i === 0 || v < a[i - 1] + EPS);
  if (centered && leftOk && rightOk && L[0] < max - FLAT_RANGE / 2 && L[n - 1] < max - FLAT_RANGE / 2) return 'peak';
  return 'other';
}

/** 種別と形から、形の説明文を決める。 */
export function describeShape(type, shape) {
  if (shape === 'flat') {
    return type === 'qualitative'
      ? 'このパレットは、この色の数では明度の差が小さくなっています。明度ではなく、色相の違いで区別するスキームです。'
      : 'このパレットは、この色の数では明度の差が小さくなっています。';
  }
  if (type === 'sequential') {
    if (shape === 'rising' || shape === 'falling') return '明度が一方向に変わっています。明るさの順が、そのまま値の大小の順になります。';
    if (shape === 'peak') return 'このパレットは、この色の数では中央が最も明るく、両端が暗くなっています。一方向には並んでいません。';
    return 'このパレットは、この色の数では、明度が一方向には並んでいません。';
  }
  if (type === 'diverging') {
    if (shape === 'peak') return '中央がいちばん明るく、両端に向かって暗くなっています。中央が基準点、両端が「大きく増えた」「大きく減った」を表します。';
    if (shape === 'rising' || shape === 'falling') return 'このパレットは、この色の数では、明度が一方向に変わっていて、中央が最も明るい形になっていません。';
    return 'このパレットは、この色の数では、中央が最も明るく両端が暗い形になっていません。';
  }
  if (shape === 'rising' || shape === 'falling') return 'この色の数では、たまたま明度が一方向に並んでいます。定性的スキームは、明度ではなく色相の違いで区別します。';
  if (shape === 'peak') return 'この色の数では、たまたま中央が最も明るくなっています。定性的スキームは、明度ではなく色相の違いで区別します。';
  return '明度は上がったり下がったりで、一方向には並んでいません。色相の違いで区別するスキームです。';
}

/**
 * @param {HTMLElement} el マウント点
 * @param {{ d3: object, color: object, palettes: object }} deps
 * @returns {{ destroy(): void }}
 */
export function mount(el, { d3, color, palettes }) {
  const infos = Object.fromEntries(SCHEMES.map((s) => [s.type, palettes.list(s.type)]));
  const clampCount = (info, n) => Math.min(info.classCounts.at(-1), Math.max(info.classCounts[0], n));
  const defaultId = (type) => {
    const id = type === 'qualitative' ? palettes.DEFAULTS.qualitative : palettes.DEFAULTS[type];
    return infos[type].some((p) => p.id === id) ? id : infos[type][0].id;
  };

  // スキームごとに、選んだパレットと色の数を覚えておく（切り替えて戻ったときに続きから見られるように）
  const memory = Object.fromEntries(SCHEMES.map((s) => {
    const info = infos[s.type].find((p) => p.id === defaultId(s.type));
    return [s.type, { id: info.id, n: clampCount(info, s.defaultCount) }];
  }));
  const state = { type: 'qualitative', gray: false };
  const infoOf = () => infos[state.type].find((p) => p.id === memory[state.type].id);

  // --- 操作部品 ---------------------------------------------------------
  const groupName = uid('scheme-anatomy-type');
  const segment = h('div', { class: 'ctl-segment', role: 'radiogroup', 'aria-labelledby': `${groupName}-label` },
    SCHEMES.map((s) => h('label', {}, [
      h('input', { type: 'radio', name: groupName, value: s.type, checked: s.type === state.type }),
      h('span', {}, s.label),
    ])));

  const selectId = uid('scheme-anatomy-palette');
  const select = h('select', { id: selectId, class: 'scheme-anatomy__select' });

  const sliderId = uid('scheme-anatomy-count');
  const output = h('output', { for: sliderId });
  const slider = h('input', { id: sliderId, type: 'range', step: 1 });

  const toggle = h('input', { type: 'checkbox', checked: state.gray });

  const shapeText = h('p', { class: 'scheme-anatomy__shape', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const cvdText = h('p', { class: 'scheme-anatomy__cvd', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const svgHost = h('div', { class: 'scheme-anatomy__plot' });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, 'スキームの中身を、明度で見る'),
    h('div', { class: 'ctl' }, [
      h('span', { class: 'scheme-anatomy__ctl-label', id: `${groupName}-label` }, 'スキーム'),
      segment,
      h('div', { class: 'scheme-anatomy__select-wrap' }, [h('label', { for: selectId }, 'パレット'), select]),
    ]),
    h('div', { class: 'ctl' }, [
      h('div', { class: 'ctl-slider' }, [h('label', { for: sliderId }, '色の数'), slider, output]),
      h('label', { class: 'ctl-toggle' }, [toggle, h('span', {}, 'グレースケールにする')]),
    ]),
    svgHost,
    shapeText,
    cvdText,
    h('p', { class: 'fig-note' }, 'パレットは ColorBrewer と Okabe–Ito によります。明度は OKLab の L です。'),
  );

  // --- 描画 -------------------------------------------------------------
  const BAND_TOP = 4;
  const BAND_H = 36;
  const PLOT_TOP = BAND_TOP + BAND_H + 24; // 帯とグラフの間に、軸の見出し「明度」を置く
  const PLOT_H = 170;
  const AXIS_BOTTOM = PLOT_TOP + PLOT_H;
  const HEIGHT = AXIS_BOTTOM + 40;
  const LEFT = 48;
  const RIGHT = 12;

  /** viewBox の幅。表示幅に合わせる（240〜600）。測れないとき（非表示など）は 600。 */
  const viewWidth = () => {
    const width = svgHost.clientWidth;
    return width > 0 ? Math.min(600, Math.max(240, Math.round(width))) : 600;
  };
  let drawnWidth = viewWidth();

  const svg = d3.select(svgHost).append('svg')
    .attr('class', 'scheme-anatomy__svg')
    .attr('role', 'img');

  function renderControls() {
    const info = infoOf();
    const mem = memory[state.type];
    select.replaceChildren(...infos[state.type].map((p) =>
      h('option', { value: p.id, selected: p.id === mem.id }, p.label)));
    select.value = mem.id;
    slider.min = String(info.classCounts[0]);
    slider.max = String(info.classCounts.at(-1));
    slider.value = String(mem.n);
    output.textContent = String(mem.n);
  }

  function renderChart() {
    const { id, n } = memory[state.type];
    const info = infoOf();
    const colors = palettes.get(id, n);
    const shown = state.gray ? colors.map(color.toGray) : colors;
    const L = colors.map(color.lightness);
    const width = drawnWidth;
    const bw = (width - LEFT - RIGHT) / n;
    const cx = (i) => LEFT + (i + 0.5) * bw;
    const y = d3.scaleLinear().domain([0, 1]).range([AXIS_BOTTOM, PLOT_TOP]);

    const shape = classifyShape(L);
    svg.attr('viewBox', `0 0 ${width} ${HEIGHT}`)
      .attr('aria-label', `${info.label}（${n}色）の色見本と、各色の明度を結んだ折れ線グラフ。` +
        `明度（%）：${L.map((v) => Math.round(v * 100)).join('、')}`);
    svg.selectAll('*').remove();

    // 帯
    const band = svg.append('g').attr('class', 'scheme-anatomy__band');
    band.selectAll('rect').data(shown).join('rect')
      .attr('x', (_, i) => LEFT + i * bw)
      .attr('y', BAND_TOP)
      .attr('width', bw)
      .attr('height', BAND_H)
      .attr('fill', (c) => c)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1);
    svg.append('text').attr('class', 'scheme-anatomy__text')
      .attr('x', LEFT - 6).attr('y', BAND_TOP + BAND_H / 2 + 4).attr('text-anchor', 'end').text('色見本');

    // 縦軸（0・50・100%）と横の目盛り線
    const axis = svg.append('g').attr('class', 'scheme-anatomy__axis');
    for (const v of [0, 0.5, 1]) {
      axis.append('line').attr('x1', LEFT).attr('x2', width - RIGHT).attr('y1', y(v)).attr('y2', y(v))
        .attr('stroke', v === 0 ? '#8c8c8c' : '#d9d9d9').attr('stroke-width', 1);
      axis.append('text').attr('class', 'scheme-anatomy__tick')
        .attr('x', LEFT - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(`${Math.round(v * 100)}%`);
    }
    axis.append('text').attr('class', 'scheme-anatomy__text')
      .attr('x', LEFT - 6).attr('y', PLOT_TOP - 14).attr('text-anchor', 'end').text('明度');

    // 帯の各色の真下に点が来ることを示す縦のガイド
    const guides = svg.append('g').attr('class', 'scheme-anatomy__guides');
    guides.selectAll('line').data(L).join('line')
      .attr('x1', (_, i) => cx(i)).attr('x2', (_, i) => cx(i))
      .attr('y1', BAND_TOP + BAND_H).attr('y2', AXIS_BOTTOM)
      .attr('stroke', '#e6e6e6').attr('stroke-width', 1).attr('stroke-dasharray', '2 3');

    // 折れ線と点
    svg.append('path').attr('class', 'scheme-anatomy__line')
      .attr('fill', 'none').attr('stroke', '#8c8c8c').attr('stroke-width', 2)
      .attr('d', d3.line().x((_, i) => cx(i)).y((v) => y(v))(L));
    const dots = svg.append('g').attr('class', 'scheme-anatomy__dots');
    dots.selectAll('circle').data(L).join('circle')
      .attr('cx', (_, i) => cx(i)).attr('cy', (v) => y(v)).attr('r', 7)
      .attr('fill', (_, i) => shown[i]).attr('stroke', '#4d4d4d').attr('stroke-width', 1)
      .append('title').text((v, i) => `${i + 1}番目：明度 ${(v * 100).toFixed(1)}%`);

    // 横軸の見出しと、並び順の番号
    svg.append('g').selectAll('text').data(L).join('text')
      .attr('class', 'scheme-anatomy__tick')
      .attr('x', (_, i) => cx(i)).attr('y', AXIS_BOTTOM + 18).attr('text-anchor', 'middle')
      .text((_, i) => (bw >= 18 || i === 0 || i === n - 1 ? String(i + 1) : ''));
    svg.append('text').attr('class', 'scheme-anatomy__text')
      .attr('x', LEFT + (width - LEFT - RIGHT) / 2).attr('y', AXIS_BOTTOM + 36).attr('text-anchor', 'middle')
      .text('色の並び順');

    // 文
    shapeText.textContent = describeShape(state.type, shape);
    const safe = palettes.isColorblindSafe(id, n);
    const okabe = id === 'OkabeIto';
    const word = safe ? '見分けやすい' : '見分けにくい';
    const sentence = okabe
      ? '色覚に配慮して作られたパレットです'
      : safe
        ? 'この色の数では、色覚のタイプが違っても見分けやすいとされています'
        : 'この色の数では、見分けにくい色の組が含まれます';
    cvdText.replaceChildren(
      h('span', { class: `verdict verdict--${safe ? 'good' : 'caution'}` }, `${word}：${sentence}`),
      h('span', { class: 'scheme-anatomy__source' }, okabe ? '（出典：Okabe–Ito）' : '（出典：ColorBrewer の判定）'),
    );
  }

  function render() {
    renderControls();
    renderChart();
  }

  // --- イベント ---------------------------------------------------------
  const onSegment = (event) => {
    if (event.target.name !== groupName) return;
    state.type = event.target.value;
    render();
  };
  const onSelect = () => {
    const info = infos[state.type].find((p) => p.id === select.value);
    memory[state.type] = { id: info.id, n: clampCount(info, memory[state.type].n) };
    render();
  };
  const onSlider = () => {
    memory[state.type].n = Number(slider.value);
    output.textContent = slider.value;
    renderChart();
  };
  const onToggle = () => { state.gray = toggle.checked; renderChart(); };
  segment.addEventListener('change', onSegment);
  select.addEventListener('change', onSelect);
  slider.addEventListener('input', onSlider);
  toggle.addEventListener('change', onToggle);

  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        const width = viewWidth();
        if (width !== drawnWidth) { drawnWidth = width; renderChart(); }
      })
    : null;
  observer?.observe(svgHost);

  render();

  return {
    destroy() {
      observer?.disconnect();
      segment.removeEventListener('change', onSegment);
      select.removeEventListener('change', onSelect);
      slider.removeEventListener('input', onSlider);
      toggle.removeEventListener('change', onToggle);
      el.replaceChildren();
    },
  };
}
