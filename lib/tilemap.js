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
/** viewBox 上の文字サイズの上限。 */
const MAX_FONT = 18;

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

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/**
 * タイル地図を el の中に描く。el の中身は、この関数が書き換える。
 * - SVG は viewBox つきで描き、幅は親要素いっぱいに伸縮する（高さは viewBox の比で決まる）。
 * - 各マスは <rect data-code="都道府県コード"> で、子の <title> に県名を持つ。マスの間には隙間があり、枠線はない。
 * - labels が真のとき、マスの文字色は塗りの明るさ（相対輝度）に応じて、濃い色か白かを自動で選ぶ。
 * - labels が 'auto' のとき、マスの表示サイズが小さく、県名が 11px 未満になる場合は県名を出さない
 *   （親要素の幅が変わるたびに ResizeObserver で切り替える）。true のときは大きさにかかわらず常に出す。
 * - fill が返す色は '#rrggbb'。
 * @param {HTMLElement} el 描画先
 * @param {object} options
 * @param {object|Array<object>} options.prefectures data/prefectures.json を読み込んだオブジェクト全体
 *   （deps.prefectures）。その `prefectures` 配列だけを渡してもよい。
 * @param {(pref: object) => string} options.fill 都道府県 1 件を受け取り、'#rrggbb' を返す関数
 * @param {boolean|'auto'} [options.labels] 県名の略称（short）をマスに表示するか。true で常に表示、'auto' で表示サイズが足りるときだけ表示、省略か false で表示しない
 * @param {string} [options.ariaLabel] 図全体の代替テキスト
 * @returns {{ update(options: { fill: (pref: object) => string }): void, destroy(): void }}
 *   update はマスを作り直さず、塗り分け（と文字色）だけを差し替える。destroy は描いたものと ResizeObserver を取り除く。
 */
export function render(el, { prefectures, fill, labels, ariaLabel }) {
  const list = Array.isArray(prefectures) ? prefectures : prefectures?.prefectures;
  if (!Array.isArray(list)) throw new Error('prefectures に都道府県の配列がありません');
  if (typeof fill !== 'function') throw new Error('fill は関数で指定してください');

  const grid = Array.isArray(prefectures) ? null : prefectures.meta?.grid;
  const columns = grid?.columns ?? Math.max(13, ...list.map((p) => p.x + 1));
  const rows = grid?.rows ?? Math.max(12, ...list.map((p) => p.y + 1));
  const view = viewBoxSize(columns, rows);

  const svg = svgEl('svg', { viewBox: `0 0 ${view.width} ${view.height}`, role: 'img' });
  svg.setAttribute('aria-label', ariaLabel ?? '都道府県を同じ大きさの正方形で並べたタイル地図');
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = 'auto';

  const tilesGroup = svgEl('g');
  const labelsGroup = svgEl('g', { 'text-anchor': 'middle', 'font-weight': 600 });
  labelsGroup.style.pointerEvents = 'none'; // ホバーはマス（<rect>）の <title> に任せる
  labelsGroup.style.userSelect = 'none';
  svg.append(tilesGroup, labelsGroup);

  const showLabels = labels === true || labels === 'auto';
  // 略称のうち最長のものがマスに収まる文字サイズにする（2 文字なら 17 前後）
  const longest = Math.max(1, ...list.map((p) => [...String(p.short ?? p.name ?? '')].length));
  const fontSize = Math.min(MAX_FONT, Math.floor(((PITCH - GAP - 4) / longest) * 10) / 10);

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

  /** 塗りと文字色を、いまの fill 関数で付け直す。マスは作り直さない。 */
  function paint(fillFn) {
    for (const { pref, rect, text } of tiles) {
      const color = fillFn(pref);
      rect.setAttribute('fill', color);
      text?.setAttribute('fill', labelColor(color));
    }
  }
  paint(fill);

  /** 'auto' のとき、県名の表示サイズが足りるかで文字の表示を切り替える。 */
  function syncLabels(width) {
    if (labels !== 'auto') return;
    const px = fontSize * (width / view.width);
    labelsGroup.setAttribute('display', px >= MIN_LABEL_PX ? 'inline' : 'none');
  }

  el.replaceChildren(svg);

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
    },
    destroy() {
      observer?.disconnect();
      observer = null;
      svg.remove();
    },
  };
}
