// 図「色の3つのつまみ」：色相・彩度・明度の3つで色を作り、グレースケールにすると明度だけが残ることを示す。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

const HUE_STEPS = Array.from({ length: 12 }, (_, i) => i * 30);
const LIGHT_STEPS = [0.95, 0.82, 0.69, 0.56, 0.43, 0.30, 0.17];
const pct = (l) => `${Math.round(l * 100)}%`;
const floor3 = (x) => Math.floor(x * 1000) / 1000;

const MSG_GRAY = '色相と彩度が消えて、明度だけが残りました。色相の帯は見分けられなくなり、明度の帯は順序が残っています。';
const MSG_INIT = '「グレースケールにする」を入れると、色相と彩度が消えて、明度だけが残ります。';
const MSG_COLOR = '色に戻しました。色相の帯は12色が見分けられ、明度の帯は順序があります。';
const MSG_OUT_OF_GAMUT = '画面で表示できない色相は、彩度を下げて表示しています。';

/**
 * @param {HTMLElement} el
 * @param {{ color: object }} deps
 */
export function mount(el, { color }) {
  // c は表示している彩度、wantC は読者が彩度のスライダーで選んだ値（希望の値）。c は wantC を、そのときの上限に収めたもの。
  const state = { h: 250, c: 0.12, wantC: 0.12, l: 0.6, gray: false };

  // --- 操作部品 ---------------------------------------------------------
  const hueId = uid('knobs-hue');
  const chromaId = uid('knobs-chroma');
  const lightId = uid('knobs-light');
  const hueOut = h('output', { for: hueId });
  const chromaOut = h('output', { for: chromaId });
  const lightOut = h('output', { for: lightId });
  const hueIn = h('input', { id: hueId, type: 'range', min: 0, max: 360, step: 1, value: state.h });
  const chromaIn = h('input', { id: chromaId, type: 'range', min: 0, max: 0.3, step: 0.001, value: state.c });
  const lightIn = h('input', { id: lightId, type: 'range', min: 0, max: 100, step: 1, value: Math.round(state.l * 100) });
  const grayIn = h('input', { type: 'checkbox' });

  // --- 表示部品 ---------------------------------------------------------
  const big = h('div', { class: 'three-knobs__big', role: 'img', 'aria-label': '' });
  const hexOut = h('dd', { class: 'three-knobs__hex' });
  const hueVal = h('dd');
  const chromaVal = h('dd');
  const lightVal = h('dd');

  const makeCells = (n) => Array.from({ length: n }, () => ({
    chip: h('span', { class: 'three-knobs__chip', 'aria-hidden': 'true' }),
    label: h('span', { class: 'three-knobs__label', 'aria-hidden': 'true' }),
    sr: h('span', { class: 'three-knobs__sr' }),
  }));
  const hueCells = makeCells(HUE_STEPS.length);
  const lightCells = makeCells(LIGHT_STEPS.length);
  const bandEl = (cls, label, cells) => h('ul', { class: `three-knobs__band ${cls}`, 'aria-label': label },
    cells.map((c) => h('li', { class: 'three-knobs__cell' }, [c.chip, c.label, c.sr])));
  const hueSpread = h('small');
  const hueNote = h('p', { class: 'three-knobs__comment three-knobs__note' });

  const yellowChip = h('span', { class: 'three-knobs__chip', role: 'img' });
  const blueChip = h('span', { class: 'three-knobs__chip', role: 'img' });
  const yellowText = h('p');
  const blueText = h('p');

  const status = h('p', { class: 'three-knobs__status', 'aria-live': 'polite' }, MSG_INIT);
  const limitNote = h('p', { class: 'fig-note' });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, '色の3つのつまみ：色相・彩度・明度で色を作る'),
    h('div', { class: 'ctl' }, [
      h('div', { class: 'ctl-slider' }, [h('label', { for: hueId }, '色相'), hueIn, hueOut]),
      h('div', { class: 'ctl-slider' }, [h('label', { for: chromaId }, '彩度'), chromaIn, chromaOut]),
      h('div', { class: 'ctl-slider' }, [h('label', { for: lightId }, '明度'), lightIn, lightOut]),
      h('label', { class: 'ctl-toggle' }, [grayIn, h('span', {}, 'グレースケールにする')]),
    ]),
    limitNote,
    h('div', { class: 'three-knobs__main' }, [
      big,
      h('dl', { class: 'three-knobs__values' }, [
        h('dt', {}, '色コード'), hexOut,
        h('dt', {}, '色相'), hueVal,
        h('dt', {}, '彩度'), chromaVal,
        h('dt', {}, '明度'), lightVal,
      ]),
    ]),
    h('div', { class: 'three-knobs__section' }, [
      h('p', { class: 'three-knobs__heading' }, '色相だけを変えた12色（色相環を帯に伸ばしたもの）'),
      bandEl('three-knobs__band--hue', '色相だけを変えた12色', hueCells),
      h('p', { class: 'three-knobs__comment' }, ['明度は同じ。どれが上、という順序はありません。', ' ', hueSpread]),
      hueNote,
    ]),
    h('div', { class: 'three-knobs__section' }, [
      h('p', { class: 'three-knobs__heading' }, '明度だけを変えた7色'),
      bandEl('three-knobs__band--light', '明度だけを変えた7色', lightCells),
      h('p', { class: 'three-knobs__comment' }, '明るい色から暗い色へ、順に並びます。'),
    ]),
    status,
    h('div', { class: 'three-knobs__aside' }, [
      h('p', { class: 'three-knobs__heading' }, 'パソコンの色選択にあるHSBの「明るさ」とのちがい'),
      h('div', { class: 'three-knobs__pair' }, [
        h('div', { class: 'three-knobs__item' }, [yellowChip, yellowText]),
        h('div', { class: 'three-knobs__item' }, [blueChip, blueText]),
      ]),
      h('p', { class: 'three-knobs__comment' },
        'HSBでは同じ「明るさ100%」でも、見た目の明るさ（明度）は大きく違います。この図は、見た目の明るさに近いOKLCHという方式で計算しています。'),
    ]),
  );

  // --- 描画 -------------------------------------------------------------
  const shown = (hex) => (state.gray ? color.toGray(hex) : hex);

  function setCell(cell, hex, label, sr) {
    const out = shown(hex);
    cell.chip.style.setProperty('--swatch', out);
    cell.label.textContent = label;
    cell.sr.textContent = `${sr}、${out}`;
  }

  function render() {
    // 彩度の上限は、明度と色相で決まる。上限が下がったら表示だけを上限に合わせ、上限が戻ったら希望の値に戻す。
    const max = floor3(color.maxChroma(state.l, state.h));
    chromaIn.max = String(max);
    state.c = Math.min(state.wantC, max);
    chromaIn.value = String(state.c);

    const hex = color.oklchToHex({ l: state.l, c: state.c, h: state.h });
    const out = shown(hex);
    big.style.setProperty('--swatch', out);
    big.setAttribute('aria-label', `選んだ色の見本。${out}`);
    hexOut.textContent = out;
    hueVal.textContent = state.gray ? '— （なし）' : `${state.h}°`;
    chromaVal.textContent = state.gray ? '0.000（なし）' : state.c.toFixed(3);
    lightVal.textContent = pct(color.lightness(hex));
    hueOut.textContent = `${state.h}°`;
    chromaOut.textContent = state.c.toFixed(3);
    limitNote.textContent = `画面で表示できる彩度の上限は、いまの色相と明度では ${max.toFixed(3)} です。`;
    lightOut.textContent = pct(state.l);
    chromaIn.setAttribute('aria-valuetext', `${state.c.toFixed(3)}、上限 ${max.toFixed(3)}`);

    const hueHexes = HUE_STEPS.map((hue, i) => {
      const hx = color.oklchToHex({ l: state.l, c: state.c, h: hue });
      setCell(hueCells[i], hx, `${hue}°`, `色相${hue}°`);
      return hx;
    });
    // 帯の下の一言：白・黒に固定される場合と、その色相では出せない彩度が自動で下がった場合
    const clamped = HUE_STEPS.some((hue) => color.maxChroma(state.l, hue) < state.c - 1e-9);
    if (state.l >= 1) hueNote.textContent = '明度が100%では、どの色相も白になります。';
    else if (state.l <= 0) hueNote.textContent = '明度が0%では、どの色相も黒になります。';
    else hueNote.textContent = clamped && !state.gray ? MSG_OUT_OF_GAMUT : '';
    hueNote.hidden = hueNote.textContent === '';
    const ls = hueHexes.map((hx) => color.lightness(shown(hx)));
    const spread = Math.max(...ls) - Math.min(...ls);
    hueSpread.textContent = `（12色の明度の差：${(spread * 100).toFixed(1)}%）`;

    LIGHT_STEPS.forEach((l, i) => {
      const hx = color.oklchToHex({ l, c: state.c, h: state.h });
      setCell(lightCells[i], hx, pct(l), `明度${pct(l)}`);
    });

    const ref = [['#ffff00', yellowChip, yellowText, '黄色'], ['#0000ff', blueChip, blueText, '青']];
    for (const [src, chip, text, name] of ref) {
      const o = shown(src);
      chip.style.setProperty('--swatch', o);
      chip.setAttribute('aria-label', `${name} ${o}`);
      text.replaceChildren(`${name} ${src}`, h('br'), 'HSBの明るさ（B）100%', h('br'), `明度 ${pct(color.lightness(src))}`);
    }
  }

  // --- イベント ---------------------------------------------------------
  const onHue = () => { state.h = Number(hueIn.value); render(); };
  const onChroma = () => { state.wantC = Number(chromaIn.value); render(); };
  const onLight = () => { state.l = Number(lightIn.value) / 100; render(); };
  const onGray = () => {
    state.gray = grayIn.checked;
    render();
    // aria-live の領域は、このトグルを切り替えたときだけ（文が変わるときだけ）書き換える
    const message = state.gray ? MSG_GRAY : MSG_COLOR;
    if (status.textContent !== message) status.textContent = message;
  };
  hueIn.addEventListener('input', onHue);
  chromaIn.addEventListener('input', onChroma);
  lightIn.addEventListener('input', onLight);
  grayIn.addEventListener('change', onGray);

  render();

  return {
    destroy() {
      hueIn.removeEventListener('input', onHue);
      chromaIn.removeEventListener('input', onChroma);
      lightIn.removeEventListener('input', onLight);
      grayIn.removeEventListener('change', onGray);
      el.replaceChildren();
    },
  };
}
