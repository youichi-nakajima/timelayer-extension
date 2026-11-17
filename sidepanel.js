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
  let isSigningIn = false;
  let loadController = null; // 実行中の loadAllLayers を中断するための AbortController
  let isFetchingCalendars = false;

  // カレンダー管理状態
  let availableCalendars = []; // Array of calendar objects
  let selectedCalendarIds = new Set(); // Set of active calendar IDs
  let rawEventsCache = { present: [], '1yr': [], '2yr': [] }; // 検索用キャッシュ
  let currentSearchQuery = '';
  let currentWeekStart = 'sunday'; // 'sunday' or 'monday'

  // DOM Elements
  const authView = document.getElementById('auth-view');
  const mainView = document.getElementById('main-view');
  const signinBtn = document.getElementById('signin-btn');
  const signoutBtn = document.getElementById('signout-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const weekStartToggleBtn = document.getElementById('week-start-toggle-btn');
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

  function updateWeekStartBtnUI() {
    if (weekStartToggleBtn) {
      const isMon = currentWeekStart === 'monday';
      weekStartToggleBtn.textContent = isMon ? TimeLayerCore.t('weekStartMon') : TimeLayerCore.t('weekStartSun');
      weekStartToggleBtn.title = isMon ? TimeLayerCore.t('weekStartMonTitle') : TimeLayerCore.t('weekStartSunTitle');
    }
  }

  function updateWeekNavUI() {
    updateWeekStartBtnUI();
    const currentWeekRange = TimeLayerCore.getWeekRange(currentOffsetWeeks, 0, currentWeekStart);
    weekRangeText.textContent = TimeLayerCore.formatRangeText(currentWeekRange.start, currentWeekRange.end, true);

    if (currentOffsetWeeks === 0) {
      weekRelativeLabel.textContent = TimeLayerCore.t('thisWeek');
      weekRelativeLabel.style.background = 'rgba(16, 185, 129, 0.15)';
      weekRelativeLabel.style.color = '#34d399';
      if (todayWeekBtn) todayWeekBtn.classList.add('hidden');
    } else if (currentOffsetWeeks > 0) {
      weekRelativeLabel.textContent = TimeLayerCore.t('weeksLater', { n: currentOffsetWeeks });
      weekRelativeLabel.style.background = 'rgba(59, 130, 246, 0.15)';
      weekRelativeLabel.style.color = '#60a5fa';
      if (todayWeekBtn) todayWeekBtn.classList.remove('hidden');
    } else {
      weekRelativeLabel.textContent = TimeLayerCore.t('weeksAgo', { n: Math.abs(currentOffsetWeeks) });
      weekRelativeLabel.style.background = 'rgba(245, 158, 11, 0.15)';
      weekRelativeLabel.style.color = '#fbbf24';
      if (todayWeekBtn) todayWeekBtn.classList.remove('hidden');
    }
  }

  // =========================================================================
  // Calendar Management Logic & UI
  // =========================================================================
  async function loadCalendars() {
    if (!currentAuthToken || isFetchingCalendars) return;

    isFetchingCalendars = true;
    calendarListLoading.classList.remove('hidden');

    try {
      availableCalendars = await TimeLayerCore.fetchCalendarList(currentAuthToken);

      // 保存済みの選択状態を読み込む
      const savedIds = await TimeLayerCore.getStoredSelectedCalendarIds();

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

        await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      }

      renderCalendarList();
      updateCalendarBadge();
    } catch (err) {
      console.error('[TimeLayer] Error fetching calendar list:', err);
      if (err.message === 'AUTH_EXPIRED') {
        currentAuthToken = null;
        setAuthenticatedUI(false);
        showAlert(TimeLayerCore.t('errAuthExpired'));
      } else {
        showAlert(TimeLayerCore.t('errFetchCalList', { msg: err.message }));
      }
    } finally {
      isFetchingCalendars = false;
      calendarListLoading.classList.add('hidden');
    }
  }

  function renderCalendarList() {
    calendarList.innerHTML = '';

    if (availableCalendars.length === 0) {
      calendarList.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:11px;">${TimeLayerCore.escapeHtml(TimeLayerCore.t('noCalendarsFound'))}</div>`;
      return;
    }

    availableCalendars.forEach(cal => {
      const isChecked = selectedCalendarIds.has(cal.id);

      const itemEl = document.createElement('label');
      itemEl.className = `calendar-item ${isChecked ? 'is-selected' : ''}`;

      let tagsHtml = '';
      if (cal.primary) {
        tagsHtml += `<span class="cal-tag cal-tag-primary">${TimeLayerCore.escapeHtml(TimeLayerCore.t('tagPrimary'))}</span>`;
      }
      if (cal.isHoliday) {
        tagsHtml += `<span class="cal-tag cal-tag-holiday">${TimeLayerCore.escapeHtml(TimeLayerCore.t('tagHoliday'))}</span>`;
      }

      itemEl.innerHTML = `
        <div class="cal-item-left">
          <span class="cal-color-dot" style="background-color: ${TimeLayerCore.escapeHtml(cal.backgroundColor)};"></span>
          <span class="cal-item-name" title="${TimeLayerCore.escapeHtml(cal.summary)}">${TimeLayerCore.escapeHtml(cal.summary)}</span>
          ${tagsHtml}
        </div>
        <input type="checkbox" class="cal-checkbox" data-id="${TimeLayerCore.escapeHtml(cal.id)}" ${isChecked ? 'checked' : ''}>
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

        await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
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

    calendarSelectedSummary.textContent = TimeLayerCore.t('calSelectedSummary', { selected, total });

    if (selected > 0) {
      calendarBadgeCount.textContent = String(selected);
      calendarBadgeCount.classList.remove('hidden');
    } else {
      calendarBadgeCount.classList.add('hidden');
    }
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
      const rangePresent = TimeLayerCore.getWeekRange(currentOffsetWeeks, 0, currentWeekStart);
      const range1yr = TimeLayerCore.getWeekRange(currentOffsetWeeks, 1, currentWeekStart);
      const range2yr = TimeLayerCore.getWeekRange(currentOffsetWeeks, 2, currentWeekStart);

      // 各レイヤーのヘッダー日付を更新
      layers.present.date.textContent = TimeLayerCore.formatRangeText(rangePresent.start, rangePresent.end, true);
      layers['1yr'].date.textContent = TimeLayerCore.formatRangeText(range1yr.start, range1yr.end, true);
      layers['2yr'].date.textContent = TimeLayerCore.formatRangeText(range2yr.start, range2yr.end, true);

      // 3つの地層を並列取得
      const [eventsPresent, events1yr, events2yr] = await Promise.all([
        TimeLayerCore.fetchAllSelectedCalendarEvents(currentAuthToken, availableCalendars, selectedCalendarIds, rangePresent.start, rangePresent.end, signal),
        TimeLayerCore.fetchAllSelectedCalendarEvents(currentAuthToken, availableCalendars, selectedCalendarIds, range1yr.start, range1yr.end, signal),
        TimeLayerCore.fetchAllSelectedCalendarEvents(currentAuthToken, availableCalendars, selectedCalendarIds, range2yr.start, range2yr.end, signal)
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
      lastUpdatedEl.textContent = TimeLayerCore.t('syncedSidepanel', {
        time: TimeLayerCore.formatTime(now),
        count: selectedCalendarIds.size
      });
    } catch (err) {
      if (TimeLayerCore.isAbortError(err) || signal.aborted) return;
      console.error('[TimeLayer] Error fetching calendar events:', err);
      if (err.message === 'AUTH_EXPIRED') {
        currentAuthToken = null;
        setAuthenticatedUI(false);
        showAlert(TimeLayerCore.t('errAuthExpired'));
      } else {
        showAlert(TimeLayerCore.t('errFetchEvents', { msg: err.message }));
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
    layerObj.count.textContent = TimeLayerCore.formatEventCount(events.length);
    const container = layerObj.eventsContainer;
    container.innerHTML = '';

    if (events.length === 0) {
      container.innerHTML = `
        <div class="layer-empty-state">
          <span class="layer-empty-icon">🌱</span>
          <span>${TimeLayerCore.escapeHtml(TimeLayerCore.t('emptyLayerEvents'))}</span>
        </div>
      `;
      return;
    }

    // 7曜日のグループマップを初期化
    const dayGroups = new Map();

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + i);
      const key = TimeLayerCore.formatDateOnly(d);
      dayGroups.set(key, { date: d, items: [], holidays: [] });
    }

    events.forEach(evt => {
      if (evt.start?.date) {
        // 終日・複数日予定（全日スパン対応）
        const startStr = evt.start.date;
        const endStr = evt.end?.date;
        dayGroups.forEach((group, key) => {
          const isInRange = endStr ? (key >= startStr && key < endStr) : (key === startStr);
          if (isInRange) {
            group.items.push(evt);
            if (evt._isHoliday) {
              group.holidays.push(evt.summary || TimeLayerCore.t('defaultHolidayName'));
            }
          }
        });
      } else if (evt.start?.dateTime) {
        // 時間指定予定（日マタギ・複数日対応）
        const s = new Date(evt.start.dateTime);
        const startStr = TimeLayerCore.formatDateOnly(s);
        const e = evt.end?.dateTime ? new Date(evt.end.dateTime) : s;
        const isMidnightEnd = e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0;
        const effectiveEndDate = isMidnightEnd ? new Date(e.getTime() - 1000) : e;
        const endStr = TimeLayerCore.formatDateOnly(effectiveEndDate);

        dayGroups.forEach((group, key) => {
          if (key >= startStr && key <= endStr) {
            group.items.push(evt);
            if (evt._isHoliday) {
              group.holidays.push(evt.summary || TimeLayerCore.t('defaultHolidayName'));
            }
          }
        });
      }
    });

    const todayKey = TimeLayerCore.formatDateOnly(new Date());

    // 各日の要素を生成
    dayGroups.forEach((group, key) => {
      if (group.items.length === 0) return; // 予定がない日はスキップ

      // 終日予定を先頭に、時間指定予定を開始時刻順でソート
      group.items.sort((a, b) => {
        const isAllDayA = Boolean(a.start?.date);
        const isAllDayB = Boolean(b.start?.date);
        if (isAllDayA && !isAllDayB) return -1;
        if (!isAllDayA && isAllDayB) return 1;

        const timeA = a.start?.dateTime ? new Date(a.start.dateTime).getTime() : 0;
        const timeB = b.start?.dateTime ? new Date(b.start.dateTime).getTime() : 0;
        return timeA - timeB;
      });

      const dayGroupEl = document.createElement('div');
      dayGroupEl.className = 'day-group';

      const isToday = key === todayKey;
      const isHoliday = group.holidays.length > 0;
      const holidayName = isHoliday ? group.holidays[0] : '';

      const dayHeader = document.createElement('div');
      dayHeader.className = `day-header ${isToday ? 'is-today' : ''} ${isHoliday ? 'is-holiday' : ''}`;

      dayHeader.innerHTML = `
        <div class="day-header-left">
          <span class="day-title-text">${TimeLayerCore.formatDateShort(group.date)}</span>
          ${isToday ? '<span class="today-indicator">TODAY</span>' : ''}
          ${isHoliday ? `<span class="day-holiday-badge">🎌 ${TimeLayerCore.escapeHtml(holidayName)}</span>` : ''}
        </div>
        <span style="font-size: 10px; color: var(--text-tertiary);">${TimeLayerCore.formatEventCount(group.items.length)}</span>
      `;
      dayGroupEl.appendChild(dayHeader);

      group.items.forEach(item => {
        const itemEl = createEventItemElement(item, key);
        dayGroupEl.appendChild(itemEl);
      });

      container.appendChild(dayGroupEl);
    });
  }

  function createEventItemElement(item, currentDateKey) {
    const itemEl = document.createElement('div');
    itemEl.className = 'event-item';

    // 所属カレンダーのカラーを設定
    const calColor = item._calendarColor || 'var(--border-subtle)';
    itemEl.style.setProperty('--event-cal-color', calColor);

    // 祝日イベントの場合は特別クラス
    if (item._isHoliday) {
      itemEl.classList.add('is-holiday-item');
    }

    // 時間の表示判定（日マタギ・複数日対応）
    let timeHtml = '';
    if (item.start?.date) {
      const startStr = item.start.date;
      const endStr = item.end?.date || startStr;
      const totalDays = Math.max(1, TimeLayerCore.getDayDifference(startStr, endStr));
      if (totalDays > 1) {
        timeHtml = `<span class="all-day-tag">${TimeLayerCore.escapeHtml(TimeLayerCore.t('allDayMulti', { days: totalDays }))}</span>`;
      } else {
        timeHtml = `<span class="all-day-tag">${TimeLayerCore.escapeHtml(TimeLayerCore.t('allDay'))}</span>`;
      }
    } else if (item.start?.dateTime) {
      const s = new Date(item.start.dateTime);
      const e = item.end?.dateTime ? new Date(item.end.dateTime) : null;
      if (e) {
        const sStr = TimeLayerCore.formatDateOnly(s);
        const isMidnight = e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0;
        const eStr = TimeLayerCore.formatDateOnly(isMidnight ? new Date(e.getTime() - 1000) : e);
        if (sStr !== eStr && currentDateKey) {
          if (currentDateKey === sStr) {
            timeHtml = `<span class="event-time">${TimeLayerCore.escapeHtml(TimeLayerCore.t('timeStartOnly', { time: TimeLayerCore.formatTime(s) }))}</span>`;
          } else if (currentDateKey === eStr) {
            timeHtml = `<span class="event-time">${TimeLayerCore.escapeHtml(TimeLayerCore.t('timeEndOnly', { time: TimeLayerCore.formatTime(e) }))}</span>`;
          } else {
            timeHtml = `<span class="event-time">${TimeLayerCore.escapeHtml(TimeLayerCore.t('allDayCont'))}</span>`;
          }
        } else {
          timeHtml = `<span class="event-time">${TimeLayerCore.formatTime(s)} - ${TimeLayerCore.formatTime(e)}</span>`;
        }
      } else {
        timeHtml = `<span class="event-time">${TimeLayerCore.formatTime(s)}</span>`;
      }
    }

    const summary = item.summary || TimeLayerCore.t('untitledEvent');
    const location = item.location ? `<div class="event-location">📍 ${TimeLayerCore.escapeHtml(item.location)}</div>` : '';
    const calPill = item._calendarSummary ? `<span class="event-cal-pill" title="${TimeLayerCore.escapeHtml(item._calendarSummary)}">${TimeLayerCore.escapeHtml(item._calendarSummary)}</span>` : '';

    itemEl.innerHTML = `
      <div class="event-title-full" title="${TimeLayerCore.escapeHtml(summary)}">
        ${TimeLayerCore.escapeHtml(summary)}
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
        window.open(item.htmlLink, '_blank', 'noopener,noreferrer');
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

    searchMatchCount.textContent = TimeLayerCore.t('searchMatchedCount', { n: matchedCount });
    searchMatchCount.classList.remove('hidden');
  }

  // =========================================================================
  // Auth Handlers
  // =========================================================================
  const REDIRECT_URL = chrome.identity.getRedirectURL();

  async function handleSignIn() {
    hideAlert();
    isSigningIn = true;
    try {
      const token = await TimeLayerCore.getAuthToken(true);
      if (token) {
        currentAuthToken = token;
        setAuthenticatedUI(true);
        updateWeekNavUI();
        await loadCalendars();
        await loadAllLayers();
      }
    } catch (err) {
      console.error('[TimeLayer] Sign-in error:', err);
      showAlert(TimeLayerCore.t('errSignIn', { msg: err.message || TimeLayerCore.t('errSignInFallback') }));
    } finally {
      isSigningIn = false;
    }
  }

  async function handleSignOut() {
    const tokenToRevoke = currentAuthToken;
    if (loadController) {
      loadController.abort();
    }
    currentAuthToken = null;
    availableCalendars = [];
    selectedCalendarIds.clear();
    rawEventsCache = { present: [], '1yr': [], '2yr': [] };
    setAuthenticatedUI(false);
    await TimeLayerCore.revokeAndClearToken(tokenToRevoke);
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

    // 大画面ダッシュボードを新規タブで開く（開いた後にサイドパネルまたは親ドロワーを自動クローズ）
    const openFullpageBtn = document.getElementById('open-fullpage-btn');
    if (openFullpageBtn) {
      openFullpageBtn.addEventListener('click', async () => {
        try {
          const langParam = new URLSearchParams(window.location.search).get('lang');
          const dashboardPath = (langParam === 'en' || langParam === 'ja')
            ? `dashboard.html?lang=${encodeURIComponent(langParam)}`
            : 'dashboard.html';
          await chrome.tabs.create({ url: chrome.runtime.getURL(dashboardPath) });
          if (document.body.classList.contains('is-embedded')) {
            window.parent.postMessage({ type: 'TIMELAYER_CLOSE_DRAWER' }, 'https://calendar.google.com');
          } else {
            window.close();
          }
        } catch (error) {
          console.error('[TimeLayer] Failed to open dashboard tab:', error);
        }
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
      await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
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
      await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
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

      await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
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

    // 週開始曜日の切り替え（日曜 ⇄ 月曜）
    if (weekStartToggleBtn) {
      weekStartToggleBtn.addEventListener('click', () => {
        const nextWeekStart = currentWeekStart === 'sunday' ? 'monday' : 'sunday';
        currentWeekStart = nextWeekStart;
        chrome.storage.local.set({ timelayer_week_start: nextWeekStart });
        updateWeekStartBtnUI();
        updateWeekNavUI();
        if (currentAuthToken) {
          scheduleLoadAllLayers();
        }
      });
    }

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
          copyUriBtn.textContent = TimeLayerCore.t('copied');
          setTimeout(() => { copyUriBtn.textContent = origText; }, 2000);
        } catch {
          redirectUriInput.select();
        }
      });
    }
  }

  // =========================================================================
  // Theme & Storage Sync Management
  // =========================================================================
  let currentTheme = 'dark';
  let hasExplicitTheme = false;

  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (themeToggleBtn) {
      themeToggleBtn.title = currentTheme === 'light'
        ? TimeLayerCore.t('themeToggleDark')
        : TimeLayerCore.t('themeToggleLight');
    }
  }

  async function initStorageSync() {
    const res = await new Promise((resolve) => {
      chrome.storage.local.get(['timelayer_theme', 'timelayer_week_start'], resolve);
    });

    hasExplicitTheme = res.timelayer_theme === 'light' || res.timelayer_theme === 'dark';
    applyTheme(TimeLayerCore.resolveTheme(res.timelayer_theme));

    currentWeekStart = res.timelayer_week_start === 'monday' ? 'monday' : 'sunday';
    updateWeekStartBtnUI();
    updateWeekNavUI();

    const colorSchemeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    if (colorSchemeQuery) {
      colorSchemeQuery.addEventListener('change', () => {
        if (!hasExplicitTheme) {
          applyTheme(TimeLayerCore.resolveTheme(null));
        }
      });
    }

    // 他画面（大画面ダッシュボード等）での設定・認証状態変更とリアルタイム同期
    const tokenAreaName = chrome.storage.session ? 'session' : 'local';
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === tokenAreaName && changes[TimeLayerCore.TOKEN_KEY]) {
        const nextToken = changes[TimeLayerCore.TOKEN_KEY].newValue?.accessToken || null;
        if (nextToken && !isSigningIn && nextToken !== currentAuthToken) {
          currentAuthToken = nextToken;
          setAuthenticatedUI(true);
          updateWeekNavUI();
          loadCalendars().then(() => {
            if (currentAuthToken) return loadAllLayers();
          }).catch(() => {});
        } else if (!nextToken && currentAuthToken) {
          if (loadController) {
            loadController.abort();
          }
          currentAuthToken = null;
          availableCalendars = [];
          selectedCalendarIds.clear();
          rawEventsCache = { present: [], '1yr': [], '2yr': [] };
          setAuthenticatedUI(false);
        }
      }

      if (area !== 'local') return;

      // 1. テーマの同期
      if (changes.timelayer_theme) {
        const nextTheme = changes.timelayer_theme.newValue;
        hasExplicitTheme = nextTheme === 'light' || nextTheme === 'dark';
        applyTheme(TimeLayerCore.resolveTheme(nextTheme));
      }

      // 2. カレンダー選択状態の同期
      if (changes.timelayer_selected_calendar_ids) {
        const newIds = changes.timelayer_selected_calendar_ids.newValue;
        if (Array.isArray(newIds) && !TimeLayerCore.areIdSetsEqual(selectedCalendarIds, newIds)) {
          const validIds = availableCalendars.length > 0
            ? newIds.filter(id => availableCalendars.some(c => c.id === id))
            : newIds;
          selectedCalendarIds = new Set(validIds);
          renderCalendarList();
          if (currentAuthToken) {
            scheduleLoadAllLayers();
          }
        }
      }

      // 3. 週の開始曜日の同期
      if (changes.timelayer_week_start) {
        const nextWeekStart = changes.timelayer_week_start.newValue === 'monday' ? 'monday' : 'sunday';
        if (currentWeekStart !== nextWeekStart) {
          currentWeekStart = nextWeekStart;
          updateWeekStartBtnUI();
          updateWeekNavUI();
          if (currentAuthToken) {
            scheduleLoadAllLayers();
          }
        }
      }
    });

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        hasExplicitTheme = true;
        applyTheme(nextTheme);
        chrome.storage.local.set({ timelayer_theme: nextTheme });
      });
    }
  }

  // 初期化: 既存のサイレントログインを検証
  async function init() {
    TimeLayerCore.applyI18nToDOM();
    updateCalendarBadge();
    Object.values(layers).forEach((layer) => {
      if (layer.count) layer.count.textContent = TimeLayerCore.formatEventCount(0);
    });

    await initStorageSync();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('embedded') === 'true') {
      document.body.classList.add('is-embedded');
    }

    initAccordion();
    setupEventListeners();
    updateWeekNavUI();

    try {
      const token = await TimeLayerCore.getAuthToken(false);
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
