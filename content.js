/**
 * TimeLayer - Google Calendar Content Script
 * Injected into https://calendar.google.com/*
 * Provides an in-page floating launcher and slide-in drawer for TimeLayer
 */

(() => {
  'use strict';

  // 既に注入済みの場合は多重実行を防止
  if (document.getElementById('timelayer-launcher-btn')) {
    return;
  }

  // 1. フローティング・ランチャーボタンの作成
  const launcherBtn = document.createElement('button');
  launcherBtn.id = 'timelayer-launcher-btn';
  launcherBtn.title = 'TimeLayer 地層ビューを開く（過去と現在の予定を重ねて比較）';
  launcherBtn.innerHTML = `
    <div class="timelayer-launcher-bars">
      <span class="timelayer-bar timelayer-bar-1"></span>
      <span class="timelayer-bar timelayer-bar-2"></span>
      <span class="timelayer-bar timelayer-bar-3"></span>
    </div>
    <span class="timelayer-launcher-text">TimeLayer</span>
    <span class="timelayer-launcher-badge">地層</span>
  `;

  // 2. バックドロップ（半透明オーバーレイ）
  const backdrop = document.createElement('div');
  backdrop.id = 'timelayer-backdrop';

  // 3. スライドイン・ドロワーコンテナ
  const drawer = document.createElement('aside');
  drawer.id = 'timelayer-drawer-container';

  // ドロワー上部ツールバー
  const toolbar = document.createElement('div');
  toolbar.className = 'timelayer-drawer-toolbar';
  toolbar.innerHTML = `
    <div class="timelayer-drawer-brand">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="2.5">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="17" y2="12"/>
        <line x1="3" y1="18" x2="13" y2="18"/>
      </svg>
      <span>TimeLayer 地層ビュー</span>
    </div>
    <div class="timelayer-drawer-actions">
      <button id="timelayer-open-dashboard-btn" class="timelayer-tool-btn" title="新しいタブで大画面パノラマダッシュボードを開く">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      <button id="timelayer-close-drawer-btn" class="timelayer-tool-btn" title="閉じる (Esc)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  // ドロワー内 iframe
  const iframe = document.createElement('iframe');
  iframe.className = 'timelayer-drawer-frame';
  iframe.src = chrome.runtime.getURL('sidepanel.html?embedded=true');
  iframe.allow = 'clipboard-write';

  drawer.appendChild(toolbar);
  drawer.appendChild(iframe);

  // DOMへ追加
  document.body.appendChild(launcherBtn);
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  // 開閉ロジック
  let isOpen = false;

  function openDrawer() {
    isOpen = true;
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    launcherBtn.style.opacity = '0';
    launcherBtn.style.pointerEvents = 'none';
  }

  function closeDrawer() {
    isOpen = false;
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    launcherBtn.style.opacity = '1';
    launcherBtn.style.pointerEvents = 'auto';
  }

  launcherBtn.addEventListener('click', () => {
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  backdrop.addEventListener('click', closeDrawer);

  const closeBtn = toolbar.querySelector('#timelayer-close-drawer-btn');
  closeBtn.addEventListener('click', closeDrawer);

  const openDashboardBtn = toolbar.querySelector('#timelayer-open-dashboard-btn');
  openDashboardBtn.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('dashboard.html'), '_blank');
  });

  // Escapeキーで閉じる
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeDrawer();
    }
  });

  console.log('[TimeLayer] Content script injected into Google Calendar successfully.');
})();
