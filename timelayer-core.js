/**
 * TimeLayer - Shared Core
 * sidepanel.js / dashboard.js の両方から利用する共通処理
 *
 * - トークン管理: chrome.storage.session（メモリのみ・ディスクに残さない）＋有効期限チェック
 * - API呼び出し: 同時接続数の制限 + 429/403(rate limit)/5xx 時の指数バックオフ
 * - イベントキャッシュ: 過去期間は長め、現在を含む期間は短めのTTLでメモリキャッシュ
 * - debounce: 連打時のリクエスト抑制
 */
(() => {
  'use strict';

  // =========================================================================
  // Token Storage (session only)
  // =========================================================================
  const TOKEN_KEY = 'timelayer_token';
  // storage.session は Chrome 102+。未対応環境のみ local にフォールバック
  const tokenArea = chrome.storage.session || chrome.storage.local;
  // 有効期限の何ミリ秒前から「期限切れ」と扱うか
  const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;

  // 旧バージョンで storage.local に平文保存されたトークンを削除（移行処理）
  if (chrome.storage.session) {
    chrome.storage.local.remove([TOKEN_KEY]).catch(() => {});
  }

  async function getStoredToken() {
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
    getStoredToken,
    saveStoredToken,
    clearStoredToken,
    apiFetch,
    getEventsCached,
    clearEventCache,
    isAbortError,
    debounce
  });
})();
