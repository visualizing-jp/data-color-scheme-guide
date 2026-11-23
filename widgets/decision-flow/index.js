// 図「判断フロー」：2つの問いに答えると、3種類のカラースキームのどれが合うかがわかる。
// 図の文字はすべて HTML の要素で組み、SVG は節どうしをつなぐ線を描くためだけに使う
// （文字が画面幅で縮まないようにするため）。広い幅では横に広がる木、狭い幅では縦に並ぶ木にする。
import { ensureStyle, el as h, uid } from '../../lib/dom.js';

const styleLink = ensureStyle(new URL('./style.css', import.meta.url));

/** 結論ごとの色見本（図の中のデータ）。 */
const RESULTS = {
  neg: {
    name: '定性的スキーム',
    colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854'],
    desc: '色相の違いで区別します。',
    example: '性別、都道府県名',
    care: '取り扱い注意（色だけに頼らず、ラベルや形も使う）',
    cond: '問い1が「いいえ」のとき：',
    sentence: '順序がないデータです。定性的スキームが合います。',
  },
  cont: {
    name: '連続的スキーム',
    colors: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
    desc: '明度を一方向に変えます。',
    example: '5段階評価、65歳以上人口の割合',
    care: '明るさで分けているので、このままでOK',
    cond: '問い2が「いいえ」のとき：',
    sentence: '順序があり、基準点を境にした増減はないデータです。連続的スキームが合います。',
  },
  div: {
    name: '分岐的スキーム',
    colors: ['#ca0020', '#f4a582', '#f7f7f7', '#92c5de', '#0571b0'],
    desc: '2つの色相を両端に置き、基準点を中央の淡い色にします。',
    example: '人口の増減率、前年との差',
    care: '2つの色相が、見分けにくい組み合わせ（赤と緑など）でなければOK',
    cond: '問い2が「はい」のとき：',
    sentence: '順序があり、基準点もあるデータです。分岐的スキームが合います。',
  },
};

const QUESTIONS = {
  q1: { label: '問い1', text: 'データに順序はありますか？' },
  q2: { label: '問い2', text: 'ゼロなどの基準点を境に、増加と減少がありますか？' },
};

const INITIAL_MESSAGE = '問いに答えると、ここに結論が表示されます。';
const RESET_MESSAGE = '選択を解除しました。問い1から答えてください。';

/** 節の置き場所。wide（広い幅）は格子の列と行、narrow（狭い幅）は木の深さ。 */
const NODES = [
  { id: 'start', col: 1, row: 1, depth: 0 },
  { id: 'q1', col: 2, row: 1, depth: 1 },
  { id: 'neg', col: 4, row: 1, depth: 2 },
  { id: 'q2', col: 3, row: 2, depth: 2 },
  { id: 'cont', col: 4, row: 2, depth: 3 },
  { id: 'div', col: 4, row: 3, depth: 3 },
];

/** 線：from → to、label は線の上に付ける語。 */
const EDGES = [
  { id: 'start-q1', from: 'start', to: 'q1' },
  { id: 'q1-neg', from: 'q1', to: 'neg', label: 'いいえ' },
  { id: 'q1-q2', from: 'q1', to: 'q2', label: 'はい' },
  { id: 'q2-cont', from: 'q2', to: 'cont', label: 'いいえ' },
  { id: 'q2-div', from: 'q2', to: 'div', label: 'はい' },
];

const WIDE_MIN = 760;     // この幅（図の内側）以上で、横に広がる木にする
const COLUMN_GAP = 56;    // 広い配置の列の間隔（線の上の語がちょうど収まる幅）
const INDENT = 28;        // 狭い配置の、深さ1段ぶんの字下げ
const ARROW = 9;

/**
 * 答えから、節と線の状態を決める。on：たどった道筋、off：たどらなかった部分、idle：まだ決まらない部分。
 * @param {{ q1: 'yes'|'no'|null, q2: 'yes'|'no'|null }} a
 */
function statesFor({ q1, q2 }) {
  const none = q1 === null;
  const conclusion = q1 === 'no' ? 'neg' : q1 === 'yes' && q2 === 'no' ? 'cont' : q1 === 'yes' && q2 === 'yes' ? 'div' : null;
  const pick = (on, off) => (on ? 'on' : off ? 'off' : 'idle');
  const q2Branch = (answer) => pick(q1 === 'yes' && q2 === answer, q1 === 'no' || (q2 !== null && q2 !== answer));
  const nodes = {
    start: pick(!none, false),
    q1: pick(!none, false),
    q2: pick(q1 === 'yes', q1 === 'no'),
    neg: pick(q1 === 'no', q1 === 'yes'),
    cont: q2Branch('no'),
    div: q2Branch('yes'),
  };
  const edges = {
    'start-q1': pick(!none, false),
    'q1-neg': pick(q1 === 'no', q1 === 'yes'),
    'q1-q2': pick(q1 === 'yes', q1 === 'no'),
    'q2-cont': q2Branch('no'),
    'q2-div': q2Branch('yes'),
  };
  let message;
  if (conclusion) message = RESULTS[conclusion].sentence;
  else if (q1 === 'yes') message = '順序があるデータです。続けて問い2に答えてください。';
  else message = INITIAL_MESSAGE;
  return { nodes, edges, message, conclusion };
}

