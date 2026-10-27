# TimeLayer - カレンダー地層ビュー (Calendar Strata Viewer)

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/<extension-id>)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/version-1.3.0-10b981.svg)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-☕-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/youichinakq)

> **「時間を地層のように重ねる」**  
> 今週と過去（1年前・2年前）の Google カレンダーの予定を地層のように重ねて比較・振り返りができる Google Chrome 拡張機能です。

---

## 📖 概要 (Overview)

日々の生活や仕事のサイクル・習慣は、年単位の周期で繰り返されることが多くあります。  
「去年の今頃は何をしていたっけ？」「一昨年のこの時期の繁忙期はどう乗り切ったっけ？」といった疑問を、これまでは過去のカレンダーを何画面もスクロールして遡る必要がありました。

**TimeLayer** は、Google カレンダーと連携し、**「現在（今週）」・「1年前の同週」・「2年前の同週」**の予定を同一画面上に多層（地層 / Strata）として重ね合わせて一覧表示します。

---

## 🚀 インストール & はじめ方 (Quick Start)

### 1. ストアからインストール
[Chrome ウェブストア](https://chromewebstore.google.com/detail/<extension-id>) から **「Chrome に追加」** をクリックしてインストールします。

> [!TIP]
> インストール後、ブラウザ右上ツールバーの拡張機能パズルアイコンから **TimeLayer をピン留め** しておくと、ワンクリックでいつでもサイドパネルを呼び出せて便利です。

### 2. Google アカウントでログイン
1. ツールバーの **TimeLayer アイコン** をクリックしてサイドパネルを開きます。
2. 初回起動画面に表示される **「Google アカウントでログイン」** ボタンをクリックします。
3. 認証ポップアップで、カレンダーを連携したい Google アカウントを選択し、アクセスを許可します。
   - ※ 要求する権限はカレンダー一覧と予定の **「読み取り専用（Read-only）」** のみです。予定の作成や削除を行う権限は一切求めません。

わずかこれだけでセットアップ完了です！現在の予定と1年前・2年前の同じ週の予定が即座に読み込まれます。

---

## ✨ 3つの表示スタイル (Multi-View Experience)

作業環境や好みに合わせて、3つの表示スタイルをシームレスに使い分けられます。

| スタイル | 呼び出し方 | おすすめの利用シーン |
| :--- | :--- | :--- |
| 📌 **Chrome サイドパネル** | ツールバーのアイコンをクリック | ブラウジングを遮らずに常時参照。調べ物や作業中の振り返りに最適。 |
| 🪐 **大画面パノラマダッシュボード** | ヘッダーの全画面アイコン または 右クリックメニュー | 新しいタブで広々と予定を比較。週全体の詳細な振り返りや計画立てに。 |
| 🚀 **Google カレンダー直接埋め込み** | `calendar.google.com` 右下の専用ランチャー | いつものカレンダー画面からワンクリックでスライドインドロワーを展開。 |

---

## 💡 便利な機能・使い方 (Features)

### 1. 3つの時間の地層 (Strata Layers)
- **Layer 01: 表層 (現在)** - 現在進行中の今週のスケジュール（エメラルド）
- **Layer 02: 中間層 (1年前)** - 1年前の同週のスケジュール（アンバー）
- **Layer 03: 深層 (2年前)** - 2年前の同週のスケジュール（パープル）

### 2. 大画面ダッシュボードの2大ビュー
- **週横組みビュー（Matrix View）**: 曜日（7日間）を横軸、3つの地層を縦軸に並べたマトリクス比較。
- **3列カラムビュー（Columns View）**: 現在・1年前・2年前を並列表示。全7曜日が水平ラインでピタリと揃い、3列が完全に同期して連動スクロールします。

### 3. 高度なスケジュール比較 & 管理
- **日曜始まり / 月曜始まり切り替え**: 週セレクタ横のボタンからいつでもワンクリックで切り替え可能。
- **全画面間のリアルタイム自動同期**: サイドパネルや大画面ダッシュボードなど、複数画面を同時に開いていても、カレンダーの選択や週移動、テーマ変更がリアルタイムに相互同期。
- **大画面を開いた時のスマートクローズ**: サイドパネルやカレンダー内ドロワーから大画面ダッシュボードを開くと、自動で元のサイドビューが閉じて画面をスッキリ保ちます。
- **複数カレンダー切り替え**: 業務・プライベート・祝日・共有カレンダーなどを自由に選択可能。
- **全地層インクリメンタル検索**: キーワード入力で、現在・1年前・2年前のすべての予定を瞬時に横断検索・ハイライト。
- **ダークモード / ライトモード**: OSのシステム設定に自動連動するほか、ヘッダーのボタンからいつでも手動切り替え可能。

---

## 🔒 プライバシー & セキュリティ (Privacy & Security)

TimeLayer はプライバシー第一で設計されています：

- **外部サーバー不使用 & 完全ローカル動作**: カレンダー情報はユーザーのブラウザと Google 公式 API（`googleapis.com`）の間でのみ直接通信され、開発者を含むサードパーティのサーバーには一切送信・蓄積されません。
- **最小限の権限設計（Least Privilege）**: カレンダー一覧の読み取り（`calendarlist.readonly`）とイベントの読み取り（`events.readonly`）のみを使用します。カレンダー設定の参照や、予定の作成・変更・削除等の権限は一切保持しません。
- **インメモリ・トークン管理 & 1時間自動失効**: OAuth アクセストークンはブラウザのメモリ内（`chrome.storage.session`）でのみ一時保持され、ディスクに平文保存されません。また、最大1時間（またはブラウザ終了・ログアウト時）で自動破棄されます。
- **外部 CDN 通信ゼロ**: UIフォントは OS 標準の高品質システムフォントを採用し、外部 CDN への依存を排除しています。

---

## ☕ 開発の応援 (Support)

TimeLayer は個人開発のオープンソースプロジェクトとしてメンテナンス・改善を行っています。  
もしこの拡張機能が日々のカレンダー管理や振り返りに役立ちましたら、Buy Me a Coffee からコーヒーを一杯ごちそうしていただけると、継続的な開発や新機能追加の大きな励みになります！

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=youichinakq&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://buymeacoffee.com/youichinakq)

---

## 📄 ライセンス (License)

本プロジェクトは [MIT License](LICENSE) の下で公開されています。
