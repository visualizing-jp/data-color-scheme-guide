// 図のひな形。widgets/_template/ をコピーして widgets/<名前>/ を作り、中身を差し替える。
// 約束：
//   - export する mount(el, deps) は { destroy() } か、それを解決する Promise を返す。
//     自前のデータファイルを読む図は async function mount にして、最初の描画が終わってから解決する
//     （例：const data = await (await fetch(new URL('./data.json', import.meta.url))).json(); … 描画 … return { destroy }）。
//     読み込みや描画に失敗したら throw する（main.js が「図を表示できませんでした」を出す）
//   - 自分の el の中だけを書き換える
//   - 専用スタイルは style.css に置き、クラス名は図の名前を接頭辞にする（ここでは .template__*）
//   - 操作部品は css/base.css の共通クラス（.ctl-slider / .ctl-segment / .ctl-toggle など）を使う
//   - ラベルと入力は uid() で作った ID で結び付ける
//   - SVG には必ず viewBox を付ける。幅 390px の画面でも図の中の文字が 11px 以上で表示されるように、
//     viewBox の幅と文字サイズを決める。ここでは viewBox の幅を「表示幅」（240〜600）に合わせ、
//     1 ユーザー単位が 1 CSS px 前後になるようにしている（狭い画面で 600 の viewBox を縮めると、12px の文字が約 6.6px になる）。
//     他の方法：狭いときにレイアウトを切り替える、文字サイズを大きくする、など
//   - .verdict には、記号だけに頼らず、判定の語（「合う」「条件つき」「誤読を招く」など）を文字として入れる
//   - 動きの演出（transition など）は、matchMedia('(prefers-reduced-motion: reduce)').matches のときは行わない
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

/**
 * @param {HTMLElement} el マウント点（<figure class="widget" data-widget="…">）
 * @param {{ d3: object, color: object, palettes: object, prefectures: object, tilemap: object }} deps
 * @returns {{ destroy(): void } | Promise<{ destroy(): void }>} 非同期にするなら async function にして、最初の描画のあとで解決する
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
  const HEIGHT = 160;
  /** viewBox の幅。表示幅に合わせる（240〜600）。測れないとき（非表示など）は 600。 */
  const viewWidth = () => {
    const width = svgHost.clientWidth;
    return width > 0 ? Math.min(600, Math.max(240, Math.round(width))) : 600;
  };
  let drawnWidth = viewWidth();

  const svg = d3.select(svgHost).append('svg')
    .attr('class', 'template__svg')
    .attr('role', 'img')
    .attr('aria-label', 'グレーの濃さで値の大きさを表した、棒または点の並び');
  const gray = d3.scaleLinear().domain([0, 1]).range(['#bbb', '#333']);

  function render() {
    const n = state.count;
    const width = drawnWidth;
    svg.attr('viewBox', `0 0 ${width} ${HEIGHT}`);
    const items = Array.from({ length: n }, (_, i) => ({ i, v: (i + 1) / n }));
    const band = d3.scaleBand().domain(items.map((d) => d.i)).range([20, width - 20]).padding(0.25);
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
    const [kind, word, note] = n <= 8 ? ['good', '合う', '見やすい個数です']
      : n <= 10 ? ['caution', '条件つき', 'やや多めです']
      : ['bad', '誤読を招く', '多すぎます'];
    verdict.className = `verdict verdict--${kind}`;
    verdict.textContent = `${word}：${note}`; // 記号（○△×）だけに頼らず、判定の語を文字で入れる
  }

  // --- イベント ---------------------------------------------------------
  const onSlider = () => { state.count = Number(slider.value); render(); };
  const onSegment = (event) => { if (event.target.name === groupName) { state.shape = event.target.value; render(); } };
  const onToggle = () => { state.showValues = toggle.checked; render(); };
  slider.addEventListener('input', onSlider);
  segment.addEventListener('change', onSegment);
  toggle.addEventListener('change', onToggle);

  // 表示幅が変わったら、viewBox の幅を測り直して描き直す
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        const width = viewWidth();
        if (width !== drawnWidth) { drawnWidth = width; render(); }
      })
    : null;
  observer?.observe(svgHost);

  render();

  return {
    destroy() {
      observer?.disconnect();
      slider.removeEventListener('input', onSlider);
      segment.removeEventListener('change', onSegment);
      toggle.removeEventListener('change', onToggle);
      el.replaceChildren();
    },
  };
}
