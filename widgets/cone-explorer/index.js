// 図「錐体エクスプローラ」（第1章の1組目）。
// 波長を動かして、L・M・S の3種類の錐体の反応量を見る。
// 同じ錐体のデータを使う「光の混合」（widgets/cone-mix/）とは、cone-math.js と cones.json を共有している。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';
import { CONES, loadCones } from './cone-math.js';

ensureStyle(new URL('./style.css', import.meta.url));

const WL_MIN = 390;
const WL_MAX = 700;

/** 反応量のやさしい言い方。表示する小数2桁の値で判定する。 */
function amountWord(value) {
  const v = Math.round(value * 100) / 100;
  if (v < 0.05) return 'ほとんどなし';
  if (v < 0.35) return 'すこし';
  if (v < 0.7) return 'そこそこ';
  return 'たくさん';
}

/**
 * @param {HTMLElement} el マウント点（<figure class="widget" data-widget="cone-explorer">）
 * @param {{ d3: object }} deps
 * @returns {Promise<{ destroy(): void }>}
 */
export async function mount(el, { d3 }) {
  const { data, wls, indexOf, at } = await loadCones();
  /** 各錐体の感度が最大になる波長（データから求める） */
  const peaks = Object.fromEntries(CONES.map((c) => {
    let best = 0;
    data[c].forEach((v, i) => { if (v > data[c][best]) best = i; });
    return [c, wls[best]];
  }));

  const state = { wl: 580 };

  // ---- 部品 --------------------------------------------------------------
  const wlId = uid('cone-explorer-wl');
  const wlOutput = h('output', { for: wlId });
  const wlSlider = h('input', { id: wlId, type: 'range', min: WL_MIN, max: WL_MAX, step: 5, value: state.wl });

  const plot = h('div', { class: 'cone-explorer__plot' });
  const lightSwatch = h('span', { class: 'swatch cone-explorer__light-swatch' });
  const lightWl = h('span', { class: 'cone-explorer__light-wl' });

  // 横棒（L・M・S）
  const bars = Object.fromEntries(CONES.map((c) => {
    const fill = h('div', { class: 'cone-explorer__fill' });
    const value = h('span', { class: 'cone-explorer__value' });
    const word = h('span', { class: 'cone-explorer__word' });
    const row = h('div', { class: `cone-explorer__bar cone-explorer__bar--${c}`, dataset: { cone: c } }, [
      h('span', { class: 'cone-explorer__cone' }, c),
      h('div', { class: 'cone-explorer__track', 'aria-hidden': 'true' }, fill),
      h('span', { class: 'cone-explorer__reading' }, [value, word]),
    ]);
    return [c, { row, fill, value, word }];
  }));

  el.replaceChildren(
    h('p', { class: 'fig-title' }, '錐体エクスプローラ：波長を動かして、3種類の錐体の反応を見る'),
    h('p', { class: 'cone-explorer__lead' }, '光の波長を変えると、L・M・Sの錐体の反応量が変わります。'),
    h('div', { class: 'cone-explorer__top' }, [
      plot,
      h('div', { class: 'cone-explorer__light' }, [
        lightSwatch,
        h('p', { class: 'cone-explorer__light-text' }, [lightWl, 'この波長の光（画面での近似表示）']),
      ]),
    ]),
    h('p', { class: 'cone-explorer__hint' },
      'L・M・Sは、反応しやすい波長が長め（Long）・中くらい（Medium）・短め（Short）の錐体です。曲線の高さは各錐体の感度で、最大を1にそろえています。縦の細線は、その錐体の感度が最大になる波長です。'),
    h('div', { class: 'ctl' },
      h('div', { class: 'ctl-slider' }, [h('label', { for: wlId }, '波長'), wlSlider, wlOutput])),
    h('div', { class: 'cone-explorer__bars', role: 'group', 'aria-label': 'この波長の光に対する錐体の反応量' },
      CONES.map((c) => bars[c].row)),
    h('p', { class: 'fig-note' },
      '錐体の感度は Stockman & Sharpe (2000) の2°視野の錐体分光感度（エネルギー基準、各錐体の最大値を1に正規化）によります。画面に出す波長の色見本は近似です。'),
  );

  // ---- 曲線（SVG）---------------------------------------------------
  const PAD = { top: 44, right: 14, bottom: 46, left: 14 };
  const viewWidth = () => {
    const width = plot.clientWidth;
    return width > 0 ? Math.min(760, Math.max(240, Math.round(width))) : 600;
  };
  let drawnWidth = viewWidth();

  const gradId = uid('cone-explorer-band');
  const svg = d3.select(plot).append('svg')
    .attr('class', 'cone-explorer__svg')
    .attr('role', 'img')
    .attr('aria-label', 'スペクトルの帯の上に、L・M・Sの錐体の感度曲線を重ねた図。感度が最大になる波長は、Lが'
      + `${peaks.L}nm付近、Mが${peaks.M}nm付近、Sが${peaks.S}nm付近です。`);
  const gBand = svg.append('g');
  const gCurves = svg.append('g');
  const gMarker = svg.append('g');

  function drawPlot() {
    const W = drawnWidth;
    const H = Math.round(Math.min(300, Math.max(210, W * 0.46)));
    const x = d3.scaleLinear().domain([WL_MIN, WL_MAX]).range([PAD.left, W - PAD.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - PAD.bottom, PAD.top]);
    const base = H - PAD.bottom;
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    gBand.selectAll('*').remove();
    const defs = gBand.append('defs');
    const grad = defs.append('linearGradient').attr('id', gradId).attr('x1', 0).attr('x2', 1).attr('y1', 0).attr('y2', 0);
    wls.forEach((w, i) => {
      grad.append('stop').attr('offset', `${((w - WL_MIN) / (WL_MAX - WL_MIN)) * 100}%`).attr('stop-color', data.bandColor[i]);
    });
    gBand.append('rect').attr('class', 'cone-explorer__band-bg')
      .attr('x', x(WL_MIN)).attr('y', PAD.top).attr('width', x(WL_MAX) - x(WL_MIN)).attr('height', base - PAD.top);
    gBand.append('rect').attr('class', 'cone-explorer__band')
      .attr('x', x(WL_MIN)).attr('y', PAD.top).attr('width', x(WL_MAX) - x(WL_MIN)).attr('height', base - PAD.top)
      .attr('fill', `url(#${gradId})`);

    // 横軸（波長）
    const axisG = gBand.append('g').attr('class', 'cone-explorer__xaxis');
    axisG.append('line').attr('x1', x(WL_MIN)).attr('x2', x(WL_MAX)).attr('y1', base).attr('y2', base);
    for (let t = 400; t <= 700; t += 50) {
      axisG.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', base).attr('y2', base + 5);
      axisG.append('text').attr('x', x(t)).attr('y', base + 19).attr('text-anchor', 'middle').text(t);
    }
    axisG.append('text').attr('class', 'cone-explorer__axis-title')
      .attr('x', (x(WL_MIN) + x(WL_MAX)) / 2).attr('y', base + 38).attr('text-anchor', 'middle').text('光の波長（nm）');

    // 感度が最大になる波長の縦線とラベル
    const peakG = gBand.append('g').attr('class', 'cone-explorer__peaks');
    // 狭い幅でもラベルが重ならず、左端で切れないように、S だけ1段上に置いて右向きにする
    const anchors = { S: 'start', M: 'end', L: 'start' };
    const labelY = { S: PAD.top - 28, M: PAD.top - 10, L: PAD.top - 10 };
    for (const c of CONES) {
      const px = x(peaks[c]);
      peakG.append('line').attr('x1', px).attr('x2', px).attr('y1', labelY[c] + 4).attr('y2', base);
      peakG.append('text').attr('x', px + (anchors[c] === 'start' ? 4 : -4)).attr('y', labelY[c])
        .attr('text-anchor', anchors[c]).text(`${c} ${peaks[c]}nm付近`);
    }

    // 感度曲線（グレーの濃淡と線種で区別）
    gCurves.selectAll('*').remove();
    const line = d3.line().x((d, i) => x(wls[i])).y((d) => y(d)).curve(d3.curveMonotoneX);
    for (const c of CONES) {
      gCurves.append('path').attr('class', 'cone-explorer__curve-casing').attr('d', line(data[c]));
      gCurves.append('path').attr('class', `cone-explorer__curve cone-explorer__curve--${c}`).attr('d', line(data[c]));
      // 文字ラベル：ピークより長波長側で、感度がおよそ 0.5 の位置の右に置く
      const pi = wls.indexOf(peaks[c]);
      let li = pi;
      for (let i = pi; i < wls.length; i += 1) {
        if (Math.abs(data[c][i] - 0.5) < Math.abs(data[c][li] - 0.5)) li = i;
      }
      gCurves.append('text').attr('class', 'cone-explorer__curve-label')
        .attr('x', x(wls[li]) + 7).attr('y', y(data[c][li])).attr('dy', '0.35em').text(c);
    }

    gMarker.selectAll('*').remove();
    gMarker.append('line').attr('class', 'cone-explorer__now').attr('y1', PAD.top - 4).attr('y2', base + 1);
    gMarker.append('path').attr('class', 'cone-explorer__now-head').attr('d', 'M0,0 L-6,9 L6,9 Z').attr('transform', `translate(0,${base + 1})`);
    for (const c of CONES) {
      gMarker.append('circle').attr('class', `cone-explorer__dot cone-explorer__dot--${c}`).attr('r', 4.5);
    }
    gMarker.datum({ x, y, base });
    moveMarker();
  }

  function moveMarker() {
    const info = gMarker.datum();
    if (!info) return;
    const { x, y, base } = info;
    const px = x(state.wl);
    gMarker.select('.cone-explorer__now').attr('x1', px).attr('x2', px);
    gMarker.select('.cone-explorer__now-head').attr('transform', `translate(${px},${base + 1})`);
    for (const c of CONES) {
      gMarker.select(`.cone-explorer__dot--${c}`).attr('cx', px).attr('cy', y(at(c, state.wl)));
    }
  }

  // ---- 値の反映 ----------------------------------------------------------
  const pct = (v, max) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;

  function renderLight() {
    wlOutput.textContent = `${state.wl}nm`;
    lightWl.textContent = `${state.wl}nm`;
    lightSwatch.style.setProperty('--swatch', data.bandColor[indexOf.get(state.wl)]);
    for (const c of CONES) {
      const v = at(c, state.wl);
      const b = bars[c];
      b.fill.style.width = pct(v, 1);
      b.value.textContent = v.toFixed(2);
      b.word.textContent = amountWord(v);
      b.row.dataset.value = v.toFixed(4);
    }
    moveMarker();
  }

  // ---- イベント ----------------------------------------------------------
  const onWl = () => { state.wl = Number(wlSlider.value); renderLight(); };
  wlSlider.addEventListener('input', onWl);

  // 表示幅が変わったら、viewBox の幅を測り直して描き直す
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        const width = viewWidth();
        if (width !== drawnWidth) { drawnWidth = width; drawPlot(); }
      })
    : null;
  observer?.observe(plot);

  drawPlot();
  renderLight();

  return {
    destroy() {
      observer?.disconnect();
      wlSlider.removeEventListener('input', onWl);
      el.replaceChildren();
    },
  };
}
