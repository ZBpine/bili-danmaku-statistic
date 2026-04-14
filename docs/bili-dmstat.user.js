// ==UserScript==
// @name         bilibili 视频弹幕统计|下载|查询发送者
// @namespace    https://github.com/ZBpine/bili-danmaku-statistic
// @version      2.1.4
// @description  获取B站弹幕数据，并生成统计页面。
// @author       ZBpine
// @icon         https://www.bilibili.com/favicon.ico
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/watchlater*
// @match        https://www.bilibili.com/bangumi/play/ep*
// @match        https://space.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.bilibili.com
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(async () => {
    'use strict';

    const consoleColor = {
        log: 'background: #01a1d6;',
        error: 'background: #d63601;',
        warn: 'background: #d6a001;',
    };
    const console = new Proxy(window.console, {
        get(target, prop) {
            const original = target[prop];
            if (typeof original === 'function' && (prop === 'log' || prop === 'error' || prop === 'warn')) {
                return (...args) => original.call(target, '%cDanmaku Statistic', consoleColor[prop] +
                    ' color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', ...args);
            }
            return original;
        }
    });
    class ResourceLoader {
        constructor(doc = document) {
            this.doc = doc;
        }
        addEl(tag, attrs = {}, parent = this.doc.head) {
            const el = this.doc.createElement(tag);
            Object.assign(el, attrs);
            parent.appendChild(el);
            return el;
        }
        addScript(src) { return new Promise(resolve => { this.addEl('script', { src, onload: resolve }); }); }
        addCss(href) { return new Promise(resolve => { this.addEl('link', { rel: 'stylesheet', href, onload: resolve }); }); }
        addStyle(cssText) { this.addEl('style', { textContent: cssText }); }
    }
    // iframe里初始化统计面板应用
    async function initIframeApp(iframe, dataMgr, panelInfoParam) {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;

        // 引入外部库
        const loader = new ResourceLoader(doc);
        await Promise.all([
            loader.addCss(cdnUrl + '/npm/element-plus@2.11.4/dist/index.css'),
            loader.addScript(cdnUrl + '/npm/vue@3.3.4/dist/vue.global.prod.js'),
            loader.addScript(cdnUrl + '/npm/echarts@5')
        ]);
        await Promise.all([
            loader.addScript(cdnUrl + '/npm/element-plus@2.11.4/dist/index.full.min.js'),
            loader.addScript(cdnUrl + '/npm/@element-plus/icons-vue/dist/index.iife.min.js'),
            loader.addScript(cdnUrl + '/npm/echarts-wordcloud@2/dist/echarts-wordcloud.min.js'),
            loader.addScript(cdnUrl + '/npm/html2canvas@1.4.1/dist/html2canvas.min.js'),
            loader.addScript(cdnUrl + '/npm/dom-to-image-more@3.5.0/dist/dom-to-image-more.min.js')
        ]);
        const [createVideoInfoPanel, createDanmukuTable] = await Promise.all([
            import(statPath + 'docs/VideoInfoPanel.js'),
            import(statPath + 'docs/DanmukuTable.js')
        ]).then(([v, d]) => [v.default, d.default]);

        const VideoInfoPanel = createVideoInfoPanel(win.Vue, win.ElementPlus);
        const DanmukuTable = createDanmukuTable(win.Vue, win.ElementPlus);

        // 创建挂载点
        const appRoot = doc.createElement('div');
        appRoot.id = 'danmaku-app';
        doc.body.style.margin = '0';
        doc.body.appendChild(appRoot);

        // 挂载Vue
        const { createApp, ref, reactive, toRaw, onMounted, nextTick, h, computed } = win.Vue;
        const ELEMENT_PLUS = win.ElementPlus;
        const ECHARTS = win.echarts;
        const ICONS = win.ElementPlusIconsVue;
        const app = createApp({
            setup() {
                ['Setting', 'Plus', 'Delete', 'Download', 'InfoFilled'].forEach(key => {
                    app.component('ElIcon' + key, ICONS[key]);
                });
                app.component('VideoInfoPanel', VideoInfoPanel);
                app.component('DanmukuTable', DanmukuTable);
                app.component('ActionTag', {
                    props: { type: { type: String, default: 'info' }, title: String, onClick: Function },
                    setup(props, { slots }) {
                        return () =>
                            h(win.ElementPlus.ElTag, {
                                type: props.type, size: 'small', effect: 'light', round: true, title: props.title,
                                style: {
                                    marginLeft: '4px', verticalAlign: 'baseline', cursor: 'pointer', aspectRatio: '1/1', padding: '0'
                                },
                                onClick: props.onClick
                            }, () => slots.default ? slots.default() : '');
                    }
                });

                const converter = new BiliMidHashConverter();
                const excludeFilter = ref(false);
                const filterText = ref('^(哈|呵|h|ha|H|HA|233+)+$');
                const currentFilt = ref('');
                const currentSubFilt = ref({});
                const subFiltHistory = ref([]);
                const danmakuCount = ref({ origin: 0, filtered: 0 });
                const videoInfo = reactive(dataMgr.info || {});
                const commandDms = ref(
                    Array.isArray(dataMgr.data.commandDms)
                        ? dataMgr.data.commandDms.map(cmd => parseCommandDm(cmd))
                        : []
                );
                const isTableVisible = ref(true);
                const isTableAutoH = ref(false);
                const loading = ref(true);
                const panelInfo = ref(panelInfoParam);
                const danmakuTableItems = ref([]);
                const danmukuTableRef = ref(null);
                const danmakuTableMenus = reactive([
                    {
                        getName: (item) => '点赞数：' + (Number.isInteger(item.likes) ?
                            item.likes : panelInfo.value.type === 0 ? "点击获取" : '-'),
                        onSelect: async (item) => {
                            try {
                                const data = await dataMgr.constructor.api.getDanmakuLikes(dataMgr.info.cid, [item.idStr]);
                                item.likes = data[item.idStr]?.likes ?? 0;
                            } catch (e) { console.warn(e); }
                        }
                    }
                ]);
                const danmakuList = {
                    original: [],   //原始
                    filtered: [],   //正则筛选后
                    current: []     //子筛选提交后
                };
                const DmstatStorage = {
                    key: 'dm-stat',
                    getConfig() {
                        return JSON.parse(localStorage.getItem(this.key) || '{}');
                    },
                    setConfig(obj) {
                        localStorage.setItem(this.key, JSON.stringify(obj));
                    },
                    get(key, fallback = undefined) {
                        const config = this.getConfig();
                        return config[key] ?? fallback;
                    },
                    set(key, value) {
                        const config = this.getConfig();
                        config[key] = value;
                        this.setConfig(config);
                    },
                    remove(key) {
                        const config = this.getConfig();
                        delete config[key];
                        this.setConfig(config);
                    },
                    clear() {
                        localStorage.removeItem(this.key);
                    }
                };
                const charts = {
                    user: {
                        title: '用户弹幕统计',
                        instance: null,
                        expandedH: false,
                        actions: [
                            {
                                key: 'locateUser',
                                icon: '⚲',
                                title: '定位用户',
                                method: 'locate'
                            }
                        ],
                        getMenuItems() {
                            return [
                                {
                                    getName: (item) => '发送者：' + item.midHash,
                                    onSelect: (item) => {
                                        const el = this.getElement();
                                        if (!el) return;
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        this.locateInChart(item.midHash);
                                    }
                                }
                            ];
                        },
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
                        async onClick({ params, applySubFilter }) {
                            const selectedUser = params.name;
                            await applySubFilter({
                                value: selectedUser,
                                filterFn: (data) => data.filter(d => d.midHash === selectedUser),
                                filterJudge: d => d.midHash === selectedUser,
                                labelVNode: (h) => h('span', [
                                    '用户',
                                    h(ELEMENT_PLUS.ElLink, {
                                        type: 'primary',
                                        onClick: () => queryMidFromHash(selectedUser),
                                        style: 'vertical-align: baseline;'
                                    }, selectedUser),
                                    '发送'
                                ])
                            });
                        },
                        locateInChart(midHash) {
                            if (!this.instance) return;
                            const option = this.instance.getOption();
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
                            const sc = this.expandedH ? 20 : 8;
                            const scup = this.expandedH ? 9 : 3;
                            if (index >= 0) {
                                this.instance.setOption({
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
                        },
                        locate() {
                            ELEMENT_PLUS.ElMessageBox.prompt('请输入要定位的 midHash 用户 ID：', '定位用户', {
                                confirmButtonText: '定位',
                                cancelButtonText: '取消',
                                inputPattern: /^[a-fA-F0-9]{5,}$/,
                                inputErrorMessage: '请输入正确的 midHash（十六进制格式）'
                            }).then(({ value }) => {
                                this.locateInChart(value.trim());
                            }).catch((err) => {
                                if (err !== 'cancel') {
                                    console.error(err);
                                    ELEMENT_PLUS.ElMessage.error('定位失败');
                                }
                            });
                        }
                    },
                    wordcloud: {
                        title: '弹幕词云',
                        instance: null,
                        expandedH: false,
                        segmentWorker: null,
                        usingSegmentit: false,
                        actions: [
                            {
                                key: 'deepSegment',
                                icon: '📝',
                                title: '使用深度分词',
                                method: 'enableDeepSegment'
                            }
                        ],
                        async enableDeepSegment() {
                            this.usingSegmentit = !this.usingSegmentit;
                            try {
                                loading.value = true;
                                await nextTick();
                                await this.render(danmakuList.current);
                                ELEMENT_PLUS.ElMessage.success('已切换模式');
                            } catch (err) {
                                console.error(err);
                                ELEMENT_PLUS.ElMessage.error('渲染错误');
                            } finally {
                                loading.value = false;
                            }
                        },
                        async initWorker() {
                            if (this.segmentWorker) return;

                            const workerCode = `
var startTime = new Date().getTime();
importScripts('${cdnUrl}/npm/segmentit@2.0.3/dist/umd/segmentit.min.js');
const segmentit = Segmentit.useDefault(new Segmentit.Segment());
console.log('Segmentit初始化耗时：' + (new Date().getTime() - startTime) + 'ms');

function compressRepeats(text, maxRepeat = 3) {
    for (let len = 1; len <= 8; len++) {
        const regex = new RegExp('((.{1,' + len + '}))\\\\1{' + maxRepeat + ',}', 'g');
        text = text.replace(regex, (m, _1, word) => word.repeat(maxRepeat));
    }
    return text;
}
onmessage = function (e) {
    startTime = new Date().getTime();
    const data = e.data;
    const freq = {};
    for (const d of data) {
        if (!d.content || d.content.length < 2) continue;
        const safeContent = compressRepeats(d.content);
        const words = segmentit
            .doSegment(safeContent)
            .map(w => w.w)
            .filter(w => w.length >= 2);

        new Set(words).forEach(word => {
            freq[word] = (freq[word] || 0) + 1;
        });
    }
    const list = Object.entries(freq)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 1000);
    console.log('Segmentit分词耗时：' + (new Date().getTime() - startTime) + 'ms');

    postMessage(list);
};
`;
                            const blob = new Blob([workerCode], { type: 'application/javascript' });
                            this.segmentWorker = new Worker(URL.createObjectURL(blob));
                        },
                        async render(data) {
                            if (!this.usingSegmentit) {
                                const freq = {};
                                data.forEach(d => {
                                    if (!d.content) return;
                                    const words = d.content.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
                                        .split(/\s+/).filter(w => w.length >= 2);
                                    new Set(words).forEach(w => {
                                        freq[w] = (freq[w] || 0) + 1;
                                    });
                                });
                                const list = Object.entries(freq)
                                    .map(([name, value]) => ({ name, value }))
                                    .sort((a, b) => b.value - a.value)
                                    .slice(0, 1000);

                                this.instance.setOption({
                                    title: { text: '弹幕词云' },
                                    tooltip: {},
                                    series: [{
                                        type: 'wordCloud',
                                        data: list,
                                        gridSize: 8,
                                        sizeRange: [12, 40],
                                        rotationRange: [0, 0],
                                        shape: 'circle',
                                    }]
                                });
                                return;
                            }
                            // 深度模式：调用 Worker + Segmentit
                            await this.initWorker();
                            return new Promise((resolve, reject) => {
                                const timeout = setTimeout(() => reject(new Error('词云分词超时')), 30000);
                                this.segmentWorker.onmessage = (e) => {
                                    clearTimeout(timeout);
                                    const list = e.data;
                                    this.instance.setOption({
                                        title: { text: '弹幕词云[深度分词]' },
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
                                    resolve();
                                };
                                this.segmentWorker.onerror = (err) => {
                                    clearTimeout(timeout);
                                    console.error('[词云Worker错误]', err);
                                    reject(err);
                                };
                                this.segmentWorker.postMessage(data);
                            });
                        },
                        async onClick({ params, applySubFilter }) {
                            const keyword = params.name;
                            await applySubFilter({
                                value: keyword,
                                filterFn: (data) => data.filter(d => new RegExp(keyword, 'i').test(d.content)),
                                filterJudge: d => new RegExp(keyword, 'i').test(d.content),
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
                        title: '弹幕密度分布',
                        instance: null,
                        refresh: true,
                        rangeMode: false,
                        clickBuffer: [],
                        actions: [
                            {
                                key: 'addLabel',
                                icon: '📌',
                                title: '添加标记',
                                method: 'setLabel'
                            },
                            {
                                key: 'toggleRange',
                                icon: '🧭',
                                title: '切换范围选择模式',
                                method: 'toggleRangeMode'
                            },
                            {
                                key: 'clearRange',
                                icon: '-',
                                title: '清除范围',
                                method: 'clearSubFilt'
                            }
                        ],
                        labelText: '',
                        labelPosition: ref('end'),
                        setLabel() {
                            const parseTimeText = (text) => {
                                const lines = text.split('\n');
                                const result = [];

                                const timeRegex = /(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?/;

                                for (const line of lines) {
                                    if (!line.trim()) continue;  // 跳过空行

                                    const timeMatch = line.match(timeRegex);
                                    if (timeMatch) {
                                        // 解析时间部分
                                        const part1 = parseInt(timeMatch[1]);
                                        const part2 = parseInt(timeMatch[2]);
                                        const part3 = timeMatch[3] ? parseInt(timeMatch[3]) : null;

                                        // 判断时间格式类型
                                        let totalSeconds;
                                        if (part3 !== null) {  // HH:mm:ss 格式
                                            totalSeconds = part1 * 3600 + part2 * 60 + part3;
                                        } else {  // mm:ss 格式
                                            totalSeconds = part1 * 60 + part2;
                                        }

                                        // 提取标签（移除时间部分）
                                        const label = line.replace(timeMatch[0], '').trim();

                                        result.push({
                                            progress: totalSeconds,
                                            label: label || line  // 保留文本如果标签为空
                                        });
                                    }
                                }

                                return result;
                            }
                            ELEMENT_PLUS.ElMessageBox({
                                title: '设置标记',
                                message: h('div', null, [
                                    h(ELEMENT_PLUS.ElText, { type: 'info' }, '请输入标记时间和文本'),
                                    h('textarea', {
                                        style: {
                                            width: '100%',
                                            minHeight: '120px',
                                            margin: '12px 0px'
                                        },
                                        value: this.labelText,
                                        placeholder: '6:06 示例\n12:12 示例2',
                                        onInput: e => this.labelText = e.target.value,
                                    }),
                                    h('div', null, [
                                        h(ELEMENT_PLUS.ElText, { type: 'info' }, '标记位置：'),
                                        h(ELEMENT_PLUS.ElRadioGroup, {
                                            style: 'vertical-align: top;',
                                            size: 'small',
                                            modelValue: this.labelPosition,
                                            'onUpdate:modelValue': value => this.labelPosition.value = value
                                        }, [
                                            h(ELEMENT_PLUS.ElRadioButton, { label: 'end' }, '顶端'),
                                            h(ELEMENT_PLUS.ElRadioButton, { label: 'insideEnd' }, '内部')
                                        ])
                                    ])
                                ])
                            }).then(() => {
                                const labels = parseTimeText(this.labelText).map(item => ({
                                    name: item.label,
                                    xAxis: item.progress
                                }));
                                this.instance.setOption({
                                    series: [null, {
                                        markLine: {
                                            silent: true,
                                            animation: false,
                                            symbol: 'none',
                                            data: labels,
                                            label: {
                                                position: this.labelPosition.value,
                                                formatter: '{b}' // 使用数据中的name作为标签
                                            }
                                        }
                                    }]
                                });
                            }).catch((err) => {
                                if (err !== 'cancel') {
                                    console.error(err);
                                    ELEMENT_PLUS.ElMessage.error('设置失败');
                                }
                            });
                        },
                        toggleRangeMode() {
                            this.rangeMode = !this.rangeMode;
                            this.clickBuffer = [];
                            this.instance.setOption({
                                title: { text: '弹幕密度分布' + (this.rangeMode ? '[范围模式]' : '') },
                                series: [{
                                    markLine: null,
                                    markArea: null
                                }, null]
                            });
                            ELEMENT_PLUS.ElMessage.success(`已${this.rangeMode ? '进入' : '退出'}范围选择模式`);
                        },
                        render(data) {
                            const duration = videoInfo.duration * 1000; // ms
                            const allowedIntervals = [1, 2, 3, 4, 5, 6, 10, 15, 20, 30];

                            let roughInterval = videoInfo.duration / 60;
                            let zoom = 1000;
                            while (roughInterval > 45) {
                                roughInterval /= 60;
                                zoom *= 60;
                            }
                            const interval = zoom * allowedIntervals.reduce((a, b) =>
                                Math.abs(b - roughInterval) < Math.abs(a - roughInterval) ? b : a
                            );
                            const binCount = Math.ceil(duration / interval);

                            const bins = new Array(binCount).fill(0);
                            data.forEach(d => {
                                const idx = Math.floor((d.progress / duration) * binCount);
                                bins[Math.min(idx, bins.length - 1)]++;
                            });

                            const dataPoints = [];
                            for (let i = 0; i < binCount; i++) {
                                const timeSec = Math.floor(i * interval / 1000);
                                dataPoints.push({
                                    value: [timeSec, bins[i]],
                                    name: formatProgress(timeSec * 1000)
                                });
                            }

                            this.instance.setOption({
                                title: { text: '弹幕密度分布' + (this.rangeMode ? '[范围模式]' : '') },
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
                                    markLine: null,
                                    markArea: null,
                                    data: dataPoints,
                                    type: 'line',
                                    smooth: true,
                                    areaStyle: {}
                                }, null]
                            });
                        },
                        async onClick({ params, applySubFilter }) {
                            const sec = params.value[0];
                            if (!this.rangeMode) {
                                // 默认模式：直接跳转
                                const target = sec * 1000;
                                const table = this.ctx.danmukuTableRef.value;
                                const items = this.ctx.danmakuTableItems.value;
                                if (!items.length) return;
                                const idx = items.reduce((closestIdx, item, i) => {
                                    const currentDiff = Math.abs(item.progress - target);
                                    const closestDiff = Math.abs(items[closestIdx]?.progress - target);
                                    return currentDiff < closestDiff ? i : closestIdx;
                                }, 0);
                                table.scrollToRow(idx);
                                return;
                            }

                            this.clickBuffer.push(sec);
                            // 第一次点击，添加辅助线
                            if (this.clickBuffer.length === 1) {
                                this.instance.setOption({
                                    series: [{
                                        markLine: {
                                            silent: true,
                                            animation: false,
                                            symbol: 'none',
                                            data: [
                                                {
                                                    xAxis: sec,
                                                    lineStyle: {
                                                        color: 'red',
                                                        type: 'dashed'
                                                    },
                                                    label: {
                                                        formatter: `起点：${formatProgress(sec * 1000)}`,
                                                        position: 'end',
                                                        color: 'red'
                                                    }
                                                }
                                            ]
                                        }
                                    }, null]
                                });
                                ELEMENT_PLUS.ElMessage.info('请点击结束时间');
                                return;
                            }

                            // 第二次点击，清除临时标记 + 应用时间范围筛选
                            const [startSec, endSec] = this.clickBuffer.sort((a, b) => a - b);
                            const startMs = startSec * 1000;
                            const endMs = endSec * 1000;
                            this.clickBuffer = [];

                            // 使用 markArea 高亮选中范围
                            this.instance.setOption({
                                series: [{
                                    markLine: null,
                                    markArea: {
                                        silent: true,
                                        itemStyle: {
                                            color: 'rgba(255, 100, 100, 0.2)'
                                        },
                                        data: [
                                            [
                                                { xAxis: startSec },
                                                { xAxis: endSec }
                                            ]
                                        ]
                                    }
                                }, null]
                            });

                            await applySubFilter({
                                value: `${formatProgress(startMs)} ~ ${formatProgress(endMs)}`,
                                filterFn: (data) => data.filter(d => d.progress >= startMs && d.progress <= endMs),
                                filterJudge: d => d.progress >= startMs && d.progress <= endMs,
                                labelVNode: (h) => h('span', [
                                    '时间段：',
                                    h(ELEMENT_PLUS.ElTag, {
                                        type: 'info',
                                        size: 'small',
                                        style: 'vertical-align: baseline;'
                                    }, `${formatProgress(startMs)} ~ ${formatProgress(endMs)}`)
                                ])
                            });
                        },
                        clearSubFilt() {
                            this.clickBuffer = [];
                            this.instance.setOption({
                                series: [{
                                    markLine: null,
                                    markArea: null
                                }, null]
                            });
                        }
                    }
                };
                const chartsActions = reactive({
                    remove: {
                        icon: '⨉',
                        title: '移除图表',
                        apply: () => true,
                        handler: (chart) => {
                            const idx = chartConfig.chartsVisible.indexOf(chart);
                            if (idx !== -1) {
                                chartConfig.chartsVisible.splice(idx, 1);
                                disposeChart(chart);
                            }
                        }
                    },
                    moveDown: {
                        icon: '▼',
                        title: '下移图表',
                        apply: () => true,
                        handler: async (chart) => {
                            const idx = chartConfig.chartsVisible.indexOf(chart);
                            if (idx < chartConfig.chartsVisible.length - 1) {
                                chartConfig.chartsVisible.splice(idx, 1);
                                chartConfig.chartsVisible.splice(idx + 1, 0, chart);
                                await nextTick();
                                const el = doc.getElementById('chart-' + chart);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }
                    },
                    moveUp: {
                        icon: '▲',
                        title: '上移图表',
                        apply: () => true,
                        handler: async (chart) => {
                            const idx = chartConfig.chartsVisible.indexOf(chart);
                            if (idx > 0) {
                                chartConfig.chartsVisible.splice(idx, 1);
                                chartConfig.chartsVisible.splice(idx - 1, 0, chart);
                                await nextTick();
                                const el = doc.getElementById('chart-' + chart);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }
                        }
                    },
                    refresh: {
                        icon: '↻',
                        title: '刷新',
                        apply: chart => 'refresh' in charts[chart],
                        handler: async (chart) => {
                            loading.value = true;
                            await nextTick();
                            disposeChart(chart);
                            await renderChart(chart);
                            loading.value = false;
                        }
                    },
                    expandH: {
                        icon: '⇕',
                        title: '展开/收起',
                        apply: chart => 'expandedH' in charts[chart],
                        handler: async (chart) => {
                            loading.value = true;
                            await nextTick();
                            charts[chart].expandedH = !charts[chart].expandedH;
                            disposeChart(chart);
                            await renderChart(chart);
                            loading.value = false;
                        }
                    }
                });
                const chartHover = ref(null);
                const chartConfig = reactive({
                    show: false,                         // 是否显示设置弹窗
                    chartsAvailable: [],                 // 所有图表（默认+自定义）
                    chartsVisible: [],                   // 当前勾选可见图表
                    oldChartsVisible: [],
                    customInputVisible: false,           // 是否展开自定义添加区域
                    newChartCode: `{
    name: 'leadingDigit',
    title: '例子-弹幕中数字首位分布',
    expandedH: false,
    render(data) {
        const digitCount = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };
        const digitRegex = /\\d+/g;

        data.forEach(d => {
            const matches = d.content.match(digitRegex);
            if (!matches) return;
            matches.forEach(numStr => {
                const firstDigit = numStr.replace(/^0+/, '')[0];
                if (firstDigit && digitCount[firstDigit] !== undefined) {
                    digitCount[firstDigit]++;
                }
            });
        });

        const labels = Object.keys(digitCount);
        const counts = labels.map(d => digitCount[d]);
        const total = counts.reduce((a, b) => a + b, 0);
        const percentages = counts.map(c => ((c / total) * 100).toFixed(2));

        this.instance.setOption({
            title: { text: '弹幕中数字首位分布' },
            tooltip: {
                trigger: 'axis',
                formatter: function (params) {
                    const p = params[0];
                    return "首位数字：" + p.name + "<br/>数量：" + p.value + "<br/>占比：" + percentages[labels.indexOf(p.name)] + "%";
                }
            },
            xAxis: {
                type: 'category',
                data: labels,
                name: '首位数字'
            },
            yAxis: {
                type: 'value',
                name: '出现次数'
            },
            series: [{
                type: 'bar',
                data: counts,
                label: {
                    show: true,
                    position: 'top',
                    formatter: (val) => percentages[val.dataIndex] + "%"
                }
            }]
        });
    },
    async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
        const selectedDigit = params.name;
        await applySubFilter({
            value: selectedDigit,
            filterJudge: d => (d.content.match(/\\d+/g) || []).some(n => n.replace(/^0+/, '')[0] === selectedDigit),
            labelVNode: (h) => h('span', [
                '首位数字为 ',
                h(ELEMENT_PLUS.ElTag, {
                    type: 'info',
                    size: 'small',
                    style: 'vertical-align: baseline;'
                }, selectedDigit)
            ])
        });
    }
}`,                                                      // 自定义图表代码
                    remoteChartList: [],                 // 远程图表加载数据列表
                    open() {
                        this.show = true;
                        this.oldChartsVisible = [...this.chartsVisible];
                        this.sortChartsAvailable();
                    },
                    sortChartsAvailable() {
                        const visible = this.chartsVisible;
                        const visibleSet = new Set(this.chartsVisible);
                        const fullList = Object.entries(charts).map(([key, def]) => ({
                            key,
                            title: def?.title || key,
                            isCustom: key.startsWith('custom_')
                        }));
                        this.chartsAvailable = [
                            ...visible.map(k => fullList.find(c => c.key === k)).filter(Boolean),
                            ...fullList.filter(c => !visibleSet.has(c.key))
                        ];
                    },
                    saveChartVisable() {
                        DmstatStorage.set('chartsVisible', this.chartsVisible);
                    },
                    async cheackChartChange() {
                        this.sortChartsAvailable();
                        const newVisible = [...this.chartsVisible];
                        const oldVisible = this.oldChartsVisible;
                        const removed = oldVisible.filter(k => !newVisible.includes(k));
                        for (const chart of removed) disposeChart(chart);
                        const added = newVisible.filter(k => !oldVisible.includes(k));
                        for (const chart of added) await renderChart(chart);
                        this.oldChartsVisible = newVisible;

                        this.saveChartVisable();
                    },
                    removeCustomChart(name) {
                        const cfg = DmstatStorage.getConfig();
                        delete cfg.customCharts?.[name];
                        DmstatStorage.setConfig(cfg);
                        const idx = this.chartsVisible.indexOf(name);
                        if (idx >= 0) this.chartsVisible.splice(idx, 1);
                        this.saveChartVisable();
                        disposeChart(name);
                        delete charts[name];
                        this.open(); // 重新加载配置
                        ELEMENT_PLUS.ElMessage.success(`已删除图表 ${name}`);
                    },
                    addStorageChart(chartName, chartCode) {
                        const custom = DmstatStorage.get('customCharts', {});
                        custom[chartName] = chartCode;
                        DmstatStorage.set('customCharts', custom);
                    },
                    isCostomAdded(name) {
                        const key = 'custom_' + name;
                        return chartConfig.chartsAvailable.some(c => c.key === key);
                    },
                    addChartCode(code) {
                        const chartDef = eval('(' + code + ')');
                        const chartName = 'custom_' + (chartDef.name.replace(/\s+/g, '_') || Date.now());
                        if (charts[chartName]) return ELEMENT_PLUS.ElMessage.warning('图表已存在');
                        chartDef.title = chartDef.title || `🧩 ${chartName}`;

                        this.addChartDef(chartName, chartDef);
                        this.addStorageChart(chartName, code);
                        this.open();
                        ELEMENT_PLUS.ElMessage.success(`已添加图表 ${chartDef.title}`);
                    },
                    addChartDef(chartName, chartDef, visible = true) {
                        if (!chartName || typeof chartDef !== 'object') {
                            console.warn('chartName 必须为字符串，chartDef 必须为对象');
                            return;
                        }
                        this.initChart(chartName, chartDef);
                        charts[chartName] = { instance: null, ...chartDef };
                        if (visible && !this.chartsVisible.includes(chartName)) {
                            this.chartsVisible.push(chartName);
                            this.saveChartVisable();
                        }
                        nextTick(() => { renderChart(chartName); });
                    },
                    addCustomChart() {
                        try {
                            this.addChartCode(this.newChartCode)
                            this.customInputVisible = false;
                        } catch (e) {
                            console.error(e);
                            ELEMENT_PLUS.ElMessage.error('图表代码错误');
                        }
                    },
                    initChart(chartName, chartDef) {
                        const registerChartAction = (chartName, chartDef) => {
                            if (!Array.isArray(chartDef.actions)) return;
                            chartDef.actions.forEach(({ key, icon, title, method }) => {
                                if (!key || !method) return;
                                chartsActions[`${chartName}:${key}`] = {
                                    icon,
                                    title,
                                    apply: chart => chart === chartName,
                                    handler: async chart => {
                                        try {
                                            await charts[chart][method]();
                                        } catch (e) {
                                            console.error(`[chartsActions] ${chart}.${method} 执行失败`, e);
                                        }
                                    }
                                };
                            });
                        };
                        const registerChartMenuItems = (chartName, chartDef) => {
                            if (Array.isArray(chartDef.menuItems)) {
                                const menuItems = chartDef.getMenuItems();
                                menuItems.forEach(item => item.chart = chartName);
                                danmakuTableMenus.push(...chartDef.menuItems);
                            }
                            if (chartDef.getMenuItems && typeof chartDef.getMenuItems == 'function') {
                                const menuItems = chartDef.getMenuItems();
                                menuItems.forEach(item => item.chart = chartName);
                                danmakuTableMenus.push(...menuItems);
                            }
                        };
                        chartDef.ctx = {
                            ELEMENT_PLUS,
                            ECHARTS,
                            chartsActions,
                            danmakuTableItems,
                            danmakuCount,
                            danmakuList,
                            danmukuTableRef,
                            videoInfo,
                            dataMgr,
                            formatProgress
                        }
                        chartDef.getElement = () => doc.getElementById('chart-' + chartName);
                        registerChartAction(chartName, chartDef);
                        registerChartMenuItems(chartName, chartDef);
                    },
                    async loadRemoteList() {
                        try {
                            const url = statPath + 'docs/chart-list.json';
                            const res = await fetch(url);
                            this.remoteChartList = await res.json();
                        } catch (e) {
                            console.error(e);
                        }
                    },
                    async importRemoteChart(meta) {
                        const { name, url, title, path } = meta;
                        if (!name || (!url && path) || charts[name]) return;

                        try {
                            loading.value = true;
                            await nextTick();
                            let resource = url;
                            if (path) resource = statPath + path;
                            const res = await fetch(resource);
                            const code = await res.text();
                            this.addChartCode(code);
                        } catch (e) {
                            console.error(e);
                            ELEMENT_PLUS.ElMessage.error('加载失败');
                        } finally {
                            loading.value = false;
                        }
                    }
                });
                const dataLoader = reactive({
                    autoLoadXml: true,
                    autoLoadXmlChange: () => {
                        DmstatStorage.set('autoLoadXml', dataLoader.autoLoadXml);
                    },
                    autoLoadPb: false,
                    autoLoadPbChange: () => {
                        DmstatStorage.set('autoLoadPb', dataLoader.autoLoadPb);
                    },
                    init: async () => {
                        dataLoader.autoLoadXml = DmstatStorage.get('autoLoadXml', true);
                        dataLoader.autoLoadPb = DmstatStorage.get('autoLoadPb', false);
                        let loaded = false;
                        if (panelInfo.value.type === 0) {
                            if (dataLoader.autoLoadXml) {
                                await dataLoader.loadXml();
                                loaded = true;
                            }
                            if (dataLoader.autoLoadPb) {
                                await dataLoader.loadPb();
                                loaded = true;
                            }
                        }
                        if (!loaded) {
                            await dataLoader.load();
                        }
                    },
                    load: async (getter = async () => { }, desc = null) => {
                        try {
                            dataLoader.progress.visible = true;
                            dataLoader.progress.current = 0;
                            dataLoader.progress.total = 0;
                            dataLoader.progress.text = '';
                            await nextTick();
                            const added = await getter();
                            const data = dataMgr.data;
                            if (!data || !Array.isArray(data.danmakuData)) {
                                ELEMENT_PLUS.ElMessageBox.alert(
                                    '初始化数据缺失，无法加载弹幕统计面板。请确认主页面传入了有效数据。',
                                    '错误',
                                    { type: 'error' }
                                );
                                data.danmakuData = [];
                            }
                            danmakuList.original = [...data.danmakuData].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));
                            danmakuCount.value.origin = danmakuList.original.length;
                            await resetFilter();
                            if (desc) ELEMENT_PLUS.ElMessage.success(`成功新增${desc}弹幕：${added} 条`);
                        } catch (e) {
                            console.error(e);
                            ELEMENT_PLUS.ElMessage.error('载入弹幕错误：' + e.message);
                        } finally {
                            dataLoader.progress.visible = false;
                        }
                    },
                    progress: {
                        visible: false,
                        current: 0,
                        total: 0,
                        text: ''
                    },
                    clear: async () => {
                        dataMgr.clearDmList();
                        commandDms.value = [];
                        await dataLoader.load();
                        ELEMENT_PLUS.ElMessage.success('已清除弹幕列表');
                    },
                    loadXml: async () => {
                        await dataLoader.load(async () => { return await dataMgr.getDanmakuXml(); }, ' XML ');
                    },
                    loadPb: async () => {
                        await dataLoader.load(async () => {
                            return await dataMgr.getDanmakuPb((current, total, segIndex, count) => {
                                dataLoader.progress.current = current;
                                dataLoader.progress.total = total;
                                dataLoader.progress.text = `第 ${segIndex} 段（${current}/${total}） ${count} 条弹幕`;
                            });
                        }, ' Protobuf ');
                        commandDms.value = Array.isArray(dataMgr.data.commandDms) ?
                            dataMgr.data.commandDms.map(cmd => parseCommandDm(cmd)) : [];
                    },
                    selectedMonth: '',
                    disabledMonth(date) {
                        const pub = videoInfo.pubtime;
                        if (!pub) return false;
                        const min = new Date(pub * 1000);
                        const max = new Date();
                        return date < new Date(min.getFullYear(), min.getMonth()) ||
                            date >= new Date(max.getFullYear(), max.getMonth() + 1);
                    },
                    loadHis: async () => {
                        if (!dataLoader.selectedMonth) {
                            ELEMENT_PLUS.ElMessage.warning('请选择月份');
                            return;
                        }
                        await dataLoader.load(async () => {
                            return await dataMgr.getDanmakuHisPb(dataLoader.selectedMonth, (current, total, date, count) => {
                                dataLoader.progress.current = current;
                                dataLoader.progress.total = total;
                                dataLoader.progress.text = `${date}（${current}/${total}） ${count} 条弹幕`;
                            });
                        }, ` ${dataLoader.selectedMonth} 历史`);
                    }
                });

                function formatProgress(ms) {
                    const s = Math.floor(ms / 1000);
                    const hours = Math.floor(s / 3600);
                    const min = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
                    const sec = String(s % 60).padStart(2, '0');
                    return hours > 0
                        ? `${hours}:${min}:${sec}`
                        : `${min}:${sec}`;
                }
                async function danmakuTableRowClick(row) {
                    danmakuTableMenus.forEach(async menu => {
                        if (typeof menu.onSelect === 'function') {
                            menu.disabled = true;
                            await menu.onSelect(row);
                            menu.disabled = false;
                        }
                    });
                    console.log(toRaw(row));
                }

                function parseCommandDm(cmd) {
                    let extra = {};
                    try { extra = cmd.extra ? (typeof cmd.extra === 'string' ? JSON.parse(cmd.extra) : cmd.extra) : {}; } catch { extra = {}; }
                    let icon = null;
                    let type = '';
                    if (extra.icon) {
                        extra.icon = extra.icon.replace(/^http:/, 'https:');
                        icon = h('img', { src: extra.icon, style: 'width:20px;height:20px;' });
                    } else {
                        icon = h(ELEMENT_PLUS.ElIcon, { style: 'font-size: 0.8em;' }, {
                            default: () => h(ICONS.Operation)
                        });
                        type = 'primary';
                    }
                    let content = null;
                    switch (cmd.command) {
                        case '#VOTE#':
                            content = h('div', [
                                h('div', {
                                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                                }, [
                                    h(ELEMENT_PLUS.ElText, { type: 'success' }, '【投票】'),
                                    h('b', extra.question ?? cmd.content)
                                ]),
                                Array.isArray(extra.options) && extra.options.length ?
                                    h(ELEMENT_PLUS.ElTable, {
                                        data: extra.options,
                                        border: true,
                                        size: 'small',
                                        style: 'margin: 8px; width: auto;'
                                    }, {
                                        default: () => [
                                            h(ELEMENT_PLUS.ElTableColumn, { prop: 'idx', label: '序号', width: 80, sortable: true }),
                                            h(ELEMENT_PLUS.ElTableColumn, { prop: 'desc', label: '选项' }),
                                            h(ELEMENT_PLUS.ElTableColumn, { prop: 'cnt', label: '票数', width: 80, sortable: true })
                                        ]
                                    }) : null
                            ]);
                            break;
                        case '#LINK#':
                            content = h('div', [
                                h('div', {
                                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                                }, [
                                    h(ELEMENT_PLUS.ElText, { type: 'primary' }, '【关联】'),
                                    h('b', cmd.content)
                                ]),
                                h('div', [
                                    h(ELEMENT_PLUS.ElLink, {
                                        style: { margin: '8px' },
                                        href: 'https://www.bilibili.com/video/' + extra.bvid,
                                        target: '_blank'
                                    }, extra.title)
                                ])
                            ]);
                            break;
                        case '#GRADE#':
                            content = h('div', [
                                h('div', {
                                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                                }, [
                                    h(ELEMENT_PLUS.ElText, { type: 'warning' }, '【评分】'),
                                    h('b', extra.msg ?? cmd.content),
                                    h(ELEMENT_PLUS.ElText, '平均: ' + (extra.avg_score ?? '-')),
                                    h(ELEMENT_PLUS.ElText, '参与: ' + (extra.count ?? '-'))
                                ])
                            ]);
                            break;
                        case '#GRADESUMMARY#':
                            content = h('div', [
                                h('div', {
                                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                                }, [
                                    h(ELEMENT_PLUS.ElText, { type: 'warning' }, '【评分总结】'),
                                    h('b', extra.msg ?? cmd.content)
                                ]),
                                extra.avg_score !== undefined ? h('div', { style: { marginTop: '6px', marginLeft: '8px' } }, `平均：${extra.avg_score}`) : null,
                                Array.isArray(extra.grades) && extra.grades.length ?
                                    h(ELEMENT_PLUS.ElTable, {
                                        data: extra.grades,
                                        border: true,
                                        size: 'small',
                                        style: 'margin: 8px; width: auto;'
                                    }, {
                                        default: () => [
                                            h(ELEMENT_PLUS.ElTableColumn, { prop: 'content', label: '评分项' }),
                                            h(ELEMENT_PLUS.ElTableColumn, { prop: 'avg_score', label: '平均', width: 80, sortable: true }),
                                            h(ELEMENT_PLUS.ElTableColumn, { prop: 'count', label: '参与', width: 80, sortable: true })
                                        ]
                                    }) : null
                            ]);
                            break;
                        case '#ATTENTION#':
                            content = h('div', [
                                h('div', {
                                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                                }, [
                                    h(ELEMENT_PLUS.ElText, { type: 'danger' }, '【关注】'),
                                    h('b', cmd.content)
                                ])
                            ]);
                            break;
                        case '#RESERVE#':
                            content = h('div', [
                                h('div', {
                                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                                }, [
                                    h(ELEMENT_PLUS.ElText, { type: 'danger' }, '【预约】'),
                                    h('b', extra.msg ?? cmd.content)
                                ])
                            ]);
                            break;
                        default:
                            console.log('未知互动弹幕', cmd);
                            content = h('div', [
                                h('div', {
                                    style: { display: 'flex', alignItems: 'center', gap: '8px' }
                                }, [
                                    h(ELEMENT_PLUS.ElText, { type: 'primary' }, cmd.command),
                                    h('b', cmd.content)
                                ])
                            ]);
                    }
                    return {
                        key: cmd.idStr,
                        timestamp: `时间：${formatProgress(cmd.progress ?? 0)} | 发送时间：${cmd.ctime}`,
                        icon,
                        type,
                        content,
                        onClick: () => { console.log(cmd); }
                    };
                }

                function downloadData() {
                    let bTitle = dmData.info?.id?.replace(/[\\/:*?"<>|]/g, '_') || 'Bilibili';
                    const filename = `${bTitle}.json`;
                    const jsonString = JSON.stringify(dmData.data, null, 4);

                    // 创建一个包含 JSON 数据的 Blob 对象
                    const blob = new Blob([jsonString], { type: 'application/json' });

                    // 创建一个临时的 URL 对象
                    const url = URL.createObjectURL(blob);

                    // 创建一个隐藏的 <a> 元素用于触发下载
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename; // 设置下载的文件名
                    document.body.appendChild(a);
                    a.click(); // 模拟点击触发下载

                    // 移除临时的 <a> 元素和 URL 对象
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    console.log(`已触发下载，文件名为: ${filename}`);
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
                    try {
                        loading.value = true;
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
                                link.download = `${videoInfo.id}_danmaku_statistics.png`;
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

                function queryMidFromHash(midHash) {
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
                        if ((err !== 'cancel'))
                            console.error(err);
                        // 用户点击了取消，只复制midHash
                        navigator.clipboard.writeText(midHash).then(() => {
                            ELEMENT_PLUS.ElMessage.success('midHash已复制到剪贴板');
                        }).catch(() => {
                            ELEMENT_PLUS.ElMessage.error('复制失败');
                        });
                    });
                }

                async function renderChart(chart) {
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
                                        let list = [];
                                        if (typeof subFilt.filterJudge === 'function') {
                                            list = danmakuList.current.filter(d => subFilt.filterJudge(d))
                                        } else {
                                            list = danmakuList.current;
                                            ELEMENT_PLUS.ElMessage.warning('图表缺少筛选判断方法');
                                        }
                                        return updateDispDanmakus(false, list, { chart, ...subFilt });
                                    },
                                    ELEMENT_PLUS
                                });
                            });
                        }
                    }
                    try {
                        await charts[chart].render(danmakuList.current);
                    } catch (err) {
                        console.error(`图表${chart}渲染错误`, err);
                        ELEMENT_PLUS.ElMessage.error(`图表${chart}渲染错误`);
                    }
                    await nextTick();
                }
                function disposeChart(chart) {
                    if (charts[chart].instance && charts[chart].instance.dispose) {
                        charts[chart].instance.dispose();
                        charts[chart].instance = null;
                    }
                }

                async function updateDispDanmakus(ifchart = false, data = danmakuList.current, subFilt = {}) {
                    loading.value = true;
                    await nextTick();
                    await new Promise(resolve => setTimeout(resolve, 10)); //等待v-loading渲染
                    try {
                        if (typeof panelInfo.value?.updateCallback === 'function') {
                            panelInfo.value.updateCallback(danmakuList.current);
                        }
                        danmakuTableItems.value = data;
                        currentSubFilt.value = subFilt;
                        danmakuCount.value.filtered = danmakuList.current.length;
                        if (ifchart) {
                            for (const chart of chartConfig.chartsVisible) {
                                await renderChart(chart);
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
                        const activeFilters = subFiltHistory.value.filter(f => f.enabled && typeof f.filterJudge === 'function');
                        for (const filt of activeFilters) {
                            if (filt.exclude) filtered = filtered.filter(d => !filt.filterJudge(d));
                            else filtered = filtered.filter(d => filt.filterJudge(d));
                        }
                        danmakuList.current = filtered;
                        await updateDispDanmakus(true);
                    } catch (e) {
                        console.error(e);
                        ELEMENT_PLUS.ElMessage.error('子筛选应用失败');
                    }
                }
                async function commitSubFilter() {
                    if (Object.keys(currentSubFilt.value).length) {
                        subFiltHistory.value.push({
                            ...currentSubFilt.value,
                            enabled: true,
                            exclude: false
                        });
                    }
                    await applyActiveSubFilters();
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
                        danmakuList.filtered = danmakuList.original.filter(d =>
                            excludeFilter.value ? !regex.test(d.content) : regex.test(d.content)
                        );
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
                    for (const [chartName, chartDef] of Object.entries(charts)) {
                        chartConfig.initChart(chartName, chartDef);
                    }
                    const customCharts = DmstatStorage.get('customCharts', {});
                    for (const [name, code] of Object.entries(customCharts)) {
                        try {
                            const def = eval('(' + code + ')');
                            chartConfig.addChartDef(name, def, false);
                        } catch (e) {
                            console.warn(`无法加载图表 ${name}`, e);
                        }
                    }
                    chartConfig.chartsVisible = DmstatStorage.get('chartsVisible', Object.keys(charts));
                    chartConfig.loadRemoteList();

                    await dataLoader.init();
                });
                return {
                    h,
                    danmukuTableRef,
                    danmakuTableItems,
                    danmakuTableMenus,
                    danmakuTableRowClick,
                    excludeFilter,
                    filterText,
                    applyFilter,
                    resetFilter,
                    videoInfo,
                    commandDms,
                    danmakuCount,
                    currentFilt,
                    currentSubFilt,
                    subFiltHistory,
                    dataLoader,
                    loading,
                    isTableVisible,
                    isTableAutoH,
                    panelInfo,
                    chartsActions,
                    chartHover,
                    chartConfig,
                    clearSubFilter,
                    commitSubFilter,
                    applyActiveSubFilters,
                    shareImage,
                    downloadData
                };
            },
            template: `
<el-container style="height: 100%;" v-loading="loading">
    <!-- 左边 -->
    <el-aside width="50%" style="overflow-y: auto;">
        <div style="min-width: 400px;">
            <div id="wrapper-title" style="text-align: left;">
                <video-info-panel :videoInfo="videoInfo" />
                <el-collapse expand-icon-position="left">
                    <el-collapse-item name="1"
                        :title="' 已载入弹幕 ' + (danmakuCount.origin?.toLocaleString() || '-') + ' 条'">
                        <el-space v-if="panelInfo.type == 0" :size="12" wrap direction="vertical"
                            alignment="flex-start">
                            <el-alert type="warning" title="请不要短时间内频繁载入，否则可能触发B站风控。" show-icon />
                            <el-space wrap :size="20">
                                <el-button type="primary" size="small" @click="dataLoader.loadXml" style="width: 150px;"
                                    :disabled="dataLoader.progress.visible">载入 XML 实时弹幕</el-button>
                                <el-checkbox v-model="dataLoader.autoLoadXml"
                                    @change="dataLoader.autoLoadXmlChange">自动载入</el-checkbox>
                                <el-tooltip placement="top" effect="light" trigger="click"
                                    content="实时弹幕池容量有限，通常为近期的弹幕。">
                                    <el-button type="primary" circle text>
                                        <el-icon><el-icon-info-filled /></el-icon>
                                    </el-button>
                                </el-tooltip>
                            </el-space>
                            <el-space wrap :size="20">
                                <el-button type="primary" size="small" @click="dataLoader.loadPb" style="width: 150px;"
                                    :disabled="dataLoader.progress.visible">载入 ProtoBuf 弹幕</el-button>
                                <el-checkbox v-model="dataLoader.autoLoadPb"
                                    @change="dataLoader.autoLoadPbChange">自动载入</el-checkbox>
                                <el-tooltip placement="top" effect="light" trigger="click"
                                    content="二进制数据，每6分钟一包，弹幕较多时通常更全。">
                                    <el-button type="primary" circle text>
                                        <el-icon><el-icon-info-filled /></el-icon>
                                    </el-button>
                                </el-tooltip>
                            </el-space>
                            <el-space wrap :size="20">
                                <el-date-picker v-model="dataLoader.selectedMonth" type="month" size="small"
                                    placeholder="选择月份" value-format="YYYY-MM" style="width: 150px;"
                                    :disabled-date="dataLoader.disabledMonth" />
                                <el-button type="primary" size="small" @click="dataLoader.loadHis"
                                    :disabled="dataLoader.progress.visible">载入历史弹幕
                                </el-button>
                            </el-space>
                            <el-space wrap :size="12">
                                <el-button type="danger" size="small" @click="dataLoader.clear"
                                    :disabled="dataLoader.progress.visible">
                                    <el-icon style="font-size: 12px;"><el-icon-delete /></el-icon> 清除弹幕
                                </el-button>
                                <el-button type="success" size="small" @click="downloadData">
                                    <el-icon style="font-size: 12px;"><el-icon-download /></el-icon> 下载数据
                                </el-button>
                                <div style="width: 100px;">
                                    <el-progress v-if="dataLoader.progress.visible"
                                        :percentage="Math.floor((dataLoader.progress.current / dataLoader.progress.total) * 100) || 0"
                                        :text-inside="true" :stroke-width="18">
                                    </el-progress>
                                </div>
                                <el-text v-if="dataLoader.progress.visible" size="small" type="info">
                                    {{ dataLoader.progress.text }}
                                </el-text>
                            </el-space>
                        </el-space>
                    </el-collapse-item>
                    <el-collapse-item name="2" v-if="commandDms && commandDms.length"
                        :title="'互动弹幕 ' + (commandDms.length.toLocaleString()) + ' 条'">
                        <el-timeline style="padding-top: 10px;">
                            <el-timeline-item v-for="cmd in commandDms" :key="cmd.key" :timestamp="cmd.timestamp"
                                :type="cmd.type" :icon="cmd.icon" placement="top">
                                <el-card shadow="hover" @click="cmd.onClick">
                                    <component :is="cmd.content" />
                                </el-card>
                            </el-timeline-item>
                        </el-timeline>
                    </el-collapse-item>
                </el-collapse>
                <p style="
                    background-color: #f4faff;
                    border-left: 4px solid #409eff;
                    padding: 10px 15px;
                    border-radius: 4px;
                    color: #333;
                ">
                    <template v-if="currentFilt">
                        筛选
                        <el-tag type="info" size="small" style="vertical-align: baseline;">{{ currentFilt }}</el-tag>
                        <el-checkbox v-model="excludeFilter" @change="applyFilter"
                            style="margin-left: 4px; vertical-align: middle;">排除模式</el-checkbox><br />
                    </template>
                    <template v-if="subFiltHistory.length" style="margin-top: 10px;">
                        <el-space direction="vertical" :size="2" alignment="flex-start" style="width: 100%;">
                            <el-space v-for="(item, idx) in subFiltHistory" :key="idx"
                                :spacer="h('span', { style: 'color: #666;' }, '|')" wrap>
                                <el-checkbox v-model="item.enabled" @change="applyActiveSubFilters" />
                                <component :is="item.labelVNode(h)" style="min-width: 200px;" />
                                <el-checkbox v-model="item.exclude" @change="applyActiveSubFilters" label="排除" />
                                <action-tag @click="() => { subFiltHistory.splice(idx, 1); applyActiveSubFilters(); }"
                                    title="清除筛选">×</action-tag>
                            </el-space>
                        </el-space>
                    </template>
                    结果：共有 {{ danmakuCount.filtered }} 条弹幕<br />
                    <template v-if="currentSubFilt.labelVNode">
                        <component :is="currentSubFilt.labelVNode(h)" />
                        弹幕共 {{ danmakuTableItems.length }} 条
                        <action-tag @click="clearSubFilter" title="清除子筛选">×</action-tag>
                        <action-tag type="success" :onClick="commitSubFilter" title="提交子筛选结果作为新的数据源">✔</action-tag>
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
                    <span style="flex: 1; font-size: 14px; color: #333; height: 32px; align-content: center;">
                        弹幕列表
                    </span>

                    <el-popover placement="bottom" width="160" trigger="click" v-if="danmakuTableItems.length < 100">
                        <template v-slot:reference>
                            <el-button text style="margin-right: 20px;" circle @click.stop />
                        </template>
                        <div style="padding: 4px 8px;">
                            <el-radio-group v-model="isTableAutoH">
                                <el-radio-button :value="false">自动高度</el-radio-button>
                                <el-radio-button :value="true">有限高度</el-radio-button>
                            </el-radio-group>
                        </div>
                    </el-popover>
                    <span style="font-size: 12px; color: #666;">
                        {{ isTableVisible ? '▲ 收起' : '▼ 展开' }}
                    </span>
                </div>
                <el-collapse-transition>
                    <danmuku-table ref="danmukuTableRef" v-show="isTableVisible" :virtual-threshold="800"
                        :items="danmakuTableItems" :menu-items="danmakuTableMenus" @row-click="danmakuTableRowClick" />
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
                <el-button @click="applyFilter"
                    :type="danmakuTableItems.length === danmakuCount.origin ? 'warning' : 'default'">筛选</el-button>
                <span></span>
                <el-button @click="resetFilter"
                    :type="danmakuTableItems.length === danmakuCount.origin ? 'default' : 'warning'">取消筛选</el-button>
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
                <el-button v-if="panelInfo.type == 0" @click="panelInfo.newPanel(panelInfo.type)" circle
                    title="新标签页打开统计面板">
                    <svg t="1746238142181" class="icon" viewBox="0 0 1024 1024" version="1.1"
                        xmlns="http://www.w3.org/2000/svg" p-id="3091" width="16" height="16">
                        <path
                            d="M409.6 921.728H116.928a58.56 58.56 0 0 1-58.56-58.496V263.296H936.32v58.56a29.248 29.248 0 1 0 58.496 0V87.744C994.752 39.296 955.392 0 906.944 0H87.68C39.296 0 0 39.296 0 87.744v804.736a87.68 87.68 0 0 0 87.744 87.68H409.6a29.248 29.248 0 0 0 0-58.432zM58.432 116.992c0-32.32 26.24-58.496 58.56-58.496h760.64c32.32 0 58.56 26.24 58.56 58.496V204.8H58.496V116.992z m936.256 321.792h-351.104a29.312 29.312 0 0 0 0 58.56h277.312c-2.176 1.28-4.48 2.304-6.4 4.096L484.736 967.68a29.184 29.184 0 0 0 0 41.344c11.52 11.456 29.888 11.52 41.344 0l430.08-466.112a87.04 87.04 0 0 0 9.408-10.624V819.2a29.248 29.248 0 0 0 58.496 0V468.16a29.376 29.376 0 0 0-29.248-29.376z"
                            fill="#409eff" p-id="3092"></path>
                    </svg>
                </el-button>
                <el-button v-else @click="panelInfo.newPanel(panelInfo.type)" circle title="下载统计面板">
                    <svg t="1746264728781" class="icon" viewBox="0 0 1024 1024" version="1.1"
                        xmlns="http://www.w3.org/2000/svg" p-id="2669" width="16" height="16">
                        <path
                            d="M896 361.408V60.224H64v843.328h384V960H64c-35.328 0-64-23.232-64-56.448V60.16C0 26.944 28.672 0 64 0h832c35.328 0 64 26.944 64 60.224v301.184c0 33.28-28.672 60.224-64 60.224v-60.16z m-125.696 213.12L832 576l-0.064 306.752 99.968-99.84 45.248 45.184L845.248 960l3.84 3.84-45.184 45.312-3.904-3.904-3.84 3.84-45.312-45.184 3.904-3.904-131.84-131.84 45.184-45.312 100.352 100.352 1.856-308.608z"
                            fill="#409eff" p-id="2670"></path>
                        <path d="M64 256h896v64H64z" fill="#409eff" p-id="2671"></path>
                    </svg>
                </el-button>
                <span></span>
                <el-button @click="chartConfig.open()" circle title="设置">
                    <el-icon style="font-size: 16px;"><el-icon-setting /></el-icon>
                </el-button>
            </div>
        </el-header>

        <el-dialog v-model="chartConfig.show" title="图表设置" style="min-width: 400px;">
            <el-scrollbar style="height: 60%;">
                <el-checkbox-group v-model="chartConfig.chartsVisible" @change="chartConfig.cheackChartChange()">
                    <el-row v-for="item in chartConfig.chartsAvailable" :key="item.key">
                        <el-col :span="20">
                            <el-checkbox :label="item.key">{{ item.title }}</el-checkbox>
                        </el-col>
                        <el-col :span="4" v-if="item.isCustom">
                            <el-button size="small" type="danger" @click="chartConfig.removeCustomChart(item.key)">
                                <el-icon style="font-size: 16px;"><el-icon-delete /></el-icon></el-button>
                        </el-col>
                    </el-row>
                </el-checkbox-group>

                <el-divider>可选图表</el-divider>
                <el-button v-if="!chartConfig.remoteChartList.length" type="primary" size="small" style="width: 100px;"
                    @click="chartConfig.loadRemoteList()">🌐 获取列表</el-button>
                <el-table :data="chartConfig.remoteChartList" size="small" v-if="chartConfig.remoteChartList.length">
                    <el-table-column prop="title" />
                    <el-table-column width="100">
                        <template #default="{ row }">
                            <el-button :type="chartConfig.isCostomAdded(row.name) ? 'default' : 'success'"
                                @click="chartConfig.importRemoteChart(row)" size="small" style="width: 60px">
                                {{ chartConfig.isCostomAdded(row.name) ? '已加载' : '加载' }}</el-button>
                        </template>
                    </el-table-column>
                </el-table>

                <el-divider>自定义图表</el-divider>
                <el-button size="small" type="primary" style="width: 100px;"
                    @click="chartConfig.customInputVisible = !chartConfig.customInputVisible">
                    {{ chartConfig.customInputVisible ? '收起' : '➕ 添加图表' }}
                </el-button>
                <div v-show="!chartConfig.customInputVisible" style="height: 30px;"></div>
                <el-collapse-transition>
                    <div v-show="chartConfig.customInputVisible">
                        <el-input type="textarea" v-model="chartConfig.newChartCode" rows="10"
                            style="margin-bottom: 10px; margin-top: 10px;" />
                        <el-button type="success" size="small" style="width: 100px;"
                            @click="chartConfig.addCustomChart()">✅ 添加</el-button>
                    </div>
                </el-collapse-transition>
            </el-scrollbar>
        </el-dialog>

        <el-main style="overflow-y: auto;">
            <div id="wrapper-chart" style="min-width: 400px;">
                <div v-for="(chart, index) in chartConfig.chartsVisible" :key="chart" :style="{
                    position: 'relative',
                    marginBottom: index < chartConfig.chartsVisible.length - 1 ? '20px' : '0'
                }" @mouseenter="chartHover = chart" @mouseleave="chartHover = null">
                    <!-- 控制按钮 -->
                    <div v-if="chartHover === chart" :style="{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        display: 'flex',
                        direction: 'rtl',
                        gap: '3px',
                        opacity: 1,
                        zIndex: 10,
                        transition: 'opacity 0.2s'
                    }">
                        <template v-for="(action, key) in chartsActions">
                            <template v-if="action.apply(chart)" :key="key">
                                <el-button :title="action.title" @click="() => action.handler(chart)" :style="{
                                    backgroundColor: 'rgba(128,128,128,0.4)',
                                    color: 'white',
                                    fontWeight: 'bold'
                                }" size="small" circle>
                                    {{ action.icon }}
                                </el-button>
                                <span></span>
                            </template>
                        </template>
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

        const loader = new ResourceLoader(doc);
        await Promise.all([
            loader.addCss(cdnUrl + '/npm/element-plus/dist/index.css'),
            loader.addScript(cdnUrl + '/npm/vue@3.3.4/dist/vue.global.prod.js')
        ]);
        await loader.addScript(cdnUrl + '/npm/element-plus/dist/index.full.min.js');

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
            <a :href="card.face" target="_blank" title="点击查看头像原图"><el-avatar :size="100" :src="card.face" /></a>
            <!-- 用户信息 -->
            <div style="flex: 1;">
                <h2 style="margin: 0;">
                    {{ card.name }}
                    <el-tag v-if="card.sex !== '保密'" size="small" style="margin-left: 10px;">{{ card.sex }}</el-tag>
                    <el-tag v-if="card.level_info" type="success" size="small">
                        LV{{ card.level_info.current_level}}</el-tag>
                    <el-tag v-if="card.vip?.vipStatus === 1" type="warning" size="small">大会员</el-tag>
                </h2>

                <!-- 签名 -->
                <el-text type="info" size="small" style="margin: 4px 0; display: block;">
                    {{ card.sign || '这位用户很神秘，什么都没写。' }}
                </el-text>

                <!-- MID & midHash -->
                <p>
                    <b>MID：</b>
                    <el-link :href="'https://space.bilibili.com/' + card.mid" target="_blank" type="primary"
                        style="vertical-align: baseline;">{{ card.mid }}</el-link>
                    <el-tooltip content="复制midHash" placement="top">
                        <el-tag size="small"
                            style="margin-left: 6px; vertical-align: baseline; cursor: pointer; background-color: #f5f7fa; color: #909399;"
                            @click="copyToClipboard(card.midHash)">Hash: {{ card.midHash }}</el-tag>
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
                        <el-tag size="small" style="vertical-align: baseline;">{{ card.nameplate.name }}</el-tag>
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
            <el-col :span="6"><el-statistic title="关注数" :value="card.friend" /></el-col>
            <el-col :span="6"><el-statistic title="粉丝数" :value="stats.follower" /></el-col>
            <el-col :span="6"><el-statistic title="获赞数" :value="stats.like_num" /></el-col>
            <el-col :span="6"><el-statistic title="稿件数" :value="stats.archive_count" /></el-col>
        </el-row>
    </el-card>
</div>
`
        });
        app.use(win.ElementPlus);
        app.mount('#user-space-app');
    }
    // 插入按钮
    function insertButton(isUserPage) {
        const btn = document.createElement('div');
        btn.id = 'danmaku-stat-btn';
        btn.innerHTML = `
        <span style="margin-left: 20px; white-space: nowrap; color: #00ace5; user-select: none;">${isUserPage ? '用户信息' : '弹幕统计'}</span>
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
            bottom: '150px',
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
        btn.onclick = () => {
            openPanel(async (iframe) => {
                if (isUserPage) {
                    const mid = location.href.match(/\/(\d+)/)?.[1];
                    const userData = await BiliDataManager.api.getUserCard(mid);
                    return initUserIframeApp(iframe, userData);
                } else {
                    dmData = new BiliDataManager();
                    unsafeWindow.dmData = dmData;
                    await dmData.getData(location.href);
                    return initIframeApp(iframe, dmData, {
                        type: 0, newPanel: function (type) {
                            if (type == 0) {
                                openPanelInNewTab();
                                console.log('[主页面] 新建子页面');
                            }
                        }
                    });
                }
            });
        };
        document.body.appendChild(btn);
    }
    // 打开iframe弹幕统计面板
    function openPanel(initFn) {
        if (document.getElementById('danmaku-stat-iframe')) {
            console.warn('统计面板已打开');
            return;
        }
        // 创建蒙层
        const overlay = document.createElement('div');
        overlay.id = 'danmaku-stat-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: '9998'
        });
        overlay.onclick = () => {
            document.getElementById('danmaku-stat-iframe')?.remove();
            overlay.remove();
        };
        document.body.appendChild(overlay);

        // 创建iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'danmaku-stat-iframe';
        Object.assign(iframe.style, {
            position: 'fixed',
            top: '15%',
            left: '15%',
            width: '70%',
            height: '70%',
            backgroundColor: '#fff',
            zIndex: '9999',
            padding: '20px',
            overflow: 'hidden',
            borderRadius: '8px',
            boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)'
        });
        iframe.onload = async () => {
            try {
                if (typeof initFn === 'function') {
                    await initFn(iframe);
                } else {
                    console.warn('initFn 未传入或不是函数');
                }
            } catch (err) {
                console.error('初始化统计面板失败：', err);
                alert('初始化失败：' + err.message);
            }
        };
        document.body.appendChild(iframe);
    }

    function generatePanelBlob(panelInfoText) {
        let bTitle = dmData?.info?.id?.replace(/[\\/:*?"<>|]/g, '_') || 'Bilibili';
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
            ${ResourceLoader.toString()}
            ${initIframeApp.toString()}
            ${BiliMidHashConverter.toString()}
            const cdnUrl = '${cdnUrl}';
            const statPath = '${statPath}';
            const dmData = {};
            Object.assign(dmData, ${JSON.stringify(dmData)});
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
            iframe.onload = () => initIframeApp(iframe, dmData, ${panelInfoText});
            document.body.appendChild(iframe);
        </script>
        </body>
        </html>
        `;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        return URL.createObjectURL(blob);
    }
    // 打开新标签页弹幕统计面板
    function openPanelInNewTab() {
        const blobUrl = generatePanelBlob(`{
            type: 1,
            newPanel: function (type) {
                if (type == 1) {
                    if (window.opener) {
                        console.log('[子页面] 请求保存页面');
                        window.opener.postMessage({ type: 'DMSTATS_REQUEST_SAFE' }, '*');
                    }
                }
            }
        }`);
        const newWin = window.open(blobUrl, '_blank');
        if (!newWin) {
            alert('浏览器阻止了弹出窗口');
            return;
        }
    }
    // 保存弹幕统计面板
    function savePanel() {
        let bTitle = dmData?.info?.id?.replace(/[\\/:*?"<>|]/g, '_') || 'Bilibili';
        const blobUrl = generatePanelBlob(`{
            type: 2,
            newPanel: function (type) {
                console.log('未定义操作');
            }
        }`);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${bTitle}_danmaku_statistics.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    }

    async function getFastestCDN() {
        //https://zhang-zhonggui.github.io/2024/06/17/jsdelivr%E5%9B%BD%E5%86%85%E5%8A%A0%E9%80%9F%E8%8A%82%E7%82%B9/
        const cdnList = [
            'https://cdn.jsdelivr.net',
            'https://gcore.jsdelivr.net',
            'https://testingcf.jsdelivr.net',
            'https://fastly.jsdelivr.net',
            'https://quantil.jsdelivr.net',
            'https://originfastly.jsdelivr.net'
        ];
        const testPath = '/cdn-cgi/trace';
        const timeout = 3000; // 3秒超时
        function fetchWithTimeout(url) {
            return Promise.race([
                fetch(url + testPath).then(res => res.ok ? url : Promise.reject()),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
            ]);
        }
        try {
            const fastestUrl = await Promise.any(cdnList.map(fetchWithTimeout));
            console.log(`Using fastest CDN: ${fastestUrl}`);
            return fastestUrl;
        } catch {
            console.log('All CDN unavailable, fallback to https://cdn.jsdmirror.com');
            return 'https://cdn.jsdmirror.com';
        }
    }
    const cdnUrl = await getFastestCDN();
    const statPath = cdnUrl + '/gh/ZBpine/bili-danmaku-statistic@2.1.3/';
    const downPath = cdnUrl + '/gh/ZBpine/bilibili-danmaku-download@1.6.1.5/'
    const { BiliMidHashConverter } = await import(statPath + 'docs/BiliMidHashConverter.js');
    const { createBiliDataManagerImport } = await import(downPath + 'tampermonkey/BiliDataManager.js');
    const BiliDataManager = await createBiliDataManagerImport(GM_xmlhttpRequest, '');
    let dmData = new BiliDataManager();
    unsafeWindow.BiliDataManager = BiliDataManager;
    unsafeWindow.dmData = dmData;

    // 监听新标签页消息
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'DMSTATS_REQUEST_DATA') {
            console.log('[主页面] 收到数据请求');
            event.source.postMessage(dmData, '*');
        } else if (event.data?.type === 'DMSTATS_REQUEST_SAFE') {
            console.log('[主页面] 收到保存请求');
            savePanel();
        }
    });

    if (location.hostname.includes('space.bilibili.com')) {
        insertButton(true);
    } else if (location.hostname.includes('www.bilibili.com')) {
        insertButton(false);
    }
})();
