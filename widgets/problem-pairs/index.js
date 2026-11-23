// 図「見分けにくい色の組」：同じ明度の2色に明度の差をつけ、色覚の型ごとの見分けやすさがどう変わるかを確かめる。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

/** 見え方。強さは 100% で固定する。label は文中の呼び名、choice は選択肢の表示（関わる錐体つき）。 */
const VIEWS = [
  { id: 'normal', label: '通常', choice: '通常', type: null },
  { id: 'protan', label: 'P型', choice: 'P型（L錐体）', type: 'protan' },
  { id: 'deutan', label: 'D型', choice: 'D型（M錐体）', type: 'deutan' },
  { id: 'tritan', label: 'T型', choice: 'T型（S錐体）', type: 'tritan' },
];

const MAX_DIFF = 40; // 明度の差の上限（%）
const BAR_MAX = 0.4; // 横棒の満点にあたる色の差
const BAD_BELOW = 0.06; // 色の差がこれ未満：見分けにくい（色覚シミュレータと同じ、このページで決めた目安）
const CAUTION_BELOW = 0.12; // これ未満：やや見分けにくい
const LIVE_DELAY = 300; // スライダーを止めてから、数値と判定の文を書き換えるまでの待ち時間（ミリ秒）

/** 色の差（OKLab 上の距離）から判定を決める。 */
function judge(delta) {
  if (delta < BAD_BELOW) return { kind: 'bad', word: '見分けにくい' };
  if (delta < CAUTION_BELOW) return { kind: 'caution', word: 'やや見分けにくい' };
  return { kind: 'good', word: '見分けやすい' };
}

/**
 * @param {HTMLElement} el マウント点
 * @param {{ color: object }} deps
 * @returns {Promise<{ destroy(): void }>}
 */
