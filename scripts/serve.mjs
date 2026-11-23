// 依存なしの静的ファイルサーバ。既定ポート 4173、環境変数 PORT で変更できる。
// 直接実行すると起動する。scripts/shots.mjs は createStaticServer() を import して、空いているポートで起動する。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** URL パスをルート配下のファイルパスに変換する。ルートの外に出る場合は null。 */
function resolvePath(urlPath, root) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = normalize(join(root, decoded));
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

/** root 配下を配信する http.Server を作る（listen は呼び出し側）。 */
export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method Not Allowed');

    const { pathname } = new URL(req.url, 'http://localhost');
    let file = resolvePath(pathname, root);
    if (!file) return send(400, 'Bad Request');

    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(301, { Location: pathname + '/' });
          return res.end();
        }
        file = join(file, 'index.html');
        info = await stat(file);
      }
      const body = await readFile(file);
      send(200, body, TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    } catch {
      send(404, 'Not Found');
    }
  });
}

// 直接実行されたときだけ起動する。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.PORT) || 4173;
  createStaticServer().listen(PORT, () => {
    console.log(`http://localhost:${PORT}/ で配信中（Ctrl+C で終了）`);
  });
}
