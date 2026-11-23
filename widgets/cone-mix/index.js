// 図「光の混合」（第1章の2組目）。
// 黄色の単色光と、緑＋赤の混合光で、錐体の反応量が同じになる（＝同じ色に見える）ことを確かめる。
// 錐体のデータ（cones.json）と共通の計算は、「錐体エクスプローラ」（widgets/cone-explorer/）と共有している。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';
import { CONES, loadCones, xyzToHex } from '../cone-explorer/cone-math.js';

ensureStyle(new URL('./style.css', import.meta.url));

// 光（波長 nm）と初期値
const YELLOW = 580;
const GREEN = 550;
const RED = 630;
const GREEN_START = 0.2;
const GREEN_MATCH = 0.605;
const MATCH_TOLERANCE = 0.02; // L と M の差がどちらもこれ以下なら「同じ色に見える」
const BAR_MAX = 1.4;          // 横棒の目盛りの上限（緑 1 のとき L は 1.34）

/**
 * @param {HTMLElement} el マウント点（<figure class="widget" data-widget="cone-mix">）
 * @returns {Promise<{ destroy(): void }>}
 */
export async function mount(el) {
  const { at, xyzAt } = await loadCones();

  const state = { green: GREEN_START };

  // ---- 部品 --------------------------------------------------------------
  const greenId = uid('cone-mix-green');
  const greenOutput = h('output', { for: greenId });
  const greenSlider = h('input', { id: greenId, type: 'range', min: 0, max: 1, step: 0.005, value: state.green });

  // 横棒（錐体ごとに、黄色の光が上、混合光が下）
  const bars = {};
  const compareRows = [];
  for (const c of CONES) {
    bars[c] = {};
    for (const kind of ['yellow', 'mix']) {
      const fill = h('div', { class: 'cone-mix__fill' });
      const value = h('span', { class: 'cone-mix__value' });
      bars[c][kind] = { fill, value };
      compareRows.push(h('div', {
        class: `cone-mix__bar cone-mix__bar--${c} cone-mix__bar--${kind}`,
        dataset: { cone: c, light: kind },
      }, [
        h('span', { class: 'cone-mix__cone' }, kind === 'yellow' ? c : ''),
        h('div', { class: 'cone-mix__track', 'aria-hidden': 'true' }, fill),
        value,
      ]));
    }
  }
  const axis = h('div', { class: 'cone-mix__axis', 'aria-hidden': 'true' },
    [0, 0.5, 1].map((t) => h('span', { style: { left: `${(t / BAR_MAX) * 100}%` } }, t === 0 ? '0' : t.toFixed(1))));

  const mixSwatch = h('span', { class: 'swatch cone-mix__light-swatch' });
  const yellowSwatch = h('span', { class: 'swatch cone-mix__light-swatch' });
  const diffText = h('p', { class: 'cone-mix__diff' });
  const verdict = h('span');
  const btnMatch = h('button', { type: 'button', class: 'ctl-button ctl-button--primary' }, 'ぴったり合わせる');
  const btnReset = h('button', { type: 'button', class: 'ctl-button' }, '最初に戻す');

  const legendKey = (kind) => h('span', { class: `cone-mix__key cone-mix__key--${kind}`, 'aria-hidden': 'true' });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, '光の混合：ちがう光でも、同じ色に見える'),
    h('p', { class: 'cone-mix__lead' },
      '黄色の光（580nm）と、緑の光（550nm）＋赤い光（630nm）。成分は違いますが、混ぜ方しだいで錐体の反応量はほぼ同じになります。'),
    h('div', { class: 'cone-mix__pair' }, [
      h('div', { class: 'cone-mix__card' }, [
        yellowSwatch,
        h('div', {}, [
          h('p', { class: 'cone-mix__card-title' }, '左：黄色の単色光'),
          h('p', { class: 'cone-mix__card-text' }, '580nm、強さ 1'),
        ]),
      ]),
      h('div', { class: 'cone-mix__card' }, [
        mixSwatch,
        h('div', {}, [
          h('p', { class: 'cone-mix__card-title' }, '右：緑の光（550nm）＋赤い光（630nm）'),
          h('p', { class: 'cone-mix__card-text' }, '赤い光の強さは 1 で固定'),
        ]),
      ]),
    ]),
    h('div', { class: 'ctl' },
      h('div', { class: 'ctl-slider' }, [h('label', { for: greenId }, '緑の光の強さ'), greenSlider, greenOutput])),
    h('ul', { class: 'legend' }, [
      h('li', {}, [legendKey('yellow'), '黄色の光（580nm）']),
      h('li', {}, [legendKey('mix'), '緑の光＋赤い光']),
    ]),
    h('div', { class: 'cone-mix__bars', role: 'group', 'aria-label': '黄色の光と混合光の、錐体の反応量の比較' },
      [...compareRows, axis]),
    diffText,
    h('p', { class: 'cone-mix__status', role: 'status' }, verdict),
    h('div', { class: 'ctl' }, [btnMatch, btnReset]),
    h('p', { class: 'fig-note' },
      '錐体の感度は Stockman & Sharpe (2000) の2°視野の錐体分光感度によります。画面では、単色光の色を完全には再現できません。色見本は近似です。'),
  );

  // ---- 値の反映 ----------------------------------------------------------
  const pct = (v, max) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  const mixValue = (c, g) => g * at(c, GREEN) + at(c, RED);

  function render() {
    const g = state.green;
    greenOutput.textContent = g.toFixed(3);
    const diffs = {};
    for (const c of CONES) {
      const yv = at(c, YELLOW);
      const mv = mixValue(c, g);
      diffs[c] = Math.abs(mv - yv);
      bars[c].yellow.fill.style.width = pct(yv, BAR_MAX);
      bars[c].mix.fill.style.width = pct(mv, BAR_MAX);
      bars[c].yellow.value.textContent = yv.toFixed(2);
      bars[c].mix.value.textContent = mv.toFixed(2);
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
  const onGreen = () => { state.green = Number(greenSlider.value); render(); };
  const setGreen = (value) => { state.green = value; greenSlider.value = String(value); render(); };
  const onMatch = () => setGreen(GREEN_MATCH);
  const onReset = () => setGreen(GREEN_START);
  greenSlider.addEventListener('input', onGreen);
  btnMatch.addEventListener('click', onMatch);
  btnReset.addEventListener('click', onReset);

  render();

  return {
    destroy() {
      greenSlider.removeEventListener('input', onGreen);
      btnMatch.removeEventListener('click', onMatch);
      btnReset.removeEventListener('click', onReset);
      el.replaceChildren();
    },
  };
}
