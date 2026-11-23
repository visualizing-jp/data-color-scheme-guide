// 図「理解度クイズ」：データの説明文を読んで、合うカラースキームを3択から選ぶ5問。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

ensureStyle(new URL('./style.css', import.meta.url));

/** 選択肢（定性的・連続的・分岐的の順）。色見本の色は、この図の中のデータとして持つ。 */
const SCHEMES = [
  { id: 'qualitative', label: '定性的', colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854'] },
  { id: 'sequential', label: '連続的', colors: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'] },
  { id: 'diverging', label: '分岐的', colors: ['#ca0020', '#f4a582', '#f7f7f7', '#92c5de', '#0571b0'] },
];
const labelOf = (id) => SCHEMES.find((s) => s.id === id).label;

const FINAL_MESSAGES = [
  [5, 'どのデータにも、合うスキームを選べています。'],
  [3, 'あと一歩です。順序と基準点の2つの問いを思い出してください。'],
  [0, '第3章の図で、合わない組み合わせの見え方をもう一度確かめてみてください。'],
];

/**
 * @param {HTMLElement} el マウント点
 * @returns {Promise<{ destroy(): void }>}
 */
export async function mount(el) {
  const response = await fetch(new URL('./questions.json', import.meta.url));
  if (!response.ok) throw new Error(`questions.json を読み込めませんでした（${response.status}）`);
  const questions = await response.json();
  const total = questions.length;

  const state = { index: 0, score: 0, picked: null };

  const progress = h('p', { class: 'quiz__progress' });
  const body = h('div', { class: 'quiz__body' });
  // 結果の文はここに出す。aria-live の領域は最初から置いておく（あとから足すと読み上げられないことがある）
  const result = h('div', { class: 'quiz__result', 'aria-live': 'polite', 'aria-atomic': 'false' });
  const actions = h('div', { class: 'quiz__actions' });

  el.replaceChildren(
    h('p', { class: 'fig-title' }, '理解度クイズ：このデータに合うスキームは？'),
    progress,
    body,
    result,
    actions,
  );

  const swatchStrip = (colors) => h('span', { class: 'quiz__strip', 'aria-hidden': 'true' },
    colors.map((c) => h('span', { class: 'swatch', style: { '--swatch': c } })));

  function showQuestion(moveFocus = true) {
    const q = questions[state.index];
    state.picked = null;
    progress.textContent = `${state.index + 1}／${total}`;
    const promptId = uid('quiz-prompt');
    const prompt = h('p', { class: 'quiz__prompt', id: promptId, tabindex: '-1' }, q.prompt);
    const buttons = SCHEMES.map((s) => h('button', {
      type: 'button',
      class: 'quiz__choice',
      dataset: { scheme: s.id },
      onclick: () => choose(s.id),
    }, [
      h('span', { class: 'quiz__choice-name' }, s.label),
      swatchStrip(s.colors),
    ]));
    body.replaceChildren(
      prompt,
      h('ul', { class: 'quiz__choices', 'aria-labelledby': promptId },
        buttons.map((b) => h('li', {}, b))),
    );
    result.replaceChildren();
    actions.replaceChildren();
    if (moveFocus) prompt.focus({ preventScroll: true }); // 初回の表示では、ページの読み込み中にフォーカスを奪わない
  }

  function choose(schemeId) {
    if (state.picked) return;
    const q = questions[state.index];
    state.picked = schemeId;
    const correct = schemeId === q.answer;
    if (correct) state.score += 1;

    for (const button of body.querySelectorAll('.quiz__choice')) {
      const id = button.dataset.scheme;
      const tags = [];
      if (id === q.answer) tags.push('✓ 正解');
      if (id === schemeId) tags.push('▶ あなたの選択');
      button.classList.toggle('quiz__choice--correct', id === q.answer);
      button.classList.toggle('quiz__choice--chosen', id === schemeId);
      if (tags.length) button.append(h('span', { class: 'quiz__tags' }, tags.map((t) => h('span', {}, t))));
      button.disabled = true;
    }

    result.replaceChildren(...(correct
      ? [h('p', { class: 'verdict verdict--good' }, '合っています'), h('p', {}, q.explain)]
      : [
          h('p', { class: 'verdict verdict--bad' }, '合いません'),
          h('p', {}, q.whyNot[schemeId]),
          h('p', {}, `このデータに合うのは「${labelOf(q.answer)}」のスキームです。${q.explain}`),
        ]));

    const last = state.index === total - 1;
    const next = h('button', { type: 'button', class: 'ctl-button ctl-button--primary', onclick: last ? showFinal : advance },
      last ? '結果を見る' : '次の問題へ');
    actions.replaceChildren(next);
    next.focus({ preventScroll: true }); // 押したボタンは操作不能になるので、キーボードの位置を次へ送る
  }

  function advance() {
    state.index += 1;
    showQuestion();
  }

  function showFinal() {
    progress.textContent = `${total}／${total}`;
    const message = FINAL_MESSAGES.find(([min]) => state.score >= min)[1];
    const score = h('p', { class: 'quiz__score', tabindex: '-1' }, `${total}問中${state.score}問 正解`);
    body.replaceChildren();
    result.replaceChildren(score, h('p', {}, message));
    const again = h('button', { type: 'button', class: 'ctl-button', onclick: restart }, 'もう一度');
    actions.replaceChildren(again);
    again.focus({ preventScroll: true });
  }

  function restart() {
    state.index = 0;
    state.score = 0;
    showQuestion();
  }

  showQuestion(false);

  return {
    destroy() {
      el.replaceChildren();
    },
  };
}
