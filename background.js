// バックグラウンドスクリプト（Service Worker）
// 拡張機能の初期化とグローバルな状態管理

// 拡張機能がインストールされた時
chrome.runtime.onInstalled.addListener(() => {
  // デフォルト設定を初期化
  chrome.storage.sync.get(['sites', 'globalSettings'], (data) => {
    if (!data.sites) {
      chrome.storage.sync.set({ sites: {} });
    }
    if (!data.globalSettings) {
      chrome.storage.sync.set({
        globalSettings: {
          followSystem: true,  // システム設定に従う
          defaultBrightness: 85,
          defaultContrast: 100,
          shortcuts: true
        }
      });
    }
  });
  
  // コンテキストメニューを作成
  chrome.contextMenus.create({
    id: 'toggleDarkMode',
    title: 'このサイトでダークモードを切り替え',
    contexts: ['page']
  }, () => {
    // エラーチェック
    if (chrome.runtime.lastError) {
      console.log('Context menu creation error:', chrome.runtime.lastError);
    }
  });
  
  // 初回のシステムダークモード状態をチェック
  checkSystemDarkMode();
});

// コンテキストメニューのクリックイベント
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === 'toggleDarkMode' && tab && tab.id) {
    // 現在のタブにメッセージを送信
    chrome.tabs.sendMessage(tab.id, {
      action: 'toggleDarkMode',
      enabled: true
    }, function(response) {
      // エラーハンドリング
      if (chrome.runtime.lastError) {
        console.log('Failed to send message:', chrome.runtime.lastError.message);
        // コンテンツスクリプトが読み込まれていない場合は注入
        if (tab.id) {
          injectContentScript(tab.id);
        }
      }
    });
  }
});

// タブが更新された時
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    // URLからホスト名を取得
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      
      // 保存された設定を確認
      chrome.storage.sync.get(['sites'], function(data) {
        if (data.sites && data.sites[hostname] && data.sites[hostname].enabled) {
          // コンテンツスクリプトを動的に注入
          injectContentScript(tabId);
        }
      });
    } catch (e) {
      console.error('Invalid URL:', tab.url);
    }
  }
});

// コンテンツスクリプトを動的に注入
function injectContentScript(tabId) {
  // まずスクリプトが既に注入されているか確認
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function() { return window.darkModeExtensionLoaded; }
  }, function(results) {
    if (chrome.runtime.lastError) {
      console.error('Script execution failed:', chrome.runtime.lastError);
      return;
    }
    
    if (!results || !results[0] || !results[0].result) {
      // スクリプトを注入
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['scripts/content.js']
      }, function() {
        if (chrome.runtime.lastError) {
          console.error('Failed to inject script:', chrome.runtime.lastError);
          return;
        }
        
        // CSSを注入
        chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['styles/dark-mode.css']
        }, function() {
          if (chrome.runtime.lastError) {
            console.error('Failed to inject CSS:', chrome.runtime.lastError);
            return;
          }
          
          // フラグを設定
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: function() { window.darkModeExtensionLoaded = true; }
          });
        });
      });
    }
  });
}

// ショートカットコマンドの処理
chrome.commands.onCommand.addListener(function(command) {
  if (command === 'toggle-dark-mode') {
    // アクティブなタブを取得
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleDarkMode'
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.log('Failed to toggle dark mode:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  }
});

// システムのダークモード状態を検出して適用
function checkSystemDarkMode() {
  chrome.storage.sync.get(['globalSettings'], function(data) {
    if (data.globalSettings && data.globalSettings.followSystem) {
      // すべてのタブにシステムダークモードの状態を問い合わせるメッセージを送信
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(function(tab) {
          if (tab.id) {
            // タブにシステムのダークモード状態をチェックさせる
            chrome.tabs.sendMessage(tab.id, {
              action: 'checkSystemDarkMode'
            }, function(response) {
              // エラーを無視（コンテンツスクリプトがないタブの場合）
              if (chrome.runtime.lastError) {
                // Silent fail
              }
            });
          }
        });
      });
    }
  });
}

// メッセージリスナー（コンテンツスクリプトからの通信を受信）
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'systemDarkModeChanged') {
    // システムのダークモード状態が変更された
    chrome.storage.sync.get(['globalSettings'], function(data) {
      if (data.globalSettings && data.globalSettings.followSystem) {
        // すべてのタブに新しい状態を適用
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(function(tab) {
            if (tab.id && tab.id !== sender.tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'applySystemDarkMode',
                enabled: request.isDarkMode
              }, function(response) {
                if (chrome.runtime.lastError) {
                  // Silent fail
                }
              });
            }
          });
        });
      }
    });
    sendResponse({ success: true });
  }
  return true; // 非同期レスポンスのために必要
});

// 定期的にシステムダークモードの状態をチェック（フォールバック）
setInterval(checkSystemDarkMode, 30 * 1000); // 30秒ごと

// 拡張機能起動時にもチェック
checkSystemDarkMode();
