# データの性質で選ぶ、色の使い方

初学者向けの日本語スクロール型解説ページ「データの性質に合ったカラースキームの選び方」のリポジトリです。
ビルド工程のない静的サイト（バニラJSのESモジュール・CSS・HTML）で、依存パッケージはありません。
このファイルは、後続の担当が最初に読む文書です。

## 動かし方

```sh
npm run serve      # 依存なしの静的サーバ。http://localhost:4173/ を開く（PORT=8080 npm run serve で変更可）
npm test           # node --test "tests/**/*.test.js"
npm run shots      # 撮影と表示検査（下の「撮影と表示検査」）
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
lib/color.js            色計算（実装済み）
lib/palettes.js         パレット（実装済み）
lib/tilemap.js          都道府県タイル地図（実装済み）
data/prefectures.json   都道府県データ（実装済み。数値は総務省統計局『人口推計』から転記）
widgets/_template/      図のひな形：index.js、style.css、demo.html
widgets/<名前>/         9つの図（実装済み）：index.js、style.css、demo.html、必要なら自前のデータ
widgets/_placeholder.js 「準備中」の枠（モジュールが無い図の名前があるときに、main.js が使う）
LICENSES/Apache-2.0.txt ColorBrewer のライセンス（Apache License 2.0）の全文
tests/                  contract.test.js（共有モジュール・データ・図の mount の契約）、page.test.js（index.html の骨組み）
                        共有モジュールの担当は tests/<モジュール名>.test.js を足す（後述）
scripts/serve.mjs       静的ファイルサーバ（createStaticServer を export。shots.mjs も使う）
scripts/shots.mjs       撮影と表示検査（npm run shots）
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
9つの図はすべて実装済みです。新しい図を足すときは、`widgets/<名前>/index.js` を置いてから、`index.html` にマウント点を足します
（モジュールが存在しない名前を import するとブラウザがコンソールに 404 を出すため、マウント点だけを先に置くのは避けます）。

### 図の作り方

1. `widgets/_template/` の中身を、自分の `widgets/<名前>/` にコピーする。
2. クラス名の接頭辞 `template__` を自分の図の名前に直し、`demo.html` の `data-widget` と見出しも直す。
3. `http://localhost:4173/widgets/<名前>/demo.html` で確認し、`/` のページでも表示されることを確かめる。

## 撮影と表示検査

レビュー担当と検証担当が、1コマンドでスクリーンショットを撮り、表示の問題を機械的に見つけるためのスクリプト（`scripts/shots.mjs`）です。

```sh
npm run shots                                  # index.html と、すべての demo.html を撮影・検査する
npm run shots -- widgets/quiz/demo.html        # 指定したページだけを対象にする（複数指定できる）
```

- 静的ファイルサーバ（`scripts/serve.mjs` の `createStaticServer`）を空いているポートで自分で起動し、終わったら止めます。`npm run serve` を起動しておく必要はありません。
- 対象は `index.html`、`widgets/*/demo.html`（ひな形の `widgets/_template/demo.html` を含む）、`lib/*.demo.html` です。
- 各ページを幅 1280px と 390px で開き、`<html data-widgets-ready="true">` が付くのを待ちます（15 秒で付かなければ不合格）。そのあと、ページ全体の画像を `screenshots/<ページ名>-<幅>.png` に保存します。
  ページ名はパスの `/` を `-` にして `.html` を除いたもの（例：`widgets/quiz/demo.html` → `widgets-quiz-demo-1280.png`）です。
  `index.html` では、各図（`[data-widget]`）を要素単位でも `screenshots/index-<幅>-<図の名前>.png` に撮ります。
- 撮影は `prefers-reduced-motion: reduce` の状態で行います（JS の演出を止めて、撮影を安定させるため）。
- `screenshots/` は `.gitignore` に入れてあり、コミットしません。同じページ・幅の古い画像は、撮影のたびに消してから撮ります。
- Playwright は `package.json` に加えていません。環境に導入済みのものを `require('playwright')` で読み込みます。読み込めない環境では、その旨を出して終了します。

