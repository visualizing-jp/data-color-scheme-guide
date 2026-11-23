// 図のひな形。widgets/_template/ をコピーして widgets/<名前>/ を作り、中身を差し替える。
// 約束：
//   - export する mount(el, deps) は { destroy() } を返す
//   - 自分の el の中だけを書き換える
//   - 専用スタイルは style.css に置き、クラス名は図の名前を接頭辞にする（ここでは .template__*）
//   - 操作部品は css/base.css の共通クラス（.ctl-slider / .ctl-segment / .ctl-toggle など）を使う
//   - ラベルと入力は uid() で作った ID で結び付ける
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

/**
 * @param {HTMLElement} el マウント点（<figure class="widget" data-widget="…">）
 * @param {{ d3: object, color: object, palettes: object, prefectures: object, tilemap: object }} deps
 * @returns {{ destroy(): void }}
 */
export function mount(el, { d3 }) {
  const state = { count: 5, shape: 'bar', showValues: true };

  // --- 操作部品 ---------------------------------------------------------
  const sliderId = uid('template-count');
  const output = h('output', { for: sliderId }, String(state.count));
  const slider = h('input', { id: sliderId, type: 'range', min: 1, max: 12, step: 1, value: state.count });

  const groupName = uid('template-shape');
  const segment = h('div', { class: 'ctl-segment', role: 'radiogroup', 'aria-label': '表示の形' },
    [['bar', '棒'], ['dot', '点']].map(([value, label]) =>
      h('label', {}, [
        h('input', { type: 'radio', name: groupName, value, checked: value === state.shape }),
        h('span', {}, label),
      ])));

  const toggle = h('input', { type: 'checkbox', checked: state.showValues });

  const verdict = h('span');
  const svgHost = h('div', { class: 'template__plot' });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, 'ひな形：数を変えると表示が変わる'),
    h('div', { class: 'ctl' }, [
      h('div', { class: 'ctl-slider' }, [h('label', { for: sliderId }, '個数'), slider, output]),
      segment,
      h('label', { class: 'ctl-toggle' }, [toggle, h('span', {}, '値を表示')]),
    ]),
    svgHost,
    h('ul', { class: 'legend' }, [
      h('li', {}, [h('span', { class: 'swatch', style: { '--swatch': '#333' } }), '大きい値']),
      h('li', {}, [h('span', { class: 'swatch', style: { '--swatch': '#bbb' } }), '小さい値']),
    ]),
    h('p', {}, verdict),
    h('p', { class: 'fig-note' }, 'この図は共通の操作部品の使い方を示すためのものです。色は使わず、グレーだけで描いています。'),
  );

  // --- 描画 -------------------------------------------------------------
  const svg = d3.select(svgHost).append('svg')
    .attr('class', 'template__svg')
    .attr('viewBox', '0 0 600 160')
    .attr('role', 'img')
    .attr('aria-label', 'グレーの濃さで値の大きさを表した、棒または点の並び');
  const gray = d3.scaleLinear().domain([0, 1]).range(['#bbb', '#333']);

  function render() {
    const n = state.count;
    const items = Array.from({ length: n }, (_, i) => ({ i, v: (i + 1) / n }));
    const band = d3.scaleBand().domain(items.map((d) => d.i)).range([20, 580]).padding(0.25);
    const bw = band.bandwidth();

    svg.selectAll('g.template__item')
      .data(items, (d) => d.i)
      .join((enter) => enter.append('g').attr('class', 'template__item'))
      .attr('transform', (d) => `translate(${band(d.i)},0)`)
      .each(function (d) {
        const g = d3.select(this);
        g.selectAll('*').remove();
        const fill = gray(d.v);
        if (state.shape === 'bar') {
          const height = 20 + d.v * 100;
          g.append('rect').attr('y', 130 - height).attr('width', bw).attr('height', height).attr('fill', fill);
        } else {
          g.append('circle').attr('cx', bw / 2).attr('cy', 70).attr('r', Math.min(bw / 2, 30)).attr('fill', fill);
        }
        if (state.showValues) {
          g.append('text').attr('class', 'template__value').attr('x', bw / 2).attr('y', 150)
            .attr('text-anchor', 'middle').text(String(d.i + 1));
        }
      });

    output.textContent = String(n);
    const [kind, mark] = n <= 8 ? ['good', '見やすい個数です'] : n <= 10 ? ['caution', 'やや多めです'] : ['bad', '多すぎます'];
    verdict.className = `verdict verdict--${kind}`;
    verdict.textContent = mark;
  }

  // --- イベント ---------------------------------------------------------
  const onSlider = () => { state.count = Number(slider.value); render(); };
  const onSegment = (event) => { if (event.target.name === groupName) { state.shape = event.target.value; render(); } };
  const onToggle = () => { state.showValues = toggle.checked; render(); };
  slider.addEventListener('input', onSlider);
  segment.addEventListener('change', onSegment);
  toggle.addEventListener('change', onToggle);

  render();

  return {
    destroy() {
      slider.removeEventListener('input', onSlider);
      segment.removeEventListener('change', onSegment);
      toggle.removeEventListener('change', onToggle);
      el.replaceChildren();
    },
  };
}
