// 図「色覚シミュレータ」：色覚のタイプと強さを切り替えて、3種類のカラースキームが
// どれだけ見分けにくくなるかを、色相環・スキームの帯・タイル地図で確かめる。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

/** 見え方の選択肢。label は文中での呼び名、cone は選択肢に添える、関わる錐体。 */
const TYPES = [
  { value: 'normal', label: '通常', cone: null },
  { value: 'protan', label: 'P型', cone: 'L錐体' },
  { value: 'deutan', label: 'D型', cone: 'M錐体' },
  { value: 'tritan', label: 'T型', cone: 'S錐体' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

/**
 * 「見分けにくい組」の基準。次の2つを両方満たす2色の組を数える。
 *   (a) シミュレーション後の色差（OKLab 上の距離）が THRESHOLD 未満
 *   (b) シミュレーション後の色差が、もとの色差の SHRINK 倍未満（見え方の違いで、差が大きく縮んだ）
 */
const THRESHOLD = 0.06;
const SHRINK = 0.6;
/** スライダーを止めてから、まとめの文を書き換えるまでの待ち時間（ミリ秒）。 */
const LIVE_DELAY = 300;
const HUE_STEP = 15;
const HUE_COUNT = 360 / HUE_STEP;

/**
 * @param {HTMLElement} el マウント点
 * @param {{ color: object, palettes: object, prefectures: object, tilemap: object }} deps
 * @returns {{ destroy(): void }}
 */
export function mount(el, { color, palettes, prefectures, tilemap }) {
  const D = palettes.DEFAULTS;
  const paletteLabel = (id) => palettes.list().find((p) => p.id === id)?.label ?? id;
  const paletteChoices = [D.qualitative, D.qualitativeSafe].map((id) => ({ id, label: paletteLabel(id) }));

  const state = { type: 'normal', severity: 100, palette: D.qualitative };

  // ---- 変わらない元データ ---------------------------------------------------
  const hueColors = Array.from({ length: HUE_COUNT }, (_, i) =>
    color.oklchToHex({ l: 0.7, c: 0.12, h: i * HUE_STEP }));
  const sequentialColors = palettes.get(D.sequential, 7);
  const divergingColors = palettes.get(D.diverging, 7);
  const regionIndex = new Map(prefectures.regions.map((r, i) => [r.id, i]));

  // ---- 操作部品 -------------------------------------------------------------
  const typeGroup = uid('cvd-simulator-type');
  const typeLabelId = uid('cvd-simulator-type-label');
  const typeSegment = h('div', { class: 'ctl-segment', role: 'radiogroup', 'aria-labelledby': typeLabelId },
    TYPES.map(({ value, label, cone }) => h('label', {}, [
      h('input', { type: 'radio', name: typeGroup, value, checked: value === state.type }),
      h('span', {}, cone ? [label, h('span', { class: 'cvd-simulator__cone' }, `（${cone}）`)] : label),
    ])));

  const sliderId = uid('cvd-simulator-severity');
  const sliderOutput = h('output', { for: sliderId }, `${state.severity}%`);
  const slider = h('input', { id: sliderId, type: 'range', min: 0, max: 100, step: 10, value: state.severity });
  const sliderBox = h('div', { class: 'ctl-slider cvd-simulator__slider' }, [
    h('label', { for: sliderId }, '強さ'), slider, sliderOutput,
  ]);

  const paletteGroup = uid('cvd-simulator-palette');
  const paletteLabelId = uid('cvd-simulator-palette-label');
  const paletteSegment = h('div', { class: 'ctl-segment', role: 'radiogroup', 'aria-labelledby': paletteLabelId },
    paletteChoices.map(({ id, label }) => h('label', {}, [
      h('input', { type: 'radio', name: paletteGroup, value: id, checked: id === state.palette }),
      h('span', {}, label),
    ])));

  const controls = h('div', { class: 'ctl cvd-simulator__ctl' }, [
    h('div', { class: 'cvd-simulator__field' }, [
      h('span', { id: typeLabelId, class: 'cvd-simulator__label' }, '見え方'), typeSegment,
    ]),
    sliderBox,
    h('div', { class: 'cvd-simulator__field' }, [
      h('span', { id: paletteLabelId, class: 'cvd-simulator__label' }, '定性的パレット'), paletteSegment,
    ]),
  ]);

  // ---- 表示の枠 -------------------------------------------------------------
  const hueOriginal = h('div');
  const hueSim = h('div');
  const schemeRows = ['qualitative', 'sequential', 'diverging'].map((id) => ({
    id,
    title: h('p', { class: 'cvd-simulator__scheme-title' }),
    original: h('div'),
    sim: h('div'),
    result: h('div', { class: 'cvd-simulator__result' }),
  }));
  const mapOriginal = h('div', { class: 'cvd-simulator__map' });
  const mapSim = h('div', { class: 'cvd-simulator__map' });
  const readout = () => ({
    swatch: h('span', { class: 'cvd-simulator__readout-sw', 'aria-hidden': 'true' }),
    text: h('span', { class: 'cvd-simulator__readout-text' }),
  });
  const readouts = { original: readout(), sim: readout() };
  const readoutBox = ({ swatch, text }) => h('p', { class: 'cvd-simulator__readout' }, [swatch, text]);
  const summary = h('p', { class: 'cvd-simulator__summary', 'aria-live': 'polite' });

  const strip = (caption, body) => h('div', { class: 'cvd-simulator__strip' }, [
    h('span', { class: 'cvd-simulator__cap' }, caption), body,
  ]);

  const root = h('div', { class: 'cvd-simulator' }, [
    h('p', { class: 'fig-title' }, '色覚シミュレータ：見え方のちがいを確かめる'),
    controls,
    h('div', { class: 'cvd-simulator__block' }, [
      h('p', { class: 'fig-subtitle cvd-simulator__block-title' }, '地方区分のタイル地図（選んでいる定性的パレットで塗り分け）'),
      h('div', { class: 'cvd-simulator__maps' }, [
        h('div', {}, [
          h('p', { class: 'cvd-simulator__cap cvd-simulator__map-cap' }, 'もとの色'), mapOriginal, readoutBox(readouts.original),
        ]),
        h('div', {}, [
          h('p', { class: 'cvd-simulator__cap cvd-simulator__map-cap' }, 'シミュレーション後の色'), mapSim, readoutBox(readouts.sim),
        ]),
      ]),
    ]),
    h('div', { class: 'cvd-simulator__block' }, [
      h('p', { class: 'fig-subtitle cvd-simulator__block-title' }, '3種類のカラースキーム（帯の下の数字は、左から数えた色の番号）'),
      ...schemeRows.map((row) => h('div', { class: 'cvd-simulator__scheme' }, [
        row.title,
        h('div', { class: 'cvd-simulator__scheme-body' }, [
          h('div', { class: 'cvd-simulator__scheme-bands' }, [
            strip('もとの色', row.original),
            strip('シミュレーション後の色', row.sim),
          ]),
          row.result,
        ]),
      ])),
    ]),
    h('div', { class: 'cvd-simulator__block' }, [
      h('p', { class: 'fig-subtitle cvd-simulator__block-title' }, '色相環（色相を15°ずつ、24色）'),
      strip('もとの色', hueOriginal),
      strip('シミュレーション後の色', hueSim),
    ]),
    summary,
    h('p', { class: 'fig-note' },
      'シミュレーションは Machado ほか（2009）の方法による目安です。実際の見え方には個人差があります。'
      + 'T型の再現は、もとの方法が想定していない部分を含むため、特に粗い近似です。'
      + '「見分けにくい組」は、シミュレーション後の色の差（OKLab 上の距離）が 0.06 未満で、もとの差の6割未満に縮んだ組です。'
      + '「見分けにくい組」の基準は、このページで決めた目安です。'),
  ]);
  el.replaceChildren(root);

  // ---- 計算 -----------------------------------------------------------------
  const simulate = (hex) => (state.type === 'normal'
    ? hex
    : color.simulateCvd(hex, state.type, state.severity / 100));

  /** 帯の中のすべての2色の組のうち、見分けにくい組（THRESHOLD と SHRINK の両方を満たすもの）。 */
  function hardPairs(colors) {
    const sim = colors.map(simulate);
    const pairs = [];
    for (let i = 0; i < sim.length; i += 1) {
      for (let j = i + 1; j < sim.length; j += 1) {
        const after = color.deltaE(sim[i], sim[j]);
        if (after < THRESHOLD && after < SHRINK * color.deltaE(colors[i], colors[j])) {
          pairs.push({ i, j, a: sim[i], b: sim[j] });
        }
      }
    }
    return pairs;
  }

  const conditionText = () => (state.type === 'normal'
    ? '通常の見え方'
    : `${TYPE_LABEL[state.type]}・強さ${state.severity}%`);

  // ---- 描画 -----------------------------------------------------------------
  /** 色の帯。numbered が真のとき、各色の下に番号（1、2、3…）を付ける。 */
  const band = (colors, label, { flush = false, numbered = false } = {}) => {
    const cells = colors.map((hex, i) => h('span', { class: 'cvd-simulator__cell', style: { '--c': hex } },
      numbered ? h('span', { class: 'cvd-simulator__num', 'aria-hidden': 'true' }, String(i + 1)) : null));
    return h('div', {
      class: `cvd-simulator__band${flush ? ' cvd-simulator__band--flush' : ''}${numbered ? ' cvd-simulator__band--numbered' : ''}`,
      role: 'img',
      'aria-label': label,
    }, cells);
  };
  const fillBand = (host, colors, label, options) => host.replaceChildren(band(colors, label, options));

  /** 見分けにくい1組：シミュレーション後の2色の色見本を並べ、帯の下の番号を添える。 */
  const pairItem = (p) => h('li', { class: 'cvd-simulator__pair', 'aria-label': `${p.i + 1}番目と${p.j + 1}番目の色` }, [
    h('span', { class: 'cvd-simulator__pair-sw', style: { '--c': p.a }, 'aria-hidden': 'true' }),
    h('span', { class: 'cvd-simulator__pair-sw', style: { '--c': p.b }, 'aria-hidden': 'true' }),
    h('span', { class: 'cvd-simulator__pair-num', 'aria-hidden': 'true' }, `${p.i + 1}と${p.j + 1}`),
  ]);

  const tileFill = (colors, simulated) => {
    const mapped = simulated ? colors.map(simulate) : colors;
    return (pref) => mapped[regionIndex.get(pref.region)];
  };
  const qualitativeColors = () => palettes.get(state.palette, 8);

  // マスに触れる・タップする・キーボードで移動すると、地方名と県名を地図の下に出す
  // （tilemap.render の onActive：その都道府県のオブジェクト、地図を離れたら null で呼ばれる）。
  const READOUT_IDLE = 'マスに触れる（タップする）と、地方名と県名が出ます';
  const active = { original: null, sim: null };
  const showReadout = (which) => {
    const pref = active[which];
    const { swatch, text } = readouts[which];
    if (!pref) {
      swatch.hidden = true;
      text.textContent = READOUT_IDLE;
      return;
    }
    const region = prefectures.regions.find((r) => r.id === pref.region)?.name ?? pref.region;
    swatch.hidden = false;
    swatch.style.setProperty('--c', tileFill(qualitativeColors(), which === 'sim')(pref));
    text.textContent = `${region}地方・${pref.name}`;
  };

  const maps = {
    original: tilemap.render(mapOriginal, {
      prefectures, fill: tileFill(qualitativeColors(), false), labels: 'auto',
      ariaLabel: '地方区分を定性的パレットで塗り分けたタイル地図（もとの色）',
      onActive(pref) { active.original = pref; showReadout('original'); },
    }),
    sim: tilemap.render(mapSim, {
      prefectures, fill: tileFill(qualitativeColors(), true), labels: 'auto',
      ariaLabel: '地方区分を定性的パレットで塗り分けたタイル地図（シミュレーション後の色）',
      onActive(pref) { active.sim = pref; showReadout('sim'); },
    }),
  };

  // aria-live の領域（まとめの文）は、文が変わったときだけ書き換える。
  // 強さのスライダーを動かしている間は、止まってから LIVE_DELAY ミリ秒後に書き換える。
  let liveTimer = null;
  let liveText = '';
  const setSummary = (text, { defer = false } = {}) => {
    window.clearTimeout(liveTimer);
    liveTimer = null;
    const apply = () => {
      liveTimer = null;
      if (text !== liveText) {
        liveText = text;
        summary.textContent = text;
      }
    };
    if (defer) liveTimer = window.setTimeout(apply, LIVE_DELAY);
    else apply();
  };

  function render({ deferLive = false } = {}) {
    // 操作部品の状態
    const normal = state.type === 'normal';
    slider.disabled = normal;
    sliderBox.classList.toggle('is-disabled', normal);
    sliderOutput.textContent = normal ? '―' : `${state.severity}%`;

    // 色相環
    fillBand(hueOriginal, hueColors, '色相環の24色（もとの色）', { flush: true });
    fillBand(hueSim, hueColors.map(simulate), '色相環の24色（シミュレーション後の色）', { flush: true });

    // 3種類のスキーム
    const qualitative = qualitativeColors();
    const palettes3 = {
      qualitative: { name: '定性的', palette: paletteLabel(state.palette), colors: qualitative },
      sequential: { name: '連続的', palette: paletteLabel(D.sequential), colors: sequentialColors },
      diverging: { name: '分岐的', palette: paletteLabel(D.diverging), colors: divergingColors },
    };
    const counts = {};
    for (const row of schemeRows) {
      const s = palettes3[row.id];
      const pairs = hardPairs(s.colors);
      counts[row.id] = pairs.length;
      row.title.textContent = `${s.name}（${s.palette}、${s.colors.length}色）`;
      fillBand(row.original, s.colors, `${s.name}（${s.palette}）の${s.colors.length}色（もとの色）`, { numbered: true });
      fillBand(row.sim, s.colors.map(simulate), `${s.name}（${s.palette}）の${s.colors.length}色（シミュレーション後の色）`, { numbered: true });
      row.result.replaceChildren(...[
        h('p', { class: 'cvd-simulator__count' }, pairs.length === 0 ? '見分けにくい組はありません' : `見分けにくい組：${pairs.length}組`),
        pairs.length > 0 ? h('ul', { class: 'cvd-simulator__pairs', 'aria-label': 'シミュレーション後の色で見分けにくい2色の組（数字は、帯の下の色の番号）' }, pairs.map(pairItem)) : null,
      ].filter(Boolean));
    }

    // タイル地図
    maps.original.update({ fill: tileFill(qualitative, false) });
    maps.sim.update({ fill: tileFill(qualitative, true) });
    showReadout('original');
    showReadout('sim');

    // まとめの文
    const nameInSentence = (id) => (id === 'qualitative' ? `定性的パレット ${palettes3.qualitative.palette} ` : palettes3[id].name);
    const withPairs = schemeRows.filter((r) => counts[r.id] > 0).map((r) => r.id);
    const without = schemeRows.filter((r) => counts[r.id] === 0).map((r) => r.id);
    const sentences = [];
    if (withPairs.length === 0) {
      sentences.push(`${conditionText()}では、3種類のスキームのどれにも、見分けにくい組はありません。`);
    } else {
      sentences.push(`${conditionText()}では、${withPairs.map((id) => `${nameInSentence(id)}に見分けにくい組が${counts[id]}組`).join('、')}あります。`);
      if (without.length > 0) {
        sentences.push(`${without.map((id) => palettes3[id].name).join('と')}には、見分けにくい組はありません。`);
      }
    }
    setSummary(sentences.join(''), { defer: deferLive });
  }

  // ---- イベント -------------------------------------------------------------
  const onType = (event) => {
    if (event.target.name !== typeGroup) return;
    state.type = event.target.value;
    render();
  };
  const onPalette = (event) => {
    if (event.target.name !== paletteGroup) return;
    state.palette = event.target.value;
    render();
  };
  const onSlider = () => { state.severity = Number(slider.value); render({ deferLive: true }); };
  typeSegment.addEventListener('change', onType);
  paletteSegment.addEventListener('change', onPalette);
  slider.addEventListener('input', onSlider);

  render();

  return {
    destroy() {
      typeSegment.removeEventListener('change', onType);
      paletteSegment.removeEventListener('change', onPalette);
      slider.removeEventListener('input', onSlider);
      window.clearTimeout(liveTimer);
      maps.original.destroy();
      maps.sim.destroy();
      el.replaceChildren();
    },
  };
}
