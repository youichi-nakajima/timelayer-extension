/**
 * TimeLayer - Shared Core
 * sidepanel.js / dashboard.js の両方から利用する共通処理
 *
 * - トークン管理: chrome.storage.session（メモリのみ・ディスクに残さない）＋有効期限チェック
 * - API呼び出し: 同時接続数の制限 + 429/403(rate limit)/5xx 時の指数バックオフ
 * - イベントキャッシュ: 過去期間は長め、現在を含む期間は短めのTTLでメモリキャッシュ
 * - 日付・HTML・テーマ・OAuth・Google Calendar API 共通ヘルパー
 */
(() => {
  'use strict';

  // =========================================================================
  // Token Storage (session only)
  // =========================================================================
  const TOKEN_KEY = 'timelayer_token';
  const SELECTED_CALENDARS_KEY = 'timelayer_selected_calendar_ids';
  const hasChromeStorage = typeof chrome !== 'undefined' && Boolean(chrome.storage);
  // storage.session は Chrome 102+。未対応環境のみ local にフォールバック
  const tokenArea = hasChromeStorage ? (chrome.storage.session || chrome.storage.local) : null;
  // 有効期限の何ミリ秒前から「期限切れ」と扱うか
  const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;

  // 旧バージョンで storage.local に平文保存されたトークンを削除（移行処理）
  if (hasChromeStorage && chrome.storage.session) {
    chrome.storage.local.remove([TOKEN_KEY]).catch(() => {});
  }

  async function getStoredToken() {
    if (!tokenArea) return null;
    const res = await tokenArea.get([TOKEN_KEY]);
    const stored = res[TOKEN_KEY];
    // 旧形式（文字列）や不正な値は破棄
    if (!stored || typeof stored !== 'object' || !stored.accessToken) {
      return null;
    }
    if (stored.expiresAt && Date.now() > stored.expiresAt - TOKEN_EXPIRY_MARGIN_MS) {
      await tokenArea.remove([TOKEN_KEY]);
      return null;
    }
    return stored.accessToken;
  }

  async function saveStoredToken(accessToken, expiresInSec) {
    if (!tokenArea) return;
    const seconds = Number(expiresInSec) > 0 ? Number(expiresInSec) : 3600;
    await tokenArea.set({
      [TOKEN_KEY]: {
        accessToken,
        expiresAt: Date.now() + seconds * 1000
      }
    });
  }

  async function clearStoredToken() {
    clearEventCache();
    if (!tokenArea) return;
    await tokenArea.remove([TOKEN_KEY]);
  }

  // =========================================================================
  // Rate-limited fetch with exponential backoff
  // =========================================================================
  const MAX_CONCURRENT_REQUESTS = 6;
  const MAX_RETRIES = 3;
  const BASE_BACKOFF_MS = 1000;
  const MAX_BACKOFF_MS = 16000;
  const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

  let activeRequests = 0;
  const requestQueue = [];

  function runQueued(task) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ task, resolve, reject });
      drainQueue();
    });
  }

  function drainQueue() {
    while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
      const { task, resolve, reject } = requestQueue.shift();
      activeRequests++;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activeRequests--;
          drainQueue();
        });
    }
  }

  function createAbortError() {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  function isAbortError(err) {
    return Boolean(err) && err.name === 'AbortError';
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      function onAbort() {
        clearTimeout(timer);
        reject(createAbortError());
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function isRetryableResponse(response) {
    if (response.status === 429) return true;
    if (response.status >= 500 && response.status !== 501) return true;
    if (response.status === 403) {
      // 403 は権限エラーの場合もあるため、理由がレート制限のときのみリトライ
      const body = await response.clone().json().catch(() => null);
      const reason = body?.error?.errors?.[0]?.reason;
      return RATE_LIMIT_REASONS.has(reason);
    }
    return false;
  }

  function getBackoffDelay(attempt, response) {
    const retryAfter = Number(response?.headers?.get('Retry-After'));
    if (retryAfter > 0) {
      return Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
    }
    const exp = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    // ジッターで同時リトライの集中を避ける
    return exp / 2 + Math.random() * (exp / 2);
  }

  /**
   * Google API への GET リクエスト（同時接続制限・指数バックオフ付き）
   * @returns {Promise<Response>}
   */
  async function apiFetch(url, token, { signal } = {}) {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw createAbortError();

      const response = await runQueued(() => fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal
      }));

      if (attempt < MAX_RETRIES && await isRetryableResponse(response)) {
        const delay = getBackoffDelay(attempt, response);
        console.warn(`[TimeLayer] API ${response.status}: ${Math.round(delay)}ms 後にリトライします (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay, signal);
        continue;
      }
      return response;
    }
  }

  // =========================================================================
  // Event Cache (in-memory)
  // =========================================================================
  const CACHE_TTL_CURRENT_MS = 2 * 60 * 1000;   // 現在・未来を含む期間: 2分
  const CACHE_TTL_PAST_MS = 30 * 60 * 1000;     // 完全に過去の期間: 30分
  const CACHE_MAX_ENTRIES = 300;

  // key -> { expiresAt, items }
  const eventCache = new Map();
  // key -> Promise（同一リクエストの重複送信を防ぐ）
  const inflight = new Map();
  // クリア後に、クリア前に開始したリクエストの結果が書き戻されるのを防ぐ
  let cacheGeneration = 0;

  function makeCacheKey(calendarId, timeMin, timeMax) {
    return `${calendarId}|${timeMin.toISOString()}|${timeMax.toISOString()}`;
  }

  function clearEventCache() {
    cacheGeneration++;
    eventCache.clear();
    inflight.clear();
  }

  function pruneCache() {
    const now = Date.now();
    for (const [key, entry] of eventCache) {
      if (entry.expiresAt <= now) eventCache.delete(key);
    }
    // 古い順（挿入順）に削除
    while (eventCache.size > CACHE_MAX_ENTRIES) {
      eventCache.delete(eventCache.keys().next().value);
    }
  }

  /**
   * キャッシュがあれば返し、なければ fetcher を実行して結果をキャッシュする。
   * fetcher が throw した場合はキャッシュしない。
   * @param {string} calendarId
   * @param {Date} timeMin
   * @param {Date} timeMax
   * @param {() => Promise<Array>} fetcher
   * @param {AbortSignal} [signal] 呼び出し元の中断シグナル
   */
  async function getEventsCached(calendarId, timeMin, timeMax, fetcher, signal) {
    const key = makeCacheKey(calendarId, timeMin, timeMax);
    const cached = eventCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items;
    }

    if (inflight.has(key)) {
      try {
        return await inflight.get(key);
      } catch (err) {
        // 他の呼び出し元が中断しただけなら、自分で取得し直す
        if (!isAbortError(err) || signal?.aborted) throw err;
      }
    }

    const generation = cacheGeneration;
    const promise = (async () => {
      try {
        const items = await fetcher();
        if (generation === cacheGeneration) {
          const ttl = timeMax.getTime() < Date.now() ? CACHE_TTL_PAST_MS : CACHE_TTL_CURRENT_MS;
          eventCache.set(key, { expiresAt: Date.now() + ttl, items });
          pruneCache();
        }
        return items;
      } finally {
        if (inflight.get(key) === promise) inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  // =========================================================================
  // Internationalization (i18n)
  // =========================================================================
  const MESSAGES = Object.freeze({
    ja: Object.freeze({
      pageTitleSidepanel: 'TimeLayer - カレンダー地層ビュー',
      pageTitleDashboard: 'TimeLayer - 大画面地層ダッシュボード',
      sidepanelSubtitle: '時間の地層ビューア',
      dashboardSubtitle: '過去と現在を地層のように重ねる大画面パノラマビュー',
      calToggleTitle: 'カレンダーを選択・管理',
      calToggleAria: 'カレンダー管理',
      calBtnLabel: 'カレンダー選択',
      searchToggleTitle: 'キーワードで予定を絞り込み',
      searchToggleAria: '検索',
      openFullpageTitle: '新しいタブで大画面ダッシュボードを開く',
      openFullpageAria: '全画面表示',
      themeToggleLight: 'ライトモードに切り替え',
      themeToggleDark: 'ダークモードに切り替え',
      themeToggleAria: 'テーマ切替',
      refreshTitle: 'カレンダーを更新',
      refreshAria: '更新',
      signoutTitle: 'ログアウト',
      signoutAria: 'ログアウト',
      welcomeTitleSidepanel: '時間の地層を旅する',
      welcomeDescSidepanel: 'Googleカレンダーと連携して、<strong>「今週」</strong>と<strong>「1年前の同週」「2年前の同週」</strong>の予定を縦に重ねて一覧できます。<br>過去の自分の行動やリズムを振り返り、今の過ごし方に新しい気づきを。',
      welcomeTitleDashboard: '時間の地層を旅する（大画面パノラマ）',
      welcomeDescDashboard: 'Googleカレンダーと連携して、<strong>「今週」</strong>と<strong>「1年前の同週」「2年前の同週」</strong>の予定を横並び3列の広大なパノラマで一覧比較できます。<br>過去の自分の軌跡と現在のスケジュールを横断して見渡しましょう。',
      signinBtn: 'Googleアカウントでログイン',
      authSecurityNotice: '🔒 読み取り専用権限（Calendar.Readonly）のみを使用します',
      redirectUriLabel: '承認済みのリダイレクト URI:',
      copyBtn: 'コピー',
      copyUriTitle: 'URIをコピー',
      copied: 'コピー完了!',
      prevWeek: '前の週',
      nextWeek: '次の週',
      thisWeek: '今週',
      weeksLater: '{n}週後',
      weeksAgo: '{n}週前',
      loading: '読み込み中...',
      returnThisWeekShort: '今週 ↩',
      returnThisWeekLong: '今週に戻る ↩',
      returnThisWeekTitle: '今週に戻る',
      weekStartSun: '日曜始',
      weekStartMon: '月曜始',
      weekStartSunTitle: '週の開始: 日曜（クリックで月曜始まりに切替）',
      weekStartMonTitle: '週の開始: 月曜（クリックで日曜始まりに切替）',
      viewSwitcherAria: '表示モード切替',
      viewMatrixTitle: '週を横組み（曜日×地層マトリクス）で比較表示',
      viewMatrixLabel: '週横組み',
      viewColumnsTitle: '年別3列カラムで縦スクロール表示',
      viewColumnsLabel: '3列カラム',
      searchPlaceholderSidepanel: '予定タイトルや場所で絞り込み...',
      searchPlaceholderDashboard: '全地層を検索（予定名・場所など）...',
      clearSearch: 'クリア',
      searchMatchedCount: '{n}件一致',
      calPanelTitle: '表示カレンダー選択',
      calSelectedSummary: '{selected}/{total}件 選択中',
      footerCalCount: '{selected}カレンダー選択中',
      close: '閉じる',
      calBtnAll: 'すべて選択',
      calBtnPrimary: 'メインのみ',
      calBtnHoliday: '祝日切替',
      calBtnReloadTitle: 'カレンダー一覧を再取得',
      calListLoading: 'カレンダーを取得中...',
      noCalendarsFound: '利用可能なカレンダーが見つかりません',
      tagPrimary: 'メイン',
      tagHoliday: '🎌 祝日',
      loaderSidepanel: 'カレンダーの地層を発掘中...',
      loaderDashboard: '全地層（現在・1年前・2年前）を発掘中...',
      matrixCornerTag: '地層 \\ 曜日',
      layerPresent: '表層 (現在)',
      layer1yr: '中間層 (1年前)',
      layer2yr: '深層 (2年前)',
      toggleCollapse: '折りたたみ',
      emptyLayerEvents: '選択されたカレンダーに予定はありません',
      noEventsDay: '予定なし',
      defaultHolidayName: '祝日',
      untitledCalendar: '（名称未設定）',
      untitledEvent: '(タイトルなし)',
      allDay: '終日',
      allDayMulti: '終日 ({days}日間)',
      multiDaySpan: '{days}日間',
      timeStartOnly: '{time}〜',
      timeEndOnly: '〜{time}',
      allDayCont: '終日（継続）',
      syncedSidepanel: '同期: {time} ({count}カレンダー)',
      syncedDashboard: '同期完了: {time}',
      notSynced: '未同期',
      coffeeTitle: 'Buy Me a Coffee で応援する',
      coffeeTextSidepanel: '応援',
      errMissingClientId: 'manifest.json にクライアントIDが設定されていません。',
      errAuthCancelled: '認証がキャンセルされました',
      errOAuth: 'OAuthエラー: {error}',
      errOAuthState: 'OAuth state検証に失敗しました（CSRFの疑いがあります）',
      errNoAccessToken: 'アクセストークンを取得できませんでした',
      errAuthExpired: '認証セッションが切れました。再度ログインしてください。',
      errFetchCalList: 'カレンダー一覧の取得に失敗しました: {msg}',
      errFetchEvents: 'カレンダーの取得に失敗しました: {msg}',
      errSignIn: 'ログインに失敗しました: {msg}',
      errSignInFallback: 'クライアントIDや設定を確認してください'
    }),
    en: Object.freeze({
      pageTitleSidepanel: 'TimeLayer - Calendar Strata Viewer',
      pageTitleDashboard: 'TimeLayer - Panoramic Strata Dashboard',
      sidepanelSubtitle: 'Calendar Strata Viewer',
      dashboardSubtitle: 'Panoramic multi-layered view comparing past and present',
      calToggleTitle: 'Select & manage calendars',
      calToggleAria: 'Manage calendars',
      calBtnLabel: 'Calendars',
      searchToggleTitle: 'Filter events by keyword',
      searchToggleAria: 'Search',
      openFullpageTitle: 'Open Panoramic Dashboard in a new tab',
      openFullpageAria: 'Full screen view',
      themeToggleLight: 'Switch to Light Mode',
      themeToggleDark: 'Switch to Dark Mode',
      themeToggleAria: 'Toggle theme',
      refreshTitle: 'Refresh calendars',
      refreshAria: 'Refresh',
      signoutTitle: 'Sign out',
      signoutAria: 'Sign out',
      welcomeTitleSidepanel: 'Journey Through Layers of Time',
      welcomeDescSidepanel: 'Connect with Google Calendar to stack and compare your schedules from <strong>This Week</strong>, <strong>1 Year Ago</strong>, and <strong>2 Years Ago</strong>.<br>Reflect on your past rhythms and discover new insights for today.',
      welcomeTitleDashboard: 'Journey Through Layers of Time (Panoramic View)',
      welcomeDescDashboard: 'Connect with Google Calendar to compare schedules from <strong>This Week</strong>, <strong>1 Year Ago</strong>, and <strong>2 Years Ago</strong> across a wide panoramic view.<br>Explore your past footsteps alongside your current schedule.',
      signinBtn: 'Sign in with Google',
      authSecurityNotice: '🔒 Uses read-only permissions (Calendar.Readonly) only',
      redirectUriLabel: 'Authorized redirect URI:',
      copyBtn: 'Copy',
      copyUriTitle: 'Copy URI',
      copied: 'Copied!',
      prevWeek: 'Previous week',
      nextWeek: 'Next week',
      thisWeek: 'This Week',
      weeksLater: 'In {n}w',
      weeksAgo: '{n}w ago',
      loading: 'Loading...',
      returnThisWeekShort: 'Today ↩',
      returnThisWeekLong: 'This Week ↩',
      returnThisWeekTitle: 'Return to this week',
      weekStartSun: 'Sun Start',
      weekStartMon: 'Mon Start',
      weekStartSunTitle: 'Week starts on Sunday (Click to switch to Monday)',
      weekStartMonTitle: 'Week starts on Monday (Click to switch to Sunday)',
      viewSwitcherAria: 'Switch view mode',
      viewMatrixTitle: 'Compare in Matrix View (Days × Strata)',
      viewMatrixLabel: 'Matrix View',
      viewColumnsTitle: 'Compare in 3-Column vertical scroll view',
      viewColumnsLabel: '3 Columns',
      searchPlaceholderSidepanel: 'Filter by event title or location...',
      searchPlaceholderDashboard: 'Search all layers (title, location, etc.)...',
      clearSearch: 'Clear',
      searchMatchedCount: '{n} matched',
      calPanelTitle: 'Select Calendars',
      calSelectedSummary: '{selected}/{total} selected',
      footerCalCount: '{selected} calendars selected',
      close: 'Close',
      calBtnAll: 'Select All',
      calBtnPrimary: 'Primary Only',
      calBtnHoliday: 'Toggle Holidays',
      calBtnReloadTitle: 'Reload calendar list',
      calListLoading: 'Loading calendars...',
      noCalendarsFound: 'No calendars found',
      tagPrimary: 'Primary',
      tagHoliday: '🎌 Holiday',
      loaderSidepanel: 'Excavating calendar strata...',
      loaderDashboard: 'Excavating all strata (Present, 1Y Ago, 2Y Ago)...',
      matrixCornerTag: 'Strata \\ Day',
      layerPresent: 'Surface (Present)',
      layer1yr: 'Middle (1 Year Ago)',
      layer2yr: 'Deep (2 Years Ago)',
      toggleCollapse: 'Toggle collapse',
      emptyLayerEvents: 'No events in selected calendars',
      noEventsDay: 'No events',
      defaultHolidayName: 'Holiday',
      untitledCalendar: '(Untitled)',
      untitledEvent: '(No title)',
      allDay: 'All day',
      allDayMulti: 'All day ({days}d)',
      multiDaySpan: '{days}d',
      timeStartOnly: '{time}–',
      timeEndOnly: '–{time}',
      allDayCont: 'All day (cont.)',
      syncedSidepanel: 'Synced: {time} ({count} cal)',
      syncedDashboard: 'Synced: {time}',
      notSynced: 'Not synced',
      coffeeTitle: 'Support on Buy Me a Coffee',
      coffeeTextSidepanel: 'Support',
      errMissingClientId: 'Client ID is not configured in manifest.json.',
      errAuthCancelled: 'Authentication was cancelled.',
      errOAuth: 'OAuth error: {error}',
      errOAuthState: 'OAuth state verification failed (possible CSRF).',
      errNoAccessToken: 'Failed to obtain access token.',
      errAuthExpired: 'Authentication session expired. Please sign in again.',
      errFetchCalList: 'Failed to load calendar list: {msg}',
      errFetchEvents: 'Failed to load calendar events: {msg}',
      errSignIn: 'Sign-in failed: {msg}',
      errSignInFallback: 'Please check your Client ID and configuration.'
    })
  });

  function detectLang() {
    if (typeof window !== 'undefined' && window.location?.search) {
      const param = new URLSearchParams(window.location.search).get('lang');
      if (param) {
        const normalized = param.trim().toLowerCase();
        if (normalized === 'ja' || normalized === 'en') {
          return normalized;
        }
      }
    }
    const uiLang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
                   (typeof navigator !== 'undefined' && navigator.language) ||
                   'en';
    return String(uiLang).toLowerCase().startsWith('ja') ? 'ja' : 'en';
  }

  let currentLang = detectLang();

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    currentLang = lang === 'ja' ? 'ja' : 'en';
    return currentLang;
  }

  function t(key, params) {
    const dict = MESSAGES[currentLang] || MESSAGES.en;
    let str = Object.prototype.hasOwnProperty.call(dict, key)
      ? dict[key]
      : (Object.prototype.hasOwnProperty.call(MESSAGES.en, key) ? MESSAGES.en[key] : key);
    if (params && typeof str === 'string') {
      for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  }

  function formatEventCount(n) {
    if (currentLang === 'ja') {
      return `${n}件`;
    }
    return `${n} ${n === 1 ? 'event' : 'events'}`;
  }

  function applyI18nToDOM(root = document) {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = currentLang;
    }
    if (!root) return;

    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
  }

  // =========================================================================
  // Date & Formatting Helpers
  // =========================================================================
  const DAY_NAMES_MAP = Object.freeze({
    ja: Object.freeze(['日', '月', '火', '水', '木', '金', '土']),
    en: Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  });
  const MONTH_NAMES_SHORT = Object.freeze([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]);

  function getDayName(dayIndex) {
    const names = DAY_NAMES_MAP[currentLang] || DAY_NAMES_MAP.en;
    return names[dayIndex] || '';
  }

  function formatDateOnly(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * YYYY-MM-DD 文字列をローカル日付として解釈し、deltaDays 日を加減した YYYY-MM-DD を返す。
   * UTC 基準の加減算をローカル Date でフォーマットすることによる西半球タイムゾーンの日付ズレを防ぐ。
   */
  function addDaysToDateStr(dateStr, deltaDays) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return formatDateOnly(new Date(y, m - 1, d + deltaDays));
  }

  function parseUtcMidnightMs(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function getDayDifference(dateStr1, dateStr2) {
    return Math.round((parseUtcMidnightMs(dateStr2) - parseUtcMidnightMs(dateStr1)) / (1000 * 60 * 60 * 24));
  }

  /**
   * 指定したオフセット週の開始日 00:00:00 〜 終了日 23:59:59.999 の範囲を計算する。
   * weekStart が 'monday' の場合は月曜〜日曜、'sunday' の場合は日曜〜土曜。
   */
  function getWeekRange(offsetWeeks = 0, yearOffset = 0, weekStart = 'sunday') {
    const now = new Date();
    const targetDate = new Date(now.getFullYear() - yearOffset, now.getMonth(), now.getDate() + (offsetWeeks * 7));
    const startDayOfWeek = weekStart === 'monday' ? 1 : 0;
    let diff = targetDate.getDay() - startDayOfWeek;
    if (diff < 0) {
      diff += 7;
    }
    const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - diff, 0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);

    return {
      start,
      end,
      year: start.getFullYear()
    };
  }

  function formatDateShort(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const day = getDayName(date.getDay());
    if (currentLang === 'ja') {
      return `${m}/${d}(${day})`;
    }
    return `${MONTH_NAMES_SHORT[date.getMonth()]} ${d} (${day})`;
  }

  function formatRangeText(start, end, includeYear = true) {
    const y = start.getFullYear();
    if (currentLang === 'ja') {
      const startStr = `${start.getMonth() + 1}/${start.getDate()}(${getDayName(start.getDay())})`;
      const endStr = `${end.getMonth() + 1}/${end.getDate()}(${getDayName(end.getDay())})`;
      return includeYear ? `${y}年 ${startStr} 〜 ${endStr}` : `${startStr} 〜 ${endStr}`;
    }
    const startStr = `${MONTH_NAMES_SHORT[start.getMonth()]} ${start.getDate()} (${getDayName(start.getDay())})`;
    const endStr = `${MONTH_NAMES_SHORT[end.getMonth()]} ${end.getDate()} (${getDayName(end.getDay())})`;
    return includeYear ? `${startStr} – ${endStr}, ${y}` : `${startStr} – ${endStr}`;
  }

  function formatMatrixLayerDate(range) {
    if (currentLang === 'ja') {
      return `${range.year}年 (${range.start.getMonth() + 1}/${range.start.getDate()}〜${range.end.getMonth() + 1}/${range.end.getDate()})`;
    }
    const startStr = `${MONTH_NAMES_SHORT[range.start.getMonth()]} ${range.start.getDate()}`;
    const endStr = `${MONTH_NAMES_SHORT[range.end.getMonth()]} ${range.end.getDate()}`;
    return `${range.year} (${startStr} – ${endStr})`;
  }

  function formatTime(dateObj) {
    const h = String(dateObj.getHours()).padStart(2, '0');
    const m = String(dateObj.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  // =========================================================================
  // Theme & Storage Helpers
  // =========================================================================
  function resolveTheme(savedTheme) {
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }

  function getStoredSelectedCalendarIds() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SELECTED_CALENDARS_KEY], (res) => {
        resolve(res[SELECTED_CALENDARS_KEY] || null);
      });
    });
  }

  function saveStoredSelectedCalendarIds(idsArray) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SELECTED_CALENDARS_KEY]: idsArray }, resolve);
    });
  }

  function areIdSetsEqual(setA, listB) {
    if (!listB) return setA.size === 0;
    const setB = new Set(listB);
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    return true;
  }

  // =========================================================================
  // OAuth Helpers
  // =========================================================================
  async function getAuthToken(interactive = false) {
    const stored = await getStoredToken();
    if (stored) {
      return stored;
    }

    if (!interactive) {
      return null;
    }

    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2?.client_id ? manifest.oauth2.client_id.trim() : null;
    const scopes = manifest.oauth2?.scopes || [
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly'
    ];

    if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
      throw new Error(t('errMissingClientId'));
    }

    // CSRF対策のランダムstate値を生成
    const state = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)) + Date.now().toString(36);
    const redirectUrl = chrome.identity.getRedirectURL();

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUrl);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'select_account');

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
      }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!responseUrl) {
          return reject(new Error(t('errAuthCancelled')));
        }

        try {
          const urlObj = new URL(responseUrl);
          const hashParams = new URLSearchParams(urlObj.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const error = hashParams.get('error');
          const returnState = hashParams.get('state');

          if (error) {
            return reject(new Error(t('errOAuth', { error })));
          }
          if (returnState !== state) {
            return reject(new Error(t('errOAuthState')));
          }
          if (!accessToken) {
            return reject(new Error(t('errNoAccessToken')));
          }

          const expiresIn = hashParams.get('expires_in');
          saveStoredToken(accessToken, expiresIn).then(() => resolve(accessToken));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async function revokeAndClearToken(token) {
    if (token) {
      fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(token)}`
      }).catch(() => {});
    }
    await clearStoredToken();
  }

  // =========================================================================
  // Google Calendar API Helpers
  // =========================================================================
  function isHolidayCalendar(cal) {
    const id = (cal.id || '').toLowerCase();
    const summary = (cal.summary || '').toLowerCase();
    return id.includes('holiday@group.v.calendar.google.com') ||
           summary.includes('祝日') ||
           summary.includes('holiday') ||
           summary.includes('日本の祝日');
  }

  async function fetchCalendarList(token) {
    const allItems = [];
    let pageToken = null;
    let pageCount = 0;
    const MAX_PAGES = 5;

    do {
      const endpoint = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
      endpoint.searchParams.set('maxResults', '100');
      endpoint.searchParams.set('fields', 'items(id,summary,description,backgroundColor,foregroundColor,primary,selected),nextPageToken');
      if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

      const response = await apiFetch(endpoint.toString(), token);

      if (response.status === 401) {
        await clearStoredToken();
        throw new Error('AUTH_EXPIRED');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(message);
      }

      const data = await response.json();
      if (data.items) allItems.push(...data.items);
      pageToken = data.nextPageToken || null;
      pageCount++;
    } while (pageToken && pageCount < MAX_PAGES);

    const parsed = allItems.map(item => ({
      id: item.id,
      summary: item.summary || t('untitledCalendar'),
      description: item.description || '',
      backgroundColor: item.backgroundColor || '#6366f1',
      foregroundColor: item.foregroundColor || '#ffffff',
      primary: Boolean(item.primary),
      isHoliday: isHolidayCalendar(item),
      selectedInGoogle: Boolean(item.selected)
    }));

    // ソート順: プライマリを先頭に、次に祝日、その後に通常カレンダーをロケール順
    parsed.sort((a, b) => {
      if (a.primary) return -1;
      if (b.primary) return 1;
      if (a.isHoliday) return -1;
      if (b.isHoliday) return 1;
      return a.summary.localeCompare(b.summary, currentLang);
    });

    return parsed;
  }

  async function fetchEventsForSingleCalendar(token, cal, timeMin, timeMax, signal) {
    let items;
    try {
      // 同じカレンダー・同じ期間はキャッシュを再利用（過去期間30分 / 現在含む2分）
      items = await getEventsCached(cal.id, timeMin, timeMax, async () => {
        const allEvents = [];
        let pageToken = null;
        let pageCount = 0;
        const MAX_PAGES = 4;

        do {
          const encodedId = encodeURIComponent(cal.id);
          const endpoint = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events`);
          endpoint.searchParams.set('timeMin', timeMin.toISOString());
          endpoint.searchParams.set('timeMax', timeMax.toISOString());
          endpoint.searchParams.set('singleEvents', 'true');
          endpoint.searchParams.set('orderBy', 'startTime');
          endpoint.searchParams.set('maxResults', '250');
          endpoint.searchParams.set('fields', 'items(id,summary,location,start,end,htmlLink),nextPageToken');
          if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

          const response = await apiFetch(endpoint.toString(), token, { signal });

          if (response.status === 401) {
            await clearStoredToken();
            throw new Error('AUTH_EXPIRED');
          }

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const fetchErr = new Error(errorData.error?.message || `HTTP ${response.status}`);
            fetchErr.name = 'CalendarFetchError';
            throw fetchErr;
          }

          const data = await response.json();
          if (data.items) allEvents.push(...data.items);
          pageToken = data.nextPageToken || null;
          pageCount++;
        } while (pageToken && pageCount < MAX_PAGES);

        return allEvents;
      }, signal);
    } catch (err) {
      // 特定カレンダーのエラー（権限なし等）はスキップ
      if (err.name === 'CalendarFetchError') {
        console.warn(`[TimeLayer] Warning: Failed to fetch events for ${cal.summary}:`, err.message);
        return [];
      }
      throw err;
    }

    return items.map(item => ({
      ...item,
      _calendarId: cal.id,
      _calendarSummary: cal.summary,
      _calendarColor: cal.backgroundColor || '#6366f1',
      _isHoliday: cal.isHoliday,
      _isPrimary: cal.primary
    }));
  }

  async function fetchAllSelectedCalendarEvents(token, availableCalendars, selectedCalendarIds, timeMin, timeMax, signal) {
    if (!selectedCalendarIds || selectedCalendarIds.size === 0) {
      return [];
    }

    const targetCalendars = availableCalendars.filter(c => selectedCalendarIds.has(c.id));
    if (targetCalendars.length === 0) {
      return [];
    }

    const fetchPromises = targetCalendars.map(cal =>
      fetchEventsForSingleCalendar(token, cal, timeMin, timeMax, signal)
    );

    const results = await Promise.allSettled(fetchPromises);

    // 認証切れ・中断は握りつぶさずに呼び出し元へ伝える
    const fatal = results.find(r => r.status === 'rejected' &&
      (r.reason?.message === 'AUTH_EXPIRED' || isAbortError(r.reason)));
    if (fatal) {
      throw fatal.reason;
    }

    let allEvents = [];
    for (const res of results) {
      if (res.status === 'fulfilled') {
        allEvents = allEvents.concat(res.value);
      }
    }

    // イベントを開始時刻順に整列（終日イベントを先頭に）
    allEvents.sort((a, b) => {
      const aStart = a.start?.dateTime ? new Date(a.start.dateTime).getTime() : (a.start?.date ? new Date(a.start.date).getTime() : 0);
      const bStart = b.start?.dateTime ? new Date(b.start.dateTime).getTime() : (b.start?.date ? new Date(b.start.date).getTime() : 0);

      if (aStart !== bStart) return aStart - bStart;
      if (a.start?.date && !b.start?.date) return -1;
      if (!a.start?.date && b.start?.date) return 1;
      return (a.summary || '').localeCompare(b.summary || '', currentLang);
    });

    return allEvents;
  }

  // =========================================================================
  // Utilities
  // =========================================================================
  function debounce(fn, waitMs) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, waitMs);
    };
  }

  window.TimeLayerCore = Object.freeze({
    TOKEN_KEY,
    MESSAGES,
    getLang,
    setLang,
    t,
    formatEventCount,
    applyI18nToDOM,
    getDayName,
    getStoredToken,
    saveStoredToken,
    clearStoredToken,
    apiFetch,
    getEventsCached,
    clearEventCache,
    isAbortError,
    debounce,
    formatDateOnly,
    addDaysToDateStr,
    getDayDifference,
    getWeekRange,
    formatDateShort,
    formatRangeText,
    formatMatrixLayerDate,
    formatTime,
    escapeHtml,
    resolveTheme,
    getStoredSelectedCalendarIds,
    saveStoredSelectedCalendarIds,
    areIdSetsEqual,
    getAuthToken,
    revokeAndClearToken,
    isHolidayCalendar,
    fetchCalendarList,
    fetchEventsForSingleCalendar,
    fetchAllSelectedCalendarEvents
  });
})();