各ページ・各幅で次を検査し、結果を表にして標準出力に出します。

| 検査 | 合格の条件 |
|---|---|
| コンソールのエラー | 0 件（`console.error` と、捕捉されなかった例外の件数） |
| 失敗したリクエスト | 0 件（通信の失敗と、HTTP 400 以上の応答の件数。404 はコンソールのエラーにも数えられる） |
| 横スクロール | なし（`document.documentElement.scrollWidth <= window.innerWidth`） |
| エラー表示 | 「図を表示できませんでした」の表示（`.widget-error` と、本文中のその文言）が 0 件 |
| SVG 内の文字の最小サイズ | 表示上のサイズが 11px 以上。`svg text` ごとに「計算された `font-size` × 画面への拡大率（`viewBox` の縮尺を含む）」を測る。表示されていない文字は対象外 |
| 準備中の個数 | 件数の表示だけで、合否には関係しない（`.widget-placeholder` の個数。9つの図が実装済みの現在は 0） |

1つでも不合格があれば、表のあとに内訳（エラーの文面や失敗した URL）を出し、終了コードを 1 にします。
引数のパスが無いなど、実行の前提を満たさないときの終了コードは 2 です。

## 担当範囲の取り決め

並行作業で互いに衝突しないよう、編集してよい範囲を次のとおり分けます。

| 担当 | 編集してよい範囲 |
|---|---|
| 図 | `widgets/<自分の名前>/` の中だけ |
| 本文 | `index.html` の自分の章の `data-prose="…"` の `<div>` と、図の直後の `data-after="…"` の `<div>`（`.prose-after`）の中だけ |
| 共有モジュール | 自分の `lib/*.js`（または `data/prefectures.json`）と、自分のモジュールのテスト `tests/<モジュール名>.test.js`（新しいファイル）だけ。モジュール名は `color`、`palettes`、`tilemap`、`prefectures` |
| 撮影スクリプト | `package.json` と `scripts/`。この2つは撮影スクリプトの担当だけが編集する（他の担当は、npm のコマンドを足したいときも編集しない）。`npm test` は `tests/**/*.test.js` を拾うので、テストを足すのに `package.json` の編集は要らない |

- `tests/contract.test.js` と `tests/page.test.js` は骨組みのもので、他の担当は編集しません。
- 出典の章（`data-prose="sources"`）は、第3〜5章（`ch3`〜`ch5`）の本文の担当が書きます。出典を足すときは、自分が使った出典の項目を足すだけにして、他の担当が書いた項目は触りません。

`css/base.css`、`main.js`、`lib/deps.js`、`lib/dom.js`、`tests/contract.test.js`、`tests/page.test.js`、章の見出しとマウント点は、骨組みで決めた契約です。
変更が必要なときは、勝手に直さず統括に相談します。

## 共通の操作部品（`css/base.css`）

| クラス | 用途 |
|---|---|
| `.ctl` | 操作部品を横にまとめる行（収まらなければ折り返す） |
| `.ctl-slider` | ラベル + `<input type="range">` + 値表示（`<output>`） |
| `.ctl-segment` | 選択ボタンの組。`role="radiogroup"` の中にネイティブのラジオを置くので、矢印キーの操作はそのまま使える。狭い幅で2段に折り返しても、段の間に区切り線が見える |
| `.ctl-toggle` | チェックボックスの切り替え |
| `.fig-title` | 図の見出し。`<p class="fig-title">` で書き、形は「図の名前：ひとことの説明」にそろえる（例：「色の3つのつまみ：色相・彩度・明度で色を作る」）。本文は図をこの名前で呼ぶ |
| `.fig-subtitle` | 図の中の小見出し。`<p class="fig-subtitle">` で書く |
| `.fig-note` | 図の下の説明文 |
| `.ctl-button` | 図の中のボタン（白地・枠線つき）。図ごとの専用ボタンのクラスは作らない |
| `.ctl-button--primary` | `.ctl-button` に重ねる修飾クラス。主要な操作に使う（濃いグレーの塗り） |
| `.prose-after` | 図のあとに読ませる文章。`<figure data-widget="名前">` の直後に `<div class="prose-after" data-after="名前">` で置く。見た目は `.prose` と同じ |
| `aside.note` | 補足の枠。本文より控えめな無彩色の面 |
| `.verdict` + `--good` / `--caution` / `--bad` | 判定表示。無彩色のまま、記号「○」「△」「×」と枠線の太さ（1px／2px／4px）で区別する。記号は飾りで、判定の語（「合う」「条件つき」「誤読を招く」など）は中身の文字として必ず入れる |
| `.swatch` | 色見本の四角。`style: { '--swatch': '#rrggbb' }` で色を付ける |
| `.legend` | 凡例（`<ul class="legend">` の中に `<li>` を並べる） |

