// 導入図「同じデータなのに、見え方がちがう」。
// 65歳以上人口の割合を、同じ階級の区切りで 2 通りの配色（定性的な配色・連続的な配色）に塗り、タイル地図を並べて見比べる。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

const CLASS_COUNT = 5;
const DEFAULT_INFO = 'マスに触れると、県名と値が出ます。';
/** 答えのラベルを置く側。秋田県は西（日本海）側、東京都は南側が空いている。 */
const CALLOUT_SIDE = { '05': 'left', '13': 'below' };

const fmt = (value) => value.toFixed(1);

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

  // 2 つの地図は同じ区切り（domain と階級数が同じ）で塗る
  const schemes = [
    { key: 'a', title: '配色A', caption: '色の種類がばらばら', id: palettes.DEFAULTS.qualitative },
    { key: 'b', title: '配色B', caption: '濃いほど割合が高い', id: palettes.DEFAULTS.sequential },
  ].map((s) => ({ ...s, scale: palettes.scale(s.id, CLASS_COUNT, domain) }));

  // --- 組み立て ---------------------------------------------------------
  const infoId = uid('intro-compare-info');
  const info = h('p', { class: 'intro-compare__info', id: infoId }, DEFAULT_INFO);
  const answer = h('p', { class: 'intro-compare__answer', 'aria-live': 'polite' });
  const button = h('button', { class: 'ctl-button ctl-button--primary', type: 'button' }, '答えを見る');

  const panels = schemes.map((s) => {
    const mapHost = h('div', { class: 'intro-compare__map' });
    const legend = buildLegend(s.scale, domain, s.title);
    const panel = h('div', { class: 'intro-compare__panel', dataset: { scheme: s.key } }, [
      h('p', { class: 'fig-subtitle intro-compare__panel-title' }, [
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
    h('p', { class: 'intro-compare__question' }, '割合がいちばん高い都道府県と、いちばん低い都道府県は、どこでしょう。まず配色Aで探してみてください。'),
    h('div', { class: 'ctl' }, button),
    answer,
    h('p', { class: 'fig-note' }, '出典：総務省統計局『人口推計（2024年10月1日現在）』の65歳以上人口の割合をもとに加工して作成。'),
  );

  // --- 地図 -------------------------------------------------------------
  // マスの操作（ホバー、タップ、矢印キー、フォーカスの枠）は tilemap.render の onActive に任せる。
  const showActive = (pref) => {
    info.textContent = pref ? `${pref.name}：${pref.aged65}${unit}` : DEFAULT_INFO;
  };
  for (const p of panels) {
    p.handle = tilemap.render(p.mapHost, {
      prefectures,
      fill: (pref) => p.scale.color(pref.aged65),
      labels: 'auto',
      ariaLabel: `65歳以上人口の割合を、${p.title}（${p.caption}）で塗り分けたタイル地図`,
      initialCode: '01', // 最初に止まるのは北海道。答えの県（秋田県）に止まると、問いの答えがわかってしまう
      tileLabel: (pref) => `${pref.name} ${pref.aged65}${unit}`,
      onActive: showActive,
    });
  }

  // --- 答えを見る / もう一度 ---------------------------------------------
  let revealed = false;

  function setRevealed(next) {
    revealed = next;
    const answers = revealed ? [highest, lowest] : [];
    for (const p of panels) {
      p.handle.mark(answers.map((pref) => pref.code));
      p.handle.callouts(answers.map((pref) => ({ code: pref.code, text: pref.name, side: CALLOUT_SIDE[pref.code] ?? 'below' })));
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
      panels.forEach((p) => p.handle.destroy());
      el.replaceChildren();
    },
  };
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
