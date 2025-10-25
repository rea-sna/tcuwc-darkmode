// 現在のタブ情報を取得
let currentTab = null;
let currentHostname = '';

// システムのダークモード状態を検出
function detectSystemDarkMode() {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

// DOMContentLoaded時の初期化
document.addEventListener('DOMContentLoaded', async () => {
  // 現在のタブを取得
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  
  if (currentTab && currentTab.url) {
    try {
      const url = new URL(currentTab.url);
      currentHostname = url.hostname;
      document.getElementById('currentSite').textContent = `現在のサイト: ${currentHostname}`;
    } catch (e) {
      document.getElementById('currentSite').textContent = 'サイト情報を取得できません';
    }
  }
  
  // システムダークモードの状態を表示
  const isSystemDark = detectSystemDarkMode();
  document.getElementById('systemStatus').textContent = 
    `システム: ${isSystemDark ? 'ダークモード' : 'ライトモード'}`;
  
  // 保存された設定を読み込み
  loadSettings();
  
  // イベントリスナーの設定
  setupEventListeners();
  
  // サイトリストを更新
  updateSitesList();
  
  // システムダークモードの変更を監視
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      document.getElementById('systemStatus').textContent = 
        `システム: ${e.matches ? 'ダークモード' : 'ライトモード'}`;
    });
  }
});

// 設定を読み込む
async function loadSettings() {
  const data = await chrome.storage.sync.get(['sites', 'globalSettings']);
  
  // グローバル設定の読み込み
  if (data.globalSettings) {
    document.getElementById('followSystem').checked = 
      data.globalSettings.followSystem !== false;
  }
  
  if (data.sites && data.sites[currentHostname]) {
    const siteSettings = data.sites[currentHostname];
    document.getElementById('darkModeToggle').checked = siteSettings.enabled || false;
    document.getElementById('overrideSystem').checked = siteSettings.overrideSystem || false;
    
    if (siteSettings.settings) {
      document.getElementById('invertImages').checked = siteSettings.settings.invertImages || false;
      document.getElementById('brightness').value = siteSettings.settings.brightness || 85;
      document.getElementById('contrast').value = siteSettings.settings.contrast || 100;
      updateSliderValues();
    }
  }
  
  // システム設定に従う場合の表示制御
  toggleOverrideVisibility();
  
  // 現在の状態を確認
  if (currentTab) {
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'getDarkModeStatus'
      });
      if (response && response.enabled !== undefined) {
        document.getElementById('darkModeToggle').checked = response.enabled;
      }
    } catch (e) {
      console.log('Content script not loaded yet');
    }
  }
}