### ページ全体の取り決め

- 図の見出し（`.fig-title`）は「図の名前：ひとことの説明」の形にそろえます。
- 各 `<figure data-widget="名前">` には `id="fig-名前"` を付けます。本文から離れた図に触れるときは、その図へのページ内リンクにし、「第4章の」のように章を添えます。
- 2色が「見分けにくい」かどうかの目安は、ページ全体で OKLab 上の色の差（`color.deltaE`）0.06 にそろえます。知覚実験に基づく値ではなく、このページで決めた目安です（出典の章の「判定の目安」にも書いてあります）。
- 人口増減率の期間は「2023年10月〜2024年9月の1年間」です。
- `aria-live` の領域は、文の内容が変わったときだけ書き換えます。スライダーを動かしている最中は、止まってから（300ミリ秒ほど待って）書き換えます。
- 幅 600px 以下の画面では、`.ctl-segment` の選択肢・`.ctl-button`・`.ctl-toggle` の押せる範囲の高さが 44px 以上になり、`.ctl-slider` のつまみも大きくなります（`css/base.css`）。

マークアップの見本は `widgets/_template/index.js` にあります。`lib/dom.js` は `ensureStyle(url)`、`el(tag, attrs, children)`、`uid(prefix)` の3つです。
`el()` は、値が `false` / `null` / `undefined` の属性は付けませんが、`aria-` で始まる属性だけは `false` も `"false"` として付けます（例：`'aria-expanded': false` → `aria-expanded="false"`）。

## 共有モジュール

`lib/color.js`・`lib/palettes.js`・`lib/tilemap.js` は実装済みで、`tests/<モジュール名>.test.js` が挙動を検査しています。
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
- `popChange`：2023年10月〜2024年9月の1年間の人口増減率（前年10月1日の人口に対する率）。単位は %（例：-1.87）。
- `x`：左（西）から数えた列番号、0〜12 の整数。`y`：上（北）から数えた行番号、0〜11 の整数。同じ (x, y) を2つの都道府県が持つことはない。
- `meta.units`（`{ aged65: "%", popChange: "%" }`）と `meta.grid`（`{ columns: 13, rows: 12 }`）に、単位とマス目の大きさを持つ。
- `tilemap.render` は、SVG を `viewBox` つきで描き、幅は親要素いっぱいに伸縮する。`labels` が真のとき、マスの文字色は塗りの明るさに応じて濃い色か白かを自動で選ぶ。`fill` が返す色は `#rrggbb`。

## 同梱したライブラリ

- D3 **7.9.2**（`npm pack d3@7` で取得した tarball の `dist/d3.min.js`）。ライセンスは ISC（`vendor/d3/LICENSE`）。
  HTML では `<script src="…/vendor/d3/d3.min.js"></script>` で読み込み、モジュールは `globalThis.d3` を使います。

## ライセンス

- D3：ISC License（`vendor/d3/LICENSE`）。
- ColorBrewer のパレット：Apache License 2.0。全文は [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt)（https://www.apache.org/licenses/LICENSE-2.0.txt から取得）。
  表示すべき帰属表示の文面は `lib/palettes.js` の `ATTRIBUTION` にあり、出典の章（`index.html`）にも載せています。
- 都道府県のデータ：総務省統計局『人口推計』をもとに加工して作成。公共データ利用規約（第1.0版）に基づき利用しています（`data/prefectures.json` の `meta`）。
