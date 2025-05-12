// ==UserScript==
// @name         bilibili 视频弹幕统计|下载|查询发送者
// @namespace    https://github.com/ZBpine/bili-danmaku-statistic
// @version      1.7.4
// @description  获取B站视频页弹幕数据，并生成统计页面
// @author       ZBpine
// @icon         https://i0.hdslb.com/bfs/static/jinkela/long/images/favicon.ico
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/watchlater*
// @match        https://www.bilibili.com/bangumi/play/ep*
// @match        https://space.bilibili.com/*
// @grant        none
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // iframe里初始化统计面板应用
    async function initIframeApp(iframe, dataParam, panelInfoParam) {
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
        const { createApp, ref, onMounted, nextTick, h } = win.Vue;
        const ELEMENT_PLUS = win.ElementPlus;
        const ECHARTS = win.echarts;
        const app = createApp({
            setup() {
                const converter = new BiliMidHashConverter();
                const displayedDanmakus = ref([]);
                const filterText = ref('^(哈|呵|h|ha|H|HA|233+)+$');
                const currentFilt = ref('');
                const currentSubFilt = ref({});
                const subFiltHistory = ref([]);
                const danmakuCount = ref({ origin: 0, filtered: 0 });
                const videoData = ref(dataParam.videoData || {});
                const isTableVisible = ref(true);
                const isTableAutoH = ref(false);
                const loading = ref(true);
                const panelInfo = ref(panelInfoParam);
                const charts = {
                    user: {
                        instance: null,
                        expandedH: false,
                        render(data) {
                            const countMap = {};
                            for (const d of data) {
                                countMap[d.midHash] = (countMap[d.midHash] || 0) + 1;
                            }
                            const stats = Object.entries(countMap)
                                .map(([user, count]) => ({ user, count }))
                                .sort((a, b) => b.count - a.count);
                            const userNames = stats.map(item => item.user);
                            const counts = stats.map(item => item.count);
                            const maxCount = Math.max(...counts);

                            const sc = this.expandedH ? 20 : 8;

                            this.instance.setOption({
                                tooltip: {},
                                title: { text: '用户弹幕统计', subtext: `共 ${userNames.length} 位用户` },
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
                        },
                        async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
                            const selectedUser = params.name;
                            await applySubFilter({
                                value: selectedUser,
                                filterFn: (data) => data.filter(d => d.midHash === selectedUser),
                                labelVNode: (h) => h('span', [
                                    '用户',
                                    h(ELEMENT_PLUS.ElLink, {
                                        type: 'primary',
                                        onClick: () => midHashOnClick(selectedUser),
                                        style: 'vertical-align: baseline;'
                                    }, selectedUser),
                                    '发送'
                                ])
                            });
                        }
                    },
                    wordcloud: {
                        instance: null,
                        expandedH: false,
                        render(data) {
                            const freq = {};
                            data.forEach(d => {
                                d.content.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).forEach(w => {
                                    if (w.length >= 2) freq[w] = (freq[w] || 0) + 1;
                                });
                            });
                            const list = Object.entries(freq).map(([name, value]) => ({ name, value }));
                            this.instance.setOption({
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
                        },
                        async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
                            const keyword = params.name;
                            await applySubFilter({
                                value: keyword,
                                filterFn: (data) => data.filter(d => new RegExp(keyword, 'i').test(d.content)),
                                labelVNode: (h) => h('span', [
                                    '包含词语',
                                    h(ELEMENT_PLUS.ElTag, {
                                        type: 'info',
                                        size: 'small',
                                        style: 'vertical-align: baseline;'
                                    }, keyword)
                                ])
                            });
                        }
                    },
                    density: {
                        instance: null,
                        render(data) {
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

                            this.instance.setOption({
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
                        },
                        async onClick({ params }) {
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
                        }
                    },
                    date: {
                        instance: null,
                        render(data) {
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
                            this.instance.setOption({
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
                        },
                        async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
                            const selectedDate = params.name;
                            await applySubFilter({
                                value: selectedDate,
                                filterFn: (data) => data.filter(d => formatTime(d.ctime).startsWith(selectedDate)),
                                labelVNode: (h) => h('span', [
                                    '日期',
                                    h(ELEMENT_PLUS.ElTag, {
                                        type: 'info',
                                        size: 'small',
                                        style: 'vertical-align: baseline;'
                                    }, selectedDate)
                                ])
                            });
                        }
                    },
                    hour: {
                        instance: null,
                        render(data) {
                            const hours = new Array(24).fill(0);
                            data.forEach(d => {
                                const hour = new Date(d.ctime * 1000).getHours();
                                hours[hour]++;
                            });
                            this.instance.setOption({
                                title: { text: '发送时间分布' },
                                tooltip: {},
                                xAxis: { type: 'category', data: hours.map((_, i) => i + '时') },
                                yAxis: { type: 'value', name: '弹幕数量' },
                                series: [{ type: 'bar', data: hours }]
                            });
                        },
                        async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
                            const selectedHour = parseInt(params.name);
                            await applySubFilter({
                                value: selectedHour,
                                filterFn: (data) => data.filter(d => new Date(d.ctime * 1000).getHours() === selectedHour),
                                labelVNode: (h) => h('span', [
                                    '每天',
                                    h(ELEMENT_PLUS.ElTag, {
                                        type: 'info',
                                        size: 'small',
                                        style: 'vertical-align: baseline;'
                                    }, selectedHour),
                                    '点'
                                ])
                            });
                        }
                    },
                    pool: {
                        instance: null,
                        expandedH: false,
                        render(data) {
                            const labelMap = {
                                0: '普通池',
                                1: '字幕池',
                                2: '特殊池',
                                3: '互动池'
                            };

                            // 动态统计出现过的 pool 值
                            const poolMap = {};
                            data.forEach(d => {
                                const key = d.pool;
                                poolMap[key] = (poolMap[key] || 0) + 1;
                            });

                            const keys = Object.keys(poolMap);
                            const xData = keys.map(k => labelMap[k] ?? `pool:${k}`);
                            const yData = keys.map(k => poolMap[k]);
                            this._poolIndexMap = Object.fromEntries(xData.map((label, i) => [label, Number(keys[i])]));

                            this.instance.setOption({
                                title: { text: '弹幕池分布' },
                                tooltip: {},
                                xAxis: {
                                    type: 'category',
                                    data: xData
                                },
                                yAxis: {
                                    type: 'value',
                                    name: '弹幕数量'
                                },
                                series: [{
                                    type: 'bar',
                                    data: yData
                                }]
                            });
                        },
                        async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
                            const poolLabel = params.name;
                            const poolVal = this._poolIndexMap?.[poolLabel];
                            await applySubFilter({
                                value: poolLabel,
                                filterFn: (data) => data.filter(d => d.pool === poolVal),
                                labelVNode: (h) => h('span', [
                                    h(ELEMENT_PLUS.ElTag, {
                                        type: 'info',
                                        size: 'small',
                                        style: 'vertical-align: baseline;'
                                    }, poolLabel)
                                ])
                            });
                        }
                    }
                };
                const chartsVisible = ref(Object.keys(charts));
                const chartsExpandable = ref(Object.keys(charts).filter(key => 'expandedH' in charts[key]));
                const chartHover = ref(null);
                const danmakuList = {
                    original: [],   //原始
                    filtered: [],   //正则筛选后
                    current: []     //子筛选提交后
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

                async function shareImage() {
                    const html2canvas = win.html2canvas;
                    const domtoimage = win.domtoimage;
                    if (!html2canvas || !domtoimage) {
                        ELEMENT_PLUS.ElMessage.error('截图库加载失败');
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
                            style: { transform: `scale(${scale})`, transformOrigin: 'top left' },
                            width: titleWrapper.offsetWidth * scale,
                            height: titleWrapper.offsetHeight * scale
                        });
                        const titleImg = await loadImage(titleBlob);

                        //foreignObjectRendering开启则Echart无法显示，关闭则el-tag没有文字。
                        // const [titleCanvas, tableCanvas, chartCanvas] = await Promise.all([
                        //     html2canvas(titleWrapper, {
                        //         useCORS: true, backgroundColor: '#fff', scale: scale,
                        //         foreignObjectRendering: true
                        //     }),
                        //     html2canvas(tableWrapper, { useCORS: true, backgroundColor: '#fff', scale: scale }),
                        //     html2canvas(chartWrapper, { useCORS: true, backgroundColor: '#fff', scale: scale })
                        // ]);
                        let tableCanvas = null;
                        let chartCanvas = null;
                        if (isTableVisible.value) {
                            tableCanvas = await html2canvas(tableWrapper, { useCORS: true, backgroundColor: '#fff', scale });
                        } else {
                            tableCanvas = document.createElement('canvas');
                            tableCanvas.width = 0;
                            tableCanvas.height = 0;
                        }
                        chartCanvas = await html2canvas(chartWrapper, { useCORS: true, backgroundColor: '#fff', scale });

                        // 计算总大小
                        const totalWidth = Math.max(titleImg.width, tableCanvas.width, chartCanvas.width) * 1.1;
                        const totalHeight = titleImg.height + tableCanvas.height + chartCanvas.height;

                        // 合并成一张新 canvas
                        const finalCanvas = document.createElement('canvas');
                        finalCanvas.width = totalWidth;
                        finalCanvas.height = totalHeight;
                        const ctx = finalCanvas.getContext('2d');

                        // 绘制
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, totalWidth, totalHeight);
                        let y = 0;
                        ctx.drawImage(titleImg, (totalWidth - titleImg.width) / 2, y);
                        y += titleImg.height;
                        if (tableCanvas.height > 0) {
                            ctx.drawImage(tableCanvas, (totalWidth - tableCanvas.width) / 2, y);
                            y += tableCanvas.height;
                        }
                        if (chartCanvas.height > 0) {
                            ctx.drawImage(chartCanvas, (totalWidth - chartCanvas.width) / 2, y);
                        }
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
                                link.download = `${videoData.value.bvid}_danmaku_statistics.png`;
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

                function midHashOnClick(midHash) {
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
                        var result = converter.hashToMid(midHash);
                        if (result && result !== -1) {
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
                    }).catch((err) => {
                        console.error(err);
                        // 用户点击了取消，只复制midHash
                        navigator.clipboard.writeText(midHash).then(() => {
                            ELEMENT_PLUS.ElMessage.success('midHash已复制到剪贴板');
                        }).catch(() => {
                            ELEMENT_PLUS.ElMessage.error('复制失败');
                        });
                    });
                }

                function renderChart(chart) {
                    const el = doc.getElementById('chart-' + chart);
                    if (!el) return;

                    if (!charts[chart].instance) {
                        el.style.height = charts[chart].expandedH ? '100%' : '50%';
                        charts[chart].instance = ECHARTS.init(el);
                        charts[chart].instance.off('click');
                        if (typeof charts[chart].onClick === 'function') {
                            charts[chart].instance.on('click', (params) => {
                                charts[chart].onClick({
                                    params,
                                    data: danmakuList.current,
                                    applySubFilter: (subFilt) => {
                                        const list = typeof subFilt.filterFn === 'function'
                                            ? subFilt.filterFn(danmakuList.current)
                                            : danmakuList.current;
                                        return updateDispDanmakus(false, list, { chart, ...subFilt });
                                    },
                                    ELEMENT_PLUS
                                });
                            });
                        }
                    }
                    charts[chart].render(danmakuList.current);
                }
                function disposeChart(chart) {
                    if (charts[chart].instance && charts[chart].instance.dispose) {
                        charts[chart].instance.dispose();
                        charts[chart].instance = null;
                    }
                }
                function expandChart(chart) {
                    charts[chart].expandedH = !charts[chart].expandedH;
                    disposeChart(chart);
                    renderChart(chart);
                }
                function moveChartUp(chart) {
                    const idx = chartsVisible.value.indexOf(chart);
                    if (idx > 0) {
                        chartsVisible.value.splice(idx, 1);
                        chartsVisible.value.splice(idx - 1, 0, chart);
                    }
                }
                function moveChartDown(chart) {
                    const idx = chartsVisible.value.indexOf(chart);
                    if (idx < chartsVisible.value.length - 1) {
                        chartsVisible.value.splice(idx, 1);
                        chartsVisible.value.splice(idx + 1, 0, chart);
                    }
                }
                function moveChartOut(chart) {
                    const idx = chartsVisible.value.indexOf(chart);
                    if (idx !== -1) {
                        chartsVisible.value.splice(idx, 1);
                        disposeChart(chart);
                    }
                }

                function locateUserInChart(midHash) {
                    if (!charts.user.instance) return;
                    const option = charts.user.instance.getOption();
                    const index = option.yAxis[0].data.indexOf(midHash);

                    if (index === -1) {
                        ELEMENT_PLUS.ElMessageBox.alert(
                            `未在当前图表中找到用户 <b>${midHash}</b>`,
                            '未找到用户',
                            {
                                type: 'warning',
                                dangerouslyUseHTMLString: true,
                                confirmButtonText: '确定'
                            }
                        );
                        return;
                    }
                    const sc = charts.user.expandedH ? 20 : 8;
                    const scup = charts.user.expandedH ? 9 : 3;
                    if (index >= 0) {
                        charts.user.instance.setOption({
                            yAxis: {
                                axisLabel: {
                                    formatter: function (value) {
                                        if (value === midHash) {
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
                    ELEMENT_PLUS.ElMessage.success(`已定位到用户 ${midHash}`);
                }
                function handleRowClick(row) {
                    let el = doc.getElementById('wrapper-chart');
                    if (!el) return;
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

                    locateUserInChart(row.midHash);
                }
                function promptLocateUser() {
                    ELEMENT_PLUS.ElMessageBox.prompt('请输入要定位的 midHash 用户 ID：', '定位用户', {
                        confirmButtonText: '定位',
                        cancelButtonText: '取消',
                        inputPattern: /^[a-fA-F0-9]{5,}$/,
                        inputErrorMessage: '请输入正确的 midHash（十六进制格式）'
                    }).then(({ value }) => {
                        locateUserInChart(value.trim());
                    }).catch(() => { /* 用户取消 */ });
                }

                async function updateDispDanmakus(ifchart = false, data = danmakuList.current, subFilt = {}) {
                    loading.value = true;
                    await nextTick();
                    await new Promise(resolve => setTimeout(resolve, 10)); //等待v-loading渲染
                    try {
                        displayedDanmakus.value = data;
                        currentSubFilt.value = subFilt;
                        danmakuCount.value.filtered = danmakuList.current.length;
                        if (ifchart) {
                            for (const chart of chartsVisible.value) {
                                renderChart(chart);
                            }
                        }
                        await nextTick();
                    } catch (err) {
                        console.error(err);
                        ELEMENT_PLUS.ElMessage.error('数据显示错误');
                    } finally {
                        loading.value = false;
                    }
                }
                async function applyActiveSubFilters() {
                    try {
                        let filtered = danmakuList.filtered;
                        const activeFilters = subFiltHistory.value.filter(f => f.enabled && typeof f.filterFn === 'function');
                        for (const filt of activeFilters) {
                            filtered = filt.filterFn(filtered);
                        }
                        danmakuList.current = filtered;
                        await updateDispDanmakus(true);
                    } catch (e) {
                        console.error(e);
                        ELEMENT_PLUS.ElMessage.error('子筛选应用失败');
                    }
                }
                async function commitSubFilter() {
                    try {
                        if (Object.keys(currentSubFilt.value).length) {
                            subFiltHistory.value.push({ ...currentSubFilt.value, enabled: true });
                        }
                        danmakuList.current = [...displayedDanmakus.value];
                        await updateDispDanmakus(true);
                    } catch (e) {
                        console.error(e);
                        ELEMENT_PLUS.ElMessage.error('提交子筛选失败');
                    }
                }
                async function clearSubFilter() {
                    if (currentSubFilt.value.chart) {
                        const chart = currentSubFilt.value.chart;
                        if (typeof charts[chart]?.clearSubFilt === 'function') {
                            charts[chart].clearSubFilt();
                        }
                    }
                    await updateDispDanmakus();
                }

                async function applyFilter() {
                    try {
                        subFiltHistory.value = [];
                        const regex = new RegExp(filterText.value, 'i');
                        danmakuList.filtered = danmakuList.original.filter(d => regex.test(d.content));
                        danmakuList.current = [...danmakuList.filtered];
                        currentFilt.value = regex;
                        await updateDispDanmakus(true);
                    } catch (e) {
                        console.warn(e);
                        alert('无效正则表达式');
                    }
                }
                async function resetFilter() {
                    subFiltHistory.value = [];
                    danmakuList.filtered = [...danmakuList.original];
                    danmakuList.current = [...danmakuList.filtered];
                    currentFilt.value = '';
                    await updateDispDanmakus(true);
                }


                onMounted(async () => {
                    if ((!dataParam?.videoData && !dataParam?.episodeData) || !Array.isArray(dataParam?.danmakuData)) {
                        ELEMENT_PLUS.ElMessageBox.alert(
                            '初始化数据缺失，无法加载弹幕统计面板。请确认主页面传入了有效数据。',
                            '错误',
                            { type: 'error' }
                        );
                        dataParam.danmakuData = [];
                    }
                    if (dataParam.epid && dataParam.episodeData) {
                        let ep = null;
                        let sectionTitle = null;
                        if (Array.isArray(dataParam.episodeData.episodes)) {
                            ep = dataParam.episodeData.episodes.find(e => e.ep_id === dataParam.epid || e.id === dataParam.epid);
                            if (ep) {
                                sectionTitle = ep.show_title;
                            }
                        }
                        if (!ep && Array.isArray(dataParam.episodeData.section)) {
                            for (const section of dataParam.episodeData.section) {
                                ep = section.episodes?.find(e => e.ep_id === dataParam.epid || e.id === dataParam.epid);
                                if (ep) {
                                    sectionTitle = section.title + '：' + ep.show_title;
                                    break;
                                }
                            }
                        }
                        if (ep) {
                            Object.assign(videoData.value, {
                                bvid: ep.bvid,
                                cid: ep.cid,
                                epid: ep.ep_id || ep.id,
                                section_title: sectionTitle,
                                title: ep.share_copy || ep.show_title || ep.long_title || ep.title,
                                duration: ep.duration / 1000,
                                pic: ep.cover,
                                owner: {
                                    mid: dataParam.episodeData.up_info?.mid,
                                    name: dataParam.episodeData.up_info?.uname,
                                    face: dataParam.episodeData.up_info?.avatar
                                },
                                pubdate: ep.pub_time,
                                stat: {
                                    view: ep.stat?.play || dataParam.episodeData.stat.views,
                                    danmaku: ep.stat?.danmakus || dataParam.episodeData.stat.danmakus,
                                    reply: ep.stat?.reply || dataParam.episodeData.stat.reply,
                                    coin: ep.stat?.coin || dataParam.episodeData.stat.coins,
                                    like: ep.stat?.likes || dataParam.episodeData.stat.likes,
                                }
                            });
                        }
                    }
                    if (videoData.value?.pic?.startsWith('http:')) {
                        videoData.value.pic = videoData.value.pic.replace(/^http:/, 'https:');
                    }
                    if (videoData.value?.owner?.face?.startsWith('http:')) {
                        videoData.value.owner.face = videoData.value.owner.face.replace(/^http:/, 'https:');
                    }
                    if (videoData.value.pages) {
                        if (!isNaN(dataParam.p) && videoData.value.pages[dataParam.p - 1]) {
                            videoData.value.page_cur = videoData.value.pages[dataParam.p - 1];
                            videoData.value.duration = videoData.value.page_cur.duration;
                        } else if (videoData.value.pages[0]) {
                            videoData.value.duration = videoData.value.pages[0].duration;
                        }
                    }
                    danmakuList.original = [...dataParam.danmakuData].sort((a, b) => a.progress - b.progress);
                    danmakuList.filtered = [...danmakuList.original];
                    danmakuList.current = [...danmakuList.filtered];
                    danmakuCount.value.origin = danmakuList.original.length;
                    await updateDispDanmakus(true);

                    window.addCustomChart = function (chartName, chartDef) {
                        if (!chartName || typeof chartDef !== 'object') {
                            console.warn('chartName 必须为字符串，chartDef 必须为对象');
                            return;
                        }
                        if (charts[chartName]) {
                            console.warn(`图表 "${chartName}" 已存在`);
                            return;
                        }
                        charts[chartName] = {
                            instance: null,
                            ...chartDef
                        };
                        chartsVisible.value.push(chartName);
                        if ('expandedH' in charts[chartName]) {
                            chartsExpandable.value.push(chartName);
                        }
                        nextTick(() => {
                            renderChart(chartName);
                        });
                        console.log(`✅ 已添加图表 "${chartName}"，请在界面查看`);
                    };
                });
                return {
                    h,
                    displayedDanmakus,
                    filterText,
                    applyFilter,
                    resetFilter,
                    videoData,
                    danmakuCount,
                    currentFilt,
                    currentSubFilt,
                    subFiltHistory,
                    loading,
                    isTableVisible,
                    isTableAutoH,
                    panelInfo,
                    chartsVisible,
                    chartsExpandable,
                    chartHover,
                    expandChart,
                    moveChartUp,
                    moveChartDown,
                    moveChartOut,
                    midHashOnClick,
                    handleRowClick,
                    promptLocateUser,
                    clearSubFilter,
                    commitSubFilter,
                    applyActiveSubFilters,
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
                    第 {{ videoData.page_cur.page }} P：{{ videoData.page_cur.part }}
                </el-tag>
                <el-tag type="success" v-if="videoData.section_title">
                    {{ videoData.section_title }}
                </el-tag>

                <p style="margin: 10px;">
                    <template v-if="videoData.epid">
                        EPID：
                        <el-link v-if="videoData.epid"
                            :href="'https://www.bilibili.com/bangumi/play/ep' + videoData.epid" target="_blank"
                            type="primary" style="vertical-align: baseline;">
                            ep{{ videoData.epid }}
                        </el-link><br />
                    </template>
                    <template v-else>
                        BVID：
                        <el-link v-if="videoData.bvid" :href="'https://www.bilibili.com/video/' + videoData.bvid"
                            target="_blank" type="primary" style="vertical-align: baseline;">
                            {{ videoData.bvid }}
                        </el-link><br />
                    </template>
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
                        {{ danmakuCount.origin }}
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
                        筛选：
                        <el-tag type="info" size="small" style="vertical-align: baseline;">{{ currentFilt }}</el-tag>
                        <br />
                    </template>
                    <template v-if="subFiltHistory.length" style="margin-top: 10px;">
                        <span v-for="(item, idx) in subFiltHistory" :key="idx" style="margin-right: 6px;">
                            <el-checkbox v-model="item.enabled" style="margin-right: 4px;"
                                @change="applyActiveSubFilters" />
                            <component :is="item.labelVNode(h)" />
                            <el-tag type="info" size="small" effect="light" round
                                style="margin-left: 4px; vertical-align: baseline; cursor: pointer; aspect-ratio: 1/1; padding: 0;"
                                @click="() => { subFiltHistory.splice(idx, 1); applyActiveSubFilters(); }"
                                title="清除历史子筛选">
                                ×
                            </el-tag><br />
                        </span>
                    </template>
                    结果：共有 {{ danmakuCount.filtered }} 条弹幕<br />
                    <template v-if="currentSubFilt.labelVNode">
                        <component :is="currentSubFilt.labelVNode(h)" />
                        弹幕共 {{ displayedDanmakus.length }} 条
                        <el-tag type="info" size="small" effect="light" round
                            style="margin-left: 4px; vertical-align: baseline; cursor: pointer; aspect-ratio: 1/1; padding: 0;"
                            @click="clearSubFilter" title="清除子筛选">
                            ×
                        </el-tag>
                        <el-tag type="success" size="small" effect="light" round
                            style="margin-left: 4px; vertical-align: baseline; cursor: pointer; aspect-ratio: 1/1; padding: 0;"
                            @click="commitSubFilter" title="提交子筛选结果作为新的数据源">
                            ✔
                        </el-tag>


                    </template>
                </p>
            </div>

            <div id="wrapper-table" :style="isTableAutoH ? '' : 'height: 100%; display: flex; flex-direction: column;'">
                <div @click="isTableVisible = !isTableVisible" style="
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  padding: 6px 10px;
                  border-top-left-radius: 6px;
                  border-top-right-radius: 6px;
                  background-color: #fafafa;
                  transition: background-color 0.2s ease;
                  user-select: none;
                ">
                    <span style="flex: 1; font-size: 14px; color: #333;">
                        弹幕列表
                    </span>
                    <el-popover placement="bottom" width="160" trigger="click">
                        <template v-slot:reference>
                            <el-button text style="margin-right: 20px;" circle @click.stop />
                        </template>
                        <div style="padding: 4px 8px;">
                            <el-switch v-model="isTableAutoH" active-text="自动高度" inactive-text="有限高度" />
                        </div>
                    </el-popover>
                    <span style="font-size: 12px; color: #666;">
                        {{ isTableVisible ? '▲ 收起' : '▼ 展开' }}
                    </span>
                </div>
                <el-collapse-transition>
                    <el-table :data="displayedDanmakus" v-show="isTableVisible" @row-click="handleRowClick" border>
                        <el-table-column prop="progress" label="时间" width="80">
                            <template #default="{ row }">{{ formatProgress(row.progress) }}</template>
                        </el-table-column>
                        <el-table-column prop="content" label="弹幕内容">
                            <template #default="{ row }">
                                <el-tooltip class="item" placement="top-start"
                                    :content="'发送用户: ' + row.midHash + '\\n屏蔽等级: ' + row.weight">
                                    <span>{{ row.content }}</span>
                                </el-tooltip>
                            </template>
                        </el-table-column>
                        <el-table-column prop="ctime" label="发送时间" width="160">
                            <template #default="{ row }">{{ formatCtime(row.ctime) }}</template>
                        </el-table-column>
                    </el-table>
                </el-collapse-transition>
            </div>
        </div>
    </el-aside>

    <el-container>
        <el-header style="
        height: auto; 
        padding: 10px;
        box-shadow: 2px 2px 2px rgba(0, 0, 0, 0.05);
        border-bottom: 1px solid #ddd;">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 5px;">
                <el-input v-model="filterText" placeholder="请输入正则表达式"
                    style="flex: 1 1 200px; min-width: 150px;"></el-input>
                <span></span>
                <template v-if="displayedDanmakus.length == danmakuCount.origin">
                    <el-button @click="applyFilter" type="warning">筛选</el-button>
                    <span></span>
                    <el-button @click="resetFilter">取消筛选</el-button>
                </template>
                <template v-else>
                    <el-button @click="applyFilter">筛选</el-button>
                    <span></span>
                    <el-button @click="resetFilter" type="warning">取消筛选</el-button>
                </template>
                <span></span>
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
                <span></span>
                <el-button @click="panelInfo.newPanel(panelInfo.type)" title="新标签页打开统计面板" circle
                    v-if="panelInfo.type == 0">
                    <svg t="1746238142181" class="icon" viewBox="0 0 1024 1024" version="1.1"
                        xmlns="http://www.w3.org/2000/svg" p-id="3091" width="16" height="16">
                        <path
                            d="M409.6 921.728H116.928a58.56 58.56 0 0 1-58.56-58.496V263.296H936.32v58.56a29.248 29.248 0 1 0 58.496 0V87.744C994.752 39.296 955.392 0 906.944 0H87.68C39.296 0 0 39.296 0 87.744v804.736a87.68 87.68 0 0 0 87.744 87.68H409.6a29.248 29.248 0 0 0 0-58.432zM58.432 116.992c0-32.32 26.24-58.496 58.56-58.496h760.64c32.32 0 58.56 26.24 58.56 58.496V204.8H58.496V116.992z m936.256 321.792h-351.104a29.312 29.312 0 0 0 0 58.56h277.312c-2.176 1.28-4.48 2.304-6.4 4.096L484.736 967.68a29.184 29.184 0 0 0 0 41.344c11.52 11.456 29.888 11.52 41.344 0l430.08-466.112a87.04 87.04 0 0 0 9.408-10.624V819.2a29.248 29.248 0 0 0 58.496 0V468.16a29.376 29.376 0 0 0-29.248-29.376z"
                            fill="#409eff" p-id="3092"></path>
                    </svg>
                </el-button>
                <el-button @click="panelInfo.newPanel(panelInfo.type)" title="下载统计面板" circle v-else>
                    <svg t="1746264728781" class="icon" viewBox="0 0 1024 1024" version="1.1"
                        xmlns="http://www.w3.org/2000/svg" p-id="2669" width="16" height="16">
                        <path
                            d="M896 361.408V60.224H64v843.328h384V960H64c-35.328 0-64-23.232-64-56.448V60.16C0 26.944 28.672 0 64 0h832c35.328 0 64 26.944 64 60.224v301.184c0 33.28-28.672 60.224-64 60.224v-60.16z m-125.696 213.12L832 576l-0.064 306.752 99.968-99.84 45.248 45.184L845.248 960l3.84 3.84-45.184 45.312-3.904-3.904-3.84 3.84-45.312-45.184 3.904-3.904-131.84-131.84 45.184-45.312 100.352 100.352 1.856-308.608z"
                            fill="#409eff" p-id="2670"></path>
                        <path d="M64 256h896v64H64z" fill="#409eff" p-id="2671"></path>
                    </svg>
                </el-button>
            </div>
        </el-header>
        <el-main style="overflow-y: auto;">
            <div id="wrapper-chart" style="min-width: 400px;">
                <div v-for="(chart, index) in chartsVisible" :key="chart" :style="{
                  position: 'relative',
                  marginBottom: index < chartsVisible.length - 1 ? '20px' : '0'
                }" @mouseenter="chartHover = chart" @mouseleave="chartHover = null">
                    <!-- 控制按钮 -->
                    <div v-if="chartHover === chart" :style="{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      display: 'flex',
                      gap: '3px',
                      opacity: 1,
                      zIndex: 10,
                      transition: 'opacity 0.2s'
                    }">
                        <el-button v-if="chart === 'user'" size="small" circle @click="promptLocateUser" :style="{
                      backgroundColor: 'rgba(128,128,128,0.4)',
                      color: 'white',
                      fontWeight: 'bold'
                    }">
                            ⚲
                        </el-button>
                        <span></span>
                        <template v-if="chartsExpandable.includes(chart)">
                            <el-button size="small" circle @click="expandChart(chart)" :style="{
                      backgroundColor: 'rgba(128,128,128,0.4)',
                      color: 'white',
                      fontWeight: 'bold'
                    }">
                                ⇕
                            </el-button>
                            <span></span>
                        </template>
                        <el-button size="small" circle @click="moveChartUp(chart)" :style="{
                      backgroundColor: 'rgba(128,128,128,0.4)',
                      color: 'white',
                      fontWeight: 'bold'
                    }">
                            ▲
                        </el-button>
                        <span></span>
                        <el-button size="small" circle @click="moveChartDown(chart)" :style="{
                      backgroundColor: 'rgba(128,128,128,0.4)',
                      color: 'white',
                      fontWeight: 'bold'
                    }">
                            ▼
                        </el-button>
                        <span></span>
                        <el-button size="small" circle @click="moveChartOut(chart)" :style="{
                      backgroundColor: 'rgba(128,128,128,0.4)',
                      color: 'white',
                      fontWeight: 'bold'
                    }">
                            ⨉
                        </el-button>

                    </div>
                    <!-- 图表容器 -->
                    <div :id="'chart-' + chart" style="height: 50%;"></div>
                </div>
            </div>
        </el-main>
    </el-container>
</el-container>
`
        });
        app.use(ELEMENT_PLUS);
        app.mount('#danmaku-app');
    }
    // iframe里初始化用户面板应用
    async function initUserIframeApp(iframe, userData) {
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

        const appRoot = doc.createElement('div');
        appRoot.id = 'user-space-app';
        doc.body.style.margin = '0';
        doc.body.appendChild(appRoot);

        const { createApp, ref, onMounted, computed } = win.Vue;
        const ELEMENT_PLUS = win.ElementPlus;
        const app = createApp({
            setup() {
                const converter = new BiliMidHashConverter();
                const card = ref(userData.card || {});
                const stats = ref(userData || {});

                const officialRoleMap = {
                    0: '无',
                    1: '个人认证 - 知名UP主',
                    2: '个人认证 - 大V达人',
                    3: '机构认证 - 企业',
                    4: '机构认证 - 组织',
                    5: '机构认证 - 媒体',
                    6: '机构认证 - 政府',
                    7: '个人认证 - 高能主播',
                    9: '个人认证 - 社会知名人士'
                };
                const officialInfo = computed(() => {
                    const o = card.value?.Official;
                    if (!o || o.type === -1) return null;
                    return {
                        typeText: officialRoleMap[o.role] || '未知认证',
                        title: o.title || '（无标题）',
                        desc: o.desc || ''
                    };
                });
                function copyToClipboard(text) {
                    navigator.clipboard.writeText(text).then(() => {
                        ELEMENT_PLUS.ElMessage.success('midHash 已复制到剪贴板');
                    }).catch(() => {
                        ELEMENT_PLUS.ElMessage.error('复制失败');
                    });
                }
                onMounted(async () => {
                    card.value.midHash = converter.midToHash(card.value.mid || '')
                });
                return {
                    card,
                    stats,
                    officialInfo,
                    copyToClipboard
                };
            },
            template: `
<div style="padding: 20px; font-family: sans-serif;">
    <el-card>
        <div style="display: flex; gap: 20px;">
            <!-- 头像 -->
            <a :href="card.face" target="_blank" title="点击查看头像原图">
                <el-avatar :size="100" :src="card.face" />
            </a>

            <!-- 用户信息 -->
            <div style="flex: 1;">
                <h2 style="margin: 0;">
                    {{ card.name }}
                    <el-tag v-if="card.sex !== '保密'" size="small" style="margin-left: 10px;">{{ card.sex }}</el-tag>
                    <el-tag v-if="card.level_info" type="success" size="small">
                        LV{{ card.level_info.current_level }}
                    </el-tag>
                    <el-tag v-if="card.vip?.vipStatus === 1" type="warning" size="small">
                        大会员
                    </el-tag>
                </h2>

                <!-- 签名 -->
                <el-text type="info" size="small" style="margin: 4px 0; display: block;">
                    {{ card.sign || '这位用户很神秘，什么都没写。' }}
                </el-text>

                <!-- MID & midHash -->
                <p>
                    <b>MID：</b>
                    <el-link :href="'https://space.bilibili.com/' + card.mid" target="_blank" type="primary"
                        style="vertical-align: baseline;">
                        {{ card.mid }}
                    </el-link>
                    <el-tooltip content="复制midHash" placement="top">
                        <el-tag size="small"
                            style="margin-left: 6px; vertical-align: baseline; cursor: pointer; background-color: #f5f7fa; color: #909399;"
                            @click="copyToClipboard(card.midHash)">
                            Hash: {{ card.midHash }}
                        </el-tag>
                    </el-tooltip>
                </p>

                <!-- 认证信息 -->
                <p v-if="officialInfo">
                    <b>认证：</b>
                    <el-tag size="small" style="margin-right: 8px; vertical-align: baseline;">
                        {{ officialInfo.typeText }}
                    </el-tag>
                    <span>{{ officialInfo.title }}</span>
                    <el-text type="info" size="small" v-if="officialInfo.desc" style="margin-left: 6px;">
                        （{{ officialInfo.desc }}）
                    </el-text>
                </p>

                <!-- 勋章 -->
                <p v-if="card.nameplate?.name">
                    <b>勋章：</b>
                    <a :href="card.nameplate.image" target="_blank" title="点击查看大图">
                        <el-tag size="small" style="vertical-align: baseline;">
                            {{ card.nameplate.name }}
                        </el-tag>
                    </a>
                    <el-text type="info" size="small" style="margin-left: 6px;">
                        {{ card.nameplate.level }} - {{ card.nameplate.condition }}
                    </el-text>
                </p>

                <!-- 挂件 -->
                <p v-if="card.pendant?.name && card.pendant?.image">
                    <b>挂件：</b>
                    <a :href="card.pendant.image" target="_blank" title="点击查看大图">
                        <el-tag size="small" style="vertical-align: baseline;">{{ card.pendant.name }}</el-tag>
                    </a>
                </p>
            </div>
        </div>

        <!-- 指标数据 -->
        <el-divider></el-divider>
        <el-row :gutter="20" justify="space-between">
            <el-col :span="6">
                <el-statistic title="关注数" :value="card.friend" />
            </el-col>
            <el-col :span="6">
                <el-statistic title="粉丝数" :value="stats.follower" />
            </el-col>
            <el-col :span="6">
                <el-statistic title="获赞数" :value="stats.like_num" />
            </el-col>
            <el-col :span="6">
                <el-statistic title="稿件数" :value="stats.archive_count" />
            </el-col>
        </el-row>
    </el-card>
</div>
`
        });
        app.use(win.ElementPlus);
        app.mount('#user-space-app');
    }
    // B站mid与hash转换
    class BiliMidHashConverter {
        constructor() {
            this.crcTable = this._createCRCTable();
        }
        _createCRCTable() {
            const table = new Array(256);
            const CRCPOLYNOMIAL = 0xEDB88320;
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
                table[i] = crcreg;
            }
            return table;
        }

        /**
         * mid → hash（用于弹幕中 midHash 显示）
         */
        midToHash(mid) {
            let crc = 0xFFFFFFFF;
            const input = mid.toString();
            for (let i = 0; i < input.length; i++) {
                const byte = input.charCodeAt(i);
                crc = (crc >>> 8) ^ this.crcTable[(crc ^ byte) & 0xFF];
            }
            return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16);
        }

        /**
         * 尝试通过 midHash 反查 mid（暴力逆向）
         * 若失败返回 -1
         * @param {string} hashStr 16进制字符串（如 '6c2b67a9'）
         * @param {number} maxTry 最大尝试次数（默认一亿）
         */
        hashToMid(hashStr, maxTry = 100_000_000) {
            var index = new Array(4);

            var ht = parseInt('0x' + hashStr) ^ 0xffffffff,
                snum, i, lastindex, deepCheckData;
            for (i = 3; i >= 0; i--) {
                index[3 - i] = this._getCRCIndex(ht >>> (i * 8));
                snum = this.crcTable[index[3 - i]];
                ht ^= snum >>> ((3 - i) * 8);
            }
            for (i = 0; i < maxTry; i++) {
                lastindex = this._crc32LastIndex(i);
                if (lastindex == index[3]) {
                    deepCheckData = this._deepCheck(i, index)
                    if (deepCheckData[0])
                        break;
                }
            }

            if (i == 100000000)
                return -1;
            return i + '' + deepCheckData[1];
        }
        _crc32(input) {
            if (typeof (input) != 'string')
                input = input.toString();
            var crcstart = 0xFFFFFFFF, len = input.length, index;
            for (var i = 0; i < len; ++i) {
                index = (crcstart ^ input.charCodeAt(i)) & 0xff;
                crcstart = (crcstart >>> 8) ^ this.crcTable[index];
            }
            return crcstart;
        }
        _crc32LastIndex(input) {
            if (typeof (input) != 'string')
                input = input.toString();
            var crcstart = 0xFFFFFFFF, len = input.length, index;
            for (var i = 0; i < len; ++i) {
                index = (crcstart ^ input.charCodeAt(i)) & 0xff;
                crcstart = (crcstart >>> 8) ^ this.crcTable[index];
            }
            return index;
        }
        _getCRCIndex(t) {
            //if(t>0)
            //t-=256;
            for (var i = 0; i < 256; i++) {
                if (this.crcTable[i] >>> 24 == t)
                    return i;
            }
            return -1;
        }
        _deepCheck(i, index) {
            var tc = 0x00, str = '',
                hash = this._crc32(i);
            tc = hash & 0xff ^ index[2];
            if (!(tc <= 57 && tc >= 48))
                return [0];
            str += tc - 48;
            hash = this.crcTable[index[2]] ^ (hash >>> 8);
            tc = hash & 0xff ^ index[1];
            if (!(tc <= 57 && tc >= 48))
                return [0];
            str += tc - 48;
            hash = this.crcTable[index[1]] ^ (hash >>> 8);
            tc = hash & 0xff ^ index[0];
            if (!(tc <= 57 && tc >= 48))
                return [0];
            str += tc - 48;
            hash = this.crcTable[index[0]] ^ (hash >>> 8);
            return [1, str];
        }
    }
    // 获取数据
    class BiliDanmakuUtils {
        constructor() {
            this.bvid = null;
            this.p = null;
            this.epid = null;
            this.type = null;
            this.cid = null;
            this.videoData = null;
            this.episodeData = null;
            this.danmakuData = null;
            this.danmakuXmlText = null;
            this.logStyle = {
                tag: 'Danmaku Statistic',
                style: 'background: #00a2d8; color: white; padding: 2px 6px; border-radius: 3px;',
                errorStyle: 'background: #ff4d4f; color: white; padding: 2px 6px; border-radius: 3px;'
            };
        }
        logTag(...args) {
            console.log(`%c${this.logStyle.tag}`, this.logStyle.style, ...args);
        }
        logTagError(...args) {
            console.error(`%c${this.logStyle.tag}`, this.logStyle.errorStyle, ...args);
        }
        parseDanmakuXml(xmlText) {
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
                    pool: parseInt(parts[5]),
                    midHash: parts[6],
                    dmid: parts[7],
                    weight: parseInt(parts[8]),
                    content: d.textContent.trim()
                });
            }
            this.logTag(`解析弹幕xml文本完成，共 ${danmakus.length} 条弹幕`);
            return danmakus;
        }
        parseBiliUrl(url) {
            this.bvid = null;
            this.p = null;
            this.epid = null;
            const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
            if (bvidMatch) this.bvid = bvidMatch[0];
            if (this.bvid) {
                const pMatch = url.match(/[?&]p=(\d+)/);
                if (pMatch) {
                    const parsedP = parseInt(pMatch[1], 10);
                    if (!isNaN(parsedP) && parsedP >= 1) {
                        this.p = parsedP;
                    }
                }
                if (this.p) {
                    this.logTag(`解析 URL 得到 BVID=${this.bvid}, 分页p=${this.p}`);
                } else {
                    this.logTag(`解析 URL 得到 BVID=${this.bvid}`);
                }
            } else {
                const epidMatch = url.match(/ep(\d+)/);
                if (epidMatch) {
                    this.epid = parseInt(epidMatch[1]);
                } else {
                    this.logTagError(`URL=${url} 解析未找到 ID 信息`);
                }
            }
        }
        _findCid() {
            if (this.bvid) {
                this.cid = this.videoData.pages[this.p - 1]?.cid || this.videoData.cid;
                return this.cid
            }
            if (this.epid) {
                if (Array.isArray(this.episodeData.episodes)) {
                    const ep = this.episodeData.episodes.find(e => e.ep_id === this.epid || e.id === this.epid);
                    if (ep) {
                        this.cid = ep.cid;
                        return this.cid
                    }
                }
                if (Array.isArray(this.episodeData.section)) {
                    for (const section of this.episodeData.section) {
                        const ep = section.episodes?.find(e => e.ep_id === this.epid || e.id === this.epid);
                        if (ep) {
                            this.cid = ep.cid;
                            return this.cid
                        }
                    }
                }
            }
        }
        async getVideoData() {
            if (!this.bvid) return null;
            try {
                const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${this.bvid}`);
                const json = await res.json();
                if (json && json.data) {
                    this.videoData = json.data;
                    this.logTag('获取视频信息成功');
                    return this.videoData;
                }
                else throw new Error(`视频信息接口请求失败，json：${json}`);
            } catch (e) {
                this.logTagError('请求视频信息失败:', e);
                return null;
            }
        }
        async getEpisodeData() {
            if (!this.epid) return null;
            try {
                const res = await fetch(`https://api.bilibili.com/pgc/view/web/season?ep_id=${this.epid}`);
                const json = await res.json();
                if (json && json.result) {
                    this.episodeData = json.result;
                    this.logTag('获取剧集信息成功');
                    return this.episodeData;
                }
                else throw new Error(`剧集信息接口请求失败，json：${json}`);
            } catch (e) {
                this.logTagError('请求剧集信息失败:', e);
                return null;
            }
        }
        async getDanmakuData() {
            try {
                this._findCid();
                if (!this.cid) throw new Error('ChatID 缺失');

                const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${this.cid}`);
                if (!res.ok) throw new Error(`弹幕接口请求失败，状态码：${res.status}`);

                this.danmakuXmlText = await res.text();
                this.danmakuData = this.parseDanmakuXml(this.danmakuXmlText);
                this.logTag('获取弹幕数据成功');
                return this.danmakuData;
            } catch (err) {
                this.logTagError('获取弹幕数据失败:', err);
                return null;
            }
        }
        async fetchAllData(url) {
            this.parseBiliUrl(url);
            await this.getVideoData();
            await this.getEpisodeData();
            await this.getDanmakuData();
            return {
                videoData: this.videoData,
                danmakuData: this.danmakuData
            };
        }
        async getUserCardData(mid) {
            try {
                const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=true`);
                const json = await res.json();
                if (json.code === 0) {
                    this.logTag(`获取用户名片成功：${mid}`);
                    return json.data;
                } else {
                    throw new Error(json.message || '获取用户信息失败');
                }
            } catch (e) {
                this.logTagError('请求用户信息失败:', e);
                return { card: { mid } };
            }
        }
    }
    const dmUtils = new BiliDanmakuUtils();

    // 插入按钮
    function insertButton() {
        const btn = document.createElement('div');
        btn.id = 'danmaku-stat-btn';
        btn.innerHTML = `
        <span style="margin-left: 20px; white-space: nowrap; color: #00ace5; user-select: none;">弹幕统计</span>
        <div style="display: flex; align-items: center; justify-content: center; margin-right: 8px; flex-shrink: 0;">
          <svg t="1745985333201" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1486" 
          width="24" height="24">
            <path d="M691.2 928.2V543.1c0-32.7 26.5-59.3 59.2-59.3h118.5c32.7 0 59.3 26.5 59.3 59.2V928.2h-237z m192.6-385.1c0-8.2-6.6-14.8-14.8-14.8H750.5c-8.2 0-14.8 6.6-14.9 14.7v340.8h148.2V543.1zM395 157.8c-0.1-32.6 26.3-59.2 58.9-59.3h118.8c32.6 0 59.1 26.5 59.1 59.1v770.6H395V157.8z m44.4 725.9h148V157.9c0-8.1-6.5-14.7-14.7-14.8H454.1c-8.1 0.1-14.7 6.7-14.7 14.8v725.8zM98.6 394.9c0-32.7 26.5-59.2 59.2-59.3h118.5c32.7-0.1 59.3 26.4 59.3 59.1v533.5h-237V394.9z m44.5 488.8h148.2V394.9c0-8.2-6.7-14.8-14.8-14.8H158c-8.2 0-14.8 6.6-14.9 14.7v488.9z" p-id="1487" fill="#00ace5"></path>
          </svg>
        </div>
      `;
        Object.assign(btn.style, {
            position: 'fixed',
            left: '-100px',
            bottom: '40px',
            zIndex: '9997',
            width: '120px',
            height: '40px',
            backgroundColor: 'transparent',
            color: '#00ace5',
            borderTopRightRadius: '20px',
            borderBottomRightRadius: '20px',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 0 5px rgba(0, 172, 229, 0.3)',
            transition: 'left 0.3s ease-in-out, background-color 0.2s ease-in-out',
        });
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
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 9998;
        `;
        overlay.onclick = () => {
            document.getElementById('danmaku-stat-iframe')?.remove();
            overlay.remove();
        };
        document.body.appendChild(overlay);

        // 创建iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'danmaku-stat-iframe';
        iframe.style.cssText = `
            position: fixed;
            top: 15%; left: 15%; width: 70%; height: 70%;
            background-color: #fff;
            z-index: 9999;
            padding: 20px;
            overflow: hidden;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        `;

        const match = location.href.match(/^https:\/\/space\.bilibili\.com\/(\d+)/);
        const isUserPage = !!match;
        iframe.onload = async () => {
            try {
                if (isUserPage) {
                    const mid = match[1];
                    const userData = await dmUtils.getUserCardData(mid);
                    await initUserIframeApp(iframe, userData);
                } else {
                    await dmUtils.fetchAllData(location.href);
                    await initIframeApp(iframe, dmUtils, {
                        type: 0, newPanel: function (type) {
                            if (type == 0) {
                                openPanelInNewTab();
                                dmUtils.logTag('[主页面] 新建子页面');
                            }
                        }
                    });
                }
            } catch (err) {
                dmUtils.logTagError('初始化失败:', err);
                alert(`面板加载失败：${err.message}`);
            }
        };
        document.body.appendChild(iframe);
    }
    // 打开新标签页弹幕统计面板
    function openPanelInNewTab() {
        let bTitle = 'Bilibili';
        if (dmUtils.bvid) bTitle = dmUtils.bvid;
        else if (dmUtils.epid) bTitle = 'ep' + dmUtils.epid;
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="zh">
        <head>
        <meta charset="UTF-8">
        <title>${bTitle} 弹幕统计</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            html, body {
                margin: 0;
                padding: 0;
            }
        </style>
        </head>
        <body>
        <script>
            ${initIframeApp.toString()}
            ${BiliDanmakuUtils.toString()}
            ${BiliMidHashConverter.toString()}
            const dmUtils = new BiliDanmakuUtils();
            window.addEventListener('message', function(event) {
                Object.assign(dmUtils, event.data);
                if (!dmUtils.danmakuData) {
                    dmUtils.logTagError('数据获取失败');
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
        let bTitle = 'Bilibili';
        if (dmUtils.bvid) bTitle = dmUtils.bvid;
        else if (dmUtils.epid) bTitle = 'ep' + dmUtils.epid;
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="zh">
        <head>
        <meta charset="UTF-8">
        <title>${bTitle} 弹幕统计</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            html, body {
                margin: 0;
                padding: 0;
            }
        </style>
        </head>
        <body>
        <script>
            ${initIframeApp.toString()}
            ${BiliDanmakuUtils.toString()}
            ${BiliMidHashConverter.toString()}
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
        link.download = `${bTitle}_danmaku_statistics.html`;
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
