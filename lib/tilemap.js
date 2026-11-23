// 都道府県タイル地図（1県＝1マスの図）。
// 座標は data/prefectures.json の x, y（マス目の位置）を使う。
//   x：左（西）から数えた列番号、0〜12 の整数。y：上（北）から数えた行番号、0〜11 の整数。
//   グリッドの大きさは data の meta.grid（columns: 13, rows: 12）。同じ (x, y) を 2 つの都道府県が持つことはない。
// D3 には依存せず、DOM の API だけで SVG を描く。

const SVG_NS = 'http://www.w3.org/2000/svg';

/** viewBox 上の 1 マスぶんの間隔（マスの一辺 + 隙間）。 */
const PITCH = 40;
/** マスとマスの隙間。枠線は付けず、この隙間だけで区切る。 */
const GAP = 2;
/** 文字色に使う濃いグレーと白。 */
const DARK_TEXT = '#222222';
const LIGHT_TEXT = '#ffffff';
/** labels が 'auto' のとき、県名をこの px 未満で表示することになる場合は出さない。 */
const MIN_LABEL_PX = 11;
/** 県名の文字サイズ（マスの一辺に対する割合）。地図の主役は塗りの色なので、県名は控えめにする。 */
const FONT_RATIO = 0.25;
/** 県名の幅がマスの一辺に占めてよい割合の上限。 */
const MAX_TEXT_SPAN = 0.8;

/**
 * グリッド上の (x, y) から、viewBox 上のマスの位置と大きさを求める。
 * 隙間は各マスの周りに半分ずつ割り振るので、図の端にも半分の隙間が残る。
 * @param {number} x 列番号（左から 0）
 * @param {number} y 行番号（上から 0）
 * @returns {{ x: number, y: number, size: number }} マスの左上の座標と一辺の長さ
 */
export function tileRect(x, y) {
  return { x: x * PITCH + GAP / 2, y: y * PITCH + GAP / 2, size: PITCH - GAP };
}

/**
 * グリッドの大きさから viewBox の幅と高さを求める。
 * @param {number} columns 列の数
 * @param {number} rows 行の数
 * @returns {{ width: number, height: number }}
 */
export function viewBoxSize(columns, rows) {
  return { width: columns * PITCH, height: rows * PITCH };
}

/**
 * '#rrggbb'（または '#rgb'）の sRGB の相対輝度（0〜1）を求める（WCAG の定義）。
 * @param {string} hex
 * @returns {number}
 */
