// ダークモードの状態を管理
let darkModeEnabled = false;
let systemDarkModeEnabled = false;
let followSystemSetting = true;

// システムのダークモード状態を検出
function detectSystemDarkMode() {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

// システムのダークモード変更を監視
function watchSystemDarkMode() {
  if (window.matchMedia) {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // 初回チェック
    systemDarkModeEnabled = darkModeMediaQuery.matches;
    
    // 変更を監視
    darkModeMediaQuery.addEventListener('change', function(e) {
      systemDarkModeEnabled = e.matches;
      
      // バックグラウンドスクリプトに通知
      chrome.runtime.sendMessage({
        action: 'systemDarkModeChanged',
        isDarkMode: systemDarkModeEnabled
      });
      
      // 設定を確認してダークモードを適用
      chrome.storage.sync.get(['globalSettings', 'sites'], function(data) {
        const currentSite = window.location.hostname;
        
        // サイト固有の設定がない場合のみシステム設定に従う
        if (data.globalSettings && data.globalSettings.followSystem) {
          if (!data.sites || !data.sites[currentSite] || data.sites[currentSite].followSystem !== false) {
            applyDarkMode(systemDarkModeEnabled);
          }
        }
      });
    });
  }
}

// ページ読み込み時に設定を取得
chrome.storage.sync.get(['darkMode', 'sites', 'globalSettings'], (data) => {
  const currentSite = window.location.hostname;
  
  // グローバル設定を確認
  if (data.globalSettings) {
    followSystemSetting = data.globalSettings.followSystem !== false;
  }
  
  // サイト固有の設定があるかチェック
  if (data.sites && data.sites[currentSite]) {
    const siteSettings = data.sites[currentSite];
    
    // サイト固有の設定がシステム設定を上書きする場合
    if (siteSettings.overrideSystem === true) {
      applyDarkMode(siteSettings.enabled);
    } else if (followSystemSetting) {
      // システムのダークモード状態に従う
      applyDarkMode(detectSystemDarkMode());
    } else {
      applyDarkMode(siteSettings.enabled);
    }
  } else if (followSystemSetting) {
    // システムのダークモード状態に従う
    applyDarkMode(detectSystemDarkMode());
  } else if (data.darkMode) {
    // グローバル設定を適用
    applyDarkMode(true);
  }
  
  // システムダークモードの監視を開始
  watchSystemDarkMode();
});

// ダークモードの適用/解除
function applyDarkMode(enable) {
  darkModeEnabled = enable;
  
  if (enable) {
    // 方法1: フィルターを使った簡単な反転
    // document.documentElement.setAttribute('data-dark-mode', 'true');
    
    // 方法2: カスタムクラスを使った詳細な制御
    document.body.classList.add('custom-dark-mode');
    
    // 動的に追加される要素にも対応
    observeNewElements();
  } else {
    document.documentElement.removeAttribute('data-dark-mode');
    document.body.classList.remove('custom-dark-mode');
  }
}

// 動的に追加される要素を監視
function observeNewElements() {
  const observer = new MutationObserver((mutations) => {
    if (!darkModeEnabled) {
      observer.disconnect();
      return;
    }
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            applyDarkModeToElement(node);
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 特定の要素にダークモードを適用
function applyDarkModeToElement(element) {
  // 背景画像を持つ要素の処理
  const bgImage = window.getComputedStyle(element).backgroundImage;
  if (bgImage && bgImage !== 'none') {
    element.style.opacity = '0.9';
  }
  
  // 明るい背景色を持つ要素の処理
  const bgColor = window.getComputedStyle(element).backgroundColor;
  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
    const rgb = bgColor.match(/\d+/g);
    if (rgb) {
      const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
      if (brightness > 200) {
        element.style.backgroundColor = 'var(--dark-bg-secondary)';
      }
    }
  }
}

// 拡張機能からのメッセージを受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleDarkMode') {
    applyDarkMode(request.enabled);
    sendResponse({ success: true });
  } else if (request.action === 'getDarkModeStatus') {
    sendResponse({ enabled: darkModeEnabled });
  } else if (request.action === 'checkSystemDarkMode') {
    // システムのダークモード状態をチェックして適用
    const isDarkMode = detectSystemDarkMode();
    chrome.storage.sync.get(['globalSettings', 'sites'], function(data) {
      const currentSite = window.location.hostname;
      if (data.globalSettings && data.globalSettings.followSystem) {
        if (!data.sites || !data.sites[currentSite] || !data.sites[currentSite].overrideSystem) {
          applyDarkMode(isDarkMode);
        }
      }
    });
    sendResponse({ success: true, isDarkMode: isDarkMode });
  } else if (request.action === 'applySystemDarkMode') {
    // システムダークモードの状態を適用
    chrome.storage.sync.get(['sites'], function(data) {
      const currentSite = window.location.hostname;
      if (!data.sites || !data.sites[currentSite] || !data.sites[currentSite].overrideSystem) {
        applyDarkMode(request.enabled);
      }
    });
    sendResponse({ success: true });
  }
  return true; // 非同期レスポンスのために必要
});

// キーボードショートカット (Ctrl+Shift+D でトグル)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    applyDarkMode(!darkModeEnabled);
    
    // 設定を保存
    const hostname = window.location.hostname;
    chrome.storage.sync.get(['sites'], (data) => {
      const sites = data.sites || {};
      sites[hostname] = { enabled: darkModeEnabled };
      chrome.storage.sync.set({ sites: sites });
    });
  }
});

// サイト固有のカスタマイズ
function applySiteSpecificStyles() {
  const hostname = window.location.hostname;
  
  // 例: GitHubの場合
  if (hostname.includes('github.com')) {
    const style = document.createElement('style');
    style.textContent = `
      .custom-dark-mode .Header {
        background-color: #161b22 !important;
      }
      .custom-dark-mode .Box {
        background-color: #0d1117 !important;
        border-color: #30363d !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  // 例: Wikipediaの場合
  if (hostname.includes('wikipedia.org')) {
    const style = document.createElement('style');
    style.textContent = `
      .custom-dark-mode #content {
        background-color: #1a1a1a !important;
      }
      .custom-dark-mode .infobox {
        background-color: #2d2d2d !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// ページ読み込み完了後にサイト固有のスタイルを適用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applySiteSpecificStyles);
} else {
  applySiteSpecificStyles();
}