// イベントリスナーの設定
function setupEventListeners() {
  // システム設定に従うトグル
  document.getElementById('followSystem').addEventListener('change', async (e) => {
    const followSystem = e.target.checked;
    
    // グローバル設定を保存
    const data = await chrome.storage.sync.get(['globalSettings']);
    const globalSettings = data.globalSettings || {};
    globalSettings.followSystem = followSystem;
    await chrome.storage.sync.set({ globalSettings: globalSettings });
    
    // 表示制御
    toggleOverrideVisibility();
    
    // システム設定に従う場合は、現在のシステム状態を適用
    if (followSystem && !document.getElementById('overrideSystem').checked) {
      const isSystemDark = detectSystemDarkMode();
      document.getElementById('darkModeToggle').checked = isSystemDark;
      
      if (currentTab) {
        try {
          await chrome.tabs.sendMessage(currentTab.id, {
            action: 'toggleDarkMode',
            enabled: isSystemDark
          });
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      }
    }
  });
  
  // システム設定を上書きチェックボックス
  document.getElementById('overrideSystem').addEventListener('change', async (e) => {
    await saveCurrentSiteSettings();
    
    if (!e.target.checked && document.getElementById('followSystem').checked) {
      // システム設定に戻す
      const isSystemDark = detectSystemDarkMode();
      document.getElementById('darkModeToggle').checked = isSystemDark;
      
      if (currentTab) {
        try {
          await chrome.tabs.sendMessage(currentTab.id, {
            action: 'toggleDarkMode',
            enabled: isSystemDark
          });
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      }
    }
  });
  
  // ダークモードトグル
  document.getElementById('darkModeToggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    
    // コンテンツスクリプトにメッセージを送信
    if (currentTab) {
      try {
        await chrome.tabs.sendMessage(currentTab.id, {
          action: 'toggleDarkMode',
          enabled: enabled
        });
      } catch (error) {
        // コンテンツスクリプトがまだ読み込まれていない場合
        console.error('Failed to send message:', error);
        // ページをリロード
        chrome.tabs.reload(currentTab.id);
      }
    }
    
    // 設定を保存
    saveCurrentSiteSettings();
  });
  
  // 画像反転設定
  document.getElementById('invertImages').addEventListener('change', () => {
    saveCurrentSiteSettings();
    applyAdvancedSettings();
  });
  
  // 明度調整
  document.getElementById('brightness').addEventListener('input', (e) => {
    document.getElementById('brightnessValue').textContent = `${e.target.value}%`;
    saveCurrentSiteSettings();
    applyAdvancedSettings();
  });
  
  // コントラスト調整
  document.getElementById('contrast').addEventListener('input', (e) => {
    document.getElementById('contrastValue').textContent = `${e.target.value}%`;
    saveCurrentSiteSettings();
    applyAdvancedSettings();
  });
  
  // すべての設定をクリア
  document.getElementById('clearAll').addEventListener('click', async () => {
    if (confirm('すべてのサイトの設定をクリアしますか？')) {
      await chrome.storage.sync.clear();
      updateSitesList();
      
      // 現在のページをリロード
      if (currentTab) {
        chrome.tabs.reload(currentTab.id);
      }
    }
  });
}

// 現在のサイトの設定を保存
async function saveCurrentSiteSettings() {
  const settings = {
    enabled: document.getElementById('darkModeToggle').checked,
    overrideSystem: document.getElementById('overrideSystem').checked,
    settings: {
      invertImages: document.getElementById('invertImages').checked,
      brightness: parseInt(document.getElementById('brightness').value),
      contrast: parseInt(document.getElementById('contrast').value)
    }
  };
  
  // 既存の設定を取得
  const data = await chrome.storage.sync.get(['sites']);
  const sites = data.sites || {};
  
  // 現在のサイトの設定を更新
  sites[currentHostname] = settings;
  
  // 保存
  await chrome.storage.sync.set({ sites: sites });
  
  // サイトリストを更新
  updateSitesList();
}

// 表示制御
function toggleOverrideVisibility() {
  const followSystem = document.getElementById('followSystem').checked;
  const overrideDiv = document.querySelector('.override-setting');
  
  if (followSystem) {
    overrideDiv.style.display = 'block';
  } else {
    overrideDiv.style.display = 'none';
    document.getElementById('overrideSystem').checked = false;
  }
}

// 詳細設定を適用
async function applyAdvancedSettings() {
  if (!currentTab) return;
  
  const brightness = document.getElementById('brightness').value;
  const contrast = document.getElementById('contrast').value;
  const invertImages = document.getElementById('invertImages').checked;
  
  // CSSを動的に挿入
  const cssCode = `
    html[data-dark-mode="true"] {
      filter: invert(1) hue-rotate(180deg) brightness(${brightness}%) contrast(${contrast}%) !important;
    }
    ${invertImages ? '' : `
    html[data-dark-mode="true"] img,
    html[data-dark-mode="true"] video {
      filter: invert(1) hue-rotate(180deg) !important;
    }`}
  `;
  
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: currentTab.id },
      css: cssCode
    });
  } catch (e) {
    console.error('Failed to insert CSS:', e);
  }
}

// スライダーの値を更新
function updateSliderValues() {
  document.getElementById('brightnessValue').textContent = 
    `${document.getElementById('brightness').value}%`;
  document.getElementById('contrastValue').textContent = 
    `${document.getElementById('contrast').value}%`;
}

// サイトリストを更新
async function updateSitesList() {
  const data = await chrome.storage.sync.get(['sites']);
  const sites = data.sites || {};
  const sitesList = document.getElementById('sitesList');
  
  sitesList.innerHTML = '';
  
  const siteEntries = Object.entries(sites).filter(([hostname, settings]) => 
    settings.enabled && hostname !== currentHostname
  );
  
  if (siteEntries.length === 0) {
    sitesList.innerHTML = '<p style="font-size: 12px; opacity: 0.7;">設定されたサイトはありません</p>';
    return;
  }
  
  siteEntries.forEach(([hostname, settings]) => {
    const siteItem = document.createElement('div');
    siteItem.className = 'site-item';
    siteItem.innerHTML = `
      <span>${hostname}</span>
      <button data-hostname="${hostname}">削除</button>
    `;
    
    siteItem.querySelector('button').addEventListener('click', async () => {
      delete sites[hostname];
      await chrome.storage.sync.set({ sites: sites });
      updateSitesList();
    });
    
    sitesList.appendChild(siteItem);
  });
}