export function relativeLuminance(hex) {
  let body = String(hex).trim().replace(/^#/, '');
  if (body.length === 3) body = [...body].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(body)) throw new Error(`色を読み取れません: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(body.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 塗りの色の上に載せる文字の色を選ぶ。濃いグレーと白のうち、コントラスト比が高いほう。
 * @param {string} fill '#rrggbb'
 * @returns {string} '#222222' か '#ffffff'
 */
export function labelColor(fill) {
  const l = relativeLuminance(fill);
  const withDark = (l + 0.05) / (relativeLuminance(DARK_TEXT) + 0.05);
  const withLight = 1.05 / (l + 0.05);
  return withDark >= withLight ? DARK_TEXT : LIGHT_TEXT;
}

/**
 * viewBox 上の県名の文字サイズを求める。マスの一辺の 25%（3 文字の県名がマスの幅の 75%）を基本とし、
 * 略称が 4 文字以上のときは、全体がマスの幅の 8 割以内に収まるまで小さくする。
 * @param {number} maxChars 略称のうち最も長いものの文字数
 * @returns {number}
 */
export function labelFontSize(maxChars) {
  const size = PITCH - GAP;
  return Math.min(size * FONT_RATIO, (size * MAX_TEXT_SPAN) / Math.max(1, maxChars));
}

/** 印（mark）と、キーボードのフォーカスの枠：マスの縁に沿った、外側の濃いグレーの太い枠と、その内側の白い線。 */
const RING_COLOR = '#262626';
const RING_HALO = '#ffffff';
const RING_OUTER = 4;
const RING_INNER = 2;
/** 地図に重ねるラベルの文字サイズ（CSS px。拡大縮小しない）。 */
const CALLOUT_FONT_PX = 12;

/** 矢印キーと、動く向き（{ dx, dy }）の対応。 */
export const ARROW_KEYS = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/**
 * 矢印キーで動くときの、移動先のマスを選ぶ。DOM を使わない。
 * - その向きにまっすぐ（同じ行、または同じ列に）あるマスのうち、いちばん近いものを選ぶ。
 * - まっすぐのマスがなければ、その向きに進むマスのうち、距離（グリッド上のユークリッド距離）がいちばん近いものを選ぶ。
 *   距離が同じなら、まっすぐな向きからのずれが小さいほう、それでも同じならコードの小さいほうを選ぶ。
 * - その向きにマスが1つもなければ null を返す（動かない）。
 * @param {Array<{ code: string, x: number, y: number }>} tiles 都道府県（code, x, y を持つもの）の配列
 * @param {string} fromCode いまのマスの都道府県コード
 * @param {string | { dx: number, dy: number }} direction 'ArrowLeft' などのキー名か、向き（{ dx, dy }。例：左は { dx: -1, dy: 0 }）
 * @returns {string | null} 移動先の都道府県コード
 */
export function nextTileCode(tiles, fromCode, direction) {
  const dir = typeof direction === 'string' ? ARROW_KEYS[direction] : direction;
  const from = tiles.find((t) => t.code === fromCode);
  if (!dir || !from) return null;
  let best = null;
  let bestKey = null;
  for (const t of tiles) {
    if (t.code === from.code) continue;
    const dx = t.x - from.x;
    const dy = t.y - from.y;
    const along = dx * dir.dx + dy * dir.dy;
    if (along <= 0) continue;
    const across = dir.dx !== 0 ? Math.abs(dy) : Math.abs(dx);
    // 比べる順：まっすぐ（0）かどうか → 距離 → ずれ → コード
    const key = [across === 0 ? 0 : 1, across === 0 ? along : along * along + across * across, across, t.code];
    if (bestKey === null || compareKeys(key, bestKey) < 0) {
      best = t;
      bestKey = key;
    }
  }
  return best ? best.code : null;
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/**
 * 印の枠を描く矩形（外側の濃い枠、内側の白い線）の属性を求める。マスの縁に沿って内側に描く。
 * @param {{ x: number, y: number, size: number }} pos tileRect の戻り値
 * @returns {Array<{ x: number, y: number, width: number, height: number, stroke: string, 'stroke-width': number }>}
 */
export function ringRects(pos) {
  const ring = (inset, width, stroke) => ({
    x: pos.x + inset, y: pos.y + inset, width: pos.size - inset * 2, height: pos.size - inset * 2,
    stroke, 'stroke-width': width,
  });
  return [ring(RING_OUTER / 2, RING_OUTER, RING_COLOR), ring(RING_OUTER + RING_INNER / 2, RING_INNER, RING_HALO)];
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * タイル地図を el の中に描く。el の中身は、この関数が書き換える（el には position: relative を付ける）。
 * - SVG は viewBox つきで描き、幅は親要素いっぱいに伸縮する（高さは viewBox の比で決まる）。`<svg>` 自体には Tab で止まらない（tabindex="-1"）。
 * - 各マスは <rect data-code="都道府県コード"> で、子の <title> に県名を持つ。マスの間には隙間があり、枠線はない。
 * - labels が真のとき、マスの文字色は塗りの明るさ（相対輝度）に応じて、濃い色か白かを自動で選ぶ。
 * - labels が 'auto' のとき、マスの表示サイズが小さく、県名の表示サイズ（文字サイズ × 表示倍率）が 11px 未満になる場合は県名を出さない
 *   （親要素の幅が変わるたびに ResizeObserver で切り替える）。true のときは大きさにかかわらず常に出す。
 * - fill が返す色は '#rrggbb'。
 * - onActive を渡すと、マスの操作が有効になる（渡さなければ、下の操作はすべて付かない）。
 *   - マスにポインタが乗ったとき、タップしたとき、キーボードのフォーカスが移ったときに、onActive(その都道府県のオブジェクト) を呼ぶ。
 *     同じマスのままなら呼ばない。地図からポインタが離れたとき（マウスのみ。タップしたマスは残す）と、フォーカスが地図の外に出たときに、onActive(null) を呼ぶ。
 *     ポインタが離れても、キーボードでフォーカスしているマスがあれば、そのマスで呼び直す。
 *   - Tab で地図に止まるのは 1 回だけ。最初に止まるマスは initialCode（省略時は北海道 '01'）。地図の中は、矢印キーで、
 *     その向きにあるいちばん近いマスへ移る（nextTileCode）。移ったあとは、そのマスが Tab の停止位置になる。
 *   - フォーカスの枠は、:focus-visible のとき（キーボードで来たとき）だけ、mark と同じ枠で出す。ブラウザ標準の枠は出さない。
 *   - 各マスに role="img" と aria-label（tileLabel の値。省略時は県名）を付ける。<svg> は role="group"。
 * @param {HTMLElement} el 描画先
 * @param {object} options
 * @param {object|Array<object>} options.prefectures data/prefectures.json を読み込んだオブジェクト全体
 *   （deps.prefectures）。その `prefectures` 配列だけを渡してもよい。
 * @param {(pref: object) => string} options.fill 都道府県 1 件を受け取り、'#rrggbb' を返す関数
 * @param {boolean|'auto'} [options.labels] 県名の略称（short）をマスに表示するか。true で常に表示、'auto' で表示サイズが足りるときだけ表示、省略か false で表示しない
 * @param {string} [options.ariaLabel] 図全体の代替テキスト
 * @param {(pref: object | null) => void} [options.onActive] マスが「選ばれた」ときの通知。上の説明を参照
 * @param {string} [options.initialCode] 最初に Tab で止まるマスの都道府県コード（onActive があるときだけ有効）。省略時は '01'
 * @param {(pref: object) => string} [options.tileLabel] マスの aria-label を返す関数（onActive があるときだけ有効）。省略時は県名
 * @returns {{
 *   update(options: { fill: (pref: object) => string, tileLabel?: (pref: object) => string }): void,
 *   mark(codes: string[]): void,
 *   callouts(items: Array<{ code: string, text: string, side?: 'left' | 'right' | 'above' | 'below' }>): void,
 *   destroy(): void,
 * }}
 *   update はマスを作り直さず、塗り分け（と文字色。tileLabel を渡せば aria-label も）だけを差し替える。
 *   mark(codes) は、渡した都道府県コードのマスに印（濃いグレーの太い枠と、その内側の白い線。濃い色のマスでも見える）を付ける。前の印は消え、空の配列で全部消える。
 *   callouts(items) は、マスのそばに県名などのラベル（白地に濃いグレーの枠、12px の文字）を地図に重ねる（side は、マスのどちら側に置くか。省略時は 'below'）。空の配列で消える。
 *   マスの隣が空いている側（日本海側、太平洋側など）を side に選ぶこと。ラベルは地図の外にはみ出さない側に置く。
 *   destroy は描いたものと ResizeObserver を取り除く。
 */
export function render(el, { prefectures, fill, labels, ariaLabel, onActive, initialCode, tileLabel }) {
  const list = Array.isArray(prefectures) ? prefectures : prefectures?.prefectures;
  if (!Array.isArray(list)) throw new Error('prefectures に都道府県の配列がありません');
  if (typeof fill !== 'function') throw new Error('fill は関数で指定してください');
  const interactive = typeof onActive === 'function';

  const grid = Array.isArray(prefectures) ? null : prefectures.meta?.grid;
  const columns = grid?.columns ?? Math.max(13, ...list.map((p) => p.x + 1));
  const rows = grid?.rows ?? Math.max(12, ...list.map((p) => p.y + 1));
  const view = viewBoxSize(columns, rows);

  const svg = svgEl('svg', { viewBox: `0 0 ${view.width} ${view.height}`, role: interactive ? 'group' : 'img', tabindex: -1 });
  svg.setAttribute('aria-label', ariaLabel ?? '都道府県を同じ大きさの正方形で並べたタイル地図');
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.outline = 'none';

  const tilesGroup = svgEl('g');
  const labelsGroup = svgEl('g', { 'text-anchor': 'middle', 'font-weight': 400 });
  labelsGroup.style.pointerEvents = 'none'; // ホバーはマス（<rect>）の <title> に任せる
  labelsGroup.style.userSelect = 'none';
  const marksGroup = svgEl('g', { fill: 'none' });
  const focusGroup = svgEl('g', { fill: 'none' });
  marksGroup.style.pointerEvents = 'none';
  focusGroup.style.pointerEvents = 'none';
  svg.append(tilesGroup, labelsGroup, marksGroup, focusGroup);

  const showLabels = labels === true || labels === 'auto';
  // 略称は short をそのまま全部出す。文字サイズは最長の略称がマスに収まる大きさにする
  const longest = Math.max(1, ...list.map((p) => [...String(p.short ?? p.name ?? '')].length));
  const fontSize = labelFontSize(longest);

  /** @type {Array<{ pref: object, rect: SVGRectElement, text: SVGTextElement | null }>} */
  const tiles = list.map((pref) => {
    const pos = tileRect(pref.x, pref.y);
    const rect = svgEl('rect', { x: pos.x, y: pos.y, width: pos.size, height: pos.size, 'data-code': pref.code });
    const title = svgEl('title');
    title.textContent = pref.name;
    rect.append(title);
    tilesGroup.append(rect);

    let text = null;
    if (showLabels) {
      text = svgEl('text', {
        x: pos.x + pos.size / 2,
        y: pos.y + pos.size / 2,
        dy: '0.35em',
        'font-size': fontSize,
        'data-code': pref.code,
      });
      text.textContent = pref.short ?? pref.name;
      labelsGroup.append(text);
    }
    return { pref, rect, text };
  });
  const byCode = new Map(tiles.map((t) => [t.pref.code, t]));

  /** 塗りと文字色を、いまの fill 関数で付け直す。マスは作り直さない。 */
  function paint(fillFn) {
    for (const { pref, rect, text } of tiles) {
      const color = fillFn(pref);
      rect.setAttribute('fill', color);
      text?.setAttribute('fill', labelColor(color));
    }
  }
  paint(fill);

  /** マスの aria-label を付け直す（操作が有効なときだけ）。 */
  function labelTiles(labelFn) {
    if (!interactive) return;
    for (const { pref, rect } of tiles) rect.setAttribute('aria-label', labelFn ? labelFn(pref) : pref.name);
  }
  labelTiles(tileLabel);

  /** 枠（印・フォーカスの枠）を group の中に描き直す。 */
  function drawRings(group, codes) {
    const nodes = [];
    for (const code of codes) {
      const tile = byCode.get(code);
      if (!tile) continue;
      for (const attrs of ringRects(tileRect(tile.pref.x, tile.pref.y))) nodes.push(svgEl('rect', attrs));
    }
    group.replaceChildren(...nodes);
  }

  // マスの上に重ねるラベル（HTML）。ラベルの文字は CSS px で決めるので、地図が縮んでも小さくならない。
  const calloutLayer = document.createElement('div');
  calloutLayer.setAttribute('aria-hidden', 'true');
  Object.assign(calloutLayer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  function drawCallouts(items) {
    const GAP_PX = 3;
    const nodes = items.map(({ code, text, side = 'below' }) => {
      const tile = byCode.get(code);
      if (!tile) return null;
      const pos = tileRect(tile.pref.x, tile.pref.y);
      const pct = (value, total) => `${(value / total) * 100}%`;
      const node = document.createElement('span');
      node.textContent = text;
      Object.assign(node.style, {
        position: 'absolute',
        padding: '1px 5px',
        border: `1px solid ${RING_COLOR}`,
        borderRadius: '3px',
        background: '#ffffff',
        color: RING_COLOR,
        fontFamily: 'inherit',
        fontSize: `${CALLOUT_FONT_PX}px`,
        fontWeight: '700',
        lineHeight: '1.3',
        whiteSpace: 'nowrap',
      });
      const cx = pos.x + pos.size / 2;
      const cy = pos.y + pos.size / 2;
      if (side === 'left') {
        Object.assign(node.style, { right: `calc(${pct(view.width - pos.x, view.width)} + ${GAP_PX}px)`, top: pct(cy, view.height), transform: 'translateY(-50%)' });
      } else if (side === 'right') {
        Object.assign(node.style, { left: `calc(${pct(pos.x + pos.size, view.width)} + ${GAP_PX}px)`, top: pct(cy, view.height), transform: 'translateY(-50%)' });
      } else if (side === 'above') {
        Object.assign(node.style, { left: pct(cx, view.width), bottom: `calc(${pct(view.height - pos.y, view.height)} + ${GAP_PX}px)`, transform: 'translateX(-50%)' });
      } else {
        Object.assign(node.style, { left: pct(cx, view.width), top: `calc(${pct(pos.y + pos.size, view.height)} + ${GAP_PX}px)`, transform: 'translateX(-50%)' });
      }
      return node;
    });
    calloutLayer.replaceChildren(...nodes.filter(Boolean));
  }

  /** 'auto' のとき、県名の表示サイズが足りるかで文字の表示を切り替える。 */
  function syncLabels(width) {
    if (labels !== 'auto') return;
    const px = fontSize * (width / view.width);
    labelsGroup.setAttribute('display', px >= MIN_LABEL_PX ? 'inline' : 'none');
  }

  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.replaceChildren(svg, calloutLayer);

  // --- マスの操作（onActive があるときだけ） --------------------------------
  const cleanups = [];
  if (interactive) {
    const startTile = byCode.get(initialCode ?? '01') ?? tiles[0];
    let tabCode = startTile?.pref.code ?? null;
    let activeCode = null;
    for (const { pref, rect } of tiles) {
      rect.setAttribute('role', 'img');
      rect.setAttribute('tabindex', pref.code === tabCode ? '0' : '-1');
      rect.style.outline = 'none'; // ブラウザ標準の枠は出さず、focusGroup の枠を出す
    }

    const tileOf = (target) => (target instanceof Element ? target.closest('rect[data-code]') : null);
    const setActive = (code) => {
      if (code === activeCode) return;
      activeCode = code;
      onActive(code === null ? null : byCode.get(code).pref);
    };
    const focusedTile = () => {
      const rect = tileOf(document.activeElement);
      return rect && svg.contains(rect) ? rect : null;
    };
    const isFocusVisible = (rect) => {
      try { return rect.matches(':focus-visible'); } catch { return false; }
    };

    const on = (type, handler) => {
      svg.addEventListener(type, handler);
      cleanups.push(() => svg.removeEventListener(type, handler));
    };
    on('pointerover', (event) => {
      const rect = tileOf(event.target);
      if (rect) setActive(rect.dataset.code);
    });
    on('click', (event) => {
      const rect = tileOf(event.target);
      if (rect) setActive(rect.dataset.code);
    });
    on('pointerleave', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return; // タップしたマスは残す
      const rect = focusedTile();
      setActive(rect && isFocusVisible(rect) ? rect.dataset.code : null);
    });
    on('focusin', (event) => {
      const rect = tileOf(event.target);
      if (!rect) return;
      const code = rect.dataset.code;
      if (code !== tabCode) {
        byCode.get(tabCode)?.rect.setAttribute('tabindex', '-1');
        rect.setAttribute('tabindex', '0');
        tabCode = code;
      }
      drawRings(focusGroup, isFocusVisible(rect) ? [code] : []);
      setActive(code);
    });
    on('focusout', (event) => {
      if (!tileOf(event.target)) return;
      focusGroup.replaceChildren();
      if (!svg.contains(event.relatedTarget)) setActive(null); // 地図の中でフォーカスが移るだけのときは、focusin に任せる
    });
    on('keydown', (event) => {
      const rect = tileOf(event.target);
      if (!rect || !(event.key in ARROW_KEYS)) return;
      event.preventDefault();
      const next = nextTileCode(list, rect.dataset.code, event.key);
      if (next) byCode.get(next).rect.focus();
    });
  }

  let observer = null;
  if (labels === 'auto') {
    const initial = svg.getBoundingClientRect().width;
    if (initial > 0) syncLabels(initial);
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        syncLabels(entry.contentRect.width);
      });
      observer.observe(svg);
    }
  }

  return {
    update(next) {
      if (typeof next?.fill !== 'function') throw new Error('update には fill 関数が必要です');
      paint(next.fill);
      if (typeof next.tileLabel === 'function') labelTiles(next.tileLabel);
    },
    mark(codes) {
      drawRings(marksGroup, codes ?? []);
    },
    callouts(items) {
      drawCallouts(items ?? []);
    },
    destroy() {
      observer?.disconnect();
      observer = null;
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
      svg.remove();
      calloutLayer.remove();
    },
  };
}
