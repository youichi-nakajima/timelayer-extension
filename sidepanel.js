/**
 * TimeLayer - Side Panel Logic (Ultra Deluxe Edition)
 * Google Calendar API (v3) & chrome.identity.launchWebAuthFlow
 * 
 * Features:
 * - Multi-Calendar support (Primary, Sub-calendars, Shared calendars)
 * - Automatic Japanese Holiday recognition & special visual styling
 * - Calendar selection manager with custom color dots, badges, and persistence
 * - Real-time keyword search and highlighting across all geological layers
 * - Parallel fetching with fault-tolerant Promise.allSettled
 */

(() => {
  'use strict';

  // =========================================================================
  // State
  // =========================================================================
  let currentOffsetWeeks = 0; // 0 = 今週, -1 = 先週, +1 = 来週
  let currentAuthToken = null;
  let loadController = null; // 実行中の loadAllLayers を中断するための AbortController
  let isFetchingCalendars = false;

  // カレンダー管理状態
  let availableCalendars = []; // Array of calendar objects
  let selectedCalendarIds = new Set(); // Set of active calendar IDs
  let rawEventsCache = { present: [], '1yr': [], '2yr': [] }; // 検索用キャッシュ
  let currentSearchQuery = '';

  // DOM Elements
  const authView = document.getElementById('auth-view');
  const mainView = document.getElementById('main-view');
  const signinBtn = document.getElementById('signin-btn');
  const signoutBtn = document.getElementById('signout-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const prevWeekBtn = document.getElementById('prev-week-btn');
  const nextWeekBtn = document.getElementById('next-week-btn');
  const todayWeekBtn = document.getElementById('today-week-btn');
  const weekRelativeLabel = document.getElementById('week-relative-label');
  const weekRangeText = document.getElementById('week-range-text');
  const loader = document.getElementById('loader');
  const lastUpdatedEl = document.getElementById('last-updated');
  const alertBanner = document.getElementById('alert-banner');
  const alertMessage = document.getElementById('alert-message');
  const alertClose = document.getElementById('alert-close');

  // カレンダー管理・検索用 DOM
  const calendarToggleBtn = document.getElementById('calendar-toggle-btn');
  const calendarBadgeCount = document.getElementById('calendar-badge-count');
  const calendarPanel = document.getElementById('calendar-panel');
  const calendarPanelClose = document.getElementById('calendar-panel-close');
  const calendarSelectedSummary = document.getElementById('calendar-selected-summary');
  const calendarList = document.getElementById('calendar-list');
  const calendarListLoading = document.getElementById('calendar-list-loading');
  const btnCalAll = document.getElementById('btn-cal-all');
  const btnCalPrimary = document.getElementById('btn-cal-primary');
  const btnCalHoliday = document.getElementById('btn-cal-holiday');
  const btnCalReload = document.getElementById('btn-cal-reload');

  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchBarContainer = document.getElementById('search-bar-container');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const searchMatchCount = document.getElementById('search-match-count');

  const layers = {
    present: {
      card: document.getElementById('card-present'),
      body: document.getElementById('body-present'),
      date: document.getElementById('date-present'),
      count: document.getElementById('count-present'),
      eventsContainer: document.getElementById('events-present')
    },
    '1yr': {
      card: document.getElementById('card-1yr'),
      body: document.getElementById('body-1yr'),
      date: document.getElementById('date-1yr'),
      count: document.getElementById('count-1yr'),
      eventsContainer: document.getElementById('events-1yr')
    },
    '2yr': {
      card: document.getElementById('card-2yr'),
      body: document.getElementById('body-2yr'),
      date: document.getElementById('date-2yr'),
      count: document.getElementById('count-2yr'),
      eventsContainer: document.getElementById('events-2yr')
    }
  };

  // =========================================================================
  // Date Helpers
  // =========================================================================
  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  /**
   * 指定したオフセット週の日曜日 00:00:00 〜 土曜日 23:59:59.999 の範囲を計算
   */
  function getWeekRange(offsetWeeks = 0, yearOffset = 0) {
    const now = new Date();
    // 1. 今日の日付からオフセット週分ずらした日を計算
    const targetDate = new Date(now.getFullYear() - yearOffset, now.getMonth(), now.getDate() + (offsetWeeks * 7));
    
    // 2. その週の日曜日を特定 (dayOfWeek: 0〜6)
    const dayOfWeek = targetDate.getDay();
    const sunday = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - dayOfWeek, 0, 0, 0, 0);
    
    // 3. 土曜日 23:59:59.999
    const saturday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6, 23, 59, 59, 999);

    return {
      start: sunday,
      end: saturday,
      year: sunday.getFullYear()
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

  // =========================================================================
  // UI Display & Alerts
  // =========================================================================
  function showAlert(msg) {
    alertMessage.textContent = msg;
    alertBanner.classList.remove('hidden');
  }

  function hideAlert() {
    alertBanner.classList.add('hidden');
    alertMessage.textContent = '';
  }

  function setAuthenticatedUI(isAuth) {
    if (isAuth) {
      authView.classList.add('hidden');
      mainView.classList.remove('hidden');
      signoutBtn.classList.remove('hidden');
    } else {
      authView.classList.remove('hidden');
      mainView.classList.add('hidden');
      signoutBtn.classList.add('hidden');
      calendarPanel.classList.add('hidden');
      calendarToggleBtn.classList.remove('active');
      searchBarContainer.classList.add('hidden');
      searchToggleBtn.classList.remove('active');
    }
  }

  function updateWeekNavUI() {
    const currentWeekRange = getWeekRange(currentOffsetWeeks, 0);
    weekRangeText.textContent = formatRangeText(currentWeekRange.start, currentWeekRange.end, true);

    if (currentOffsetWeeks === 0) {
      weekRelativeLabel.textContent = '今週';
      weekRelativeLabel.style.background = 'rgba(16, 185, 129, 0.15)';
      weekRelativeLabel.style.color = '#34d399';
    } else if (currentOffsetWeeks > 0) {
      weekRelativeLabel.textContent = `${currentOffsetWeeks}週後`;
      weekRelativeLabel.style.background = 'rgba(59, 130, 246, 0.15)';
      weekRelativeLabel.style.color = '#60a5fa';
    } else {
      weekRelativeLabel.textContent = `${Math.abs(currentOffsetWeeks)}週前`;
      weekRelativeLabel.style.background = 'rgba(245, 158, 11, 0.15)';
      weekRelativeLabel.style.color = '#fbbf24';
    }
  }

  // =========================================================================
  // Storage Handlers (Tokens & Calendar Selections)
  // =========================================================================
  // トークンは timelayer-core.js で chrome.storage.session（メモリのみ）に有効期限付きで保存
  function getStoredToken() {
    return TimeLayerCore.getStoredToken();
  }

  function saveStoredToken(token, expiresInSec) {
    return TimeLayerCore.saveStoredToken(token, expiresInSec);
  }

  function clearStoredToken() {
    return TimeLayerCore.clearStoredToken();
  }

  function getStoredSelectedCalendarIds() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['timelayer_selected_calendar_ids'], (res) => {
        resolve(res.timelayer_selected_calendar_ids || null);
      });
    });
  }

  function saveStoredSelectedCalendarIds(idsArray) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ timelayer_selected_calendar_ids: idsArray }, resolve);
    });
  }

  // =========================================================================
  // Google Calendar API: CalendarList
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
    const endpoint = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    endpoint.searchParams.set('maxResults', '100');

    const response = await TimeLayerCore.apiFetch(endpoint.toString(), token);

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
    const items = data.items || [];

    // カレンダー情報の正規化
    const parsed = items.map(item => {
      const isHoliday = isHolidayCalendar(item);
      return {
        id: item.id,
        summary: item.summary || '（名称未設定）',
        description: item.description || '',
        backgroundColor: item.backgroundColor || '#6366f1',
        foregroundColor: item.foregroundColor || '#ffffff',
        primary: Boolean(item.primary),
        isHoliday: isHoliday,
        selectedInGoogle: Boolean(item.selected)
      };
    });

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

  // =========================================================================
  // Calendar Management Logic & UI
  // =========================================================================
  async function loadCalendars() {
    if (!currentAuthToken || isFetchingCalendars) return;

    isFetchingCalendars = true;
    calendarListLoading.classList.remove('hidden');

    try {
      availableCalendars = await fetchCalendarList(currentAuthToken);

      // 保存済みの選択状態を読み込む
      const savedIds = await getStoredSelectedCalendarIds();

      if (savedIds && Array.isArray(savedIds) && savedIds.length > 0) {
        // 利用可能なカレンダーにフィルタリング
        const availableIdSet = new Set(availableCalendars.map(c => c.id));
        const validIds = savedIds.filter(id => availableIdSet.has(id));
        selectedCalendarIds = new Set(validIds.length > 0 ? validIds : availableCalendars.map(c => c.id));
      } else {
        // 初期デフォルト選択: プライマリ + 祝日 + Googleカレンダーで選択状態のもの
        selectedCalendarIds = new Set();
        availableCalendars.forEach(c => {
          if (c.primary || c.isHoliday || c.selectedInGoogle) {
            selectedCalendarIds.add(c.id);
          }
        });

        // 何も選ばれなければ全選択
        if (selectedCalendarIds.size === 0 && availableCalendars.length > 0) {
          availableCalendars.forEach(c => selectedCalendarIds.add(c.id));
        }

        await saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      }

      renderCalendarList();
      updateCalendarBadge();
    } catch (err) {
      console.error('[TimeLayer] Error fetching calendar list:', err);
      if (err.message === 'AUTH_EXPIRED') {
        currentAuthToken = null;
        setAuthenticatedUI(false);
        showAlert('認証セッションが切れました。再度ログインしてください。');
      } else {
        showAlert(`カレンダー一覧の取得に失敗しました: ${err.message}`);
      }
    } finally {
      isFetchingCalendars = false;
      calendarListLoading.classList.add('hidden');
    }
  }

  function renderCalendarList() {
    calendarList.innerHTML = '';

    if (availableCalendars.length === 0) {
      calendarList.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:11px;">利用可能なカレンダーが見つかりません</div>';
      return;
    }

    availableCalendars.forEach(cal => {
      const isChecked = selectedCalendarIds.has(cal.id);

      const itemEl = document.createElement('label');
      itemEl.className = `calendar-item ${isChecked ? 'is-selected' : ''}`;

      let tagsHtml = '';
      if (cal.primary) {
        tagsHtml += '<span class="cal-tag cal-tag-primary">メイン</span>';
      }
      if (cal.isHoliday) {
        tagsHtml += '<span class="cal-tag cal-tag-holiday">🎌 祝日</span>';
      }

      itemEl.innerHTML = `
        <div class="cal-item-left">
          <span class="cal-color-dot" style="background-color: ${escapeHtml(cal.backgroundColor)};"></span>
          <span class="cal-item-name" title="${escapeHtml(cal.summary)}">${escapeHtml(cal.summary)}</span>
          ${tagsHtml}
        </div>
        <input type="checkbox" class="cal-checkbox" data-id="${escapeHtml(cal.id)}" ${isChecked ? 'checked' : ''}>
      `;

      const checkbox = itemEl.querySelector('.cal-checkbox');
      checkbox.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          selectedCalendarIds.add(id);
          itemEl.classList.add('is-selected');
        } else {
          selectedCalendarIds.delete(id);
          itemEl.classList.remove('is-selected');
        }

        await saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
        updateCalendarBadge();
        scheduleLoadAllLayers();
      });

      calendarList.appendChild(itemEl);
    });

    updateCalendarBadge();
  }

  function updateCalendarBadge() {
    const total = availableCalendars.length;
    const selected = selectedCalendarIds.size;

    calendarSelectedSummary.textContent = `${selected}/${total}件 選択中`;

    if (selected > 0) {
      calendarBadgeCount.textContent = String(selected);
      calendarBadgeCount.classList.remove('hidden');
    } else {
      calendarBadgeCount.classList.add('hidden');
    }
  }

  // =========================================================================
  // Google Calendar API: Multi-Calendar Parallel Events Fetching
  // =========================================================================
  async function fetchEventsForSingleCalendar(token, cal, timeMin, timeMax, signal) {
    let items;
    try {
      // 同じカレンダー・同じ期間はキャッシュを再利用（過去期間30分 / 現在含む2分）
      items = await TimeLayerCore.getEventsCached(cal.id, timeMin, timeMax, async () => {
        const encodedId = encodeURIComponent(cal.id);
        const endpoint = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events`);
        endpoint.searchParams.set('timeMin', timeMin.toISOString());
        endpoint.searchParams.set('timeMax', timeMax.toISOString());
        endpoint.searchParams.set('singleEvents', 'true');
        endpoint.searchParams.set('orderBy', 'startTime');
        endpoint.searchParams.set('maxResults', '250');

        const response = await TimeLayerCore.apiFetch(endpoint.toString(), token, { signal });

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
        return data.items || [];
      }, signal);
    } catch (err) {
      // 特定カレンダーのエラー（権限なし等）はスキップ
      if (err.name === 'CalendarFetchError') {
        console.warn(`[TimeLayer] Warning: Failed to fetch events for ${cal.summary}:`, err.message);
        return [];
      }
      throw err;
    }

    // イベントに所属カレンダーのメタデータを付与
    return items.map(item => ({
      ...item,
      _calendarId: cal.id,
      _calendarSummary: cal.summary,
      _calendarColor: cal.backgroundColor || '#6366f1',
      _isHoliday: cal.isHoliday,
      _isPrimary: cal.primary
    }));
  }

  async function fetchAllSelectedCalendarEvents(token, timeMin, timeMax, signal) {
    if (selectedCalendarIds.size === 0) {
      return [];
    }

    const targetCalendars = availableCalendars.filter(c => selectedCalendarIds.has(c.id));
    if (targetCalendars.length === 0) {
      return [];
    }

    // 全ての対象カレンダーを並列フェッチ (Promise.allSettled)
    // ※同時接続数は TimeLayerCore 側で制限される
    const fetchPromises = targetCalendars.map(cal => 
      fetchEventsForSingleCalendar(token, cal, timeMin, timeMax, signal)
    );

    const results = await Promise.allSettled(fetchPromises);

    // 認証切れ・中断は握りつぶさずに呼び出し元へ伝える
    const fatal = results.find(r => r.status === 'rejected' &&
      (r.reason?.message === 'AUTH_EXPIRED' || TimeLayerCore.isAbortError(r.reason)));
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
      // 終日イベントを先に
      if (a.start?.date && !b.start?.date) return -1;
      if (!a.start?.date && b.start?.date) return 1;
      return (a.summary || '').localeCompare(b.summary || '', 'ja');
    });

    return allEvents;
  }

  // =========================================================================
  // Data Loading & Layer Rendering
  // =========================================================================
  /**
   * 3地層を取得して描画する。
   * 実行中に再度呼ばれた場合は前回分を中断し、最新の週だけを描画する。
   * @param {{force?: boolean}} [options] force=true でキャッシュを破棄して再取得
   */
  async function loadAllLayers({ force = false } = {}) {
    if (!currentAuthToken) return;

    if (loadController) {
      loadController.abort();
    }
    const controller = new AbortController();
    loadController = controller;
    const { signal } = controller;

    if (force) {
      TimeLayerCore.clearEventCache();
    }

    loader.classList.remove('hidden');
    hideAlert();

    try {
      // カレンダー一覧がまだ取得されていない場合は先に取得
      if (availableCalendars.length === 0) {
        await loadCalendars();
      }
      if (signal.aborted) return;

      // 3つの期間の範囲を計算
      const rangePresent = getWeekRange(currentOffsetWeeks, 0);
      const range1yr = getWeekRange(currentOffsetWeeks, 1);
      const range2yr = getWeekRange(currentOffsetWeeks, 2);

      // 各レイヤーのヘッダー日付を更新
      layers.present.date.textContent = formatRangeText(rangePresent.start, rangePresent.end, true);
      layers['1yr'].date.textContent = formatRangeText(range1yr.start, range1yr.end, true);
      layers['2yr'].date.textContent = formatRangeText(range2yr.start, range2yr.end, true);

      // 3つの地層を並列取得
      const [eventsPresent, events1yr, events2yr] = await Promise.all([
        fetchAllSelectedCalendarEvents(currentAuthToken, rangePresent.start, rangePresent.end, signal),
        fetchAllSelectedCalendarEvents(currentAuthToken, range1yr.start, range1yr.end, signal),
        fetchAllSelectedCalendarEvents(currentAuthToken, range2yr.start, range2yr.end, signal)
      ]);

      // 取得中に別の週へ切り替えられていたら描画しない
      if (signal.aborted) return;

      // キャッシュに保存
      rawEventsCache.present = eventsPresent;
      rawEventsCache['1yr'] = events1yr;
      rawEventsCache['2yr'] = events2yr;

      // DOMに描画
      renderLayerEvents(layers.present, eventsPresent, rangePresent.start);
      renderLayerEvents(layers['1yr'], events1yr, range1yr.start);
      renderLayerEvents(layers['2yr'], events2yr, range2yr.start);

      // 検索フィルター適用
      if (currentSearchQuery.trim()) {
        applySearchFilter(currentSearchQuery);
      }

      // 最終更新時刻
      const now = new Date();
      lastUpdatedEl.textContent = `同期: ${formatTime(now)} (${selectedCalendarIds.size}カレンダー)`;
    } catch (err) {
      if (TimeLayerCore.isAbortError(err) || signal.aborted) return;
      console.error('[TimeLayer] Error fetching calendar events:', err);
      if (err.message === 'AUTH_EXPIRED') {
        currentAuthToken = null;
        setAuthenticatedUI(false);
        showAlert('認証セッションが切れました。再度ログインしてください。');
      } else {
        showAlert(`カレンダーの取得に失敗しました: ${err.message}`);
      }
    } finally {
      if (loadController === controller) {
        loadController = null;
        loader.classList.add('hidden');
      }
    }
  }

  // 週ナビの連打・カレンダー選択の連続切替をまとめて1回の取得にする
  const scheduleLoadAllLayers = TimeLayerCore.debounce(() => loadAllLayers(), 350);

  function renderLayerEvents(layerObj, events, weekStartDate) {
    layerObj.count.textContent = `${events.length}件`;
    const container = layerObj.eventsContainer;
    container.innerHTML = '';

    if (events.length === 0) {
      container.innerHTML = `
        <div class="layer-empty-state">
          <span class="layer-empty-icon">🌱</span>
          <span>選択されたカレンダーに予定はありません</span>
        </div>
      `;
      return;
    }

    // イベントを開始日（YYYY-MM-DD）ごとにグループ化
    const dayGroups = new Map();

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dayGroups.set(key, { date: d, items: [], holidays: [] });
    }

    events.forEach(evt => {
      let dateKey = '';
      if (evt.start?.date) {
        // 終日イベント (YYYY-MM-DD)
        dateKey = evt.start.date;
      } else if (evt.start?.dateTime) {
        const d = new Date(evt.start.dateTime);
        dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      if (dayGroups.has(dateKey)) {
        const group = dayGroups.get(dateKey);
        group.items.push(evt);

        // 祝日カレンダーのイベントである場合は祝日名として記録
        if (evt._isHoliday) {
          group.holidays.push(evt.summary || '祝日');
        }
      }
    });

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 各日の要素を生成
    dayGroups.forEach((group, key) => {
      if (group.items.length === 0) return; // 予定がない日はスキップ

      const dayGroupEl = document.createElement('div');
      dayGroupEl.className = 'day-group';

      const isToday = key === todayKey;
      const isHoliday = group.holidays.length > 0;
      const holidayName = isHoliday ? group.holidays[0] : '';

      const dayHeader = document.createElement('div');
      dayHeader.className = `day-header ${isToday ? 'is-today' : ''} ${isHoliday ? 'is-holiday' : ''}`;

      dayHeader.innerHTML = `
        <div class="day-header-left">
          <span class="day-title-text">${formatDateShort(group.date)}</span>
          ${isToday ? '<span class="today-indicator">TODAY</span>' : ''}
          ${isHoliday ? `<span class="day-holiday-badge">🎌 ${escapeHtml(holidayName)}</span>` : ''}
        </div>
        <span style="font-size: 10px; color: var(--text-tertiary);">${group.items.length}件</span>
      `;
      dayGroupEl.appendChild(dayHeader);

      group.items.forEach(item => {
        const itemEl = createEventItemElement(item);
        dayGroupEl.appendChild(itemEl);
      });

      container.appendChild(dayGroupEl);
    });
  }

  function createEventItemElement(item) {
    const itemEl = document.createElement('div');
    itemEl.className = 'event-item';

    // 所属カレンダーのカラーを設定
    const calColor = item._calendarColor || 'var(--border-subtle)';
    itemEl.style.setProperty('--event-cal-color', calColor);

    // 祝日イベントの場合は特別クラス
    if (item._isHoliday) {
      itemEl.classList.add('is-holiday-item');
    }

    // 時間の表示判定
    let timeHtml = '';
    if (item.start?.date) {
      timeHtml = '<span class="all-day-tag">終日</span>';
    } else if (item.start?.dateTime) {
      const s = new Date(item.start.dateTime);
      const e = item.end?.dateTime ? new Date(item.end.dateTime) : null;
      const timeStr = e ? `${formatTime(s)} - ${formatTime(e)}` : formatTime(s);
      timeHtml = `<span class="event-time">${timeStr}</span>`;
    }

    const summary = item.summary || '(タイトルなし)';
    const location = item.location ? `<div class="event-location">📍 ${escapeHtml(item.location)}</div>` : '';
    const calPill = item._calendarSummary ? `<span class="event-cal-pill" title="${escapeHtml(item._calendarSummary)}">${escapeHtml(item._calendarSummary)}</span>` : '';

    itemEl.innerHTML = `
      <div class="event-title-full" title="${escapeHtml(summary)}">
        ${escapeHtml(summary)}
      </div>
      <div class="event-meta-line">
        <div class="event-meta-left">
          ${timeHtml}
        </div>
        ${calPill}
      </div>
      ${location}
    `;

    // 検索・フィルタリング用のテキスト属性
    itemEl.dataset.searchText = `${summary} ${item.location || ''} ${item._calendarSummary || ''}`.toLowerCase();

    // クリックでカレンダー詳細を開く（htmlLinkが存在する場合）
    if (item.htmlLink) {
      itemEl.style.cursor = 'pointer';
      itemEl.addEventListener('click', () => {
        window.open(item.htmlLink, '_blank');
      });
    }

    return itemEl;
  }

  // =========================================================================
  // Search & Filtering
  // =========================================================================
  function applySearchFilter(query) {
    currentSearchQuery = query.toLowerCase().trim();
    const allItems = document.querySelectorAll('.event-item');

    if (!currentSearchQuery) {
      allItems.forEach(item => {
        item.classList.remove('search-dimmed-item', 'search-matched-item');
      });
      searchClearBtn.classList.add('hidden');
      searchMatchCount.classList.add('hidden');
      return;
    }

    searchClearBtn.classList.remove('hidden');
    let matchedCount = 0;

    allItems.forEach(item => {
      const text = item.dataset.searchText || '';
      if (text.includes(currentSearchQuery)) {
        item.classList.remove('search-dimmed-item');
        item.classList.add('search-matched-item');
        matchedCount++;
      } else {
        item.classList.remove('search-matched-item');
        item.classList.add('search-dimmed-item');
      }
    });

    searchMatchCount.textContent = `${matchedCount}件一致`;
    searchMatchCount.classList.remove('hidden');
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
  // Auth Handlers (launchWebAuthFlow + storage caching)
  // =========================================================================
  const REDIRECT_URL = chrome.identity.getRedirectURL();

  async function getAuthToken(interactive = false) {
    // 1. まずローカルストレージの保存済みトークンを確認
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
      'https://www.googleapis.com/auth/calendar.readonly'
    ];

    if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
      throw new Error('manifest.json にクライアントIDが設定されていません。');
    }

    // Google OAuth 2.0 WebフローのURLを構築
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URL);
    authUrl.searchParams.set('scope', scopes.join(' '));
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

          if (error) {
            return reject(new Error(`OAuthエラー: ${error}`));
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

  async function handleSignIn() {
    hideAlert();
    try {
      const token = await getAuthToken(true);
      if (token) {
        currentAuthToken = token;
        setAuthenticatedUI(true);
        updateWeekNavUI();
        await loadCalendars();
        await loadAllLayers();
      }
    } catch (err) {
      console.error('[TimeLayer] Sign-in error:', err);
      showAlert(`ログインに失敗しました: ${err.message || 'クライアントIDや設定を確認してください'}`);
    }
  }

  async function handleSignOut() {
    if (currentAuthToken) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${currentAuthToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }).catch(() => {});
    }
    if (loadController) {
      loadController.abort();
    }
    await clearStoredToken();
    currentAuthToken = null;
    availableCalendars = [];
    selectedCalendarIds.clear();
    setAuthenticatedUI(false);
  }

  // =========================================================================
  // Setup & Event Listeners
  // =========================================================================
  function initAccordion() {
    document.querySelectorAll('.layer-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.strata-card');
        card.classList.toggle('collapsed');
      });
    });
  }

  function setupEventListeners() {
    // 認証
    signinBtn.addEventListener('click', handleSignIn);
    signoutBtn.addEventListener('click', handleSignOut);

    // リフレッシュ（キャッシュを破棄して最新を取得）
    refreshBtn.addEventListener('click', () => {
      if (currentAuthToken) {
        loadAllLayers({ force: true });
      }
    });

    // 大画面ダッシュボードを新規タブで開く
    const openFullpageBtn = document.getElementById('open-fullpage-btn');
    if (openFullpageBtn) {
      openFullpageBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
      });
    }

    // カレンダー管理パネルのトグル
    calendarToggleBtn.addEventListener('click', () => {
      const isHidden = calendarPanel.classList.toggle('hidden');
      calendarToggleBtn.classList.toggle('active', !isHidden);
    });

    calendarPanelClose.addEventListener('click', () => {
      calendarPanel.classList.add('hidden');
      calendarToggleBtn.classList.remove('active');
    });

    // クイックアクション: すべて選択
    btnCalAll.addEventListener('click', async () => {
      availableCalendars.forEach(c => selectedCalendarIds.add(c.id));
      await saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      renderCalendarList();
      scheduleLoadAllLayers();
    });

    // クイックアクション: メインのみ
    btnCalPrimary.addEventListener('click', async () => {
      selectedCalendarIds.clear();
      availableCalendars.forEach(c => {
        if (c.primary) selectedCalendarIds.add(c.id);
      });
      // メインがない場合は先頭を1件
      if (selectedCalendarIds.size === 0 && availableCalendars.length > 0) {
        selectedCalendarIds.add(availableCalendars[0].id);
      }
      await saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      renderCalendarList();
      scheduleLoadAllLayers();
    });

    // クイックアクション: 祝日切替
    btnCalHoliday.addEventListener('click', async () => {
      const holidayCals = availableCalendars.filter(c => c.isHoliday);
      if (holidayCals.length === 0) return;

      const anySelected = holidayCals.some(c => selectedCalendarIds.has(c.id));
      holidayCals.forEach(c => {
        if (anySelected) {
          selectedCalendarIds.delete(c.id);
        } else {
          selectedCalendarIds.add(c.id);
        }
      });

      await saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      renderCalendarList();
      scheduleLoadAllLayers();
    });

    // カレンダー再読み込みボタン（キャッシュを破棄）
    btnCalReload.addEventListener('click', async () => {
      await loadCalendars();
      loadAllLayers({ force: true });
    });

    // 検索トグル
    searchToggleBtn.addEventListener('click', () => {
      const isHidden = searchBarContainer.classList.toggle('hidden');
      searchToggleBtn.classList.toggle('active', !isHidden);
      if (!isHidden) {
        searchInput.focus();
      } else {
        searchInput.value = '';
        applySearchFilter('');
      }
    });

    // 検索入力
    searchInput.addEventListener('input', (e) => {
      applySearchFilter(e.target.value);
    });

    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      applySearchFilter('');
      searchInput.focus();
    });

    // 週ナビゲーション（連打時は最後の週だけ取得）
    prevWeekBtn.addEventListener('click', () => {
      currentOffsetWeeks--;
      updateWeekNavUI();
      scheduleLoadAllLayers();
    });

    nextWeekBtn.addEventListener('click', () => {
      currentOffsetWeeks++;
      updateWeekNavUI();
      scheduleLoadAllLayers();
    });

    todayWeekBtn.addEventListener('click', () => {
      if (currentOffsetWeeks !== 0) {
        currentOffsetWeeks = 0;
        updateWeekNavUI();
        scheduleLoadAllLayers();
      }
    });

    alertClose.addEventListener('click', hideAlert);

    // リダイレクトURIの表示とコピーボタンの処理
    const redirectUriInput = document.getElementById('redirect-uri-input');
    const copyUriBtn = document.getElementById('copy-uri-btn');
    if (redirectUriInput) {
      redirectUriInput.value = REDIRECT_URL;
    }
    if (copyUriBtn && redirectUriInput) {
      copyUriBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(redirectUriInput.value);
          const origText = copyUriBtn.textContent;
          copyUriBtn.textContent = 'コピー完了!';
          setTimeout(() => { copyUriBtn.textContent = origText; }, 2000);
        } catch {
          redirectUriInput.select();
        }
      });
    }
  }

  // =========================================================================
  // Theme Management (Dark / Light)
  // =========================================================================
  let currentTheme = 'dark';

  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (themeToggleBtn) {
      themeToggleBtn.title = currentTheme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え';
    }
  }

  function initTheme() {
    chrome.storage.local.get(['timelayer_theme'], (res) => {
      const savedTheme = res.timelayer_theme || 'dark';
      applyTheme(savedTheme);
    });

    // 他画面（大画面ダッシュボード等）での切替とリアルタイム同期
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.timelayer_theme) {
        applyTheme(changes.timelayer_theme.newValue);
      }
    });

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(nextTheme);
        chrome.storage.local.set({ timelayer_theme: nextTheme });
      });
    }
  }

  // 初期化: 既存のサイレントログインを検証
  async function init() {
    initTheme();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('embedded') === 'true') {
      document.body.classList.add('is-embedded');
    }

    initAccordion();
    setupEventListeners();
    updateWeekNavUI();

    try {
      const token = await getAuthToken(false);
      if (token) {
        currentAuthToken = token;
        setAuthenticatedUI(true);
        await loadCalendars();
        await loadAllLayers();
      } else {
        setAuthenticatedUI(false);
      }
    } catch (err) {
      setAuthenticatedUI(false);
    }
  }

  // DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
