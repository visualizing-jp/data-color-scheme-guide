// 撮影と表示検査。npm run shots、または npm run shots -- widgets/quiz/demo.html
// 静的サーバを空いているポートで起動し、各ページを幅 1280px と 390px で開いて、
// スクリーンショットを screenshots/ に保存し、表示の検査結果を表にして出す。
// 1 つでも不合格があれば終了コードを 1 にする（環境や引数の問題は 2）。
import { createRequire } from 'node:module';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { createStaticServer, ROOT } from './serve.mjs';

const WIDTHS = [1280, 390];
const VIEWPORT_HEIGHT = 800;
const READY_TIMEOUT_MS = 15_000;
const MIN_FONT_PX = 11;
const OUT_DIR = join(ROOT, 'screenshots');
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'screenshots', '.git']);

// Playwright は package.json に加えず、環境に導入済みのものを使う。
function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    console.error('Playwright を読み込めません。この環境に playwright が導入されている必要があります（require(\'playwright\') が使えること）。');
    process.exit(2);
  }
}

/** リポジトリ内の撮影対象ページ（ルートからの相対パス、/ 区切り）を集める。 */
async function discoverPages() {
  const pages = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name));
      } else if (entry.name === 'demo.html' || entry.name.endsWith('.demo.html')) {
        pages.push(relative(ROOT, join(dir, entry.name)).split(sep).join('/'));
      }
    }
  }
  await walk(ROOT);
  return ['index.html', ...pages.sort()];
}

/** 引数で渡されたパスを、ルートからの相対パス（/ 区切り）に直し、存在を確かめる。 */
async function resolveArgs(args) {
  const pages = [];
  for (const arg of args) {
    const full = resolve(process.cwd(), arg);
    const rel = relative(ROOT, full).split(sep).join('/');
    if (rel.startsWith('..') || !rel.endsWith('.html')) {
      console.error(`リポジトリ内の .html ファイルを指定してください：${arg}`);
      process.exit(2);
    }
    try {
      if (!(await stat(full)).isFile()) throw new Error();
    } catch {
      console.error(`ファイルが見つかりません：${arg}`);
      process.exit(2);
    }
    if (!pages.includes(rel)) pages.push(rel);
  }
  return pages;
}

/** 'widgets/quiz/demo.html' → 'widgets-quiz-demo' */
const pageName = (path) => path.replace(/\.html$/, '').replaceAll('/', '-');

/** ページの中で検査値を集める（ブラウザ内で実行される）。 */
function inspectPage(minFontPx) {
  // 表示上の文字サイズ = 計算された font-size × 画面への拡大率（viewBox の縮尺を含む）
  let minFont = null;
  let tooSmall = 0;
  for (const text of document.querySelectorAll('svg text')) {
    if (!(text.textContent ?? '').trim()) continue;
    if (text.getClientRects().length === 0) continue; // display:none など、表示されていない
    const style = getComputedStyle(text);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const ctm = text.getScreenCTM();
    if (!ctm) continue;
    const scale = Math.hypot(ctm.a, ctm.b);
    const size = parseFloat(style.fontSize) * scale;
    if (!Number.isFinite(size)) continue;
    if (size < minFontPx) tooSmall += 1;
    if (minFont === null || size < minFont.size) {
      minFont = { size, text: text.textContent.trim().slice(0, 24) };
    }
  }
  const errorBoxes = document.querySelectorAll('.widget-error').length;
  const errorTexts = (document.body.innerText.match(/図(（[^）]*）)?を表示できませんでした/g) ?? []).length;
  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    errorDisplays: Math.max(errorBoxes, errorTexts),
    minFont,
    tooSmall,
    placeholders: document.querySelectorAll('.widget-placeholder').length,
  };
}

