/**
 * TimeLayer - Large Screen Dashboard Logic (Panoramic Strata)
 * Google Calendar API (v3) - Week Matrix View (週横組み) & 3-Column Parallel Multi-Calendar
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

  // 表示モード: 'matrix' (週横組み) | 'columns' (3列カラム)
  let currentViewMode = 'matrix';

  let availableCalendars = [];
  let selectedCalendarIds = new Set();
  let rawEventsCache = { present: [], '1yr': [], '2yr': [] };
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
  const footerCalCount = document.getElementById('footer-cal-count');
  const alertBanner = document.getElementById('alert-banner');
  const alertMessage = document.getElementById('alert-message');
  const alertClose = document.getElementById('alert-close');

  // ビュー切替ボタン
  const btnViewMatrix = document.getElementById('btn-view-matrix');
  const btnViewColumns = document.getElementById('btn-view-columns');
  const viewMatrixContainer = document.getElementById('view-matrix');
  const viewColumnsContainer = document.getElementById('view-columns');

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

  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const searchMatchCount = document.getElementById('search-match-count');

  // 3-Column Columns DOM
  const columns = {
    present: {
      date: document.getElementById('date-present'),
      count: document.getElementById('count-present'),
      eventsContainer: document.getElementById('events-present')
    },
    '1yr': {
      date: document.getElementById('date-1yr'),
      count: document.getElementById('count-1yr'),
      eventsContainer: document.getElementById('events-1yr')
    },
    '2yr': {
      date: document.getElementById('date-2yr'),
      count: document.getElementById('count-2yr'),
      eventsContainer: document.getElementById('events-2yr')
    }
  };

  // Matrix View DOM
  const matrixLabels = {
    present: {
      date: document.getElementById('matrix-date-present'),
      count: document.getElementById('matrix-count-present')
    },
    '1yr': {
      date: document.getElementById('matrix-date-1yr'),
      count: document.getElementById('matrix-count-1yr')
    },
    '2yr': {
      date: document.getElementById('matrix-date-2yr'),
      count: document.getElementById('matrix-count-2yr')
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
  // View Mode Switcher
  // =========================================================================
  function setViewMode(mode) {
    currentViewMode = mode;
    if (mode === 'matrix') {
      btnViewMatrix.classList.add('active');
      btnViewColumns.classList.remove('active');
      viewMatrixContainer.classList.remove('hidden');
      viewColumnsContainer.classList.add('hidden');
    } else {
      btnViewColumns.classList.add('active');
      btnViewMatrix.classList.remove('active');
      viewColumnsContainer.classList.remove('hidden');
      viewMatrixContainer.classList.add('hidden');
      requestAnimationFrame(() => {
        syncColumnDayHeights();
      });
    }

    chrome.storage.local.set({ timelayer_view_mode: mode });
  }

  async function loadSavedViewMode() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['timelayer_view_mode'], (res) => {
        resolve(res.timelayer_view_mode || 'matrix'); // デフォルトは週横組み
      });
    });
  }

  // =========================================================================
  // Calendar Management
  // =========================================================================
  async function loadCalendars() {
    if (!currentAuthToken || isFetchingCalendars) return;

    isFetchingCalendars = true;
    calendarListLoading.classList.remove('hidden');

    try {
      availableCalendars = await TimeLayerCore.fetchCalendarList(currentAuthToken);
      const savedIds = await TimeLayerCore.getStoredSelectedCalendarIds();

      if (savedIds && Array.isArray(savedIds) && savedIds.length > 0) {
        const availableIdSet = new Set(availableCalendars.map(c => c.id));
        const validIds = savedIds.filter(id => availableIdSet.has(id));
        selectedCalendarIds = new Set(validIds.length > 0 ? validIds : availableCalendars.map(c => c.id));
      } else {
        selectedCalendarIds = new Set();
        availableCalendars.forEach(c => {
          if (c.primary || c.isHoliday || c.selectedInGoogle) {
            selectedCalendarIds.add(c.id);
          }
        });
        if (selectedCalendarIds.size === 0 && availableCalendars.length > 0) {
          availableCalendars.forEach(c => selectedCalendarIds.add(c.id));
        }
        await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      }

      renderCalendarList();
      updateCalendarBadge();
    } catch (err) {
      console.error('[TimeLayer Dashboard] Error fetching calendar list:', err);
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
      calendarList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px;">${TimeLayerCore.escapeHtml(TimeLayerCore.t('noCalendarsFound'))}</div>`;
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
    footerCalCount.textContent = TimeLayerCore.t('footerCalCount', { selected });

    if (selected > 0) {
      calendarBadgeCount.textContent = String(selected);
      calendarBadgeCount.classList.remove('hidden');
    } else {
      calendarBadgeCount.classList.add('hidden');
    }
  }

  // =========================================================================
  // Load Layers (Loads data and renders both Matrix & Columns views)
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
      if (availableCalendars.length === 0) {
        await loadCalendars();
      }
      if (signal.aborted) return;

      // 3つの期間の範囲を計算
      const rangePresent = TimeLayerCore.getWeekRange(currentOffsetWeeks, 0, currentWeekStart);
      const range1yr = TimeLayerCore.getWeekRange(currentOffsetWeeks, 1, currentWeekStart);
      const range2yr = TimeLayerCore.getWeekRange(currentOffsetWeeks, 2, currentWeekStart);

      // 並列取得
      const [eventsPresent, events1yr, events2yr] = await Promise.all([
        TimeLayerCore.fetchAllSelectedCalendarEvents(currentAuthToken, availableCalendars, selectedCalendarIds, rangePresent.start, rangePresent.end, signal),
        TimeLayerCore.fetchAllSelectedCalendarEvents(currentAuthToken, availableCalendars, selectedCalendarIds, range1yr.start, range1yr.end, signal),
        TimeLayerCore.fetchAllSelectedCalendarEvents(currentAuthToken, availableCalendars, selectedCalendarIds, range2yr.start, range2yr.end, signal)
      ]);

      // 取得中に別の週へ切り替えられていたら描画しない
      if (signal.aborted) return;

      rawEventsCache.present = eventsPresent;
      rawEventsCache['1yr'] = events1yr;
      rawEventsCache['2yr'] = events2yr;

      // 1. カラムビューのラベル更新＆レンダリング
      columns.present.date.textContent = TimeLayerCore.formatRangeText(rangePresent.start, rangePresent.end, true);
      columns['1yr'].date.textContent = TimeLayerCore.formatRangeText(range1yr.start, range1yr.end, true);
      columns['2yr'].date.textContent = TimeLayerCore.formatRangeText(range2yr.start, range2yr.end, true);

      renderColumnEvents(columns.present, eventsPresent, rangePresent.start);
      renderColumnEvents(columns['1yr'], events1yr, range1yr.start);
      renderColumnEvents(columns['2yr'], events2yr, range2yr.start);
      requestAnimationFrame(() => {
        syncColumnDayHeights();
      });

      // 2. 週横組みマトリクスビューのレンダリング
      renderMatrixView(rangePresent, range1yr, range2yr, eventsPresent, events1yr, events2yr);

      // 検索フィルター適用
      if (currentSearchQuery.trim()) {
        applySearchFilter(currentSearchQuery);
      }

      const now = new Date();
      lastUpdatedEl.textContent = TimeLayerCore.t('syncedDashboard', { time: TimeLayerCore.formatTime(now) });
    } catch (err) {
      if (TimeLayerCore.isAbortError(err) || signal.aborted) return;
      console.error('[TimeLayer Dashboard] Load error:', err);
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

  // =========================================================================
  // Render: Week Matrix View (週横組み: 7曜日横軸 × 3地層縦軸)
  // =========================================================================
  function renderMatrixView(rangePresent, range1yr, range2yr, eventsPresent, events1yr, events2yr) {
    // 曜日ヘッダーの日付（表層現在の週の日付）を設定
    const todayKey = TimeLayerCore.formatDateOnly(new Date());

    for (let day = 0; day < 7; day++) {
      const d = new Date(rangePresent.start.getFullYear(), rangePresent.start.getMonth(), rangePresent.start.getDate() + day);
      const headerCol = document.querySelector(`.matrix-day-header[data-day="${day}"]`);
      if (headerCol) {
        const dayOfWeek = d.getDay();
        const nameEl = headerCol.querySelector('.day-name');
        if (nameEl) {
          nameEl.textContent = TimeLayerCore.getDayName(dayOfWeek);
          nameEl.className = 'day-name';
          if (dayOfWeek === 0) nameEl.classList.add('day-sun');
          if (dayOfWeek === 6) nameEl.classList.add('day-sat');
        }
        const dKey = TimeLayerCore.formatDateOnly(d);
        headerCol.classList.toggle('is-today', dKey === todayKey);
      }
    }

    // 地層ラベル行の更新
    matrixLabels.present.date.textContent = TimeLayerCore.formatMatrixLayerDate(rangePresent);
    matrixLabels.present.count.textContent = TimeLayerCore.formatEventCount(eventsPresent.length);

    matrixLabels['1yr'].date.textContent = TimeLayerCore.formatMatrixLayerDate(range1yr);
    matrixLabels['1yr'].count.textContent = TimeLayerCore.formatEventCount(events1yr.length);

    matrixLabels['2yr'].date.textContent = TimeLayerCore.formatMatrixLayerDate(range2yr);
    matrixLabels['2yr'].count.textContent = TimeLayerCore.formatEventCount(events2yr.length);

    // 3つの地層セルにイベントを配置
    renderMatrixLayerRow('present', rangePresent.start, eventsPresent, todayKey);
    renderMatrixLayerRow('1yr', range1yr.start, events1yr, todayKey);
    renderMatrixLayerRow('2yr', range2yr.start, events2yr, todayKey);
  }

  function renderMatrixLayerRow(layerKey, weekStartDate, events, todayKey) {
    const multiDayTrack = document.getElementById(`multi-day-${layerKey}`);
    if (multiDayTrack) {
      multiDayTrack.innerHTML = '';
    }

    // 1週間の各日の日付文字列 (YYYY-MM-DD) を作成
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + i);
      return TimeLayerCore.formatDateOnly(d);
    });

    const datesRow = document.getElementById(`matrix-dates-${layerKey}`);
    if (datesRow) {
      datesRow.innerHTML = '';
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const d = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + dayIndex);
        const dateKey = weekDays[dayIndex];
        const isToday = dateKey === todayKey;
        const dow = d.getDay();
        const dowClass = dow === 0 ? 'day-sun' : (dow === 6 ? 'day-sat' : '');

        const dateCell = document.createElement('div');
        dateCell.className = `matrix-cell-date-header${isToday ? ' is-today' : ''}`;
        dateCell.innerHTML = `
          <span class="matrix-cell-date-text ${dowClass}">${TimeLayerCore.escapeHtml(TimeLayerCore.formatDateShort(d))}</span>
          ${isToday ? '<span class="today-indicator">TODAY</span>' : ''}
        `;
        datesRow.appendChild(dateCell);
      }
    }

    const weekStartStr = weekDays[0];
    const weekEndStr = weekDays[6];

    // イベントを「上部帯バナー（終日・日マタギ予定）」と「日別セル（単日の時間指定予定）」に分離
    const allDayBanners = [];
    const timedEvents = [];

    events.forEach(evt => {
      let isBanner = false;
      let startStr = '';
      let inclusiveEndStr = '';
      let totalDays = 1;

      if (evt.start?.date) {
        // 終日イベント (単日・複数日問わず上部帯バナーへ)
        isBanner = true;
        startStr = evt.start.date;
        const endStr = evt.end?.date || startStr;
        const diffDays = TimeLayerCore.getDayDifference(startStr, endStr);
        totalDays = Math.max(1, diffDays);

        // 終了日(排他)の前日が実質終了日 (単日の場合は startStr と同日)
        inclusiveEndStr = startStr;
        if (diffDays > 1) {
          inclusiveEndStr = TimeLayerCore.addDaysToDateStr(endStr, -1);
        }
      } else if (evt.start?.dateTime && evt.end?.dateTime) {
        // 時間指定イベントだが、日をまたぐ（複数日にわたる）予定も日マタギバナーに統合
        const sDate = TimeLayerCore.formatDateOnly(new Date(evt.start.dateTime));
        const eDate = TimeLayerCore.formatDateOnly(new Date(evt.end.dateTime));
        const diffDays = TimeLayerCore.getDayDifference(sDate, eDate);

        // 終了時刻が 00:00 ちょうどで翌日扱いになっているだけのケースを除外
        const endTime = new Date(evt.end.dateTime);
        const isMidnightEnd = endTime.getHours() === 0 && endTime.getMinutes() === 0 && endTime.getSeconds() === 0;

        if (diffDays > 1 || (diffDays === 1 && !isMidnightEnd)) {
          isBanner = true;
          startStr = sDate;
          totalDays = diffDays + (isMidnightEnd ? 0 : 1);
          if (isMidnightEnd) {
            const prev = new Date(endTime.getTime() - 1000);
            inclusiveEndStr = TimeLayerCore.formatDateOnly(prev);
          } else {
            inclusiveEndStr = eDate;
          }
        }
      }

      if (isBanner) {
        // 今週 (weekStartStr 〜 weekEndStr) と重なっているかチェック
        if (startStr <= weekEndStr && inclusiveEndStr >= weekStartStr) {
          let startCol = 0;
          let endCol = 6;
          let continuesPrev = false;
          let continuesNext = false;

          if (startStr < weekStartStr) {
            startCol = 0;
            continuesPrev = true;
          } else {
            startCol = weekDays.indexOf(startStr);
            if (startCol === -1) startCol = 0;
          }

          if (inclusiveEndStr > weekEndStr) {
            endCol = 6;
            continuesNext = true;
          } else {
            endCol = weekDays.indexOf(inclusiveEndStr);
            if (endCol === -1) endCol = 6;
          }

          allDayBanners.push({
            evt,
            startStr,
            inclusiveEndStr,
            totalDays,
            startCol,
            endCol,
            continuesPrev,
            continuesNext
          });
        }
      } else {
        // 通常の時間指定予定（セル内に配置）
        timedEvents.push(evt);
      }
    });

    // 1. 全日・日マタギ予定の帯バナーを「隙間なく最小行数に統合」して描画
    if (multiDayTrack) {
      multiDayTrack.innerHTML = '';
      if (allDayBanners.length > 0) {
        // ソート: 開始曜日昇順(左から詰める) → 期間の長さ降順(長い日マタギ帯を上の行に優先配置) → タイトル順
        allDayBanners.sort((a, b) => {
          if (a.startCol !== b.startCol) {
            return a.startCol - b.startCol;
          }
          const spanA = a.endCol - a.startCol;
          const spanB = b.endCol - b.startCol;
          if (spanA !== spanB) {
            return spanB - spanA;
          }
          if (a.totalDays !== b.totalDays) {
            return b.totalDays - a.totalDays;
          }
          return (a.evt.summary || '').localeCompare(b.evt.summary || '', TimeLayerCore.getLang());
        });

        // 貪欲行割り当て (Interval Packing): 空いている最小の行(row)に隙間なく詰める
        const trackRows = []; // 各行の使用スロット boolean[7]
        allDayBanners.forEach(banner => {
          let assignedRow = -1;
          for (let r = 0; r < trackRows.length; r++) {
            let conflict = false;
            for (let c = banner.startCol; c <= banner.endCol; c++) {
              if (trackRows[r][c]) {
                conflict = true;
                break;
              }
            }
            if (!conflict) {
              assignedRow = r;
              break;
            }
          }

          if (assignedRow === -1) {
            assignedRow = trackRows.length;
            trackRows.push(new Array(7).fill(false));
          }

          for (let c = banner.startCol; c <= banner.endCol; c++) {
            trackRows[assignedRow][c] = true;
          }

          banner.assignedRow = assignedRow;
        });

        // バナー要素を作成して追加
        allDayBanners.forEach(({ evt, startCol, endCol, continuesPrev, continuesNext, totalDays, assignedRow }) => {
          const bannerEl = createMultiDayBannerElement(evt, startCol, endCol, continuesPrev, continuesNext, totalDays, assignedRow);
          multiDayTrack.appendChild(bannerEl);
        });
      }
    }

    // 2. 7曜日ごとの時間指定イベントセルを描画
    const dayBuckets = Array.from({ length: 7 }, (_, dayIndex) => {
      const d = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + dayIndex);
      const dateKey = weekDays[dayIndex];
      return {
        dayIndex,
        date: d,
        dateKey,
        isToday: dateKey === todayKey,
        events: []
      };
    });

    timedEvents.forEach(evt => {
      let evtDateKey = '';
      if (evt.start?.dateTime) {
        const d = new Date(evt.start.dateTime);
        evtDateKey = TimeLayerCore.formatDateOnly(d);
      }

      const bucket = dayBuckets.find(b => b.dateKey === evtDateKey);
      if (bucket) {
        bucket.events.push(evt);
      }
    });

    // 各曜日のセル DOM を描画
    dayBuckets.forEach(bucket => {
      const cell = document.querySelector(`.matrix-day-cell[data-layer="${layerKey}"][data-day="${bucket.dayIndex}"]`);
      if (!cell) return;

      cell.innerHTML = '';
      cell.classList.toggle('is-today', bucket.isToday);

      // イベントがある場合
      if (bucket.events.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'matrix-day-cell-empty';
        emptyEl.textContent = '-';
        cell.appendChild(emptyEl);
      } else {
        bucket.events.forEach(item => {
          const itemEl = createEventItemElement(item);
          cell.appendChild(itemEl);
        });
      }
    });
  }

  // 終日・日マタギ予定の帯（マルチデイ・バナー）要素を作成
  function createMultiDayBannerElement(item, startCol, endCol, continuesPrev, continuesNext, totalDays, assignedRow) {
    const bannerEl = document.createElement('div');
    bannerEl.className = 'multi-day-banner';
    if (item._isHoliday) {
      bannerEl.classList.add('is-holiday-banner');
    }

    const calColor = item._calendarColor || '#3b82f6';
    bannerEl.style.setProperty('--event-cal-color', calColor);
    bannerEl.style.gridColumn = `${startCol + 1} / ${endCol + 2}`;
    if (assignedRow !== undefined) {
      bannerEl.style.gridRow = `${assignedRow + 1}`;
    }

    const summary = item.summary || TimeLayerCore.t('untitledEvent');
    const prevArrow = continuesPrev ? '<span style="font-size:9px;opacity:0.85;">◀</span> ' : '';
    const nextArrow = continuesNext ? ' <span style="font-size:9px;opacity:0.85;">▶</span>' : '';

    // 幅が狭い単日終日予定（1日のみ）の場合はカレンダー名バッジを省略またはコンパクトにしてタイトルを優先
    const isSingleDay = startCol === endCol;
    const calPill = item._calendarSummary && !isSingleDay
      ? `<span class="banner-pill" title="${TimeLayerCore.escapeHtml(item._calendarSummary)}">${TimeLayerCore.escapeHtml(item._calendarSummary)}</span>`
      : '';
    const daysBadge = totalDays > 1 ? `<span class="banner-pill">${TimeLayerCore.escapeHtml(TimeLayerCore.t('multiDaySpan', { days: totalDays }))}</span>` : '';

    bannerEl.innerHTML = `
      <div class="banner-title" title="${TimeLayerCore.escapeHtml(summary)}">
        ${prevArrow}${TimeLayerCore.escapeHtml(summary)}${nextArrow}
      </div>
      <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
        ${daysBadge}
        ${calPill}
      </div>
    `;

    bannerEl.dataset.searchText = `${summary} ${item.location || ''} ${item._calendarSummary || ''}`.toLowerCase();

    if (item.htmlLink) {
      bannerEl.style.cursor = 'pointer';
      bannerEl.addEventListener('click', () => {
        window.open(item.htmlLink, '_blank', 'noopener,noreferrer');
      });
    }

    return bannerEl;
  }

  // =========================================================================
  // Render: 3-Column Columns View (3列縦スクロール & 曜日整列)
  // =========================================================================
  function renderColumnEvents(columnObj, events, weekStartDate) {
    columnObj.count.textContent = TimeLayerCore.formatEventCount(events.length);
    const container = columnObj.eventsContainer;
    container.innerHTML = '';

    const dayGroups = [];
    const todayKey = TimeLayerCore.formatDateOnly(new Date());

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const d = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + dayIndex);
      const key = TimeLayerCore.formatDateOnly(d);
      dayGroups.push({
        dayIndex,
        date: d,
        dateKey: key,
        items: [],
        holidays: []
      });
    }

    events.forEach(evt => {
      if (evt.start?.date) {
        // 全日・日マタギ予定（複数日スパン対応）
        const startStr = evt.start.date;
        const endStr = evt.end?.date;
        dayGroups.forEach(group => {
          const isInRange = endStr ? (group.dateKey >= startStr && group.dateKey < endStr) : (group.dateKey === startStr);
          if (isInRange) {
            group.items.push(evt);
            if (evt._isHoliday) {
              group.holidays.push(evt.summary || TimeLayerCore.t('defaultHolidayName'));
            }
          }
        });
      } else if (evt.start?.dateTime) {
        const s = new Date(evt.start.dateTime);
        const startStr = TimeLayerCore.formatDateOnly(s);
        const e = evt.end?.dateTime ? new Date(evt.end.dateTime) : s;
        const isMidnightEnd = e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0;
        const effectiveEndDate = isMidnightEnd ? new Date(e.getTime() - 1000) : e;
        const endStr = TimeLayerCore.formatDateOnly(effectiveEndDate);

        dayGroups.forEach(group => {
          if (group.dateKey >= startStr && group.dateKey <= endStr) {
            group.items.push(evt);
            if (evt._isHoliday) {
              group.holidays.push(evt.summary || TimeLayerCore.t('defaultHolidayName'));
            }
          }
        });
      }
    });

    dayGroups.forEach(group => {
      // 終日予定を先頭に、時間指定予定を開始時刻順でソート
      group.items.sort((a, b) => {
        const isAllDayA = Boolean(a.start?.date);
        const isAllDayB = Boolean(b.start?.date);
        if (isAllDayA && !isAllDayB) return -1;
        if (!isAllDayA && isAllDayB) return 1;
        const timeA = a.start?.dateTime || a.start?.date || '';
        const timeB = b.start?.dateTime || b.start?.date || '';
        return timeA.localeCompare(timeB);
      });

      const dayGroupEl = document.createElement('div');
      dayGroupEl.className = 'day-group';
      dayGroupEl.dataset.dayIndex = String(group.dayIndex);

      const isToday = group.dateKey === todayKey;
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
        <span style="font-size: 11px; color: var(--text-tertiary);">${group.items.length > 0 ? TimeLayerCore.escapeHtml(TimeLayerCore.formatEventCount(group.items.length)) : '-'}</span>
      `;
      dayGroupEl.appendChild(dayHeader);

      const eventsListEl = document.createElement('div');
      eventsListEl.className = 'day-group-events';

      if (group.items.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'day-empty-placeholder';
        emptyEl.textContent = TimeLayerCore.t('noEventsDay');
        eventsListEl.appendChild(emptyEl);
      } else {
        group.items.forEach(item => {
          const itemEl = createEventItemElement(item, group.dateKey);
          eventsListEl.appendChild(itemEl);
        });
      }

      dayGroupEl.appendChild(eventsListEl);
      container.appendChild(dayGroupEl);
    });
  }

  // 3列カラムの全7曜日（日〜土）の高さを同期して横位置を揃える
  function syncColumnDayHeights() {
    if (currentViewMode !== 'columns') return;

    const presentContainer = columns.present.eventsContainer;
    const yr1Container = columns['1yr'].eventsContainer;
    const yr2Container = columns['2yr'].eventsContainer;

    if (!presentContainer || !yr1Container || !yr2Container) return;

    const presentGroups = presentContainer.querySelectorAll('.day-group');
    const yr1Groups = yr1Container.querySelectorAll('.day-group');
    const yr2Groups = yr2Container.querySelectorAll('.day-group');

    if (presentGroups.length !== 7 || yr1Groups.length !== 7 || yr2Groups.length !== 7) {
      return;
    }

    // 1. 各要素の minHeight をリセットして自然なコンテンツ高さを取得できるようにする
    for (let i = 0; i < 7; i++) {
      presentGroups[i].style.minHeight = '';
      yr1Groups[i].style.minHeight = '';
      yr2Groups[i].style.minHeight = '';
    }

    // 2. 曜日ごとに最大高さを計測し、3列すべてに適用
    for (let i = 0; i < 7; i++) {
      const h0 = presentGroups[i].offsetHeight;
      const h1 = yr1Groups[i].offsetHeight;
      const h2 = yr2Groups[i].offsetHeight;
      const maxH = Math.max(h0, h1, h2);

      presentGroups[i].style.minHeight = `${maxH}px`;
      yr1Groups[i].style.minHeight = `${maxH}px`;
      yr2Groups[i].style.minHeight = `${maxH}px`;
    }
  }

  function createEventItemElement(item, currentDateKey) {
    const itemEl = document.createElement('div');
    itemEl.className = 'event-item';

    const calColor = item._calendarColor || 'var(--border-subtle)';
    itemEl.style.setProperty('--event-cal-color', calColor);

    if (item._isHoliday) {
      itemEl.classList.add('is-holiday-item');
    }

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

    // 予定名を1行まるまる使って表示（event-title-full）し、メタ行を下段に配置
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

    itemEl.dataset.searchText = `${summary} ${item.location || ''} ${item._calendarSummary || ''}`.toLowerCase();

    if (item.htmlLink) {
      itemEl.style.cursor = 'pointer';
      itemEl.addEventListener('click', () => {
        window.open(item.htmlLink, '_blank', 'noopener,noreferrer');
      });
    }

    return itemEl;
  }

  // =========================================================================
  // Search & Filtering (Both Views)
  // =========================================================================
  function applySearchFilter(query) {
    currentSearchQuery = query.toLowerCase().trim();
    const allItems = document.querySelectorAll('.event-item, .multi-day-banner');

    if (!currentSearchQuery) {
      allItems.forEach(item => {
        item.classList.remove('search-dimmed-item', 'search-matched-item');
      });
      searchClearBtn.classList.add('hidden');
      searchMatchCount.classList.add('hidden');
      requestAnimationFrame(() => {
        syncColumnDayHeights();
      });
      return;
    }

    searchClearBtn.classList.remove('hidden');

    allItems.forEach(item => {
      const text = item.dataset.searchText || '';
      if (text.includes(currentSearchQuery)) {
        item.classList.remove('search-dimmed-item');
        item.classList.add('search-matched-item');
      } else {
        item.classList.remove('search-matched-item');
        item.classList.add('search-dimmed-item');
      }
    });

    // 表示中ビュー内の一致件数のみカウント
    const effectiveCount = currentViewMode === 'matrix' ?
      document.querySelectorAll('#view-matrix .search-matched-item').length :
      document.querySelectorAll('#view-columns .search-matched-item').length;

    searchMatchCount.textContent = TimeLayerCore.t('searchMatchedCount', { n: effectiveCount });
    searchMatchCount.classList.remove('hidden');
    requestAnimationFrame(() => {
      syncColumnDayHeights();
    });
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
      console.error('[TimeLayer Dashboard] Sign-in error:', err);
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
  // 3-Column Scroll Synchronization
  // =========================================================================
  function initColumnScrollSync() {
    const colPresentBody = document.querySelector('#col-present .column-body');
    const col1yrBody = document.querySelector('#col-1yr .column-body');
    const col2yrBody = document.querySelector('#col-2yr .column-body');
    const columnBodies = [colPresentBody, col1yrBody, col2yrBody].filter(Boolean);

    let activeScroller = null;
    let resetScrollerTimer = null;

    columnBodies.forEach(scroller => {
      // ユーザーの入力開始元をマークして、連動による相互イベント発火ループを防止
      scroller.addEventListener('mouseenter', () => { activeScroller = scroller; });
      scroller.addEventListener('touchstart', () => { activeScroller = scroller; }, { passive: true });
      scroller.addEventListener('pointerdown', () => { activeScroller = scroller; });

      scroller.addEventListener('scroll', () => {
        if (!activeScroller) {
          activeScroller = scroller;
        }

        if (activeScroller === scroller) {
          const targetTop = scroller.scrollTop;
          columnBodies.forEach(other => {
            if (other !== scroller) {
              other.scrollTop = targetTop;
            }
          });
        }

        clearTimeout(resetScrollerTimer);
        resetScrollerTimer = setTimeout(() => {
          activeScroller = null;
        }, 150);
      }, { passive: true });
    });

    // カラムヘッダーや枠線の余白でホイールスクロールした場合も同期してスクロール
    const panoramicGrid = document.querySelector('.panoramic-grid');
    if (panoramicGrid) {
      panoramicGrid.addEventListener('wheel', (e) => {
        if (!e.target.closest('.column-body')) {
          if (columnBodies.length > 0) {
            columnBodies[0].scrollTop += e.deltaY;
          }
        }
      }, { passive: true });
    }
  }

  // =========================================================================
  // Event Listeners
  // =========================================================================
  function setupEventListeners() {
    // 3列カラムのスクロール同期初期化
    initColumnScrollSync();

    // ウィンドウリサイズ時の曜日高さ再計算
    window.addEventListener('resize', TimeLayerCore.debounce(() => {
      syncColumnDayHeights();
    }, 150));

    // 認証
    signinBtn.addEventListener('click', handleSignIn);
    signoutBtn.addEventListener('click', handleSignOut);

    // ビューモード切替
    btnViewMatrix.addEventListener('click', () => setViewMode('matrix'));
    btnViewColumns.addEventListener('click', () => setViewMode('columns'));

    // 更新（キャッシュを破棄して最新を取得）
    refreshBtn.addEventListener('click', () => {
      if (currentAuthToken) loadAllLayers({ force: true });
    });

    // カレンダー選択モーダル
    calendarToggleBtn.addEventListener('click', () => {
      calendarPanel.classList.remove('hidden');
    });

    calendarPanelClose.addEventListener('click', () => {
      calendarPanel.classList.add('hidden');
    });

    calendarPanel.addEventListener('click', (e) => {
      if (e.target === calendarPanel) {
        calendarPanel.classList.add('hidden');
      }
    });

    btnCalAll.addEventListener('click', async () => {
      availableCalendars.forEach(c => selectedCalendarIds.add(c.id));
      await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      renderCalendarList();
      scheduleLoadAllLayers();
    });

    btnCalPrimary.addEventListener('click', async () => {
      selectedCalendarIds.clear();
      availableCalendars.forEach(c => {
        if (c.primary) selectedCalendarIds.add(c.id);
      });
      if (selectedCalendarIds.size === 0 && availableCalendars.length > 0) {
        selectedCalendarIds.add(availableCalendars[0].id);
      }
      await TimeLayerCore.saveStoredSelectedCalendarIds(Array.from(selectedCalendarIds));
      renderCalendarList();
      scheduleLoadAllLayers();
    });

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

    btnCalReload.addEventListener('click', async () => {
      await loadCalendars();
      loadAllLayers({ force: true });
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

    // Escapeキーでモーダルを閉じる
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !calendarPanel.classList.contains('hidden')) {
        calendarPanel.classList.add('hidden');
      }
    });

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

    // 他画面（サイドパネル等）での設定・認証状態変更とリアルタイム同期
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

  // 初期化
  async function init() {
    TimeLayerCore.applyI18nToDOM();
    updateCalendarBadge();
    Object.values(matrixLabels).forEach((lbl) => {
      if (lbl.count) lbl.count.textContent = TimeLayerCore.formatEventCount(0);
    });
    Object.values(columns).forEach((col) => {
      if (col.count) col.count.textContent = TimeLayerCore.formatEventCount(0);
    });
    for (let day = 0; day < 7; day++) {
      const nameEl = document.querySelector(`.matrix-day-header[data-day="${day}"] .day-name`);
      if (nameEl) nameEl.textContent = TimeLayerCore.getDayName(day);
    }

    await initStorageSync();
    setupEventListeners();
    updateWeekNavUI();

    // 保存されたビューモードを復元
    const savedViewMode = await loadSavedViewMode();
    setViewMode(savedViewMode);

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
