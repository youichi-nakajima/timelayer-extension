# TimeLayer - カレンダー地層ビュー (Calendar Strata Viewer)

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/version-1.3.0-10b981.svg)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **「時間を地層のように重ねる」**  
> 今週と過去（1年前、2年前）の Google カレンダーの予定を地層のように重ねて比較・振り返りができる Google Chrome 拡張機能です。

---

## 📖 概要 (Overview)

日々の生活や仕事のサイクル・習慣は、年単位の周期で繰り返されることが多くあります。  
「去年の今頃は何をしていたっけ？」「一昨年のこの時期の繁忙期はどう乗り切ったっけ？」といった疑問を、これまでは過去のカレンダーを何画面もスクロールして遡る必要がありました。

**TimeLayer** は、Google カレンダーと連携し、**「現在（今週）」・「1年前の同週」・「2年前の同週」**の予定を同一画面上に多層（地層 / Strata）として重ね合わせて一覧表示します。

---

## ✨ 主な特徴 (Features)

### 1. 3つの表示スタイル (Multi-View Experience)
利用シーンに合わせて最適なビューを選択できます。

| スタイル | 説明 |
| :--- | :--- |
| 📌 **Chrome サイドパネル** | ブラウジングを妨げずに閲覧できるサイドパネルビュー。作業中の常時参照やメモの確認に最適。 |
| 🪐 **大画面パノラマダッシュボード** | 新しいタブで展開するフルスクリーンダッシュボード。<br>・**週横組みビュー（Matrix View）**: 曜日（7日間）を横軸、3つの地層を縦軸に並べたマトリクス比較。<br>・**3列カラムビュー（Columns View）**: 現在・1年前・2年前を並列表示。全7曜日が水平ラインでピタリと整列し、3列が完全に同期して連動スクロール。 |
| 🚀 **Google カレンダー直接埋め込み** | `calendar.google.com` の右下に専用のフローティングランチャーが常駐。クリックするだけでページ内にスライドインドロワーとして展開可能。 |

### 2. 3つの時間の地層 (Strata Layers)
- **Layer 01: 表層 (現在)** - 現在進行中の今週のスケジュール
- **Layer 02: 中間層 (1年前)** - 1年前の同週のスケジュール
- **Layer 03: 深層 (2年前)** - 2年前の同週のスケジュール

### 3. 高度なカレンダー管理 & 検索
- **日曜始まり / 月曜始まりの切り替え**: 週セレクタ横のボタンからいつでもワンクリックで切り替え可能。ビジネスユース（月曜始まり）にも柔軟に対応。
- **画面間のリアルタイム自動同期**: サイドパネルや大画面ダッシュボードなど、複数画面を同時に開いている場合でも、カレンダーの選択状態や開始曜日、テーマ変更がリアルタイムに相互同期。
- **複数カレンダー切り替え**: メインカレンダー、祝日カレンダー、業務・個人などの共有カレンダーをワンクリックで選択・切り替え可能。
- **全地層横断検索**: 予定名や場所のキーワードで、現在・1年前・2年前のすべての予定を瞬時にインクリメンタル検索・ハイライト表示。
- **3列カラムの曜日整列＆連動スクロール**: 予定の有無にかかわらず全7曜日の行が3列で水平に揃い、どこをスクロールしても3列が一体となって滑らかに同期スクロール。
- **複数日・日マタギ予定の完全サポート**: 数日間にまたがる出張や連休・合宿などの長期イベントも、帯状のトラックや各曜日のセルで欠落なくわかりやすく可視化。

### 4. 堅牢なパフォーマンス & セキュリティ設計
- **最小権限（Least Privilege）のスコープ設計**: カレンダー設定等の不要な権限を排除し、予定比較・表示に必要な2つの最小権限（`calendar.calendarlist.readonly` および `calendar.events.readonly`）のみを要求します。予定の作成・改変・削除権限は一切保持しません。
- **CSRF 対策（OAuth state 検証）**: 認証フロー時に暗号学的に安全なランダム `state` を生成・照合し、なりすましや不正なリダイレクトを防止。
- **インメモリ・トークン管理**: OAuth トークンは `chrome.storage.session`（メモリ内）でのみ管理され、ブラウザ終了時や明示的なサインアウトで安全に破棄されます（ディスクに平文保存されません）。
- **通信サイズ85%削減 (fields 最適化)**: API レスポンスの不要なメタデータを省き、必要な属性のみを要求することで通信サイズを大幅に削減し、高速化と省メモリ化を実現。
- **レート制限 & バックオフ制御**: Google Calendar API のリクエスト制限（429 / 403 Rate Limit）に備えた最大3回の指数バックオフ（Exponential Backoff）および同時接続数制限キューを実装。
- **スマートキャッシュ**: 静的な過去の予定は長期間、現在の予定は短期間のTTLキャッシュを効かせることで、高速な表示とAPI消費量の最小化を両立。

