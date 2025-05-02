// ==UserScript==
// @name         bilibili 视频弹幕统计|下载|查询发送者
// @namespace    https://github.com/ZBpine/bili-danmaku-statistic
// @version      1.3.4
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

    var biliCrc2Mid = function () {
        /*
        函数来源
        https://github.com/shafferjohn/bilibili-search/blob/master/crc32.js
        */
        const CRCPOLYNOMIAL = 0xEDB88320;
        var startTime = new Date().getTime(),
            crctable = new Array(256),
            create_table = function () {
                var crcreg,
                    i, j;
                for (i = 0; i < 256; ++i) {
                    crcreg = i;
                    for (j = 0; j < 8; ++j) {
                        if ((crcreg & 1) != 0) {
                            crcreg = CRCPOLYNOMIAL ^ (crcreg >>> 1);
                        }
                        else {
                            crcreg >>>= 1;
                        }
                    }
                    crctable[i] = crcreg;
                }
            },
            crc32 = function (input) {
                if (typeof (input) != 'string')
                    input = input.toString();
                var crcstart = 0xFFFFFFFF, len = input.length, index;
                for (var i = 0; i < len; ++i) {
                    index = (crcstart ^ input.charCodeAt(i)) & 0xff;
                    crcstart = (crcstart >>> 8) ^ crctable[index];
                }
                return crcstart;
            },
            crc32lastindex = function (input) {
                if (typeof (input) != 'string')
                    input = input.toString();
                var crcstart = 0xFFFFFFFF, len = input.length, index;
                for (var i = 0; i < len; ++i) {
                    index = (crcstart ^ input.charCodeAt(i)) & 0xff;
                    crcstart = (crcstart >>> 8) ^ crctable[index];
                }
                return index;
            },
            getcrcindex = function (t) {
                //if(t>0)
                //t-=256;
                for (var i = 0; i < 256; i++) {
                    if (crctable[i] >>> 24 == t)
                        return i;
                }
                return -1;
            },
            deepCheck = function (i, index) {
                var tc = 0x00, str = '',
                    hash = crc32(i);
                tc = hash & 0xff ^ index[2];
                if (!(tc <= 57 && tc >= 48))
                    return [0];
                str += tc - 48;
                hash = crctable[index[2]] ^ (hash >>> 8);
                tc = hash & 0xff ^ index[1];
                if (!(tc <= 57 && tc >= 48))
                    return [0];
                str += tc - 48;
                hash = crctable[index[1]] ^ (hash >>> 8);
                tc = hash & 0xff ^ index[0];
                if (!(tc <= 57 && tc >= 48))
                    return [0];
                str += tc - 48;
                hash = crctable[index[0]] ^ (hash >>> 8);
                return [1, str];
            };
        create_table();
        var index = new Array(4);
        console.log('初始化耗时：' + (new Date().getTime() - startTime) + 'ms');
        return function (input) {
            var ht = parseInt('0x' + input) ^ 0xffffffff,
                snum, i, lastindex, deepCheckData;
            for (i = 3; i >= 0; i--) {
                index[3 - i] = getcrcindex(ht >>> (i * 8));
                snum = crctable[index[3 - i]];
                ht ^= snum >>> ((3 - i) * 8);
            }
            for (i = 0; i < 100000000; i++) {
                lastindex = crc32lastindex(i);
                if (lastindex == index[3]) {
                    deepCheckData = deepCheck(i, index)
                    if (deepCheckData[0])
                        break;
                }
            }

            if (i == 100000000)
                return -1;
            console.log('总耗时：' + (new Date().getTime() - startTime) + 'ms');
            return i + '' + deepCheckData[1];
        }
    }
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

        btn.onclick = openIframe;

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
    // 打开iframe面板
    function openIframe() {
        if (document.getElementById('danmaku-stat-iframe')) return;

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
        iframe.onload = () => initIframeApp(iframe);
        document.body.appendChild(iframe);
    }
    // iframe里初始化Vue应用
    async function initIframeApp(iframe) {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;


        // 引入外部库
        const addScript = (src) => new Promise(resolve => {
            const script = doc.createElement('script');
            script.src = src;
            script.onload = resolve;
            doc.head.appendChild(script);
        });
        const addCss = (href) => {
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            doc.head.appendChild(link);
        };

        addCss('https://cdn.jsdelivr.net/npm/element-plus/dist/index.css');
        await addScript('https://cdn.jsdelivr.net/npm/vue@3.3.4/dist/vue.global.prod.js');
        await addScript('https://cdn.jsdelivr.net/npm/element-plus/dist/index.full.min.js');
        await addScript('https://cdn.jsdelivr.net/npm/echarts@5');
        await addScript('https://cdn.jsdelivr.net/npm/echarts-wordcloud@2/dist/echarts-wordcloud.min.js');
        await addScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        await addScript('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.5.0/dist/dom-to-image-more.min.js');

        // 创建挂载点
        const appRoot = doc.createElement('div');
        appRoot.id = 'danmaku-app';
        doc.body.style.margin = '0';
        doc.body.appendChild(appRoot);

        // 挂载Vue
        const { createApp, ref, onMounted, nextTick } = win.Vue;
        const ELEMENT_PLUS = win.ElementPlus;
        const ECHARTS = win.echarts;

        class DanmakuManager {
            constructor(danmakuList) {
                this.original = [...danmakuList].sort((a, b) => a.progress - b.progress);
                this.filtered = [...this.original]; // 保持同步顺序
            }

            reset() {
                this.filtered = [...this.original];
            }

            filter(regex) {
                this.filtered = this.original.filter(d => regex.test(d.content));
            }

            getStats() {
                const countMap = {};
                for (const d of this.filtered) {
                    countMap[d.midHash] = (countMap[d.midHash] || 0) + 1;
                }
                return Object.entries(countMap)
                    .map(([user, count]) => ({ user, count }))
                    .sort((a, b) => b.count - a.count);
            }
        }


        const app = createApp({
            setup() {
                const displayedDanmakus = ref([]);
                const filterText = ref('^(哈|呵|h|ha|HA|H+|233+)+$');
                const originDanmakuCount = ref(0);
                const currentFilt = ref('');
                const currentSubFilt = ref({});
                const danmakuCount = ref({ user: 0, dm: 0 });
                const videoData = ref({});
                const loading = ref(true);
                const isExpandedUserChart = ref(false);
                let manager = null;
                let charts = {
                    user: null,
                    wordcloud: null,
                    density: null,
                    date: null,
                    hour: null
                };

                function formatProgress(ms) {
                    const s = Math.floor(ms / 1000);
                    const min = String(Math.floor(s / 60)).padStart(2, '0');
                    const sec = String(s % 60).padStart(2, '0');
                    return `${min}:${sec}`;
                }
                function formatCtime(t) {
                    const d = new Date(t * 1000);
                    return d.getFullYear() + '-' +
                        String(d.getMonth() + 1).padStart(2, '0') + '-' +
                        String(d.getDate()).padStart(2, '0') + ' ' +
                        String(d.getHours()).padStart(2, '0') + ':' +
                        String(d.getMinutes()).padStart(2, '0');
                }
                function formatTime(ts) {
                    const d = new Date(ts * 1000);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                }
                function parseDanmakuXml(xmlText) {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
                    const dElements = xmlDoc.getElementsByTagName('d');
                    const danmakus = [];
                    for (const d of dElements) {
                        const pAttr = d.getAttribute('p');
                        if (!pAttr) continue;
                        const parts = pAttr.split(',');
                        if (parts.length < 8) continue;
                        danmakus.push({
                            progress: parseFloat(parts[0]) * 1000,
                            mode: parseInt(parts[1]),
                            fontsize: parseInt(parts[2]),
                            color: parseInt(parts[3]),
                            ctime: parseInt(parts[4]),
                            midHash: parts[6],
                            id: parts[7],
                            weight: parseInt(parts[8]),
                            content: d.textContent.trim()
                        });
                    }
                    return danmakus;
                }

                async function shareImage() {
                    const html2canvas = win.html2canvas;
                    if (!html2canvas) {
                        ELEMENT_PLUS.ElMessage.error('html2canvas 加载失败');
                        return;
                    }
                    const domtoimage = win.domtoimage;
                    if (!domtoimage) {
                        ELEMENT_PLUS.ElMessage.error('dom-to-image-more 加载失败');
                        return;
                    }

                    const titleWrapper = doc.getElementById('wrapper-title');
                    const tableWrapper = doc.getElementById('wrapper-table');
                    const chartWrapper = doc.getElementById('wrapper-chart');

                    if (!titleWrapper || !tableWrapper || !chartWrapper) {
                        ELEMENT_PLUS.ElMessage.error('找不到截图区域');
                        return;
                    }
                    loading.value = true;
                    try {
                        titleWrapper.style.paddingBottom = '10px';  //dom-to-image-more会少截
                        tableWrapper.style.paddingBottom = '40px';
                        await nextTick();

                        const loadImage = (blob) => new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => resolve(img);
                            img.src = URL.createObjectURL(blob);
                        });

                        const scale = window.devicePixelRatio;
                        //title使用dom-to-image-more截图，table和chart使用html2canvas截图
                        const titleBlob = await domtoimage.toBlob(titleWrapper, {
                            style: {
                                transform: `scale(${scale})`,
                                transformOrigin: 'top left'
                            },
                            width: titleWrapper.offsetWidth * scale,
                            height: titleWrapper.offsetHeight * scale
                        });
                        const titleImg = await loadImage(titleBlob);

                        const [titleCanvas, tableCanvas, chartCanvas] = await Promise.all([
                            //foreignObjectRendering开启则Echart无法显示，关闭则el-tag没有文字。
                            html2canvas(titleWrapper, {
                                useCORS: true, backgroundColor: '#fff', scale: scale,
                                foreignObjectRendering: true
                            }),
                            html2canvas(tableWrapper, { useCORS: true, backgroundColor: '#fff', scale: scale }),
                            html2canvas(chartWrapper, { useCORS: true, backgroundColor: '#fff', scale: scale })
                        ]);

                        // 计算总大小
                        const totalWidth = Math.max(titleImg.width, tableCanvas.width, chartCanvas.width) * 1.1;
                        const totalHeight = titleImg.height + tableCanvas.height + chartCanvas.height;

                        // 合并成一张新 canvas
                        const finalCanvas = document.createElement('canvas');
                        finalCanvas.width = totalWidth;
                        finalCanvas.height = totalHeight;
                        const ctx = finalCanvas.getContext('2d');

                        // 计算水平居中位置
                        const titleX = (totalWidth - titleImg.width) / 2;
                        const tableX = (totalWidth - tableCanvas.width) / 2;
                        const chartX = (totalWidth - chartCanvas.width) / 2;

                        // 绘制
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, totalWidth, totalHeight);
                        // 拼接两个 canvas（上下排列）
                        ctx.drawImage(titleImg, titleX, 0);
                        ctx.drawImage(tableCanvas, tableX, titleImg.height);
                        ctx.drawImage(chartCanvas, chartX, titleImg.height + tableCanvas.height);

                        // 输出图片
                        finalCanvas.toBlob(blob => {
                            const blobUrl = URL.createObjectURL(blob);
                            ELEMENT_PLUS.ElMessageBox({
                                title: '截图预览',
                                dangerouslyUseHTMLString: true,
                                message: `
                                <a href="${blobUrl}" target="_blank" title="点击查看大图">
                                    <img src="${blobUrl}" style="max-width:100%; max-height:80vh; cursor: zoom-in;" />
                                </a>
                                `,
                                showCancelButton: true,
                                confirmButtonText: '保存图片',
                                cancelButtonText: '关闭',
                            }).then(() => {
                                const link = doc.createElement('a');
                                link.download = 'bilibili_danmaku_statistics.png';
                                link.href = blobUrl;
                                link.click();
                                URL.revokeObjectURL(blobUrl); // 可选：释放内存
                            }).catch(() => {
                                URL.revokeObjectURL(blobUrl);
                            });
                        });
                    } catch (err) {
                        console.error(err);
                        ELEMENT_PLUS.ElMessage.error('截图生成失败');
                    } finally {
                        titleWrapper.style.paddingBottom = '';
                        tableWrapper.style.paddingBottom = '';
                        loading.value = false;
                    }
                }

                function midHashOnClick() {
                    if (!currentSubFilt.value.user) return;
                    ELEMENT_PLUS.ElMessageBox.confirm(
                        `是否尝试反查用户ID？
                        <p style="margin-top: 10px; font-size: 12px; color: gray;">
                            可能需要一段时间，且10位数以上ID容易查错
                        </p>`,
                        '提示',
                        {
                            dangerouslyUseHTMLString: true,
                            confirmButtonText: '是',
                            cancelButtonText: '否',
                            type: 'warning',
                        }
                    ).then(() => {
                        // 开始反查用户ID
                        var midcrc = new biliCrc2Mid();
                        var result = midcrc(currentSubFilt.value.user);
                        if (result && result !== '-1') {
                            ELEMENT_PLUS.ElMessageBox.alert(
                                `已查到用户ID：
                                <a href="https://space.bilibili.com/${result}" target="_blank" style="color:#409eff;text-decoration:none;">
                                    点击访问用户空间
                                </a>
                                <p style="margin-top: 10px; font-size: 12px; color: gray;">
                                    此ID通过弹幕哈希本地计算得出，非官方公开数据，请谨慎使用
                                </p>`,
                                '查找成功',
                                {
                                    dangerouslyUseHTMLString: true,
                                    confirmButtonText: '确定',
                                    type: 'success',
                                }
                            );
                        } else {
                            ELEMENT_PLUS.ElMessage.error('未能查到用户ID或用户不存在');
                        }
                    }).catch(() => {
                        // 用户点击了取消，只复制midHash
                        navigator.clipboard.writeText(currentSubFilt.value.user).then(() => {
                            ELEMENT_PLUS.ElMessage.success('midHash已复制到剪贴板');
                        }).catch(() => {
                            ELEMENT_PLUS.ElMessage.error('复制失败');
                        });
                    });
                }

                async function updateDispDanmakus(data, text, ifchart) {
                    loading.value = true;
                    await nextTick();
                    await new Promise(resolve => setTimeout(resolve, 10)); //等待v-loading渲染
                    try {
                        displayedDanmakus.value = data;
                        currentSubFilt.value = text;
                        if (ifchart) {
                            const stats = manager.getStats();
                            updateChart(stats);
                            danmakuCount.value = { user: stats.length, dm: displayedDanmakus.value.length }
                        }
                        await nextTick();
                    } catch (err) {
                        console.error(err);
                        ELEMENT_PLUS.ElMessage.error('数据显示错误');
                    } finally {
                        loading.value = false;
                    }
                }
                function renderWordCloud(data) {
                    const el = doc.getElementById('chart-wordcloud');
                    if (!el) return;
                    if (!charts.wordcloud) {
                        charts.wordcloud = ECHARTS.init(el);
                        charts.wordcloud.on('click', async (params) => {
                            const keyword = params.name;
                            const regex = new RegExp(keyword, 'i');
                            await updateDispDanmakus(
                                manager.filtered.filter(d => regex.test(d.content)),
                                { wordcloud: keyword }
                            );
                        });
                    }
                    else charts.wordcloud.clear();

                    const freq = {};
                    data.forEach(d => {
                        d.content.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).forEach(w => {
                            if (w.length >= 2) freq[w] = (freq[w] || 0) + 1;
                        });
                    });
                    const list = Object.entries(freq).map(([name, value]) => ({ name, value }));
                    charts.wordcloud.setOption({
                        title: { text: '弹幕词云' },
                        tooltip: {},
                        series: [{
                            type: 'wordCloud',
                            gridSize: 8,
                            sizeRange: [12, 40],
                            rotationRange: [0, 0],
                            shape: 'circle',
                            data: list
                        }]
                    });
                }
                function renderDensityChart(data) {
                    const el = doc.getElementById('chart-density');
                    if (!el) return;
                    if (!charts.density) {
                        charts.density = ECHARTS.init(el);
                        charts.density.on('click', function (params) {
                            const targetTime = params.value[0] * 1000;
                            const list = displayedDanmakus.value;
                            if (!list.length) return;

                            // 找到最接近的弹幕 index
                            let closestIndex = 0;
                            let minDiff = Math.abs(list[0].progress - targetTime);
                            for (let i = 1; i < list.length; i++) {
                                const diff = Math.abs(list[i].progress - targetTime);
                                if (diff < minDiff) {
                                    closestIndex = i;
                                    minDiff = diff;
                                }
                            }

                            // 使用 Element Plus 表格 ref 滚动到该行
                            nextTick(() => {
                                const rows = doc.querySelectorAll('.el-table__body-wrapper tbody tr');
                                const row = rows?.[closestIndex];
                                if (row) {
                                    row.scrollIntoView({
                                        behavior: 'smooth',
                                        block: 'center'
                                    });

                                    const original = row.style.backgroundColor;
                                    row.style.transition = 'background-color 0.3s ease';
                                    row.style.backgroundColor = '#ecf5ff';

                                    setTimeout(() => {
                                        row.style.backgroundColor = original || '';
                                    }, 1500);
                                }
                            });
                        });

                    }

                    const duration = videoData.value.duration * 1000; // ms
                    const minutes = duration / 1000 / 60;

                    // 动态设置 bin 数量
                    let binCount = 100;
                    if (minutes <= 10) binCount = 60;
                    else if (minutes <= 30) binCount = 90;
                    else if (minutes <= 60) binCount = 60;
                    else binCount = 30;

                    const bins = new Array(binCount).fill(0);
                    data.forEach(d => {
                        const idx = Math.floor((d.progress / duration) * binCount);
                        bins[Math.min(idx, bins.length - 1)]++;
                    });

                    const dataPoints = [];
                    for (let i = 0; i < binCount; i++) {
                        const timeSec = Math.floor((i * duration) / binCount / 1000);
                        dataPoints.push({
                            value: [timeSec, bins[i]],
                            name: formatProgress(timeSec * 1000)
                        });
                    }

                    charts.density.setOption({
                        title: { text: '弹幕密度分布' },
                        tooltip: {
                            trigger: 'axis',
                            formatter: function (params) {
                                const sec = params[0].value[0];
                                return `时间段：${formatProgress(sec * 1000)}<br/>弹幕数：${params[0].value[1]}`;
                            },
                            axisPointer: {
                                type: 'line'
                            }
                        },
                        xAxis: {
                            type: 'value',
                            name: '时间',
                            min: 0,
                            max: Math.ceil(duration / 1000),
                            axisLabel: {
                                formatter: val => formatProgress(val * 1000)
                            }
                        },
                        yAxis: {
                            type: 'value',
                            name: '弹幕数量'
                        },
                        series: [{
                            data: dataPoints,
                            type: 'line',
                            smooth: true,
                            areaStyle: {} // 可选加背景区域
                        }]
                    });
                }
                function renderDateChart(data) {
                    const el = doc.getElementById('chart-date');
                    if (!el) return;
                    if (!charts.date) {
                        charts.date = ECHARTS.init(el);
                        charts.date.on('click', async (params) => {
                            const selectedDate = params.name;
                            await updateDispDanmakus(
                                manager.filtered.filter(d => formatTime(d.ctime).startsWith(selectedDate)),
                                { date: selectedDate }
                            );
                        });
                    }

                    const countMap = {};
                    data.forEach(d => {
                        const date = formatTime(d.ctime).split(' ')[0];
                        countMap[date] = (countMap[date] || 0) + 1;
                    });
                    // 按日期升序排序
                    const sorted = Object.entries(countMap).sort((a, b) => new Date(a[0]) - new Date(b[0]));
                    const x = sorted.map(([date]) => date);
                    const y = sorted.map(([, count]) => count);

                    const totalDays = x.length;
                    const startIdx = Math.max(0, totalDays - 30); // 只显示最近30天
                    charts.date.setOption({
                        title: { text: '发送日期分布' },
                        tooltip: {},
                        xAxis: { type: 'category', data: x },
                        yAxis: { type: 'value', name: '弹幕数量' },
                        dataZoom: [
                            {
                                type: 'slider',
                                startValue: startIdx,
                                endValue: totalDays - 1,
                                xAxisIndex: 0,
                                height: 20
                            }
                        ],
                        series: [{ type: 'bar', data: y }]
                    });
                }
                function renderHourChart(data) {
                    const el = doc.getElementById('chart-hour');
                    if (!el) return;
                    if (!charts.hour) {
                        charts.hour = ECHARTS.init(el);
                        charts.hour.on('click', async (params) => {
                            const selectedHour = parseInt(params.name);
                            await updateDispDanmakus(
                                manager.filtered.filter(d => {
                                    const h = new Date(d.ctime * 1000).getHours();
                                    return h === selectedHour;
                                }),
                                { hour: selectedHour }
                            );
                        });
                    }

                    const hours = new Array(24).fill(0);
                    data.forEach(d => {
                        const hour = new Date(d.ctime * 1000).getHours();
                        hours[hour]++;
                    });
                    charts.hour.setOption({
                        title: { text: '发送时间分布' },
                        tooltip: {},
                        xAxis: { type: 'category', data: hours.map((_, i) => i + '时') },
                        yAxis: { type: 'value', name: '弹幕数量' },
                        series: [{ type: 'bar', data: hours }]
                    });
                }
                function updateChart(stats) {
                    const chartEl = doc.getElementById('chart-user');
                    if (!chartEl) return setTimeout(() => updateChart(stats), 100);
                    chartEl.style.height = isExpandedUserChart.value ? '100%' : '50%';

                    if (!charts.user) {
                        charts.user = ECHARTS.init(chartEl);
                        charts.user.on('click', (params) => {
                            const selected = params.name;
                            displayedDanmakus.value = manager.filtered.filter(d => d.midHash === selected);
                            currentSubFilt.value = { user: selected };
                        });
                        // 点击标题切换展开状态
                        charts.user.getZr().on('click', function (params) {
                            if (params.offsetY >= 0 && params.offsetY <= 40) {
                                isExpandedUserChart.value = !isExpandedUserChart.value;
                                if (charts.user) {
                                    charts.user.dispose();
                                    charts.user = null;
                                }
                                updateChart(stats); // 重新绘制
                            }
                        });
                    }
                    const userNames = stats.map(item => item.user);
                    const counts = stats.map(item => item.count);
                    const maxCount = Math.max(...counts);

                    const sc = isExpandedUserChart.value ? 20 : 8;

                    charts.user.setOption({
                        tooltip: {},
                        title: { text: '用户弹幕统计' },
                        grid: { left: 100 },
                        xAxis: {
                            type: 'value',
                            min: 0,
                            max: Math.ceil(maxCount * 1.1), // 横轴最大值略大一点
                            scale: false
                        },
                        yAxis: {
                            type: 'category',
                            data: userNames,
                            inverse: true
                        },
                        dataZoom: [
                            {
                                type: 'slider',
                                yAxisIndex: 0,
                                startValue: 0,
                                endValue: userNames.length >= sc ? sc - 1 : userNames.length,
                                width: 20
                            }
                        ],
                        series: [{
                            type: 'bar',
                            data: counts,
                            label: {
                                show: true,
                                position: 'right',  // 在条形右边显示
                                formatter: '{c}',   // 显示数据本身
                                fontSize: 12
                            }
                        }]
                    });
                    renderDensityChart(manager.filtered);
                    renderWordCloud(manager.filtered);
                    renderDateChart(manager.filtered);
                    renderHourChart(manager.filtered);
                }

                async function clearSubFilter() {
                    await updateDispDanmakus(manager.filtered, {});
                }
                function handleRowClick(row) {
                    if (!charts.user) return;

                    const userMid = row.midHash;
                    const option = charts.user.getOption();

                    let el = doc.getElementById('wrapper-chart');
                    while (el && el !== doc.body) {
                        //寻找可以滚动的父级元素
                        const overflowY = getComputedStyle(el).overflowY;
                        const canScroll = overflowY === 'scroll' || overflowY === 'auto';
                        if (canScroll && el.scrollHeight > el.clientHeight) {
                            el.scrollTo({ top: 0, behavior: 'smooth' });
                            break;
                        }
                        el = el.parentElement;
                    }

                    const sc = isExpandedUserChart.value ? 20 : 8;
                    const scup = isExpandedUserChart.value ? 9 : 3;
                    const index = option.yAxis[0].data.indexOf(userMid);
                    if (index >= 0) {
                        charts.user.setOption({
                            yAxis: {
                                axisLabel: {
                                    formatter: function (value) {
                                        if (value === userMid) {
                                            return '{a|' + value + '}';
                                        } else {
                                            return value;
                                        }
                                    },
                                    rich: {
                                        a: {
                                            color: '#5470c6',
                                            fontWeight: 'bold'
                                        }
                                    }
                                }
                            },
                            dataZoom: [{
                                startValue: Math.min(option.yAxis[0].data.length - sc, Math.max(0, index - scup)),
                                endValue: Math.min(option.yAxis[0].data.length - 1, Math.max(0, index - scup) + sc - 1)
                            }]
                        });
                    }
                }

                async function applyFilter() {
                    try {
                        const regex = new RegExp(filterText.value, 'i');
                        manager.filter(regex);
                        currentFilt.value = regex;
                        await updateDispDanmakus(manager.filtered, {}, true);
                    } catch (e) {
                        console.warn(e);
                        alert('无效正则表达式');
                    }
                }
                async function resetFilter() {
                    manager.reset();
                    currentFilt.value = '';
                    await updateDispDanmakus(manager.filtered, {}, true);
                }

                async function getVideoData() {
                    const url = location.href;
                    let bvid = null;

                    // 判断是否为 watchlater 链接
                    if (url.includes('/list/watchlater')) {
                        const match = url.match(/[?&]bvid=(BV\w+)/);
                        if (match) bvid = match[1];
                    } else {
                        const match = url.match(/\/video\/(BV\w+)/);
                        if (match) bvid = match[1];
                    }

                    if (!bvid) {
                        console.error('找不到 BVID');
                        return null;
                    }
                    try {
                        const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
                        const json = await res.json();
                        if (json && json.data) {
                            const data = json.data;
                            // 读取 p 参数
                            const pMatch = url.match(/[?&]p=(\d+)/);
                            if (pMatch) {
                                const pageIndex = parseInt(pMatch[1], 10) - 1;
                                if (!isNaN(pageIndex) && data.pages && data.pages[pageIndex]) {
                                    data.page_index = pageIndex;
                                    data.page_cur = data.pages[pageIndex];
                                }
                            }
                            return data;
                        } else {
                            console.error('获取视频基本信息失败', json);
                            return null;
                        }
                    } catch (e) {
                        console.error('请求出错', e);
                        return null;
                    }
                }

                onMounted(async () => {
                    videoData.value = await getVideoData();
                    const oid = videoData.value.page_cur?.cid || videoData.value.cid;
                    if (!oid) {
                        alert('无法找到视频chatid');
                        return;
                    }
                    const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${oid}`);
                    const text = await res.text();
                    const data = parseDanmakuXml(text);
                    manager = new DanmakuManager(data);
                    originDanmakuCount.value = data.length; // 原始弹幕数量
                    await updateDispDanmakus(manager.filtered, {}, true);
                });
                return {
                    displayedDanmakus,
                    filterText,
                    applyFilter,
                    resetFilter,
                    danmakuCount,
                    videoData,
                    originDanmakuCount,
                    currentFilt,
                    currentSubFilt,
                    loading,
                    isExpandedUserChart,
                    midHashOnClick,
                    handleRowClick,
                    clearSubFilter,
                    formatProgress,
                    formatCtime,
                    formatTime,
                    shareImage
                };
            },
            template: `
<el-container style="height: 100%;" v-loading="loading">
    <!-- 左边 -->
    <el-aside width="50%" style="overflow-y: auto;">
        <!-- 上半部：标题区域 -->
        <div style="min-width: 400px;">
            <div id="wrapper-title" style="text-align: left;">
                <h3>{{ videoData.title || '加载中...' }}
                    <el-popover placement="right" v-if="videoData.pic"
                        popper-style="width: 360px; height: 180px; padding: 10px; box-sizing: content-box;">
                        <div
                            style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                            <img :src="videoData.pic" alt="视频封面" style="max-width: 100%; max-height: 100%;" />
                        </div>
                        <template v-slot:reference>
                            <el-link :href="videoData.pic" target="_blank" type="primary">
                                <svg t="1746010439489" class="icon" viewBox="0 0 1029 1024" version="1.1"
                                    xmlns="http://www.w3.org/2000/svg" p-id="5042" width="20" height="20">
                                    <path
                                        d="M487.966546 867.289336c-0.191055 0-0.38211 0-0.577318-0.008306-85.119089-0.926201-171.396967-8.3898-256.428835-22.178976a29.812863 29.812863 0 0 0-0.598085-0.095528c-75.890309-13.224318-150.032051-79.636645-165.274905-148.050895l-0.161981-0.751759c-33.405525-161.104925-33.405525-324.473435 0-485.570054 0.053994-0.249202 0.103834-0.498404 0.161981-0.743452C80.326104 141.467809 154.471999 75.051329 230.370615 61.835317l0.593931-0.09968a1713.961362 1713.961362 0 0 1 550.250427 0.09968c75.890309 13.207705 150.036204 79.624185 165.279059 148.055049 0.058147 0.249202 0.107988 0.494251 0.157827 0.743452 21.672265 104.444702 29.385067 210.417843 22.943196 314.962227-1.761027 28.620847-26.390489 50.355413-55.011337 48.627612-28.625001-1.765181-50.38864-26.390489-48.627612-55.011336 5.864553-95.195155-1.158789-191.769229-20.878973-287.043298-6.836441-29.630115-51.015798-62.56631-81.414286-67.99476a1610.243499 1610.243499 0 0 0-515.735953 0c-30.394335 5.432603-74.577845 38.368798-81.422593 67.990606-30.377721 146.817345-30.381874 295.690607 0 442.512105 6.853054 29.621808 51.028258 62.55385 81.422593 67.986453 79.81524 12.925276 160.756042 19.923698 240.587896 20.791752 28.670688 0.315656 51.65957 23.802942 51.352221 52.481936-0.311502 28.479633-23.49144 51.352221-51.900465 51.352221z"
                                        p-id="5043" fill="#409eff"></path>
                                    <path
                                        d="M727.790223 570.539621c20.272581 20.272581 53.150628 20.276734 73.427362 0s20.276734-53.146475 0-73.423209l-102.762589-102.766742a51.917079 51.917079 0 0 0-73.427362 0l-86.036983 86.036982-66.055138-66.055137c-20.272581-20.272581-53.146475-20.272581-73.423209 0l-162.716431 162.712278c-20.272581 20.280888-20.272581 53.150628 0 73.423209a51.759251 51.759251 0 0 0 36.711604 15.209628c13.286619 0 26.573238-5.075414 36.711605-15.209628l126.004827-126.004826 66.055137 66.055137c20.276734 20.280888 53.146475 20.280888 73.419056 0l86.04529-86.036983 66.046831 66.059291zM974.911364 766.408222c-20.272581-20.272581-53.142322-20.272581-73.427363 0l-40.877431 40.881585v-133.318905c0-28.670688-23.246391-51.917079-51.917079-51.917079s-51.917079 23.246391-51.917078 51.917079v133.318905l-40.877432-40.881585c-20.285041-20.272581-53.154782-20.272581-73.427362 0-20.272581 20.280888-20.272581 53.150628 0 73.427363l129.510268 129.501961c10.138367 10.134214 23.424986 15.205474 36.711604 15.205474s26.569084-5.07126 36.711605-15.205474l129.510268-129.501961c20.268428-20.276734 20.268428-53.146475 0-73.427363z"
                                        p-id="5044" fill="#409eff"></path>
                                </svg>
                            </el-link>
                        </template>
                    </el-popover>
                </h3>
                <el-tag type="success" v-if="videoData.page_cur">
                    第 {{ videoData.page_index + 1 }} P：{{ videoData.page_cur.part }}
                </el-tag>

                <p style="margin: 10px;">
                    BVID：
                    <el-link v-if="videoData.bvid" :href="'https://www.bilibili.com/video/' + videoData.bvid"
                        target="_blank" type="primary" style="vertical-align: baseline;">
                        {{ videoData.bvid }}
                    </el-link><br />
                    UP主：
                    <el-link v-if="videoData.owner" :href="'https://space.bilibili.com/' + videoData.owner.mid"
                        target="_blank" type="primary" style="vertical-align: baseline;">
                        {{ videoData.owner.name }}
                    </el-link>
                    <el-popover placement="right" v-if="videoData.owner"
                        popper-style="width: 100px; height: 100px; padding: 10px; box-sizing: content-box;">
                        <div
                            style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                            <img :src="videoData.owner.face" alt="UP主头像"
                                style="max-width: 100%; max-height: 100%; border-radius: 50%;" />
                        </div>
                        <template v-slot:reference>
                            <el-link :href="videoData.owner.face" target="_blank" type="primary"
                                style="margin-left: 8px; vertical-align: -2px;">
                                <svg t="1746010657723" class="icon" viewBox="0 0 1024 1024" version="1.1"
                                    xmlns="http://www.w3.org/2000/svg" p-id="10144" width="16" height="16">
                                    <path
                                        d="M1024 512c0-281.6-230.4-512-512-512S0 230.4 0 512s230.4 512 512 512 512-230.4 512-512z m-512 448c-249.6 0-448-198.4-448-448s198.4-448 448-448 448 198.4 448 448-198.4 448-448 448z"
                                        fill="#409eff" p-id="10145"></path>
                                    <path
                                        d="M627.2 505.6c44.8-38.4 76.8-89.6 76.8-153.6 0-108.8-83.2-192-192-192s-192 83.2-192 192c0 64 32 115.2 76.8 153.6-102.4 44.8-172.8 147.2-172.8 262.4 0 19.2 12.8 32 32 32s32-12.8 32-32c0-121.6 102.4-224 224-224s224 102.4 224 224c0 19.2 12.8 32 32 32s32-12.8 32-32c0-115.2-70.4-217.6-172.8-262.4zM512 480c-70.4 0-128-57.6-128-128s57.6-128 128-128 128 57.6 128 128-57.6 128-128 128z"
                                        fill="#409eff" p-id="10146"></path>
                                </svg>
                            </el-link>
                        </template>
                    </el-popover><br />
                    发布时间：
                    <el-tag type="info" size="small" style="vertical-align: baseline;">
                        {{ videoData.pubdate ? formatTime(videoData.pubdate) : '-' }}
                    </el-tag><br />
                    截止 <el-tag type="info" size="small" style="vertical-align: baseline;"> {{
                        formatTime(Math.floor(Date.now()/1000)) }} </el-tag>
                    播放量:
                    <el-tag type="primary" size="small" style="vertical-align: baseline;" v-if="videoData.stat">
                        {{ videoData.stat.view || '-' }}
                    </el-tag><br />
                    总弹幕数:
                    <el-tag type="primary" size="small" style="vertical-align: baseline;" v-if="videoData.stat">
                        {{ videoData.stat.danmaku || '-' }}
                    </el-tag>
                    ，载入实时弹幕
                    <el-link v-if="videoData.owner"
                        :href="'https://api.bilibili.com/x/v1/dm/list.so?oid=' + videoData.cid" target="_blank"
                        type="primary" style="vertical-align: baseline;" title="下载弹幕">
                        {{ originDanmakuCount }}
                    </el-link>
                    条
                </p>
                <p style="
                    background-color: #f4faff;
                    border-left: 4px solid #409eff;
                    padding: 10px 15px;
                    border-radius: 4px;
                    color: #333;
                ">
                    <template v-if="currentFilt">
                        筛选：<el-tag type="info" size="small" style="vertical-align: baseline;">{{ currentFilt
                            }}</el-tag><br />
                    </template>
                    共有 {{ danmakuCount.user }} 位不同用户发送了 {{ danmakuCount.dm }} 条弹幕<br />
                    <template v-if="Object.keys(currentSubFilt).length">
                        <template v-if="currentSubFilt.user">
                            用户<el-link type="primary" @click="midHashOnClick" style="vertical-align: baseline;">{{
                                currentSubFilt.user }}</el-link>发送
                        </template>
                        <template v-else-if="currentSubFilt.wordcloud">
                            含词语<el-tag type="info" size="small" style="vertical-align: baseline;">{{
                                currentSubFilt.wordcloud }}</el-tag>
                        </template>
                        <template v-else-if="currentSubFilt.date">
                            日期<el-tag type="info" size="small" style="vertical-align: baseline;">{{ currentSubFilt.date
                                }}</el-tag>
                        </template>
                        <template v-else-if="currentSubFilt.hour">
                            每天<el-tag type="info" size="small" style="vertical-align: baseline;">{{ currentSubFilt.hour
                                }}</el-tag>点
                        </template>
                        弹幕共 {{ displayedDanmakus.length }} 条
                        <el-tag type="info" size="small" effect="light" round @click="clearSubFilter" style="
                            width: 18px;
                            height: 18px;
                            padding: 0;
                            vertical-align: baseline;
                            cursor: pointer;
                        " title="清除子筛选">
                            ×
                        </el-tag>

                    </template>
                </p>
            </div>

            <!-- 下半部：弹幕表格 -->
            <div id="wrapper-table" style="height: 100%; display: flex; flex-direction: column;">
                <el-table :data="displayedDanmakus" style="flex: 1;" height="0" border @row-click="handleRowClick">
                    <el-table-column prop="progress" label="时间" align="left" width="80">
                        <template #default="{ row }">{{ formatProgress(row.progress) }}</template>
                    </el-table-column>
                    <el-table-column prop="content" label="弹幕内容" align="left">
                        <template #default="{ row }">
                            <el-tooltip class="item" placement="top-start"
                                :content="'发送用户: ' + row.midHash + '\\n屏蔽等级: ' + row.weight">
                                <span>{{ row.content }}</span>
                            </el-tooltip>
                        </template>
                    </el-table-column>
                    <el-table-column prop="ctime" label="发送时间" align="left" width="160">
                        <template #default="{ row }">{{ formatCtime(row.ctime) }}</template>
                    </el-table-column>
                </el-table>
            </div>
        </div>
    </el-aside>

    <!-- 右边 -->
    <el-container>
        <el-header style="height: auto;">
            <el-input v-model="filterText" placeholder="请输入正则表达式" style="width: 300px; margin-right: 10px;"></el-input>
            <template v-if="displayedDanmakus.length == originDanmakuCount">
                <el-button @click="applyFilter" type="warning">筛选</el-button>
                <el-button @click="resetFilter">取消筛选</el-button>
            </template>
            <template v-else>
                <el-button @click="applyFilter">筛选</el-button>
                <el-button @click="resetFilter" type="warning">取消筛选</el-button>
            </template>
            <el-button @click="shareImage" title="分享统计结果" circle>
                <svg t="1746120386170" class="icon" viewBox="0 0 1024 1024" version="1.1"
                    xmlns="http://www.w3.org/2000/svg" p-id="8980" width="20" height="20">
                    <path
                        d="M304.106667 604.064a42.666667 42.666667 0 1 1 53.653333-66.357333l111.754667 90.464c14.506667 12.970667 18.954667 28.768 13.376 47.402666-7.392 17.994667-20.8 27.466667-40.224 28.426667h-266.666667a42.666667 42.666667 0 0 1 0-85.333333h146.144l-18.026667-14.602667zM314.56 841.269333a42.666667 42.666667 0 1 1-53.653333 66.357334l-111.754667-90.464c-14.506667-12.970667-18.954667-28.768-13.376-47.402667 7.392-17.994667 20.8-27.466667 40.224-28.426667h266.666667a42.666667 42.666667 0 0 1 0 85.333334H296.522667l18.026666 14.602666z"
                        p-id="8981" fill="#409eff"></path>
                    <path
                        d="M180.053333 134.72a84.8 84.8 0 0 0-26.986666 18.346667 84.8 84.8 0 0 0-18.346667 26.986666A84.298667 84.298667 0 0 0 128 213.333333v298.666667a42.304 42.304 0 0 0 0.853333 8.32c0.277333 1.365333 0.554667 2.72 0.96 4.053333a42.72 42.72 0 0 0 3.2 7.786667 41.024 41.024 0 0 0 4.693334 6.933333c0.885333 1.077333 1.781333 2.101333 2.773333 3.093334 0.992 0.992 2.016 1.888 3.093333 2.773333a43.925333 43.925333 0 0 0 6.933334 4.693333 42.72 42.72 0 0 0 7.786666 3.2c1.344 0.405333 2.688 0.682667 4.053334 0.96A43.466667 43.466667 0 0 0 170.666667 554.666667a42.304 42.304 0 0 0 8.32-0.853334c1.365333-0.277333 2.72-0.554667 4.053333-0.96a42.72 42.72 0 0 0 7.786667-3.2 41.024 41.024 0 0 0 6.933333-4.693333c1.077333-0.885333 2.101333-1.781333 3.093333-2.773333 0.992-0.992 1.888-2.016 2.773334-3.093334a43.925333 43.925333 0 0 0 4.693333-6.933333 42.72 42.72 0 0 0 3.2-7.786667c0.405333-1.344 0.682667-2.688 0.96-4.053333A43.466667 43.466667 0 0 0 213.333333 512V213.333333h597.333334v597.333334H586.666667a42.293333 42.293333 0 0 0-8.32 0.853333 42.272 42.272 0 0 0-4.053334 0.96 42.613333 42.613333 0 0 0-7.786666 3.2 41.173333 41.173333 0 0 0-6.933334 4.693333 42.122667 42.122667 0 0 0-3.093333 2.773334 41.653333 41.653333 0 0 0-2.773333 3.093333 43.456 43.456 0 0 0-4.693334 6.933333 43.157333 43.157333 0 0 0-3.2 7.786667 42.432 42.432 0 0 0-0.96 4.053333 42.314667 42.314667 0 0 0-0.64 12.48c0.138667 1.386667 0.373333 2.784 0.64 4.16 0.277333 1.376 0.554667 2.709333 0.96 4.053334a42.517333 42.517333 0 0 0 3.2 7.786666 41.045333 41.045333 0 0 0 4.693334 6.933334c0.885333 1.077333 1.781333 2.101333 2.773333 3.093333 0.992 0.992 2.016 1.888 3.093333 2.773333a44.682667 44.682667 0 0 0 6.933334 4.693334 42.613333 42.613333 0 0 0 7.786666 3.2c1.344 0.405333 2.688 0.682667 4.053334 0.96A43.136 43.136 0 0 0 586.666667 896h224a84.288 84.288 0 0 0 33.28-6.72 84.778667 84.778667 0 0 0 26.986666-18.346667 84.778667 84.778667 0 0 0 18.346667-26.986666c4.512-10.613333 6.72-21.728 6.72-33.28V213.333333a84.298667 84.298667 0 0 0-6.72-33.28 84.778667 84.778667 0 0 0-18.346667-26.986666 84.8 84.8 0 0 0-26.986666-18.346667A84.288 84.288 0 0 0 810.666667 128H213.333333a84.298667 84.298667 0 0 0-33.28 6.72z"
                        p-id="8982" fill="#409eff"></path>
                    <path
                        d="M730.666667 330.666667a48 48 0 1 0 0-96 48 48 0 0 0 0 96zM694.08 350.933333c-0.874667-1.045333-1.813333-1.92-2.773333-2.88-0.96-0.96-1.941333-1.92-2.986667-2.773333-1.045333-0.853333-2.08-1.706667-3.2-2.453333-1.12-0.746667-2.346667-1.397333-3.52-2.026667a40.490667 40.490667 0 0 0-3.626667-1.706667 38.805333 38.805333 0 0 0-3.733333-1.28 38.997333 38.997333 0 0 0-3.84-0.96 39.093333 39.093333 0 0 0-3.946667-0.533333c-1.322667-0.106667-2.624-0.106667-3.946666-0.106667s-2.634667 0.053333-3.946667 0.213334a41.6 41.6 0 0 0-11.413333 3.093333 41.205333 41.205333 0 0 0-3.626667 1.813333c-1.162667 0.672-2.208 1.461333-3.306667 2.24a45.013333 45.013333 0 0 0-3.306666 2.56l-58.453334 50.773334-81.813333-103.786667a45.205333 45.205333 0 0 0-2.773333-3.2 40.917333 40.917333 0 0 0-2.986667-2.773333 42.698667 42.698667 0 0 0-3.306667-2.56c-1.130667-0.789333-2.218667-1.568-3.413333-2.24-1.194667-0.672-2.378667-1.173333-3.626667-1.706667a42.250667 42.250667 0 0 0-7.893333-2.56 37.226667 37.226667 0 0 0-3.946667-0.533333 44.448 44.448 0 0 0-4.16-0.213334 39.445333 39.445333 0 0 0-8 0.853334c-1.322667 0.298667-2.656 0.746667-3.946666 1.173333a42.218667 42.218667 0 0 0-7.466667 3.413333 40.906667 40.906667 0 0 0-6.613333 4.8L143.146667 483.626667c-1.045333 0.928-2.026667 1.941333-2.986667 2.986666-0.96 1.045333-1.92 2.069333-2.773333 3.2a47.189333 47.189333 0 0 0-4.48 7.36c-0.64 1.28-1.301333 2.592-1.813334 3.946667-0.512 1.344-0.885333 2.773333-1.28 4.16-0.394667 1.386667-0.8 2.730667-1.066666 4.16-0.266667 1.429333-0.394667 2.922667-0.533334 4.373333a45.322667 45.322667 0 0 0 0 8.64c0.128 1.450667 0.277333 2.837333 0.533334 4.266667 0.256 1.429333 0.682667 2.88 1.066666 4.266667 0.384 1.386667 0.768 2.816 1.28 4.16 0.512 1.354667 1.066667 2.656 1.706667 3.946666s1.386667 2.517333 2.133333 3.733334c0.746667 1.226667 1.493333 2.485333 2.346667 3.626666 1.717333 2.282667 3.552 4.309333 5.653333 6.186667 2.101333 1.888 4.416 3.498667 6.826667 4.906667 2.421333 1.418667 4.949333 2.645333 7.573333 3.52 2.634667 0.874667 5.365333 1.514667 8.106667 1.813333 2.741333 0.298667 5.472 0.288 8.213333 0a39.36 39.36 0 0 0 8.106667-1.813333c2.634667-0.853333 5.152-2.016 7.573333-3.413334a40 40 0 0 0 6.72-4.8L459.733333 384.96l81.6 103.36c0.853333 1.088 1.706667 2.197333 2.666667 3.2s1.941333 1.877333 2.986667 2.773333a43.381333 43.381333 0 0 0 10.453333 6.613334c1.248 0.544 2.453333 0.970667 3.733333 1.386666 1.28 0.416 2.624 0.682667 3.946667 0.96 1.322667 0.277333 2.602667 0.608 3.946667 0.746667a39.925333 39.925333 0 0 0 8.106666 0c1.344-0.149333 2.624-0.469333 3.946667-0.746667 1.322667-0.277333 2.666667-0.533333 3.946667-0.96 1.28-0.426667 2.485333-0.938667 3.733333-1.493333h0.106667c1.237333-0.554667 2.442667-1.248 3.626666-1.92a39.466667 39.466667 0 0 0 3.413334-2.133333 41.813333 41.813333 0 0 0 3.2-2.56l59.413333-51.626667L802.133333 614.613333c0.906667 1.088 1.877333 1.994667 2.88 2.986667 1.002667 0.992 2.005333 2.005333 3.093334 2.88 1.088 0.885333 2.24 1.696 3.413333 2.453333h0.106667c1.173333 0.757333 2.282667 1.493333 3.52 2.133334 1.237333 0.64 2.56 1.205333 3.84 1.706666 1.290667 0.501333 2.506667 0.810667 3.84 1.173334s2.805333 0.746667 4.16 0.96c1.354667 0.213333 2.570667 0.426667 3.946666 0.426666h4.16c1.376 0 2.794667-0.213333 4.16-0.426666 1.354667-0.213333 2.613333-0.597333 3.946667-0.96h0.106667c1.333333-0.362667 2.666667-0.672 3.946666-1.173334 1.290667-0.501333 2.602667-1.066667 3.84-1.706666 1.237333-0.64 2.346667-1.365333 3.52-2.133334 1.173333-0.757333 2.325333-1.568 3.413334-2.453333a44.586667 44.586667 0 0 0 3.2-2.88c1.002667-0.992 1.973333-2.005333 2.88-3.093333a44.053333 44.053333 0 0 0 4.8-7.146667c0.693333-1.258667 1.237333-2.517333 1.813333-3.84a47.786667 47.786667 0 0 0 1.6-4.053333c0.448-1.376 0.853333-2.752 1.173333-4.16s0.554667-2.826667 0.746667-4.266667c0.192-1.44 0.426667-2.922667 0.426667-4.373333v-4.266667c0-1.450667-0.234667-2.933333-0.426667-4.373333a47.434667 47.434667 0 0 0-0.746667-4.266667c-0.32-1.418667-0.832-2.784-1.28-4.16a46.346667 46.346667 0 0 0-1.493333-4.053333c-0.576-1.322667-1.12-2.581333-1.813333-3.84a48.768 48.768 0 0 0-2.346667-3.733334 43.850667 43.850667 0 0 0-2.56-3.413333L694.08 350.933333z"
                        p-id="8983" fill="#409eff"></path>
                </svg>
            </el-button>
        </el-header>
        <el-main style="overflow-y: auto;">
            <div id="wrapper-chart" style="min-width: 400px;">
                <div id="chart-user" style="height: 50%; margin-bottom: 30px;"></div>
                <div id="chart-wordcloud" style="height: 50%; margin-bottom: 30px;"></div>
                <div id="chart-density" style="height: 50%; margin-bottom: 30px;"></div>
                <div id="chart-date" style="height: 50%; margin-bottom: 30px;"></div>
                <div id="chart-hour" style="height: 50%;"></div>
            </div>
        </el-main>
    </el-container>
</el-container>
`
        });
        app.use(ELEMENT_PLUS);
        app.mount('#danmaku-app');
    }

    insertButton();
})();

/*
图标来源
https://www.iconfont.cn/
*/
