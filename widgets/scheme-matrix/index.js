// 図「データ×スキーム対応表」：47都道府県のタイル地図を、データ3種 × スキーム3種の9通りで塗り分ける。
// 合う組み合わせと、合わない組み合わせで何が起きるかを、読者が自分の目で確かめる。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

const DATA = [
  { id: 'region', label: '地方区分' },
  { id: 'aged65', label: '65歳以上人口の割合' },
  { id: 'popChange', label: '人口増減率' },
];
const SCHEMES = [
  { id: 'qualitative', label: '定性的' },
  { id: 'sequential', label: '連続的' },
  { id: 'diverging', label: '分岐的' },
];
const VERDICT = {
  good: { mark: '○', word: '合う' },
  caution: { mark: '△', word: '条件つき' },
  bad: { mark: '×', word: '誤読を招く' },
};
const CLASSES = { aged65: { count: 5, decimals: 1 }, popChange: { count: 5, decimals: 2 } };
const DIVERGING_CLASSES = 7;
const NOTE = '出典：総務省統計局『人口推計（2024年10月1日現在）』をもとに加工して作成。人口増減率は2023年10月〜2024年9月の1年間。地方区分は一般的な八地方区分。';
/** ラベル（地図に重ねる県名）を置く側。秋田は西（日本海）側、東京は南側が空いている。 */
const CALLOUT_SIDE = { '05': 'left', '13': 'below' };
const DEFAULT_INFO = 'マスに触れると、県名と値が出ます。キーボードは、地図に入って矢印キーで動かします。';

/**
 * @param {HTMLElement} el マウント点
 * @param {{ d3: object, color: object, palettes: object, prefectures: object, tilemap: object }} deps
 */
