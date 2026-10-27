# プライバシーポリシー / Privacy Policy

**TimeLayer - カレンダー地層ビュー (Calendar Strata Viewer)**  
最終更新日: 2026年10月27日 (Last Updated: October 27, 2026)

---

## 日本語 (Japanese)

TimeLayer（以下「本拡張機能」）は、ユーザーのプライバシーを最優先に考え、透明性とデータ保護を徹底して設計されています。本プライバシーポリシーでは、本拡張機能がどのような情報にアクセスし、それをどのように取り扱うかについて説明します。

### 1. 取得およびアクセスする情報
本拡張機能は、ユーザーが Google カレンダー連携を承認した場合に限り、以下の情報にアクセスします：
- **Google カレンダー一覧情報**: カレンダーID、カレンダー名、カラー（表示するカレンダーの選択のため）
- **Google カレンダー予定情報**: 予定タイトル、開始日時、終了日時、場所、説明（現在、1年前、2年前の予定を画面上で比較・表示するため）
- **ユーザー設定情報**: 選択したカレンダー、週の開始曜日（日/月）、テーマ設定（ダーク/ライト）

### 2. 利用目的
取得した情報は、以下の**単一の目的**にのみ使用されます：
- 現在（今週）、1年前の同週、2年前の同週のスケジュールを同一画面上に重ね合わせて一覧表示・比較すること。

本拡張機能は**「読み取り専用（Read-only）」**権限のみを使用し、予定の作成、編集、削除、またはカレンダー設定の変更を行うことは一切ありません。

### 3. データの保存場所と外部送信ゼロ
- **完全ローカル動作**: カレンダー情報は、ユーザーのブラウザと Google 公式 API（`googleapis.com`）の間でのみ直接通信されます。
- **外部サーバー不使用**: 開発者を含む第三者の外部サーバーにカレンダーデータや個人情報が送信、収集、蓄積されることは一切ありません。
- **インメモリ・トークン管理**: 認証トークンはブラウザのメモリ内（`chrome.storage.session`）でのみ一時的に保持され、ディスクに平文保存されません。また、最大1時間（またはブラウザ終了・ログアウト時）で自動的に安全に破棄されます。

### 4. 外部ライブラリ・トラッキング
- 本拡張機能には、Google Analytics、Firebase、外部広告ネットワーク、トラッキングスクリプトなどの追跡ツールは一切含まれていません。
- OS標準のシステムフォントを使用し、レンダリング時に外部 CDN への通信も行いません。

### 5. 第三者提供・販売の禁止
本拡張機能は、ユーザーのいかなるデータも第三者に販売、貸与、譲渡、または広告配信やクレジットスコアリング等の目的で使用することはありません。

### 6. Google API のユーザーデータポリシーの遵守
TimeLayer による Google API から受信した情報の使用および他のアプリへの転送は、[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)（Limited Use 要件を含む）に準拠します。

### 7. お問い合わせ
本プライバシーポリシーまたは本拡張機能に関するご質問やお問い合わせは、GitHub リポジトリの Issue にて受け付けております。  
GitHub: [https://github.com/youichi-nakajima/timelayer-extension](https://github.com/youichi-nakajima/timelayer-extension)

---

## English

TimeLayer ("the Extension") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains what information the Extension accesses and how it is handled.

### 1. Information Accessed
The Extension accesses the following information only when explicitly authorized by the user via Google OAuth:
- **Google Calendar List**: Calendar ID, summary/title, and color.
- **Calendar Event Data**: Event title/summary, start/end time, location, and description (for displaying and comparing events across present, 1-year-ago, and 2-years-ago).
- **User Preferences**: Selected calendar IDs, week start day (Sunday/Monday), and UI theme settings.

### 2. Purpose of Use
The accessed data is used solely for the **single purpose** of displaying and comparing calendar events from the current week, 1 year ago, and 2 years ago in a multi-layered view.

The Extension only requests **read-only** permissions (`calendarlist.readonly` and `events.readonly`). It never creates, edits, modifies, or deletes your calendar events or settings.

### 3. Data Storage & Zero External Transmission
- **Strictly Local Execution**: All calendar data is fetched directly between the user's browser and official Google APIs (`googleapis.com`).
- **No External Servers**: No personal or calendar data is ever sent, stored, logged, or processed on any third-party or developer-owned server.
- **In-Memory Token Management**: OAuth tokens are stored strictly in session memory (`chrome.storage.session`), never saved in plain text on persistent disk, and expire automatically within 1 hour (or upon logout / browser restart).

### 4. Analytics & Tracking
The Extension does not use any third-party analytics (e.g., Google Analytics), advertising libraries, tracking beacons, or external CDN resources.

### 5. No Sale or Transfer of Data
The Extension does not sell, trade, lease, or monetize user data under any circumstances. User data is never used for advertising, marketing, or credit assessment.

### 6. Google API User Data Policy Compliance
TimeLayer's use and transfer of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

### 7. Contact
For questions or inquiries regarding this Privacy Policy, please open an issue on GitHub:  
GitHub: [https://github.com/youichi-nakajima/timelayer-extension](https://github.com/youichi-nakajima/timelayer-extension)
