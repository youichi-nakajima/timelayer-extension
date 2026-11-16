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
  // Date & Formatting Helpers
  // =========================================================================
  const DAY_NAMES = Object.freeze(['日', '月', '火', '水', '木', '金', '土']);

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
    const day = DAY_NAMES[date.getDay()];
    return `${m}/${d}(${day})`;
  }

  function formatRangeText(start, end, includeYear = true) {
    const y = start.getFullYear();
    const startStr = `${start.getMonth() + 1}/${start.getDate()}(${DAY_NAMES[start.getDay()]})`;
    const endStr = `${end.getMonth() + 1}/${end.getDate()}(${DAY_NAMES[end.getDay()]})`;
    return includeYear ? `${y}年 ${startStr} 〜 ${endStr}` : `${startStr} 〜 ${endStr}`;
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
      throw new Error('manifest.json にクライアントIDが設定されていません。');
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
          return reject(new Error('認証がキャンセルされました'));
        }

        try {
          const urlObj = new URL(responseUrl);
          const hashParams = new URLSearchParams(urlObj.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const error = hashParams.get('error');
          const returnState = hashParams.get('state');

          if (error) {
            return reject(new Error(`OAuthエラー: ${error}`));
          }
          if (returnState !== state) {
            return reject(new Error('OAuth state検証に失敗しました（CSRFの疑いがあります）'));
          }
          if (!accessToken) {
            return reject(new Error('アクセストークンを取得できませんでした'));
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
      summary: item.summary || '（名称未設定）',
      description: item.description || '',
      backgroundColor: item.backgroundColor || '#6366f1',
      foregroundColor: item.foregroundColor || '#ffffff',
      primary: Boolean(item.primary),
      isHoliday: isHolidayCalendar(item),
      selectedInGoogle: Boolean(item.selected)
    }));

    // ソート順: プライマリを先頭に、次に祝日、その後に通常カレンダーを五十音順
    parsed.sort((a, b) => {
      if (a.primary) return -1;
      if (b.primary) return 1;
      if (a.isHoliday) return -1;
      if (b.isHoliday) return 1;
      return a.summary.localeCompare(b.summary, 'ja');
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
      return (a.summary || '').localeCompare(b.summary || '', 'ja');
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
    DAY_NAMES,
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
