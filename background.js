/**
 * TimeLayer - Background Service Worker
 * Supports Side Panel behavior, Context Menus, and Dashboard Tab creation
 */

// 拡張機能インストール・更新時の初期化
chrome.runtime.onInstalled.addListener(() => {
  // 1. アクションアイコンクリック時にサイドパネルを開く
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => {
        console.error('[TimeLayer Background] Failed to set sidePanel behavior:', error);
      });
  }

  // 2. 右クリックメニューに「TimeLayer 大画面ダッシュボードを開く」を登録
  chrome.contextMenus.create({
    id: 'timelayer-open-dashboard',
    title: chrome.i18n.getMessage('contextMenuOpenDashboard') || '🪐 Open TimeLayer Panoramic Dashboard',
    contexts: ['action', 'page']
  });

  console.log('[TimeLayer] Service Worker & Context Menus initialized successfully.');
});

// コンテキストメニューのクリックイベント
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'timelayer-open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }
});

// コンテンツスクリプトや拡張機能内からのメッセージハンドラー
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openDashboard') {
    const url = message.lang
      ? chrome.runtime.getURL(`dashboard.html?lang=${encodeURIComponent(message.lang)}`)
      : chrome.runtime.getURL('dashboard.html');
    chrome.tabs.create({ url });
  }
});

