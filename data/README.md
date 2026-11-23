# data/

## prefectures.json

都道府県データ（47件）。タイル地図と、定性的・連続的・分岐的の各図が使います。スキーマと単位は、リポジトリ直下の `README.md` の「都道府県データの単位と座標」にあります。

- `aged65`：65歳以上人口の割合（%、小数1桁）。原典：表10「都道府県、年齢３区分別人口の割合」の2024年の「65歳以上」列
- `popChange`：人口増減率（%、小数2桁）。2023年10月1日から2024年10月1日まで。原典：表6「都道府県別人口増減率」の2024年列
- `x`・`y`：タイル地図の座標（13列×12行）。統計局の値ではなく、地理上の位置関係を優先して作った座標です。沖縄県は左下（0, 11）に置き、y=10 の行は空けています
- `region`：一般的な八地方区分（三重県は近畿、山梨県・新潟県は中部、沖縄県は九州に含める）。統計局の統計表の区分（三重県を東海に含める）とは異なります

出典：総務省統計局「人口推計（2024年（令和6年）10月1日現在）結果の概要」（2025年4月14日公表）
<https://www.stat.go.jp/data/jinsui/2024np/index.html>
利用条件：公共データ利用規約（第1.0版）に準拠。出典を記載し、加工した旨を明記します（<https://www.stat.go.jp/info/riyou.html>）。

統計局の Excel（第2表・第3表）には率の表がなく、率は PDF の表6・表10にしかありません。そのため PDF から表を抽出しています。

## 再現手順

作業用ディレクトリ `work/` を作り、ダウンロードしたファイルは `work/dl/`、スクリプトは `work/` に置きます。
ダウンロードしたファイルのあるディレクトリから Python を実行しないよう、`-I` を付けます。

### 1. 原典を取得する

```sh
mkdir -p work/dl && cd work
curl -fsS -o dl/2024gaiyou.pdf https://www.stat.go.jp/data/jinsui/2024np/pdf/2024gaiyou.pdf
sha256sum dl/2024gaiyou.pdf
# 742093 bytes、3031cd2d5347371865f2b816ecc1794244a699a90f8007bfe552c689b9014b5d になるはずです
pip install pdfplumber openpyxl
```

### 2. 表6・表10から 47 都道府県と全国を抽出する

下の `extract.py` を `work/extract.py` として保存して実行します。出力は `code,name,growth_pct,aged65_pct` の CSV です（全国は code 00）。

```sh
python3 -I extract.py dl/2024gaiyou.pdf > pref_data.csv
```

`extract.py`:

```python
#!/usr/bin/env python3
"""人口推計(2024年10月1日現在) 結果の概要PDF から
 表6 都道府県別人口増減率 (2024年列) と 表10 年齢3区分別人口の割合 (2024年の65歳以上列) を抽出し、
 47都道府県 + 全国 の CSV を標準出力へ書く。

使い方: python3 -I extract.py 2024gaiyou.pdf > pref_data.csv
依存: pip install pdfplumber  (または pypdf; 下の extract_text 部分を差し替え)
"""
import re
import sys

PREFS = """北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県
新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県
鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県""".split()
assert len(PREFS) == 47
CODE = {n: f"{i + 1:02d}" for i, n in enumerate(PREFS)}
CODE["全国"] = "00"

NAME_RE = "|".join(sorted(PREFS + ["全国"], key=len, reverse=True))


def page_texts(path):
    """PDF の各ページのテキスト。pdfplumber → pypdf → pdftotext(poppler) の順に試す。"""
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            return [(p.extract_text() or "") for p in pdf.pages]
    except ImportError:
        pass
    try:
        import pypdf
        return [(p.extract_text() or "") for p in pypdf.PdfReader(path).pages]
    except ImportError:
        pass
    import subprocess
    out = subprocess.run(["pdftotext", "-layout", path, "-"], check=True, capture_output=True, text=True).stdout
    return out.split("\f")


def squeeze(line):
    # "北 海 道" -> "北海道" : 漢字間の空白だけ除去する（数値の間の空白は残す）
    return re.sub(r"(?<=[぀-鿿]) +(?=[぀-鿿])", "", line)


def parse_growth(texts):
    """表6: 1行に3組 (順位 県名 2024年 2023年)。2024年の値だけ取る。"""
    page = next(t for t in texts if re.search(r"表６\s*都道府県別人口増減率", t))
    out = {}
    pat = re.compile(rf"(?:(\d+|－)\s+)?({NAME_RE})\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)")
    for line in page.splitlines():
        line = squeeze(line)
        for m in pat.finditer(line):
            out[m.group(2)] = m.group(3)
    return out


def parse_ageshare(texts):
    """表10: 1行 = 県名 + 2024年4列 + 2023年4列。2024年の15歳未満,15-64,65+,75+ を取る。"""
    page = next(t for t in texts if re.search(r"表10\s*都道府県、年齢３区分別人口の割合", t))
    out = {}
    pat = re.compile(rf"^({NAME_RE})((?:\s+\d+\.\d+){{8}})\s*$")
    for line in page.splitlines():
        line = squeeze(line).strip()
        m = pat.match(line)
        if m:
            v = m.group(2).split()
            out[m.group(1)] = dict(u15=v[0], w15_64=v[1], o65=v[2], o75=v[3])
    return out


def main(path):
    texts = page_texts(path)
    g = parse_growth(texts)
    a = parse_ageshare(texts)
    names = ["全国"] + PREFS
    missing = [n for n in names if n not in g or n not in a]
    if missing:
        sys.exit(f"抽出失敗: {missing}")
    print("code,name,growth_pct,aged65_pct")
    for n in names:
        print(f"{CODE[n]},{n},{g[n]},{a[n]['o65']}")


if __name__ == "__main__":
    main(sys.argv[1])
```

### 3. Excel の人口から計算した値と照合する

千人単位の人口（第2表・第3表）から率を計算し、PDF の値との差を見ます。丸めの影響で最大 0.1 ポイント程度ずれますが、抽出ミス（桁ずれ・行ずれ）があれば大きく外れます。

```sh
curl -fsS -o dl/05k2024-2.xlsx https://www.stat.go.jp/data/jinsui/2024np/zuhyou/05k2024-2.xlsx
curl -fsS -o dl/05k2024-3.xlsx https://www.stat.go.jp/data/jinsui/2024np/zuhyou/05k2024-3.xlsx
curl -fsS -o dl/05k2023-2.xlsx https://www.stat.go.jp/data/jinsui/2023np/zuhyou/05k2023-2.xlsx
python3 -I crosscheck.py dl pref_data.csv
# max |diff| growth(pt)=0.098  aged65(pt)=0.079  n=47
```

`crosscheck.py`:

```python
import csv, sys, openpyxl
base=sys.argv[1]
def pop(path,col):
    ws=openpyxl.load_workbook(path,data_only=True).active
    d={}
    for r in range(12,62):
        code=ws.cell(r,2).value
        if code and str(code).isdigit(): d[str(code)]=ws[f'{col}{r}'].value
    return d
p24=pop(base+'/05k2024-2.xlsx','E'); p23=pop(base+'/05k2023-2.xlsx','E')
ws=openpyxl.load_workbook(base+'/05k2024-3.xlsx',data_only=True).active
o65={str(ws.cell(r,2).value):ws[f'G{r}'].value for r in range(14,61)}
rows=list(csv.DictReader(open(sys.argv[2],encoding='utf-8')))
mg=ma=0
for r in rows:
    c=r['code']
    if c=='00': continue
    g=(p24[c]-p23[c])/p23[c]*100; a=o65[c]/p24[c]*100
    dg=abs(g-float(r['growth_pct'])); da=abs(a-float(r['aged65_pct']))
    mg=max(mg,dg); ma=max(ma,da)
    if dg>0.1 or da>0.1: print('WARN',r,round(g,3),round(a,3))
print('max |diff| growth(pt)=%.3f  aged65(pt)=%.3f  n=%d'%(mg,ma,len(p24)))
```

### 4. JSON に書き込む

