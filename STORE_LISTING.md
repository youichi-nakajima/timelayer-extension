# Chrome ウェブストア申請 コピペ用下書きシート (Store Listing Draft)

Chrome デベロッパーダッシュボード（[Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)）の入力欄に対応した申請用下書きです。各項目をそのままコピー＆ペーストしてご利用いただけます。

---

## 1. ストアの掲載情報 (Store Listing)

### ■ 拡張機能の名前 (Extension Name)
```text
TimeLayer - カレンダー地層ビュー
```
*(英語ストア用などを設定する場合: `TimeLayer - Calendar Strata Viewer`)*

---

### ■ 説明 (Description / 最大16,000文字)
*(※Chrome ウェブストアの「説明」入力欄に、以下の枠内をすべてコピー＆ペーストしてください)*
*(※短い要約文はアップロードした ZIP 内の manifest.json から自動取得されます)*

```text
【時間を地層のように重ねるカレンダー拡張機能】

TimeLayer は、Google カレンダーと連携し、「現在（今週）」・「1年前の同週」・「2年前の同週」の予定を同一画面上に多層（地層 / Strata）として重ね合わせて一覧表示できる Chrome 拡張機能です。

「去年の今頃は何をしていたっけ？」
「一昨年のこの時期の繁忙期はどう乗り切ったっけ？」
そんな疑問を、何画面も過去へスクロールすることなく瞬時に振り返ることができます。


✨ 3つの表示スタイル (Multi-View Experience)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
利用シーンに合わせて最適なビューを選択できます：

1. 📌 Chrome サイドパネル
ブラウジングを遮らずに常時参照できるサイドパネルビュー。作業中のメモ確認や振り返りに最適です。

2. 🪐 大画面パノラマダッシュボード
新しいタブで広々と予定を展開するフルスクリーン表示。
・週横組みビュー（Matrix View）: 曜日を横軸、3つの地層を縦軸に並べたマトリクス比較。
・3列カラムビュー（Columns View）: 現在・1年前・2年前を並列表示。全7曜日が水平ラインで整列し、3列が完全に連動同期スクロール。

3. 🚀 Google カレンダー直接埋め込み
calendar.google.com の画面右下に専用のランチャーが常駐。ワンクリックでスライドインドロワーとして展開可能です。


💡 主な機能
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
・3つの時間の地層: 現在（エメラルド）、1年前（アンバー）、2年前（パープル）
・スマート自動クローズ: サイドビューから大画面パノラマを開くと、自動でサイドビューが閉じてスッキリ。
・日曜始まり / 月曜始まり ワンクリック切り替え: ビジネスユース（月曜始まり）にも即座に対応。
・リアルタイム相互同期: 複数画面を開いていても、カレンダー選択や週移動、テーマ変更がリアルタイムに連動。
・全地層横断検索: キーワード入力で、3つの年代すべての予定を瞬時にインクリメンタル検索・ハイライト。
・複数カレンダー対応: メイン・業務・共有・祝日などのカレンダーを自由に切り替え。
・ダークモード / ライトモード: システム設定に自動連動＆ヘッダーから手動ワンクリック切り替え可能。


🔒 プライバシー & セキュリティ設計
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TimeLayer はユーザーのプライバシーを最優先に設計されています：

・外部サーバー不使用・完全ローカル動作: カレンダー情報はブラウザと Google 公式 API 間でのみ直接通信され、開発者を含むいかなる外部サーバーにも送信・蓄積されません。
・最小限の権限（読み取り専用）: カレンダーの予定一覧・イベントの読み取りのみを要求します。予定の作成・変更・削除権限は一切持ちません。
・インメモリ管理 & 1時間自動破棄: 認証トークンはブラウザのメモリ内でのみ保持され、最大1時間（またはブラウザ終了時）で自動失効します。
・外部 CDN 通信ゼロ: OS 標準のシステムフォントのみを採用し、外部通信を行いません。


☕ サポート
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TimeLayer は個人開発のオープンソースプロジェクトです。
GitHub: https://github.com/youichi-nakajima/timelayer-extension
```

---

### ■ カテゴリ (Category)
- **メイン カテゴリ**: `仕事効率化` (Productivity)
  - **サブカテゴリ**: `ワークフローと計画` (Workflow & Planning) ※おすすめ（または `ツール`）

