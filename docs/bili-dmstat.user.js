// ==UserScript==
// @name         bilibili 视频弹幕统计|下载|查询发送者
// @namespace    https://github.com/ZBpine/bili-danmaku-statistic
// @version      1.5.0
// @description  获取B站视频页弹幕数据，并生成统计页面
// @author       ZBpine
// @icon         https://i0.hdslb.com/bfs/static/jinkela/long/images/favicon.ico
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/watchlater*
// @grant        none
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    let dmUtils = null;
    const coreJsUrl = 'https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/docs/bili-dmstat-core.js';
    // 插入按钮
    function insertButton() {
        const btn = document.createElement('div');
        btn.id = 'danmaku-stat-btn';
        btn.innerHTML = `
        <span class="label">弹幕统计</span>
        <div class="icon-wrapper">
          <svg t="1745985333201" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1486" 
          width="24" height="24">
            <path d="M691.2 928.2V543.1c0-32.7 26.5-59.3 59.2-59.3h118.5c32.7 0 59.3 26.5 59.3 59.2V928.2h-237z m192.6-385.1c0-8.2-6.6-14.8-14.8-14.8H750.5c-8.2 0-14.8 6.6-14.9 14.7v340.8h148.2V543.1zM395 157.8c-0.1-32.6 26.3-59.2 58.9-59.3h118.8c32.6 0 59.1 26.5 59.1 59.1v770.6H395V157.8z m44.4 725.9h148V157.9c0-8.1-6.5-14.7-14.7-14.8H454.1c-8.1 0.1-14.7 6.7-14.7 14.8v725.8zM98.6 394.9c0-32.7 26.5-59.2 59.2-59.3h118.5c32.7-0.1 59.3 26.4 59.3 59.1v533.5h-237V394.9z m44.5 488.8h148.2V394.9c0-8.2-6.7-14.8-14.8-14.8H158c-8.2 0-14.8 6.6-14.9 14.7v488.9z" p-id="1487" fill="#00ace5"></path>
          </svg>
        </div>
      `;
        btn.style.position = 'fixed';
        btn.style.left = '-100px'; // 露出约20px图标
        btn.style.bottom = '40px';
        btn.style.zIndex = '9997';
        btn.style.width = '120px';
        btn.style.height = '40px';
        btn.style.backgroundColor = 'transparent';
        btn.style.color = '#00ace5';
        btn.style.borderTopRightRadius = '20px';
        btn.style.borderBottomRightRadius = '20px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '16px';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'space-between';
        btn.style.boxShadow = '0 0 5px rgba(0, 172, 229, 0.3)';
        btn.style.transition = 'left 0.3s ease-in-out, background-color 0.2s ease-in-out';

        btn.onmouseenter = () => {
            btn.style.left = '-10px';
            btn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            btn.style.border = '1px solid #00ace5';
        };

        btn.onmouseleave = () => {
            btn.style.left = '-100px';
            btn.style.backgroundColor = 'transparent';
            btn.style.border = 'none';
        };

        btn.onclick = openPanel;

        const style = document.createElement('style');
        style.textContent = `
        #danmaku-stat-btn .label {
          margin-left: 20px;
          white-space: nowrap;
          color: #00ace5;
        }
        #danmaku-stat-btn .icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 8px;
          flex-shrink: 0;
        }
      `;
        document.head.appendChild(style);

        document.body.appendChild(btn);
    }
    // 打开iframe弹幕统计面板
    function openPanel() {
        if (document.getElementById('danmaku-stat-iframe')) {
            console.warn('统计面板已打开');
            return;
        }

        // 创建蒙层
        const overlay = document.createElement('div');
        overlay.id = 'danmaku-stat-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.zIndex = '9998';
        overlay.onclick = () => {
            document.getElementById('danmaku-stat-iframe')?.remove();
            overlay.remove();
        };
        document.body.appendChild(overlay);

        // 创建iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'danmaku-stat-iframe';
        iframe.style.position = 'fixed';
        iframe.style.top = '15%';
        iframe.style.left = '15%';
        iframe.style.width = '70%';
        iframe.style.height = '70%';
        iframe.style.backgroundColor = '#fff';
        iframe.style.zIndex = '9999';
        iframe.style.padding = '20px';
        iframe.style.overflow = 'hidden';
        iframe.style.borderRadius = '8px';
        iframe.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        iframe.onload = async () => {
            try {
                const { BiliDanmakuUtils, initIframeApp } = await import(coreJsUrl);
                dmUtils = new BiliDanmakuUtils();
                await dmUtils.fetchAllData(location.href);
                initIframeApp(iframe, dmUtils, {
                    type: 0,
                    newPanel: function (type) {
                        if (type == 0) {
                            openPanelInNewTab();
                            dmUtils.logTag('[主页面] 新建子页面');
                        }
                    }
                });
            } catch (err) {
                dmUtils.logTagError('初始化失败:', err);
                alert(`弹幕统计加载失败：${err.message}`);
            }
        }
        document.body.appendChild(iframe);
    }
    // 打开新标签页弹幕统计面板
    function openPanelInNewTab() {
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="zh">
        <head>
        <meta charset="UTF-8">
        <title>Bilibili 弹幕统计</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            html, body {
                margin: 0;
                padding: 0;
            }
        </style>
        </head>
        <body>
        <script type="module">
            import { initIframeApp, BiliDanmakuUtils } from '${coreJsUrl}';
            let dmUtils = new BiliDanmakuUtils();
            window.addEventListener('message', function(event) {
                Object.assign(dmUtils, event.data);
                if (!dmUtils.videoData || !dmUtils.danmakuData) {
                    dmUtils.logTagError('数据获取失败');
                    return;
                } else {
                    dmUtils.logTag('[子页面] 收到数据');
                }
                const iframe = document.createElement('iframe');
                iframe.id = 'danmaku-stat-iframe';
                iframe.style.position = 'fixed';
                iframe.style.top = '3%';
                iframe.style.left = '4%';
                iframe.style.height = '90%';
                iframe.style.width = '90%';
                iframe.style.border = '0';
                iframe.style.backgroundColor = '#fff';
                iframe.style.padding = '20px';
                iframe.style.overflow = 'hidden';
                iframe.style.borderRadius = '8px';
                iframe.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
                iframe.onload = () => initIframeApp(iframe, dmUtils, {
                    type: 1,
                    newPanel: function (type) {
                        if (type == 1) {
                            if (window.opener) {
                                dmUtils.logTag('[子页面] 请求保存页面');
                                window.opener.postMessage({ type: 'DMSTATS_REQUEST_SAFE' }, '*');
                            }
                        }
                    }
                });
                document.body.appendChild(iframe);
            });
            // 主动请求数据
            window.addEventListener('load', () => {
                if (window.opener) {
                    dmUtils.logTag('[子页面] 请求数据');
                    window.opener.postMessage({ type: 'DMSTATS_REQUEST_DATA' }, '*');
                }
            });
        </script>
        </body>
        </html>
        `;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        const newWin = window.open(blobUrl, '_blank');
        if (!newWin) {
            alert('浏览器阻止了弹出窗口');
            return;
        }
    }
    // 保存弹幕统计面板
    function savePanel() {
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="zh">
        <head>
        <meta charset="UTF-8">
        <title>Bilibili 弹幕统计</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            html, body {
                margin: 0;
                padding: 0;
            }
        </style>
        </head>
        <body>
        <script type="module">
            import { initIframeApp, BiliDanmakuUtils } from '${coreJsUrl}';
            const dmUtils = new BiliDanmakuUtils();
            Object.assign(dmUtils, ${JSON.stringify(dmUtils)});
            const iframe = document.createElement('iframe');
            iframe.id = 'danmaku-stat-iframe';
            iframe.style.position = 'fixed';
            iframe.style.top = '3%';
            iframe.style.left = '4%';
            iframe.style.height = '90%';
            iframe.style.width = '90%';
            iframe.style.border = '0';
            iframe.style.backgroundColor = '#fff';
            iframe.style.padding = '20px';
            iframe.style.overflow = 'hidden';
            iframe.style.borderRadius = '8px';
            iframe.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
            iframe.onload = () => initIframeApp(iframe, dmUtils, {
                type: 2,
                newPanel: function (type) {
                    dmUtils.logTag('未定义操作');
                }
            });
            document.body.appendChild(iframe);
        </script>
        </body>
        </html>
        `;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${dmUtils.bvid}_danmaku_statistics.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    }
    // 监听新标签页消息
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'DMSTATS_REQUEST_DATA') {
            dmUtils.logTag('[主页面] 收到数据请求');
            event.source.postMessage(dmUtils, '*');
        } else if (event.data?.type === 'DMSTATS_REQUEST_SAFE') {
            dmUtils.logTag('[主页面] 收到保存请求');
            savePanel();
        }
    });
    insertButton();
})();