/** 1 ページ・1 幅を撮影して検査する。 */
async function checkPage(browser, baseUrl, path, width) {
  const name = pageName(path);
  const context = await browser.newContext({
    viewport: { width, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce', // JS の演出を止めて、撮影を安定させる
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${m.text()}${m.location().url ? `（${m.location().url}）` : ''}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`未捕捉の例外：${e.message}`));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()}：${r.failure()?.errorText ?? '失敗'}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.url()}：HTTP ${r.status()}`);
  });

  const problems = [];
  const result = { path, name, width, problems, files: [] };
  try {
    await page.goto(`${baseUrl}/${path}`, { waitUntil: 'load' });
    try {
      await page.waitForSelector('html[data-widgets-ready="true"]', { state: 'attached', timeout: READY_TIMEOUT_MS });
    } catch {
      problems.push(`data-widgets-ready が ${READY_TIMEOUT_MS / 1000} 秒以内に付きませんでした`);
    }
    await page.evaluate(() => document.fonts.ready);

    await mkdir(OUT_DIR, { recursive: true });
    // 前回の同じページ・幅の画像を消してから撮る（図の数が減っても古い画像が残らない）
    const stale = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${width}(-.+)?\\.png$`);
    for (const file of await readdir(OUT_DIR)) if (stale.test(file)) await rm(join(OUT_DIR, file));

    const full = `screenshots/${name}-${width}.png`;
    await page.screenshot({ path: join(ROOT, full), fullPage: true });
    result.files.push(full);

    if (path === 'index.html') {
      for (const handle of await page.locator('[data-widget]').all()) {
        const widget = await handle.getAttribute('data-widget');
        const file = `screenshots/${name}-${width}-${widget}.png`;
        try {
          await handle.screenshot({ path: join(ROOT, file) });
          result.files.push(file);
        } catch (error) {
          problems.push(`図（${widget}）を撮影できませんでした：${error.message.split('\n')[0]}`);
        }
      }
    }

    result.metrics = await page.evaluate(inspectPage, MIN_FONT_PX);
  } catch (error) {
    problems.push(`ページを検査できませんでした：${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }

  Object.assign(result, { consoleErrors, failedRequests });
  const m = result.metrics;
  if (consoleErrors.length) problems.push(`コンソールのエラー ${consoleErrors.length} 件`);
  if (failedRequests.length) problems.push(`失敗したリクエスト ${failedRequests.length} 件`);
  if (m) {
    if (m.scrollWidth > m.innerWidth) problems.push(`横スクロールあり（scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth}）`);
    if (m.errorDisplays > 0) problems.push(`「図を表示できませんでした」の表示 ${m.errorDisplays} 件`);
    if (m.minFont && m.minFont.size < MIN_FONT_PX) {
      problems.push(`SVG の文字が ${MIN_FONT_PX}px 未満（${m.tooSmall} 件、最小 ${m.minFont.size.toFixed(1)}px「${m.minFont.text}」）`);
    }
  }
  return result;
}

// --- 表の出力 -----------------------------------------------------------------
const displayWidth = (s) => [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - displayWidth(s)));

function printTable(results) {
  const header = ['ページ', '幅', 'コンソールエラー', '失敗リクエスト', '横スクロール', 'エラー表示', 'SVG文字の最小px', '準備中', '判定'];
  const rows = results.map((r) => {
    const m = r.metrics;
    return [
      r.path,
      String(r.width),
      String(r.consoleErrors.length),
      String(r.failedRequests.length),
      m ? (m.scrollWidth <= m.innerWidth ? `なし（${m.scrollWidth}/${m.innerWidth}）` : `あり（${m.scrollWidth}/${m.innerWidth}）`) : '—',
      m ? String(m.errorDisplays) : '—',
      m ? (m.minFont ? m.minFont.size.toFixed(1) : '（文字なし）') : '—',
      m ? String(m.placeholders) : '—',
      r.problems.length ? '不合格' : '合格',
    ];
  });
  const widths = header.map((h, i) => Math.max(displayWidth(h), ...rows.map((row) => displayWidth(row[i]))));
  const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join(' | ').trimEnd();
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
  for (const row of rows) console.log(line(row));
}

function printDetails(results) {
  const failed = results.filter((r) => r.problems.length);
  if (!failed.length) return;
  console.log('\n不合格の内訳');
  for (const r of failed) {
    console.log(`- ${r.path}（幅 ${r.width}px）`);
    for (const p of r.problems) console.log(`    ${p}`);
    for (const e of r.consoleErrors.slice(0, 5)) console.log(`      console.error: ${e}`);
    for (const e of r.failedRequests.slice(0, 5)) console.log(`      request: ${e}`);
  }
}

// --- 本体 ---------------------------------------------------------------------
async function main() {
  const { chromium } = loadPlaywright();
  const args = process.argv.slice(2);
  const pages = args.length ? await resolveArgs(args) : await discoverPages();

  const server = createStaticServer(ROOT);
  await new Promise((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let browser;
  const results = [];
  try {
    browser = await chromium.launch();
    for (const path of pages) {
      for (const width of WIDTHS) results.push(await checkPage(browser, baseUrl, path, width));
    }
  } finally {
    await browser?.close();
    server.close();
    server.closeAllConnections?.();
  }

  printTable(results);
  printDetails(results);
  const files = results.flatMap((r) => r.files);
  const failed = results.filter((r) => r.problems.length).length;
  console.log(`\n画像 ${files.length} 枚を screenshots/ に保存しました。${results.length} 件中 ${results.length - failed} 件が合格、${failed} 件が不合格です。`);
  console.log('（「準備中」の個数は件数の表示だけで、合否には関係しません。）');
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