### ■ 言語 (Language)
- `日本語` (Japanese) / `英語` (English - Chrome Web Store 多言語掲載対応)

---

## 1-B. ストアの掲載情報：英語 (English Store Listing)

Chrome Web Store デベロッパーダッシュボード右上の言語切り替え（または「言語を追加」から `English` を選択）で登録する英語用の下書きです。

### ■ Extension Name
```text
TimeLayer - Calendar Strata Viewer
```

### ■ Description (Max 16,000 characters)
```text
[Layer Your Google Calendar Like Geological Strata]

TimeLayer connects with Google Calendar to overlay and compare your schedules from "This Week", "1 Year Ago", and "2 Years Ago" in a unified multi-layered view.

"What was I doing around this time last year?"
"How did I handle the busy season two years ago?"
Reflect on your past schedules and habits instantly without scrolling back through endless calendar pages.


✨ 3 Display Styles (Multi-View Experience)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Choose the view that fits your workflow:

1. 📌 Chrome Side Panel
An always-accessible side panel that keeps your browsing uninterrupted—ideal for quick comparisons and daily reflection.

2. 🪐 Panoramic Dashboard
A full-screen workspace opened in a new tab:
• Matrix View: Compare 7 days horizontally across 3 temporal strata vertically, with multi-day banners packed cleanly on top.
• 3-Column View: View Present, 1 Year Ago, and 2 Years Ago side by side with aligned day rows and synchronized scrolling.

3. 🚀 Google Calendar Embedded Drawer
A floating launcher button sits in the bottom-right corner of calendar.google.com, opening a slide-in drawer with one click.


💡 Key Features
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 3 Strata Layers: Surface / Present (Emerald), Middle / 1 Year Ago (Amber), Deep / 2 Years Ago (Purple)
• Smart Auto-Close: Opening the Panoramic Dashboard automatically closes the side panel or embedded drawer to keep your workspace tidy.
• One-Click Week Start Toggle: Switch effortlessly between Sunday-start and Monday-start weeks.
• Real-Time Sync Across Views: Calendar selections, theme changes, week start settings, and sign-in state stay synchronized in real time across open views.
• Cross-Strata Instant Search: Filter and highlight events by title, location, or calendar across all three years simultaneously.
• Multi-Calendar Support: Toggle primary, work, shared, and holiday calendars freely.
• Dark / Light Mode: Automatically follows your system appearance and supports one-click manual switching.


🔒 Privacy & Security by Design
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TimeLayer is built with user privacy as its highest priority:

• Zero External Servers & Strictly Local: Calendar data is exchanged directly between your browser and official Google APIs. Nothing is ever transmitted to or stored on any external or developer-owned server.
• Least-Privilege Permissions (Read-Only): Requests only read-only calendar list and event scopes. Never requests permission to create, edit, or delete events.
• In-Memory Token Management: OAuth tokens are stored strictly in browser session memory and expire automatically within 1 hour (or upon sign-out / browser restart).
• Zero External CDN Requests: Uses OS-native system fonts with no external font or tracking requests.


☕ Support
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TimeLayer is an open-source project developed independently.
GitHub: https://github.com/youichi-nakajima/timelayer-extension
```

---

### ■ グラフィック アセット (Graphic Assets)

| アセット | ファイル / 保存先 | サイズ |
| :--- | :--- | :--- |
| **アイコン** (必須) | `icons/icon128.png` | 128 × 128 px |
| **スクリーンショット 1** (必須) | `screenshot/timelayer-01-matrix-view.png` (Scene 1: 大画面マトリクス) | 1280 × 800 px |
| **スクリーンショット 2** (必須) | `screenshot/timelayer-02-columns-view.png` (Scene 2: 3列同期カラム) | 1280 × 800 px |
| **スクリーンショット 3** (必須) | `screenshot/timelayer-03-sidepanel-view.png` (Scene 3: サイドパネル) | 1280 × 800 px |
| **スクリーンショット 4** (必須) | `screenshot/timelayer-04-gcal-integration.png` (Scene 4: カレンダー連携) | 1280 × 800 px |
| **小プロモタイル** (任意・推奨) | `screenshot/timelayer-promo-small-440x280.png` (Scene 5: 小プロモタイル) | 440 × 280 px |

