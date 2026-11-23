// 図「錐体エクスプローラ」（第1章）。
// 第1部：波長を動かして、L・M・S の3種類の錐体の反応量を見る。
// 第2部：黄色の単色光と、緑＋赤の混合光で、錐体の反応量が同じになる（＝同じ色に見える）ことを確かめる。
// データ（cones.json）は Stockman & Sharpe (2000) の2°錐体分光感度と CIE 1931 等色関数を 390〜700nm・5nm刻みで持つ。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

const CONES = ['L', 'M', 'S'];
const WL_MIN = 390;
const WL_MAX = 700;

// 第2部の光（波長 nm）と初期値
const YELLOW = 580;
const GREEN = 550;
const RED = 630;
const GREEN_START = 0.2;
const GREEN_MATCH = 0.605;
const MATCH_TOLERANCE = 0.02; // L と M の差がどちらもこれ以下なら「同じ色に見える」
const BAR_MAX = 1.4;          // 第2部の横棒の目盛りの上限（緑 1 のとき L は 1.34）

/** 反応量のやさしい言い方。表示する小数2桁の値で判定する。 */
function amountWord(value) {
  const v = Math.round(value * 100) / 100;
  if (v < 0.05) return 'ほとんどなし';
  if (v < 0.35) return 'すこし';
  if (v < 0.7) return 'そこそこ';
  return 'たくさん';
}