export async function mount(el, { color }) {
  const response = await fetch(new URL('./pairs.json', import.meta.url));
  if (!response.ok) throw new Error(`pairs.json を読み込めませんでした（${response.status}）`);
  const pairs = await response.json();

  const state = { pairId: pairs[0].id, viewId: 'deutan', diff: 0, grayB: false };

  /**
   * 明度の差 d（%）をつけた2色 [色A, 色B] を返す。明るくする側（pair.lighter。既定は "a"）を +d/2、
   * もう一方を -d/2 する（色相と彩度はそのまま）。向きは、どの見え方でも差が縮まないものを組ごとに選んである。
   * grayB が真のときは、色Bを同じ明度のグレーに置き換える（明度の差はそのまま d）。
   */
  function makePair(pair, diff, grayB) {
    const shift = diff / 100 / 2;
    const upSign = pair.lighter === 'b' ? -1 : +1; // 色Aに掛ける符号
    const make = (hex, sign) => {
      const { l, c, h: hue } = color.hexToOklch(hex);
      return color.oklchToHex({ l: l + sign * shift, c, h: hue });
    };
    const colorA = make(pair.a, upSign);
    if (!grayB) return [colorA, make(pair.b, -upSign)];
    // 色Bを、色Aから明度の差 d だけ離れたグレー（d = 0 なら色Aと同じ明度のグレー）に置き換える。
    // 彩度 0 の色を作り、color.toGray で同じ明度のグレーにする。
    const grayLightness = color.lightness(colorA) - upSign * (diff / 100);
    return [colorA, color.toGray(color.oklchToHex({ l: grayLightness, c: 0, h: 0 }))];
  }

  /** 2色が、ある見え方でどう見えるか。 */
  function seen(colors, view) {
    return view.type ? colors.map((hex) => color.simulateCvd(hex, view.type, 1)) : colors;
  }

  // --- 操作部品 ---------------------------------------------------------
  const pairGroup = uid('problem-pairs-pair');
  const viewGroup = uid('problem-pairs-view');
  const pairLabelId = uid('problem-pairs-pair-label');
  const viewLabelId = uid('problem-pairs-view-label');
  const sliderId = uid('problem-pairs-diff');

  const segment = (name, labelId, items, checkedId) =>
    h('div', { class: 'ctl-segment', role: 'radiogroup', 'aria-labelledby': labelId },
      items.map(({ id, label }) =>
        h('label', {}, [
          h('input', { type: 'radio', name, value: id, checked: id === checkedId }),
          h('span', {}, label),
        ])));

  const pairSegment = segment(pairGroup, pairLabelId, pairs, state.pairId);
  const viewSegment = segment(viewGroup, viewLabelId, VIEWS.map((v) => ({ id: v.id, label: v.choice })), state.viewId);

  const output = h('output', { for: sliderId }, '0%');
  const slider = h('input', { id: sliderId, type: 'range', min: 0, max: MAX_DIFF, step: 1, value: state.diff });
  const resetButton = h('button', { type: 'button', class: 'ctl-button' }, '明度の差をなくす');
  const grayToggle = h('input', { type: 'checkbox' });

  // --- 表示領域 ---------------------------------------------------------
  const panelTitles = [h('span'), h('span'), h('span')];
  const panelSwatches = [0, 1, 2].map(() => h('div', { class: 'problem-pairs__pair', role: 'img' }, [
    h('span', { class: 'problem-pairs__half' }),
    h('span', { class: 'problem-pairs__half' }),
  ]));
  const panelNotes = [h('span'), h('span'), h('span')];
  const panels = [0, 1, 2].map((i) => h('figure', { class: 'problem-pairs__panel' }, [
    h('figcaption', { class: 'problem-pairs__caption' }, panelTitles[i]),
    panelSwatches[i],
    h('p', { class: 'problem-pairs__panel-note' }, panelNotes[i]),
  ]));
  const panelBox = h('div', { class: 'problem-pairs__panels' }, panels);

  const verdictBox = h('p', { class: 'problem-pairs__result', 'aria-live': 'polite', 'aria-atomic': 'true' });

  const rows = VIEWS.map((view) => {
    const fill = h('span', { class: 'problem-pairs__fill' });
    const value = h('span', { class: 'problem-pairs__value' });
    const word = h('span', { class: 'problem-pairs__word' });
    const item = h('li', { class: 'problem-pairs__row' }, [
      h('span', { class: 'problem-pairs__row-label' }, view.label),
      h('span', { class: 'problem-pairs__bar', 'aria-hidden': 'true' }, [
        fill,
        h('span', { class: 'problem-pairs__tick', style: { left: `${(BAD_BELOW / BAR_MAX) * 100}%` } }),
        h('span', { class: 'problem-pairs__tick', style: { left: `${(CAUTION_BELOW / BAR_MAX) * 100}%` } }),
      ]),
      value,
      word,
    ]);
    return { view, item, fill, value, word };
  });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, '見分けにくい色の組：明度の差をつける'),
    h('div', { class: 'ctl' }, [
      h('div', { class: 'problem-pairs__field' }, [h('span', { id: pairLabelId, class: 'problem-pairs__label' }, '色の組'), pairSegment]),
      h('div', { class: 'problem-pairs__field' }, [h('span', { id: viewLabelId, class: 'problem-pairs__label' }, '見え方'), viewSegment]),
    ]),
    h('div', { class: 'ctl' }, [
      h('div', { class: 'ctl-slider' }, [h('label', { for: sliderId }, '明度の差'), slider, output]),
      resetButton,
      h('label', { class: 'ctl-toggle' }, [grayToggle, h('span', {}, '片方を同じ明度のグレーにする')]),
    ]),
    panelBox,
    verdictBox,
    h('p', { class: 'fig-subtitle problem-pairs__list-title' }, '4つの見え方での、2色の色の差'),
    h('div', { class: 'problem-pairs__axis problem-pairs__row', 'aria-hidden': 'true' }, [
      h('span'),
      h('span', { class: 'problem-pairs__axis-scale' }, [
        h('span', { class: 'problem-pairs__axis-label problem-pairs__axis-label--end', style: { left: `${(BAD_BELOW / BAR_MAX) * 100}%` } }, BAD_BELOW.toFixed(2)),
        h('span', { class: 'problem-pairs__axis-label', style: { left: `${(CAUTION_BELOW / BAR_MAX) * 100}%` } }, CAUTION_BELOW.toFixed(2)),
      ]),
    ]),
    h('ul', { class: 'problem-pairs__rows' }, rows.map((r) => r.item)),
    h('p', { class: 'problem-pairs__scale' }, `棒の細い線は、色の差が ${BAD_BELOW.toFixed(2)} と ${CAUTION_BELOW.toFixed(2)} の位置です。${BAD_BELOW.toFixed(2)} 未満が「見分けにくい」、${BAD_BELOW.toFixed(2)} 以上 ${CAUTION_BELOW.toFixed(2)} 未満が「やや見分けにくい」、${CAUTION_BELOW.toFixed(2)} 以上が「見分けやすい」です。`),
    h('p', { class: 'problem-pairs__scale' }, 'どちらを明るくするかで、効き方が変わることがあります。この図では、明度の差をつけたとき、どの見え方でも色の差が広がる向きを選んでいます。'),
    h('p', { class: 'fig-note' }, '色の組は Datawrapper の記事によります。シミュレーションは目安で、実際の見え方には個人差があります。色の差は OKLab 上の距離です。「見分けにくい」の基準は、このページで決めた目安です。T型の再現は、特に粗い近似です。'),
  );

  // --- 描画 -------------------------------------------------------------
  const pct = (l) => `${Math.round(l * 100)}%`;
  const fmt = (delta) => delta.toFixed(2);

  function paint(index, title, colors, noteText, labelText) {
    panelTitles[index].textContent = title;
    panelSwatches[index].setAttribute('aria-label', labelText);
    colors.forEach((hex, k) => panelSwatches[index].children[k].style.setProperty('--swatch', hex));
    panelNotes[index].textContent = noteText;
  }

  // aria-live の領域（数値と判定の文）は、文が変わったときだけ書き換える。
  // スライダーを動かしている間は、止まってから LIVE_DELAY ミリ秒後に書き換える。
  let liveTimer = null;
  let liveKey = '';
  function setVerdict(text, verdict, { defer }) {
    window.clearTimeout(liveTimer);
    liveTimer = null;
    const apply = () => {
      liveTimer = null;
      const key = `${text}|${verdict.word}`;
      if (key === liveKey) return;
      liveKey = key;
      verdictBox.replaceChildren(text, h('span', { class: `verdict verdict--${verdict.kind}` }, verdict.word));
    };
    if (defer) liveTimer = window.setTimeout(apply, LIVE_DELAY);
    else apply();
  }

  function render({ deferLive = false } = {}) {
    const pair = pairs.find((p) => p.id === state.pairId);
    const view = VIEWS.find((v) => v.id === state.viewId);
    const original = makePair(pair, state.diff, state.grayB);
    const [la, lb] = original.map((hex) => color.lightness(hex));
    output.textContent = `${state.diff}%`;

    // 3つの表示：もとの色／選んだ型の見え方／グレースケール
    const originalDelta = color.deltaE(...original);
    const gray = original.map((hex) => color.toGray(hex));
    const grayDelta = color.deltaE(...gray);
    const simulated = view.type ? seen(original, view) : null;
    const simulatedDelta = simulated ? color.deltaE(...simulated) : null;

    const originalTitle = state.grayB ? 'もとの色（色Bを同じ明度のグレーに）' : 'もとの色';
    paint(0, originalTitle, original, `明度 ${pct(la)} と ${pct(lb)}。色の差 ${fmt(originalDelta)}`,
      `${originalTitle}の色見本。明度は左が${pct(la)}、右が${pct(lb)}。2色の色の差は${fmt(originalDelta)}`);
    if (simulated) {
      paint(1, `${view.label}の見え方`, simulated, `色の差 ${fmt(simulatedDelta)}`,
        `${view.label}の見え方の色見本。2色の色の差は${fmt(simulatedDelta)}`);
    }
    panels[1].hidden = !simulated;
    paint(2, 'グレースケール', gray, `色味を除いた明るさだけ。色の差 ${fmt(grayDelta)}`,
      `グレースケールの色見本。2色の色の差は${fmt(grayDelta)}`);
    panelBox.classList.toggle('problem-pairs__panels--two', !simulated);

    // 数値と判定（選んだ見え方）
    const chosenDelta = simulated ? simulatedDelta : originalDelta;
    const verdict = judge(chosenDelta);
    setVerdict(`${view.label}の見え方での2色の色の差：${fmt(chosenDelta)}　`, verdict, { defer: deferLive });

    // 4つの見え方での差の一覧
    for (const { view: v, item, fill, value, word } of rows) {
      const delta = color.deltaE(...seen(original, v));
      const j = judge(delta);
      fill.style.width = `${Math.min(1, delta / BAR_MAX) * 100}%`;
      value.textContent = fmt(delta);
      word.textContent = j.word;
      item.classList.toggle('problem-pairs__row--selected', v.id === state.viewId);
      item.dataset.kind = j.kind;
    }
  }

  // --- イベント ---------------------------------------------------------
  const onPair = (event) => { if (event.target.name === pairGroup) { state.pairId = event.target.value; render(); } };
  const onView = (event) => { if (event.target.name === viewGroup) { state.viewId = event.target.value; render(); } };
  const onSlider = () => { state.diff = Number(slider.value); render({ deferLive: true }); };
  const onReset = () => { state.diff = 0; slider.value = '0'; render(); };
  const onGray = () => { state.grayB = grayToggle.checked; render(); };
  pairSegment.addEventListener('change', onPair);
  viewSegment.addEventListener('change', onView);
  slider.addEventListener('input', onSlider);
  resetButton.addEventListener('click', onReset);
  grayToggle.addEventListener('change', onGray);

  render();

  return {
    destroy() {
      pairSegment.removeEventListener('change', onPair);
      viewSegment.removeEventListener('change', onView);
      slider.removeEventListener('input', onSlider);
      resetButton.removeEventListener('click', onReset);
      grayToggle.removeEventListener('change', onGray);
      window.clearTimeout(liveTimer);
      el.replaceChildren();
    },
  };
}
