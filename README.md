# データの性質で選ぶ、色の使い方

初学者向けの日本語スクロール型解説ページ「データの性質に合ったカラースキームの選び方」のリポジトリです。
ビルド工程のない静的サイト（バニラJSのESモジュール・CSS・HTML）で、依存パッケージはありません。
このファイルは、後続の担当が最初に読む文書です。

## 動かし方

```sh
npm run serve      # 依存なしの静的サーバ。http://localhost:4173/ を開く（PORT=8080 npm run serve で変更可）
npm test           # node --test "tests/**/*.test.js"
```

- ページ全体：`http://localhost:4173/`
- 図を1つだけ確認：`http://localhost:4173/widgets/<名前>/demo.html`（ひな形は `widgets/_template/demo.html`）
- ES モジュールを使うので、`file://` で開いても動きません。必ずサーバ経由で開きます。
- Node.js 22 で確認しています。Node 22 の `node --test` はディレクトリ名を受け付けないため、`npm test` はグロブ指定にしています。

## ファイル構成

```
index.html              全章のセクションと、図のマウント点
css/base.css            色・余白のトークン、本文の組み、共通の操作部品のスタイル
main.js                 図の登録簿。マウント点を見つけて各図を読み込み、mount する
lib/deps.js             loadDeps()：図に渡す deps を組み立てる（main.js と各 demo.html が共用）
lib/dom.js              ensureStyle / el / uid
lib/color.js            色計算（シグネチャとJSDocだけのスタブ）
lib/palettes.js         パレット（同上）
lib/tilemap.js          都道府県タイル地図（同上）
data/prefectures.json   都道府県データ（S0 では数値と座標が仮）
widgets/_template/      図のひな形：index.js、style.css、demo.html
widgets/<名前>/index.js 全9図の仮スタブ（「準備中」の枠を出す。担当が置き換える）
widgets/_placeholder.js 「準備中」の枠（main.js とスタブが使う。編集不要）
tests/                  contract.test.js（共有モジュール・データの契約）、page.test.js（index.html の骨組み）
scripts/serve.mjs       静的ファイルサーバ
vendor/d3/              同梱した D3 と LICENSE
```

## 図の契約

各図は `widgets/<名前>/index.js` に置き、次を export します。

```js
/** @returns {{ destroy(): void }} */
export function mount(el, deps) { … }
```

- `el` はマウント点（`<figure class="widget" data-widget="名前">`）。図は自分の `el` の中だけを書き換えます。
- `deps` は `{ d3, color, palettes, prefectures, tilemap }`。
  `d3` は `globalThis.d3`（`vendor/d3/d3.min.js` を HTML で読み込む）、`color`・`palettes`・`tilemap` は `lib/` の各モジュールの名前空間、
  `prefectures` は `data/prefectures.json` を読み込んだオブジェクトです。
- 専用スタイルは `widgets/<名前>/style.css` に置き、`ensureStyle(new URL('./style.css', import.meta.url))` で読み込みます。
  クラス名は図の名前を接頭辞にします（例：`.cone-explorer__axis`）。
- 自前のデータファイルは同じディレクトリに置き、`new URL('./xxx.json', import.meta.url)` で fetch します。
- 色は図の中だけに使います。ページのUI（ボタン、枠、文字）は無彩色のままにします（`css/base.css` のトークンを使う）。

`main.js` は `[data-widget]` をすべて見つけ、`./widgets/<名前>/index.js` を動的 import して `mount(el, deps)` を呼びます。
S0 では全9図に仮のスタブが置いてあり、「図（名前）は準備中です」の枠を出します。**自分の図の `index.js` をスタブから置き換えて作ります**
（モジュールが存在しない名前を import するとブラウザがコンソールに 404 を出すため、スタブを置いています）。

### 図の作り方

1. `widgets/_template/` の中身を、自分の `widgets/<名前>/` にコピーする（`index.js` はスタブを上書き）。
2. クラス名の接頭辞 `template__` を自分の図の名前に直し、`demo.html` の `data-widget` と見出しも直す。
3. `http://localhost:4173/widgets/<名前>/demo.html` で確認し、`/` のページでも「準備中」が消えることを確かめる。

## 担当範囲の取り決め

並行作業で互いに衝突しないよう、編集してよい範囲を次のとおり分けます。

| 担当 | 編集してよい範囲 |
|---|---|
| 図 | `widgets/<自分の名前>/` の中だけ |
| 本文 | `index.html` の自分の章の `data-prose="…"` の `<div>` の中だけ |
| 共有モジュール | 自分の `lib/*.js`（または `data/prefectures.json`）と、対応するテストだけ |

`css/base.css`、`main.js`、`lib/deps.js`、`lib/dom.js`、`tests/contract.test.js`、`tests/page.test.js`、章の見出しとマウント点は、S0 で決めた契約です。
変更が必要なときは、勝手に直さず統括に相談します。

## 共通の操作部品（`css/base.css`）

| クラス | 用途 |
|---|---|
| `.ctl` | 操作部品を横にまとめる行（収まらなければ折り返す） |
| `.ctl-slider` | ラベル + `<input type="range">` + 値表示（`<output>`） |
| `.ctl-segment` | 選択ボタンの組。`role="radiogroup"` の中にネイティブのラジオを置くので、矢印キーの操作はそのまま使える |
| `.ctl-toggle` | チェックボックスの切り替え |
| `.fig-title` / `.fig-note` | 図の見出し／図の下の説明文 |
| `.verdict` + `--good` / `--caution` / `--bad` | 判定表示。無彩色のまま、記号「○」「△」「×」と枠線の太さ（1px／2px／4px）で区別する |
| `.swatch` | 色見本の四角。`style: { '--swatch': '#rrggbb' }` で色を付ける |
| `.legend` | 凡例（`<ul class="legend">` の中に `<li>` を並べる） |

マークアップの見本は `widgets/_template/index.js` にあります。`lib/dom.js` は `ensureStyle(url)`、`el(tag, attrs, children)`、`uid(prefix)` の3つです。

## 共有モジュールのスタブ

`lib/color.js`・`lib/palettes.js`・`lib/tilemap.js` は、名前・引数・戻り値を JSDoc に書いたスタブで、呼ぶと `Error('未実装: 関数名')` を投げます。
担当が実装するまで、図からは呼ばないでください（`tests/contract.test.js` は export 名だけを検査します）。

## 同梱したライブラリ

- D3 **7.9.2**（`npm pack d3@7` で取得した tarball の `dist/d3.min.js`）。ライセンスは ISC（`vendor/d3/LICENSE`）。
  HTML では `<script src="…/vendor/d3/d3.min.js"></script>` で読み込み、モジュールは `globalThis.d3` を使います。