---

### ■ 追加フィールド (Additional Fields / 任意)

| 項目 | 入力内容 | 補足 |
| :--- | :--- | :--- |
| **公式 URL** | *(空欄のままでOK)* | Search Console で所有権を確認した独自ドメインがある場合のみ入力する欄のため、空欄で問題ありません。 |
| **ホームページ URL** | `https://github.com/youichi-nakajima/timelayer-extension` | GitHub リポジトリのトップURLを指定します（任意）。 |
| **サポート URL** | `https://github.com/youichi-nakajima/timelayer-extension/issues` | GitHub の Issue（問い合わせ・要望）URLを指定します（任意）。 |

---

## 2. プライバシーへの取り組み (Privacy Practices タブ)

### ■ 単一目的の説明 (Single Purpose Description)
*(※審査官向けに本拡張機能の目的を簡潔に説明)*

```text
【日本語】
Google カレンダーの予定を取得し、「現在（今週）」・「1年前の同週」・「2年前の同週」のスケジュールを同一画面上に重ね合わせて一覧比較・振り返りを行うこと。

【English】
To access Google Calendar events and display a multi-layered comparative view comparing the current week, 1 year ago, and 2 years ago within side panels and dashboards.
```

---

### ■ 権限の正当化理由 (Permission Justifications)
*(※ダッシュボードで各権限の用途を質問された場合に入力)*

| 権限 | 入力テキスト (Justification) |
| :--- | :--- |
| **`identity`** | Google Calendar API にアクセスするための OAuth 2.0 認証（ユーザー認可およびアクセストークンの取得）に必要です。 |
| **`storage`** | ユーザーの選択カレンダーID、開始曜日、テーマ設定を保存するため、および認証トークンをセッションメモリ（`chrome.storage.session`）で安全に一時保持するために使用します。 |
| **`sidePanel`** | ブラウジングを妨げずにカレンダーの地層比較画面を表示するため、Chrome のサイドパネル機能を使用します。 |
| **`contextMenus`** | ブラウザ上の右クリックメニューから「TimeLayer 大画面ダッシュボードを開く」を直接実行できるようにするために使用します。 |
| **Host Permissions**<br>`https://www.googleapis.com/*`<br>`https://oauth2.googleapis.com/*` | ユーザーの Google カレンダー一覧および予定データ（現在・1年前・2年前）を取得し、OAuth 認証を行うために Google 公式 API と直接通信するために必要です。 |
| **Content Scripts**<br>`https://calendar.google.com/*` | Google カレンダーの利用時に、画面右下に TimeLayer を呼び出す専用のフローティングボタンおよびスライドインドロワーを表示するために使用します。 |

---

### ■ データの使用に関する宣言 (Data Usage)

ダッシュボード内の質問項目には次のようにチェック・回答します：

1. **収集するデータタイプ**:
   - `認証情報 (Authentication Information)`: Google OAuth トークン
   - `個人情報 / カレンダー (Personal Communications or Calendar)`: カレンダーの予定データ（タイトル・日時・場所）
2. **データの取り扱いに関する宣誓**:
   - [x] **第三者への販売禁止**: ユーザーデータをいかなる第三者にも販売しません。
   - [x] **目的に無関係な用途の禁止**: 拡張機能の単一目的（カレンダー比較表示）に無関係な目的で使用・転送しません。
   - [x] **信用調査・融資審査等の禁止**: クレジットスコアリングや融資審査の目的で使用しません。
3. **データ送信に関する説明**:
   - 「すべてのカレンダーデータおよびトークンはユーザーのブラウザ内（ローカル）でのみ処理され、外部のサードパーティサーバーには一切送信・保存されません。」

---

### ■ プライバシーポリシーの URL (Privacy Policy URL)

```text
https://timelayer.aufheben.studio/privacy.html
```

---

### ■ リモートコードの使用 (Remote Code)
- **質問**: 「リモートコードを使用していますか？」
- **回答**: **「いいえ」** を選択
  *(※すべてのスクリプト・スタイルは ZIP パッケージ内に完全に同梱されており、外部サーバーから動的にプログラムコードを読み込んで実行することは一切していません)*