/** スタイルシートの読み込みを待つ（最初の描画で、線の位置を正しい寸法から測るため）。 */
function styleReady(link) {
  if (!link || link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
  });
}

/**
 * @param {HTMLElement} el マウント点（<figure class="widget" data-widget="decision-flow">）
 * @param {{ d3: object }} deps
 * @returns {Promise<{ destroy(): void }>}
 */
export async function mount(el, { d3 }) {
  await styleReady(styleLink);

  const answers = { q1: null, q2: null };

  // --- 節の部品 ---------------------------------------------------------
  const radios = { q1: [], q2: [] };

  function questionNode(id) {
    const q = QUESTIONS[id];
    const textId = uid(`decision-flow-${id}`);
    const group = uid(`decision-flow-${id}-answer`);
    const inputs = [['yes', 'はい'], ['no', 'いいえ']].map(([value, label]) =>
      h('input', { type: 'radio', name: group, value, 'data-question': id }));
    radios[id] = inputs;
    const segment = h('div', { class: 'ctl-segment decision-flow__segment', role: 'radiogroup', 'aria-labelledby': textId },
      inputs.map((input, i) => h('label', {}, [input, h('span', {}, ['はい', 'いいえ'][i])])));
    return h('div', { class: 'decision-flow__node decision-flow__node--question', 'data-node': id }, [
      h('p', { class: 'decision-flow__tag' }, q.label),
      h('p', { class: 'decision-flow__text', id: textId }, q.text),
      segment,
    ]);
  }

  function resultNode(id) {
    const r = RESULTS[id];
    return h('div', { class: 'decision-flow__node decision-flow__node--result', 'data-node': id }, [
      h('p', { class: 'decision-flow__name' }, [h('span', { class: 'visually-hidden' }, r.cond), r.name]),
      h('div', { class: 'decision-flow__band', 'aria-hidden': true },
        r.colors.map((c) => h('span', { style: { '--swatch': c } }))),
      h('p', { class: 'decision-flow__desc' }, r.desc),
      h('dl', { class: 'decision-flow__facts' }, [
        h('dt', {}, '例'), h('dd', {}, r.example),
        h('dt', {}, '色覚への配慮'), h('dd', {}, r.care),
      ]),
    ]);
  }

  const nodeEls = {
    start: h('div', { class: 'decision-flow__node decision-flow__node--start', 'data-node': 'start' }, [
      h('p', { class: 'decision-flow__text' }, 'データを色で表したい'),
    ]),
    q1: questionNode('q1'),
    q2: questionNode('q2'),
    neg: resultNode('neg'),
    cont: resultNode('cont'),
    div: resultNode('div'),
  };
  for (const { id, col, row, depth } of NODES) {
    nodeEls[id].style.setProperty('--col', col);
    nodeEls[id].style.setProperty('--row', row);
    nodeEls[id].style.setProperty('--depth', depth);
  }

  const pills = Object.fromEntries(EDGES.filter((e) => e.label).map((e) =>
    [e.id, h('span', { class: 'decision-flow__pill', 'aria-hidden': true }, e.label)]));

  const svgHost = h('div', { class: 'decision-flow__lines', 'aria-hidden': true });
  const tree = h('div', { class: 'decision-flow__tree', role: 'group', 'aria-label': 'カラースキームを選ぶ手順' }, [
    svgHost,
    ...NODES.map((n) => nodeEls[n.id]),
    ...Object.values(pills),
  ]);

  const answerEl = h('p', { class: 'decision-flow__answer', 'aria-live': 'polite' }, INITIAL_MESSAGE);
  const resetButton = h('button', { type: 'button', class: 'decision-flow__reset' }, '最初から');

  el.replaceChildren(
    h('p', { class: 'fig-title' }, 'データを見て、スキームを選ぶ'),
    tree,
    answerEl,
    h('div', { class: 'ctl' }, resetButton),
    h('p', { class: 'fig-note' }, '選んだあとは、グレースケールと色覚シミュレーションで見え方を確かめましょう。'),
  );

  const svg = d3.select(svgHost).append('svg').attr('class', 'decision-flow__svg').attr('focusable', 'false');

  // --- 線の描画 ---------------------------------------------------------
  let wide = false;
  let edgeStates = {};

  /** 節の位置（tree の左上を原点にした px）。 */
  function box(id) {
    const base = tree.getBoundingClientRect();
    const r = nodeEls[id].getBoundingClientRect();
    return { left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top,
      midX: (r.left + r.right) / 2 - base.left, midY: (r.top + r.bottom) / 2 - base.top };
  }

  /** 線の経路。{ points: [[x, y], …]（最後が矢じりの先）, label: 語を置く位置 } */
  function route(edge) {
    const a = box(edge.from);
    const b = box(edge.to);
    if (wide) {
      const points = Math.abs(a.midY - b.midY) < 2
        ? [[a.right, a.midY], [b.left, b.midY]]
        : [[a.midX, a.bottom], [a.midX, b.midY], [b.left, b.midY]];
      return { points, label: { x: b.left - COLUMN_GAP / 2, y: b.midY, wide: true } };
    }
    const x = a.left + INDENT / 2;
    return { points: [[x, a.bottom], [x, b.midY], [b.left, b.midY]], label: { x: b.left, y: b.top, wide: false } };
  }

  function draw() {
    const width = Math.ceil(tree.clientWidth);
    const height = Math.ceil(tree.clientHeight);
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const routes = EDGES.map((edge) => ({ edge, ...route(edge) }));
    const paths = svg.selectAll('path.decision-flow__edge').data(routes, (d) => d.edge.id);
    paths.join('path')
      .attr('class', 'decision-flow__edge')
      .attr('data-state', (d) => edgeStates[d.edge.id] ?? 'idle')
      .attr('d', (d) => `M${d.points.slice(0, -1).map((p) => p.join(',')).join('L')}L${d.points.at(-1)[0] - ARROW + 1},${d.points.at(-1)[1]}`);
    const arrows = svg.selectAll('path.decision-flow__arrow').data(routes, (d) => d.edge.id);
    arrows.join('path')
      .attr('class', 'decision-flow__arrow')
      .attr('data-state', (d) => edgeStates[d.edge.id] ?? 'idle')
      .attr('d', (d) => {
        const [x, y] = d.points.at(-1);
        return `M${x},${y}L${x - ARROW},${y - ARROW * 0.6}L${x - ARROW},${y + ARROW * 0.6}Z`;
      });

    for (const { edge, label } of routes) {
      const pill = pills[edge.id];
      if (!pill) continue;
      pill.style.left = `${label.x}px`;
      pill.style.top = `${label.y}px`;
    }
  }

  function layout() {
    const next = tree.clientWidth >= WIDE_MIN;
    if (next !== wide || !tree.classList.contains(next ? 'is-wide' : 'is-narrow')) {
      wide = next;
      tree.classList.toggle('is-wide', wide);
      tree.classList.toggle('is-narrow', !wide);
    }
    draw();
  }

  // --- 状態の反映 -------------------------------------------------------
  function apply() {
    const s = statesFor(answers);
    edgeStates = s.edges;
    for (const [id, state] of Object.entries(s.nodes)) nodeEls[id].dataset.state = state;
    for (const [id, state] of Object.entries(s.edges)) if (pills[id]) pills[id].dataset.state = state;
    tree.dataset.conclusion = s.conclusion ?? '';
    const q2Locked = answers.q1 !== 'yes';
    for (const input of radios.q2) input.disabled = q2Locked;
    nodeEls.q2.toggleAttribute('data-locked', q2Locked);
    for (const id of ['q1', 'q2']) for (const input of radios[id]) input.checked = answers[id] === input.value;
    answerEl.textContent = s.message;
    draw();
  }

  const onChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.question) return;
    const id = input.dataset.question;
    if (answers[id] === input.value) return;
    answers[id] = input.value;
    if (id === 'q1') answers.q2 = null;   // 問い1を変えたら、問い2はやり直し（問い1が「いいえ」なら問い2は操作できない）
    apply();
  };
  const onReset = () => {
    answers.q1 = null;
    answers.q2 = null;
    apply();
    answerEl.textContent = RESET_MESSAGE;
  };
  tree.addEventListener('change', onChange);
  resetButton.addEventListener('click', onReset);

  // 表示幅（配置の切り替え）や文字の折り返しが変わったら、線を引き直す
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  observer?.observe(tree);

  tree.classList.add('is-narrow');
  layout();
  apply();
  document.fonts?.ready.then(() => { if (el.isConnected) layout(); });

  return {
    destroy() {
      observer?.disconnect();
      tree.removeEventListener('change', onChange);
      resetButton.removeEventListener('click', onReset);
      el.replaceChildren();
    },
  };
}
