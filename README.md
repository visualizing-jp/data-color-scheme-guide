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
tests/                  contract.test.js（共有モジュール・データ・図の mount の契約）、page.test.js（index.html の骨組み）
                        共有モジュールの担当は tests/<モジュール名>.test.js を足す（後述）
scripts/serve.mjs       静的ファイルサーバ
vendor/d3/              同梱した D3 と LICENSE
```

## 図の契約

各図は `widgets/<名前>/index.js` に置き、次を export します。

```js
/** @returns {{ destroy(): void } | Promise<{ destroy(): void }>} */
export function mount(el, deps) { … }
```

- `mount(el, deps)` は `{ destroy() }` か、それを解決する Promise を返します。
  自前のデータファイルを読む図は async にして、**最初の描画が終わってから解決**します（`widgets/_template/index.js` のコメントに書き方があります）。
  読み込みや描画に失敗したら throw（reject）します。`main.js` は「図（名前）を表示できませんでした」の枠を出し、コンソールにエラーを出します。

- `el` はマウント点（`<figure class="widget" data-widget="名前">`）。図は自分の `el` の中だけを書き換えます。
- `deps` は `{ d3, color, palettes, prefectures, tilemap }`。
  `d3` は `globalThis.d3`（`vendor/d3/d3.min.js` を HTML で読み込む）、`color`・`palettes`・`tilemap` は `lib/` の各モジュールの名前空間、
  `prefectures` は `data/prefectures.json` を読み込んだオブジェクトです。
- 専用スタイルは `widgets/<名前>/style.css` に置き、`ensureStyle(new URL('./style.css', import.meta.url))` で読み込みます。
  クラス名は図の名前を接頭辞にします（例：`.cone-explorer__axis`）。
- 自前のデータファイルは同じディレクトリに置き、`new URL('./xxx.json', import.meta.url)` で fetch します。
- 色は図の中だけに使います。ページのUI（ボタン、枠、文字）は無彩色のままにします（`css/base.css` のトークンを使う）。

### 図を作るときの決まり

- SVG には必ず `viewBox` を付けます。
- 幅 390px の画面でも、図の中の文字が **11px 以上**で表示されるように、`viewBox` の幅と文字サイズを決めます。
  幅 600 の `viewBox` を幅 330px に縮めると、12px の文字は約 6.6px になります。狭い幅では文字を大きくする、`viewBox` の幅を表示幅に合わせる、レイアウトを切り替える、などで対応します
  （`widgets/_template/` は、`viewBox` の幅を表示幅に合わせる方法の見本です。表示の確認は幅 390px で行います）。
- `.verdict` を使うときは、記号（○△×）だけに頼らず、判定の語（「合う」「条件つき」「誤読を招く」など）を文字として含めます。
- 動きの演出（transition、アニメーション）は、`prefers-reduced-motion: reduce` のときは行いません
  （JS では `matchMedia('(prefers-reduced-motion: reduce)').matches` を見る。CSS の `transition` / `animation` は `css/base.css` が一括で止めますが、JS の演出は図の側で止めます）。

`main.js` は `[data-widget]` をすべて見つけ、`./widgets/<名前>/index.js` を動的 import して `mount(el, deps)` を呼び、Promise なら解決を待ちます。
**全図の mount が終わると `<html data-widgets-ready="true">` が付きます**（失敗して「表示できませんでした」の枠になった図があっても付きます）。
スクリーンショットの撮影は、この印が付くのを待ってから行います。`widgets/<名前>/demo.html` も、mount が成功すると同じ印を付けます（失敗するとエラーを画面に出し、印は付けません）。
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
| 共有モジュール | 自分の `lib/*.js`（または `data/prefectures.json`）と、自分のモジュールのテスト `tests/<モジュール名>.test.js`（新しいファイル）だけ。モジュール名は `color`、`palettes`、`tilemap`、`prefectures` |
| 撮影スクリプト | `package.json` と `scripts/`。この2つは撮影スクリプトの担当だけが編集する（他の担当は、npm のコマンドを足したいときも編集しない）。`npm test` は `tests/**/*.test.js` を拾うので、テストを足すのに `package.json` の編集は要らない |

- `tests/contract.test.js` と `tests/page.test.js` は骨組みのもので、他の担当は編集しません。
- 出典の章（`data-prose="sources"`）は、第3〜5章（`ch3`〜`ch5`）の本文の担当が書きます。出典を足すときは、自分が使った出典の項目を足すだけにして、他の担当が書いた項目は触りません。
- `lib/color.js`・`lib/palettes.js`・`lib/tilemap.js`・`data/prefectures.json` が仮の状態（スタブ、仮の数値）の間は、これらを使わない図（`cone-explorer`、`quiz`、`decision-flow`）から先に作ります。
  ほかの図は、これらが確定してから（または確定を見込んで、呼ぶ側を契約どおりに書いておいて）仕上げます。

`css/base.css`、`main.js`、`lib/deps.js`、`lib/dom.js`、`tests/contract.test.js`、`tests/page.test.js`、章の見出しとマウント点は、S0 で決めた契約です。
変更が必要なときは、勝手に直さず統括に相談します。

## 共通の操作部品（`css/base.css`）

| クラス | 用途 |
|---|---|
| `.ctl` | 操作部品を横にまとめる行（収まらなければ折り返す） |
| `.ctl-slider` | ラベル + `<input type="range">` + 値表示（`<output>`） |
| `.ctl-segment` | 選択ボタンの組。`role="radiogroup"` の中にネイティブのラジオを置くので、矢印キーの操作はそのまま使える。狭い幅で2段に折り返しても、段の間に区切り線が見える |
| `.ctl-toggle` | チェックボックスの切り替え |
| `.fig-title` / `.fig-note` | 図の見出し／図の下の説明文 |
| `.verdict` + `--good` / `--caution` / `--bad` | 判定表示。無彩色のまま、記号「○」「△」「×」と枠線の太さ（1px／2px／4px）で区別する。記号は飾りで、判定の語（「合う」「条件つき」「誤読を招く」など）は中身の文字として必ず入れる |
| `.swatch` | 色見本の四角。`style: { '--swatch': '#rrggbb' }` で色を付ける |
| `.legend` | 凡例（`<ul class="legend">` の中に `<li>` を並べる） |

マークアップの見本は `widgets/_template/index.js` にあります。`lib/dom.js` は `ensureStyle(url)`、`el(tag, attrs, children)`、`uid(prefix)` の3つです。
`el()` は、値が `false` / `null` / `undefined` の属性は付けませんが、`aria-` で始まる属性だけは `false` も `"false"` として付けます（例：`'aria-expanded': false` → `aria-expanded="false"`）。

## 共有モジュールのスタブ

`lib/color.js`・`lib/palettes.js`・`lib/tilemap.js` は、名前・引数・戻り値を JSDoc に書いたスタブで、呼ぶと `Error('未実装: 関数名')` を投げます。
担当が実装するまで、図からは呼ばないでください（`tests/contract.test.js` は export 名だけを検査します）。
細部は各ファイルの JSDoc が正で、ここには複数の担当にまたがる取り決めだけを書きます。

### パレットと階級分け（`lib/palettes.js`）

- パレット ID は ColorBrewer の名前（`'Blues'` など）と、Okabe–Ito の `'OkabeIto'`。
  `list()` が返す各パレットの情報は `{ id, label, type, source, classCounts }` で、`label` は画面に出す表示名（例：`'Blues'`、`'Okabe–Ito'`）。
- `get('OkabeIto', n)` は「オレンジ、スカイブルー、青みがかった緑、黄、青、朱、赤紫、黒」の順で、先頭から n 色を返す。
- `scale(id, n, domain, options)` は、数値をパレットの色に対応づける。**同じ地図を複数の図が同じ区切りで塗れるように、階級分けはこの関数を使う**。区切りは等間隔。
  - `center` を指定しない：`domain`（最小値と最大値）を n 等分する。値が小さい階級ほど `colors` の先頭側。
  - `center` を指定する（分岐的な使い方）：`center` から最小値・最大値までの距離の大きいほうを h として、`[center - h, center + h]` を n 等分する。n が奇数なら中央の階級が `center` をまたぐ。
  - 戻り値は `{ color(value), index(value), thresholds, colors }`。`thresholds` は階級の境界（n - 1 個）、`colors` は n 色、`index` は 0〜n-1 の階級番号。

### 色計算（`lib/color.js`）

- RGB は「ガンマ補正済み sRGB、各成分 0〜1」の配列 `[r, g, b]`。hex は `'#rrggbb'`（小文字）。
- `hexToOklch(hex)` は、彩度がほぼ 0 の色（`c < 0.0001`）では `h` を 0 にする。
- `maxChroma(l, h)` は、明るさ `l`（0〜1）と色相 `h`（度）で sRGB の色域に収まる最大の彩度を返す。

### 都道府県データの単位と座標（`data/prefectures.json`、`lib/tilemap.js`）

- `aged65`：65歳以上人口の割合。単位は %（例：39.5）。
- `popChange`：2023年10月1日から2024年10月1日までの人口増減率。単位は %（例：-1.87）。
- `x`：左（西）から数えた列番号、0〜12 の整数。`y`：上（北）から数えた行番号、0〜11 の整数。同じ (x, y) を2つの都道府県が持つことはない。
- `meta.units`（`{ aged65: "%", popChange: "%" }`）と `meta.grid`（`{ columns: 13, rows: 12 }`）に、単位とマス目の大きさを持つ。
- `tilemap.render` は、SVG を `viewBox` つきで描き、幅は親要素いっぱいに伸縮する。`labels` が真のとき、マスの文字色は塗りの明るさに応じて濃い色か白かを自動で選ぶ。`fill` が返す色は `#rrggbb`。

## 同梱したライブラリ

- D3 **7.9.2**（`npm pack d3@7` で取得した tarball の `dist/d3.min.js`）。ライセンスは ISC（`vendor/d3/LICENSE`）。
  HTML では `<script src="…/vendor/d3/d3.min.js"></script>` で読み込み、モジュールは `globalThis.d3` を使います。