### 5. モダンデザイン
- **ダークモード / ライトモード**: システム設定に連動するほか、ヘッダーのボタンからいつでもワンクリックで切り替え可能。
- **洗練されたタイポグラフィ**: OSネイティブの高品質システムフォント（San Francisco / Segoe UI / Hiragino Sans / Meiryo 等）を採用し、追加のフォント読み込みやライセンス管理を一切不要としながら、情報の視認性と美しさを両立。

---

## 🚀 インストール & セットアップ手順

### 前提条件
- Google Chrome（Manifest V3 / サイドパネル対応: Chrome 116 以降推奨）
- Google アカウント

### 1. リポジトリのクローン / ダウンロード
```bash
git clone https://github.com/youichi-nakajima/timelayer-extension.git
```

### 2. Chrome への拡張機能の読み込み
1. Chrome を開き、URL バーに `chrome://extensions` と入力して拡張機能管理ページを開きます。
2. 右上の **「デベロッパー モード」** を ON にします。
3. 左上に表示される **「パッケージ化されていない拡張機能を読み込む」** をクリックします。
4. クローンした `timelayer-extension` フォルダを選択して読み込みます。
5. 拡張機能一覧に **「TimeLayer - カレンダー地層ビュー」** が追加され、**拡張機能 ID**（例: `abcdefghijklmnopqrstuvwxyzabcdef`）が発行されます。

### 3. Google Cloud Console の OAuth 2.0 設定（開発者向け）
自前で Google API クライアントを使用する場合は、以下の手順でクライアント ID を作成・設定します。

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、プロジェクトを作成（または選択）します。
2. **「API とサービス」 > 「ライブラリ」** から **「Google Calendar API」** を有効化します。
3. **「API とサービス」 > 「認証情報」** で **「認証情報を作成」 > 「OAuth クライアント ID」** を選択します。
   - アプリケーションの種類: **「ウェブ アプリケーション」** を選択します（※ `chrome.identity.launchWebAuthFlow` を使用するため、「Chrome アプリ」ではなく必ず「ウェブ アプリケーション」を選択してください）。
   - 承認済みのリダイレクト URI:  
     `https://<あなたの拡張機能ID>.chromiumapp.org/`  
     *(※拡張機能初回起動時のログイン画面に表示されるコピーボタンから直接取得できます)*  
     *(※Chrome ウェブストア公開時は、公開後の本番拡張機能IDの URI もここに追加登録してください)*
4. 作成したクライアント ID を [manifest.json](manifest.json) の `oauth2.client_id` に設定し、拡張機能を再読み込みします。

---

## 📂 プロジェクト構成 (Directory Structure)

```
timelayer-extension/
├── manifest.json        # 拡張機能マニフェスト (Manifest V3)
├── background.js        # バックグラウンドサービスワーカー (サイドパネル挙動・コンテキストメニュー)
├── timelayer-core.js    # 共通コアロジック (認証・APIリクエスト制限・キャッシュ・エラーハンドリング)
├── sidepanel.html       # Chrome サイドパネル用 HTML
├── sidepanel.css        # サイドパネル用スタイル
├── sidepanel.js         # サイドパネル制御ロジック
├── dashboard.html       # 大画面パノラマダッシュボード用 HTML
├── dashboard.css        # ダッシュボード用スタイル
├── dashboard.js         # ダッシュボード制御ロジック (マトリクス / カラム表示)
├── content.js           # Google Calendar ページ埋め込み用コンテンツスクリプト
├── content.css          # Google Calendar 内フローティングボタン・ドロワー用スタイル
├── icons/               # 拡張機能アイコン (16x16, 48x48, 128x128)
├── build-package.ps1    # Chrome Web Store 提出用 ZIP パッケージ自動生成スクリプト
└── README.md            # ドキュメント（本ファイル）
```

---

## 📦 ストア提出用パッケージのビルド (Packaging)

Chrome Web Store 提出用のクリーンな ZIP アーカイブ（不要な開発用ファイル・隠しファイルを除外）を生成するには、PowerShell で以下を実行します：

```powershell
.\build-package.ps1
```

実行すると、`dist/timelayer-v<version>.zip` が生成されます。このファイルをそのまま [Chrome デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole) にアップロードできます。

---

## 🔒 プライバシー & セキュリティ (Privacy)

- **外部サーバー不使用 & 完全ローカル動作**: 取得したカレンダー情報は、ユーザーのブラウザと Google 公式 API（`googleapis.com`）の間でのみ通信され、サードパーティのサーバー等には一切送信・保存されません。また、UIはOS標準のシステムフォントのみを使用するため、レンダリング時に外部 CDN への通信やフォントライセンスの依存は一切ありません。
- **インメモリ・トークン管理**: OAuth トークンは `chrome.storage.session`（メモリ内）でのみ管理され、ブラウザ終了時や明示的なサインアウトで安全に破棄されます（ディスクに平文保存されません）。
- **最小限の権限設計（Least Privilege）**: カレンダー一覧の読み取り（`calendar.calendarlist.readonly`）とイベントの読み取り（`calendar.events.readonly`）のみを要求します。カレンダー設定の参照や予定の作成・変更・削除などの書き込み権限は一切保持しません。

---

## 📄 ライセンス (License)

本プロジェクトは [MIT License](LICENSE) の下で公開されています。