export async function mount(el, { palettes, prefectures, tilemap }) {
  const response = await fetch(new URL('./verdicts.json', import.meta.url));
  if (!response.ok) throw new Error(`判定データを読み込めません（${response.status}）`);
  const verdicts = await response.json();
  const verdictOf = (data, scheme) => verdicts.find((v) => v.data === data && v.scheme === scheme);

  const list = prefectures.prefectures;
  const regionIndex = new Map(prefectures.regions.map((r, i) => [r.id, i]));
  const regionName = new Map(prefectures.regions.map((r) => [r.id, r.name]));
  const prefByCode = new Map(list.map((p) => [p.code, p]));
  const domainOf = (key) => {
    const values = list.map((p) => p[key]);
    return [Math.min(...values), Math.max(...values)];
  };

  const state = { data: 'region', scheme: 'qualitative', active: null };

  /** 値の文字列（地方名、または「39.5%」「-1.87%」「+0.01%」）。 */
  function valueText(pref, data) {
    if (data === 'region') return regionName.get(pref.region);
    const { decimals } = CLASSES[data];
    const v = pref[data];
    return `${data === 'popChange' && v > 0 ? '+' : ''}${v.toFixed(decimals)}%`;
  }

  /** いまの組み合わせの塗り方と凡例。 */
  function coloring(data, scheme) {
    const id = palettes.DEFAULTS[scheme];
    if (data === 'region') {
      const colors = palettes.get(id, prefectures.regions.length);
      return {
        fill: (p) => colors[regionIndex.get(p.region)],
        legend: prefectures.regions.map((r, i) => ({ color: colors[i], label: r.name })),
        callouts: [],
      };
    }
    const domain = domainOf(data);
    const { count, decimals } = CLASSES[data];
    let s;
    let centerIndex = -1;
    if (scheme === 'diverging') {
      const center = data === 'popChange' ? 0 : (domain[0] + domain[1]) / 2;
      s = palettes.scale(id, DIVERGING_CLASSES, domain, { center });
      if (data === 'popChange') centerIndex = Math.floor(DIVERGING_CLASSES / 2);
    } else {
      s = palettes.scale(id, count, domain);
    }
    const fmt = (v) => `${v < 0 ? '-' : ''}${Math.abs(v).toFixed(decimals)}%`;
    const last = s.colors.length - 1;
    const legend = s.colors.map((color, i) => {
      let label;
      if (i === 0) label = `${fmt(s.thresholds[0])}未満`;
      else if (i === last) label = `${fmt(s.thresholds[last - 1])}以上`;
      else label = `${fmt(s.thresholds[i - 1])}〜${fmt(s.thresholds[i])}`;
      return { color, label, hint: i === centerIndex ? 'ゼロ付近' : null };
    });
    return { fill: (p) => s.color(p[data]), legend, callouts: calloutPrefs(data, scheme, s, centerIndex) };
  }

  /**
   * 県名のラベルを出す県。スマホでは県名がマスに出ないので、読み取りの手がかりになる県だけに名前を添える。
   * - 人口増減率 × 分岐的：青の側の色になる県（1マスしかない）。
   * - 65歳以上人口の割合 × 連続的：最も濃い階級の最大値の県（秋田）と、最も淡い階級の最小値の県（東京）。
   */
  function calloutPrefs(data, scheme, s, centerIndex) {
    if (data === 'popChange' && scheme === 'diverging') {
      const blue = list.filter((p) => s.index(p[data]) > centerIndex);
      return blue.length <= 2 ? blue : [];
    }
    if (data === 'aged65' && scheme === 'sequential') {
      const top = list.reduce((a, b) => (b[data] > a[data] ? b : a));
      const bottom = list.reduce((a, b) => (b[data] < a[data] ? b : a));
      return [top, bottom];
    }
    return [];
  }

  // --- 操作部品 ---------------------------------------------------------
  const dataName = uid('scheme-matrix-data');
  const schemeName = uid('scheme-matrix-scheme');
  const radioGroup = (name, label, items, current) =>
    h('div', { class: 'scheme-matrix__field' }, [
      h('span', { class: 'scheme-matrix__field-label', id: `${name}-label` }, label),
      h('div', { class: 'ctl-segment', role: 'radiogroup', 'aria-labelledby': `${name}-label` },
        items.map((item) =>
          h('label', {}, [
            h('input', { type: 'radio', name, value: item.id, checked: item.id === current }),
            h('span', {}, item.label),
          ]))),
    ]);
  const dataGroup = radioGroup(dataName, 'データ', DATA, state.data);
  const schemeGroup = radioGroup(schemeName, 'スキーム', SCHEMES, state.scheme);

  // --- 9通りの一覧 ------------------------------------------------------
  const cells = new Map();
  const matrixBody = h('tbody', {}, DATA.map((d) =>
    h('tr', {}, [
      h('th', { scope: 'row' }, d.label),
      ...SCHEMES.map((s) => {
        const v = verdictOf(d.id, s.id);
        const { mark, word } = VERDICT[v.verdict];
        const button = h('button', {
          type: 'button',
          class: 'ctl-button scheme-matrix__cell',
          'data-data': d.id,
          'data-scheme': s.id,
          'aria-pressed': false,
        }, [
          h('span', { class: 'scheme-matrix__mark', 'aria-hidden': 'true' }, mark),
          h('span', { class: 'scheme-matrix__word' }, word),
        ]);
        button.setAttribute('aria-label', `${d.label}を${s.label}スキームで塗る：${word}`);
        cells.set(`${d.id}/${s.id}`, button);
        return h('td', {}, button);
      }),
    ])));
  const matrix = h('table', { class: 'scheme-matrix__table' }, [
    h('caption', { class: 'visually-hidden' }, '9通りの組み合わせの判定。押すとその組み合わせに切り替わります。'),
    h('thead', {}, h('tr', {}, [
      h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'データとスキーム')),
      ...SCHEMES.map((s) => h('th', { scope: 'col' }, s.label)),
    ])),
    matrixBody,
  ]);

  // --- 地図・凡例・判定 -------------------------------------------------
  const mapHost = h('div', { class: 'scheme-matrix__map' });
  const info = h('p', { class: 'scheme-matrix__info' });
  const legend = h('ul', { class: 'legend scheme-matrix__legend', 'aria-label': '凡例' });
  const verdictBox = h('div', { class: 'scheme-matrix__verdict', 'aria-live': 'polite', 'aria-atomic': 'true' });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, 'データ×スキーム対応表：組み合わせを試す'),
    h('div', { class: 'ctl scheme-matrix__ctl' }, [dataGroup, schemeGroup]),
    // 並びは、狭い幅の読む順（操作部品 → 9通りの一覧 → 判定と理由 → 地図 → 凡例）。広い幅では css で左右に分ける
    h('div', { class: 'scheme-matrix__body' }, [
      h('div', { class: 'scheme-matrix__matrix' }, matrix),
      verdictBox,
      h('div', { class: 'scheme-matrix__mapwrap' }, [mapHost, info, legend]),
    ]),
    h('p', { class: 'fig-note' }, NOTE),
  );

  // --- 地図 -------------------------------------------------------------
  // マスの操作（ホバー、タップ、矢印キー、フォーカスの枠）は tilemap.render の onActive に任せる。
  // 選んでいるマスには、tilemap の印（mark）を付ける。
  let paint = coloring(state.data, state.scheme);
  const tileLabel = (pref) => `${pref.name}：${valueText(pref, state.data)}`;
  const map = tilemap.render(mapHost, {
    prefectures,
    fill: paint.fill,
    labels: 'auto',
    ariaLabel: '都道府県を1県1マスで並べたタイル地図。選んだデータとスキームで塗り分けています。',
    tileLabel,
    onActive: (pref) => {
      state.active = pref ? pref.code : null;
      renderActive();
    },
  });

  function renderActive() {
    const pref = state.active ? prefByCode.get(state.active) : null;
    map.mark(pref ? [pref.code] : []);
    if (pref) info.replaceChildren(h('strong', {}, pref.name), `：${valueText(pref, state.data)}`);
    else info.replaceChildren(DEFAULT_INFO);
  }

  // --- 描画 -------------------------------------------------------------
  function render() {
    const { data, scheme } = state;
    paint = coloring(data, scheme);
    map.update({ fill: paint.fill, tileLabel });
    map.callouts(paint.callouts.map((pref) => ({ code: pref.code, text: pref.short, side: CALLOUT_SIDE[pref.code] ?? 'below' })));
    renderActive();

    legend.replaceChildren(...paint.legend.map((item) =>
      h('li', {}, [
        h('span', { class: 'swatch', style: { '--swatch': item.color } }),
        h('span', {}, item.hint ? `${item.label}（${item.hint}）` : item.label),
      ])));

    for (const [key, button] of cells) button.setAttribute('aria-pressed', String(key === `${data}/${scheme}`));
    for (const input of el.querySelectorAll('input[type="radio"]')) {
      input.checked = input.value === (input.name === dataName ? data : scheme);
    }

    // aria-live の領域は、組み合わせが変わったときだけ書き換える（同じ組み合わせを押し直しても読み上げない）
    const key = `${data}/${scheme}`;
    if (key === shownVerdict) return;
    shownVerdict = key;
    const v = verdictOf(data, scheme);
    const { word } = VERDICT[v.verdict];
    verdictBox.replaceChildren(
      h('p', { class: `verdict verdict--${v.verdict}` }, [h('span', {}, `${word}：${v.title}`)]),
      h('p', { class: 'scheme-matrix__reason' }, v.reason),
    );
  }
  let shownVerdict = null;

  // --- イベント ---------------------------------------------------------
  const onChange = (event) => {
    const input = event.target;
    if (input.name === dataName) state.data = input.value;
    else if (input.name === schemeName) state.scheme = input.value;
    else return;
    render();
  };
  const onCell = (event) => {
    const button = event.target.closest('.scheme-matrix__cell');
    if (!button) return;
    state.data = button.dataset.data;
    state.scheme = button.dataset.scheme;
    render();
  };
  el.addEventListener('change', onChange);
  matrix.addEventListener('click', onCell);

  render();

  return {
    destroy() {
      el.removeEventListener('change', onChange);
      matrix.removeEventListener('click', onCell);
      map.destroy();
      el.replaceChildren();
    },
  };
}