/** XYZ（CIE 1931）→ 画面の近似色。負の成分を 0 に切り、最大成分を 1 にそろえ、sRGB のガンマをかける。 */
function xyzToHex([x, y, z]) {
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

/**
 * @param {HTMLElement} el マウント点（<figure class="widget" data-widget="cone-explorer">）
 * @param {{ d3: object }} deps
 * @returns {Promise<{ destroy(): void }>}
 */
export async function mount(el, { d3 }) {
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
  /** 各錐体の感度が最大になる波長（データから求める） */
  const peaks = Object.fromEntries(CONES.map((c) => {
    let best = 0;
    data[c].forEach((v, i) => { if (v > data[c][best]) best = i; });
    return [c, wls[best]];
  }));

  const state = { wl: 580, green: GREEN_START };

  // ---- 部品 --------------------------------------------------------------
  const wlId = uid('cone-explorer-wl');
  const wlOutput = h('output', { for: wlId });
  const wlSlider = h('input', { id: wlId, type: 'range', min: WL_MIN, max: WL_MAX, step: 5, value: state.wl });

  const greenId = uid('cone-explorer-green');
  const greenOutput = h('output', { for: greenId });
  const greenSlider = h('input', { id: greenId, type: 'range', min: 0, max: 1, step: 0.005, value: state.green });

  const plot = h('div', { class: 'cone-explorer__plot' });
  const lightSwatch = h('span', { class: 'swatch cone-explorer__light-swatch' });
  const lightWl = h('span', { class: 'cone-explorer__light-wl' });

  // 第1部の横棒（L・M・S）
  const bars1 = Object.fromEntries(CONES.map((c) => {
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

  // 第2部の横棒（錐体ごとに、黄色の光が上、混合光が下）
  const bars2 = {};
  const compareRows = [];
  for (const c of CONES) {
    bars2[c] = {};
    for (const kind of ['yellow', 'mix']) {
      const fill = h('div', { class: 'cone-explorer__fill' });
      const value = h('span', { class: 'cone-explorer__value' });
      bars2[c][kind] = { fill, value };
      compareRows.push(h('div', {
        class: `cone-explorer__bar cone-explorer__bar--${c} cone-explorer__bar--${kind}`,
        dataset: { cone: c, light: kind },
      }, [
        h('span', { class: 'cone-explorer__cone' }, kind === 'yellow' ? c : ''),
        h('div', { class: 'cone-explorer__track cone-explorer__track--scaled', 'aria-hidden': 'true' }, fill),
        value,
      ]));
    }
  }
  const axis = h('div', { class: 'cone-explorer__axis', 'aria-hidden': 'true' },
    [0, 0.5, 1].map((t) => h('span', { style: { left: `${(t / BAR_MAX) * 100}%` } }, t === 0 ? '0' : t.toFixed(1))));

  const mixSwatch = h('span', { class: 'swatch cone-explorer__light-swatch' });
  const yellowSwatch = h('span', { class: 'swatch cone-explorer__light-swatch' });
  const diffText = h('p', { class: 'cone-explorer__diff' });
  const verdict = h('span');
  const btnMatch = h('button', { type: 'button', class: 'cone-explorer__btn' }, 'ぴったり合わせる');
  const btnReset = h('button', { type: 'button', class: 'cone-explorer__btn' }, '最初に戻す');

  const legendKey = (kind) => h('span', { class: `cone-explorer__key cone-explorer__key--${kind}`, 'aria-hidden': 'true' });

  el.replaceChildren(
    // 第1部
    h('h3', { class: 'fig-title' }, '波長を動かして、3種類の錐体の反応を見る'),
    h('p', { class: 'cone-explorer__lead' }, '光の波長を変えると、L・M・Sの錐体の反応量が変わります。'),
    h('div', { class: 'cone-explorer__top' }, [
      plot,
      h('div', { class: 'cone-explorer__light' }, [
        lightSwatch,
        h('p', { class: 'cone-explorer__light-text' }, [lightWl, 'この波長の光（画面での近似表示）']),
      ]),
    ]),
    h('p', { class: 'cone-explorer__hint' },
      'L・M・Sは、反応しやすい波長が長め（Long）・中くらい（Middle）・短め（Short）の錐体です。曲線の高さは各錐体の感度で、最大を1にそろえています。縦の細線は、その錐体の感度が最大になる波長です。'),
    h('div', { class: 'ctl' },
      h('div', { class: 'ctl-slider' }, [h('label', { for: wlId }, '波長'), wlSlider, wlOutput])),
    h('div', { class: 'cone-explorer__bars', role: 'group', 'aria-label': 'この波長の光に対する錐体の反応量' },
      CONES.map((c) => bars1[c].row)),

    // 第2部
    h('h3', { class: 'fig-title cone-explorer__part2' }, 'ちがう光でも、同じ色に見える'),
    h('p', { class: 'cone-explorer__lead' },
      '黄色の光（580nm）と、緑の光（550nm）＋赤い光（630nm）。成分は違いますが、混ぜ方しだいで錐体の反応量はほぼ同じになります。'),
    h('div', { class: 'cone-explorer__pair' }, [
      h('div', { class: 'cone-explorer__card' }, [
        yellowSwatch,
        h('div', {}, [
          h('p', { class: 'cone-explorer__card-title' }, '左：黄色の単色光'),
          h('p', { class: 'cone-explorer__card-text' }, '580nm、強さ 1'),
        ]),
      ]),
      h('div', { class: 'cone-explorer__card' }, [
        mixSwatch,
        h('div', {}, [
          h('p', { class: 'cone-explorer__card-title' }, '右：緑の光（550nm）＋赤い光（630nm）'),
          h('p', { class: 'cone-explorer__card-text' }, '赤い光の強さは 1 で固定'),
        ]),
      ]),
    ]),
    h('div', { class: 'ctl' },
      h('div', { class: 'ctl-slider' }, [h('label', { for: greenId }, '緑の光の強さ'), greenSlider, greenOutput])),
    h('ul', { class: 'legend' }, [
      h('li', {}, [legendKey('yellow'), '黄色の光（580nm）']),
      h('li', {}, [legendKey('mix'), '緑の光＋赤い光']),
    ]),
    h('div', { class: 'cone-explorer__bars cone-explorer__compare', role: 'group', 'aria-label': '黄色の光と混合光の、錐体の反応量の比較' },
      [...compareRows, axis]),
    diffText,
    h('p', { class: 'cone-explorer__status', role: 'status' }, verdict),
    h('div', { class: 'ctl' }, [btnMatch, btnReset]),
    h('p', { class: 'fig-note' },
      '錐体の感度は Stockman & Sharpe (2000) の2°錐体分光感度（エネルギー基準、各錐体の最大値を1に正規化）によります。画面では、単色光の色を完全には再現できません。色見本は近似です。'),
  );

  // ---- 第1部の曲線（SVG）---------------------------------------------------
  const PAD = { top: 26, right: 14, bottom: 46, left: 14 };
  const viewWidth = () => {
    const width = plot.clientWidth;
    return width > 0 ? Math.min(760, Math.max(240, Math.round(width))) : 600;
  };
  let drawnWidth = viewWidth();

  const gradId = uid('cone-explorer-band');
  const svg = d3.select(plot).append('svg')
    .attr('class', 'cone-explorer__svg')
    .attr('role', 'img')
    .attr('aria-label', 'スペクトルの帯の上に、L・M・Sの錐体の感度曲線を重ねた図。感度が最大になる波長はLが'
      + `${peaks.L}nm、Mが${peaks.M}nm、Sが${peaks.S}nmです。`);
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
    const anchors = { S: 'end', M: 'end', L: 'start' }; // 狭い幅でもラベルが重ならない向き
    for (const c of CONES) {
      const px = x(peaks[c]);
      peakG.append('line').attr('x1', px).attr('x2', px).attr('y1', PAD.top - 6).attr('y2', base);
      peakG.append('text').attr('x', px + (anchors[c] === 'start' ? 4 : -4)).attr('y', PAD.top - 10)
        .attr('text-anchor', anchors[c]).text(`${c} ${peaks[c]}nm`);
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
  const mixValue = (c, g) => g * at(c, GREEN) + at(c, RED);

  function renderLight() {
    wlOutput.textContent = `${state.wl}nm`;
    lightWl.textContent = `${state.wl}nm`;
    lightSwatch.style.setProperty('--swatch', data.bandColor[indexOf.get(state.wl)]);
    for (const c of CONES) {
      const v = at(c, state.wl);
      const b = bars1[c];
      b.fill.style.width = pct(v, 1);
      b.value.textContent = v.toFixed(2);
      b.word.textContent = amountWord(v);
      b.row.dataset.value = v.toFixed(4);
    }
    moveMarker();
  }

  function renderMix() {
    const g = state.green;
    greenOutput.textContent = g.toFixed(3);
    const diffs = {};
    for (const c of CONES) {
      const yv = at(c, YELLOW);
      const mv = mixValue(c, g);
      diffs[c] = Math.abs(mv - yv);
      bars2[c].yellow.fill.style.width = pct(yv, BAR_MAX);
      bars2[c].mix.fill.style.width = pct(mv, BAR_MAX);
      bars2[c].yellow.value.textContent = yv.toFixed(2);
      bars2[c].mix.value.textContent = mv.toFixed(2);
    }
    const mixXyz = xyzAt(GREEN).map((v, i) => g * v + xyzAt(RED)[i]);
    mixSwatch.style.setProperty('--swatch', xyzToHex(mixXyz));
    yellowSwatch.style.setProperty('--swatch', xyzToHex(xyzAt(YELLOW)));
    const same = diffs.L <= MATCH_TOLERANCE && diffs.M <= MATCH_TOLERANCE;
    verdict.className = `verdict verdict--${same ? 'good' : 'caution'}`;
    verdict.textContent = same ? '反応量がほぼ同じ → 同じ色に見えます' : 'まだ違います';
    diffText.textContent = `黄色の光との反応量の差：L ${diffs.L.toFixed(3)}、M ${diffs.M.toFixed(3)}（どちらも ${MATCH_TOLERANCE.toFixed(2)} 以下なら「ほぼ同じ」とみなします）`;
    diffText.dataset.diffL = diffs.L.toFixed(4);
    diffText.dataset.diffM = diffs.M.toFixed(4);
  }

  // ---- イベント ----------------------------------------------------------
  const onWl = () => { state.wl = Number(wlSlider.value); renderLight(); };
  const onGreen = () => { state.green = Number(greenSlider.value); renderMix(); };
  const setGreen = (value) => { state.green = value; greenSlider.value = String(value); renderMix(); };
  const onMatch = () => setGreen(GREEN_MATCH);
  const onReset = () => setGreen(GREEN_START);
  wlSlider.addEventListener('input', onWl);
  greenSlider.addEventListener('input', onGreen);
  btnMatch.addEventListener('click', onMatch);
  btnReset.addEventListener('click', onReset);

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
  renderMix();

  return {
    destroy() {
      observer?.disconnect();
      wlSlider.removeEventListener('input', onWl);
      greenSlider.removeEventListener('input', onGreen);
      btnMatch.removeEventListener('click', onMatch);
      btnReset.removeEventListener('click', onReset);
      el.replaceChildren();
    },
  };
}