座標表（下の `coords.csv`）を `work/coords.csv` として保存し、`build.py` で `data/prefectures.json` の `aged65`・`popChange`・`x`・`y` を書き換えます（`regions`・`meta` は手で編集します）。

```sh
python3 -I build.py ../data/prefectures.json pref_data.csv coords.csv > prefectures.json.new
mv prefectures.json.new ../data/prefectures.json
cd .. && npm test
```

`build.py`:

```python
import csv, json, sys
# 使い方: python3 -I build.py data/prefectures.json pref_data.csv coords.csv > data/prefectures.json.new
# pref_data.csv … extract.py の出力（code,name,growth_pct,aged65_pct）
# coords.csv   … code,name,region_id,x,y（タイルグリッドの座標表。13列×12行）
d = json.load(open(sys.argv[1], encoding="utf-8"))
vals = {r["code"]: r for r in csv.DictReader(open(sys.argv[2], encoding="utf-8"))}
xy = {r["code"]: r for r in csv.DictReader(open(sys.argv[3], encoding="utf-8"))}
for p in d["prefectures"]:
    c = p["code"]
    assert p["name"] == vals[c]["name"] == xy[c]["name"] and p["region"] == xy[c]["region_id"]
    p["aged65"] = float(vals[c]["aged65_pct"])
    p["popChange"] = float(vals[c]["growth_pct"])
    p["x"], p["y"] = int(xy[c]["x"]), int(xy[c]["y"])
print(json.dumps(d, ensure_ascii=False, indent=2))
```

`coords.csv`（コード、名称、地方ID、x、y）:

```csv
code,name,region_id,x,y
01,北海道,hokkaido,12,0
02,青森県,tohoku,12,1
03,岩手県,tohoku,12,2
04,宮城県,tohoku,12,3
05,秋田県,tohoku,11,2
06,山形県,tohoku,11,3
07,福島県,tohoku,11,4
08,茨城県,kanto,12,5
09,栃木県,kanto,11,5
10,群馬県,kanto,10,5
11,埼玉県,kanto,11,6
12,千葉県,kanto,12,6
13,東京都,kanto,11,7
14,神奈川県,kanto,10,7
15,新潟県,chubu,10,4
16,富山県,chubu,9,4
17,石川県,chubu,8,4
18,福井県,chubu,7,5
19,山梨県,chubu,10,6
20,長野県,chubu,9,5
21,岐阜県,chubu,8,5
22,静岡県,chubu,9,6
23,愛知県,chubu,8,6
24,三重県,kinki,7,7
25,滋賀県,kinki,7,6
26,京都府,kinki,6,6
27,大阪府,kinki,5,7
28,兵庫県,kinki,5,6
29,奈良県,kinki,6,7
30,和歌山県,kinki,6,8
31,鳥取県,chugoku,4,6
32,島根県,chugoku,3,6
33,岡山県,chugoku,4,7
34,広島県,chugoku,3,7
35,山口県,chugoku,2,7
36,徳島県,shikoku,4,9
37,香川県,shikoku,4,8
38,愛媛県,shikoku,3,8
39,高知県,shikoku,3,9
40,福岡県,kyushu,1,7
41,佐賀県,kyushu,0,7
42,長崎県,kyushu,0,8
43,熊本県,kyushu,1,8
44,大分県,kyushu,2,8
45,宮崎県,kyushu,2,9
46,鹿児島県,kyushu,1,9
47,沖縄県,kyushu,0,11
```

## 確認した値

- 取得した 47 件の値は、検算値（北海道 -0.97／33.3、秋田県 -1.87／39.5、東京都 0.66／22.7、大阪府 -0.07／27.6、沖縄県 -0.11／24.2）と一致しました。全国は -0.44／29.3 です
- 増減率の範囲は -1.87（秋田県）〜0.66（東京都）、65歳以上割合の範囲は 22.7（東京都）〜39.5（秋田県）です。増減率が正なのは東京都（0.66）と埼玉県（0.01）の2つです
- PDF 本文の記述（人口減少率が1%以上の県は18県、65歳以上が30%以上の道県は36）とも一致しました
- `npm test` の `tests/prefectures.test.js` が、上記の値と座標・地方区分の整合を検査します
