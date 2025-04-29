// ==UserScript==
// @name         bilibili 视频弹幕统计
// @namespace    https://github.com/ZBpine/bili-danmaku-statistic
// @version      1.0
// @description  获取B站视频页弹幕数据，并生成统计页面
// @author       ZBpine
// @icon         https://i0.hdslb.com/bfs/static/jinkela/long/images/favicon.ico
// @match        https://www.bilibili.com/video/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // 插入按钮
  function insertButton() {
    const btn = document.createElement('button');
    btn.innerText = '弹幕统计';
    btn.style.position = 'fixed';
    btn.style.left = "20px";
    btn.style.bottom = "40px";
    btn.style.zIndex = '9997';
    btn.style.padding = '10px 20px';
    btn.style.backgroundColor = '#00ace5';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '5px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '16px';
    btn.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.2)";
    btn.onclick = openIframe;
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

    // 创建挂载点
    const appRoot = doc.createElement('div');
    appRoot.id = 'danmaku-app';
    doc.body.style.margin = '0';
    doc.body.appendChild(appRoot);

    // 挂载Vue
    const { createApp, ref, onMounted } = win.Vue;
    const ELEMENT_PLUS = win.ElementPlus;
    const ECHARTS = win.echarts;

    class DanmakuManager {
      constructor(danmakuList) {
        this.original = danmakuList;
        this.filtered = [...danmakuList];
      }

      reset() {
        this.filtered = [...this.original];
      }

      filter(regex) {
        this.filtered = this.original.filter(d => regex.test(d.content));
      }

      getSortedDanmakus() {
        return [...this.filtered].sort((a, b) => a.progress - b.progress);
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

      getDanmakusByUser(midHash) {
        return this.filtered.filter(d => d.midHash === midHash);
      }
      getOriginDanmakusByUser(midHash) {
        return this.original.filter(d => d.midHash === midHash);
      }
    }


    const app = createApp({
      setup() {
        const displayedDanmakus = ref([]);
        const filterText = ref('(哈|呵|h|ha|HA|H+|233+)+');
        const originDanmakuCount = ref(0);
        const currentUserMidHash = ref('');
        const danmakuCount = ref({ user: 0, dm: 0 });
        const videoData = ref({});
        let manager = null;
        let chart = null;

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
            //https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/danmaku/danmaku_xml.md
          }
          return danmakus;
        }

        function midHashOnClick() {
          if (!currentUserMidHash.value) return;
          navigator.clipboard.writeText(currentUserMidHash.value).then(() => {
            ELEMENT_PLUS.ElMessage.success('midHash已复制到剪贴板');
          }).catch(() => {
            ELEMENT_PLUS.ElMessage.error('复制失败');
          });
          displayedDanmakus.value = manager.getOriginDanmakusByUser(currentUserMidHash.value).sort((a, b) => a.progress - b.progress);
        }

        function updateChart(stats) {
          const chartEl = doc.getElementById('chart');
          if (!chartEl) {
            console.warn('chart容器还没渲染好，稍后重试');
            setTimeout(() => updateChart(stats), 100); // 100ms后重试
            return;
          }
          if (!chart) {
            chart = ECHARTS.init(chartEl);
            chart.on('click', (params) => {
              const selected = params.name;
              currentUserMidHash.value = selected;
              displayedDanmakus.value = manager.getDanmakusByUser(selected).sort((a, b) => a.progress - b.progress);
            });
          }
          const userNames = stats.map(item => item.user);
          const counts = stats.map(item => item.count);
          const maxCount = Math.max(...counts);
          chart.setOption({
            tooltip: {},
            title: { text: '用户弹幕统计' },
            grid: { left: 100 },
            xAxis: {
              type: 'value',
              min: 0,
              max: Math.ceil(maxCount * 1.1), // 横轴最大值略大一点
              scale: false, // 不缩放
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
                start: 0,
                end: userNames.length > 20 ? (20 / userNames.length) * 100 : 100,
                width: 10
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
        }

        function applyFilter() {
          currentUserMidHash.value = '';
          try {
            const regex = new RegExp(filterText.value, 'i');
            manager.filter(regex);
            displayedDanmakus.value = manager.getSortedDanmakus();
            const stats = manager.getStats();
            danmakuCount.value = { user: stats.length, dm: displayedDanmakus.value.length }
            updateChart(stats);
          } catch (e) {
            alert('无效正则表达式');
          }
        }

        function resetFilter() {
          currentUserMidHash.value = '';
          manager.reset();
          displayedDanmakus.value = manager.getSortedDanmakus();
          const stats = manager.getStats();
          danmakuCount.value = { user: stats.length, dm: displayedDanmakus.value.length }
          updateChart(stats);
        }

        async function getVideoData() {
          const bvidMatch = location.href.match(/\/video\/(BV\w+)/);
          if (!bvidMatch) {
            console.error('找不到BVID');
            return null;
          }
          const bvid = bvidMatch[1];
          try {
            const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
            const json = await res.json();
            if (json && json.data) {
              return json.data;
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
          console.log(videoData.value);
          videoData.value = await getVideoData();
          console.log(videoData.value);
          const oid = videoData.value.cid;
          if (!oid) {
            alert('无法找到视频chatid');
            return;
          }
          const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${oid}`);
          const text = await res.text();
          const data = parseDanmakuXml(text);
          manager = new DanmakuManager(data);
          originDanmakuCount.value = data.length; // 原始弹幕数量
          displayedDanmakus.value = manager.getSortedDanmakus();
          const stats = manager.getStats();
          danmakuCount.value = { user: stats.length, dm: displayedDanmakus.value.length }
          updateChart(stats);
        });

        return {
          displayedDanmakus,
          filterText,
          applyFilter,
          resetFilter,
          danmakuCount,
          videoData,
          originDanmakuCount,
          currentUserMidHash,
          midHashOnClick,
          formatProgress,
          formatCtime,
          formatTime
        };
      },
      template: `
      <el-container style="height: 100%;">
        <!-- 左边 -->
        <el-aside width="50%" style="overflow-y: auto;">
          <el-main style="overflow-y: auto; padding: 10px;">
            <!-- 上半部：标题区域 -->
            <div style="text-align: left; margin-bottom: 10px;">
              <h3>{{ videoData.title || '加载中...' }}</h3>
              <p style="margin: 10px;">
                BVID：    
                <el-link
                  v-if="videoData.bvid"
                  :href="'https://www.bilibili.com/video/' + videoData.bvid"
                  target="_blank"
                  type="primary"
                  style="vertical-align: baseline;"
                >
                  {{ videoData.bvid }}
                </el-link><br/>
                UP主：
                <el-link
                  v-if="videoData.owner"
                  :href="'https://space.bilibili.com/' + videoData.owner.mid"
                  target="_blank"
                  type="primary"
                  style="vertical-align: baseline;"
                >
                  {{ videoData.owner.name }}
                </el-link><br/>
                发布时间：{{ videoData.pubdate ? formatTime(videoData.pubdate) : '-' }}<br/>
                截止 {{ formatTime(Math.floor(Date.now()/1000)) }} 载入实时弹幕 
                <el-link
                  v-if="videoData.owner"
                  :href="'https://api.bilibili.com/x/v1/dm/list.so?oid=' + videoData.cid"
                  target="_blank"
                  type="primary"
                  style="vertical-align: baseline;"
                >
                  {{ originDanmakuCount }} 
                </el-link>
                条
              </p>
              <p style="color: gray">
                  <template v-if="currentUserMidHash">
                    用户<el-link type="primary" @click="midHashOnClick" style="vertical-align: baseline;">{{ currentUserMidHash }}</el-link>
                    发送弹幕共 {{ displayedDanmakus.length }} 条
                  </template>
                  <template v-else>
                    列表当前共 {{ displayedDanmakus.length }} 条弹幕
                  </template>
              </p>
            </div>

            <!-- 下半部：弹幕表格 -->
            <el-table :data="displayedDanmakus" style="width: 100%;" height="calc(100% - 150px)" border>
              <el-table-column prop="progress" label="时间" align="left" width="100">
                <template #default="{ row }">{{ formatProgress(row.progress) }}</template>
              </el-table-column>
              <el-table-column prop="content" label="弹幕内容" align="left" />
              <el-table-column prop="ctime" label="发送时间" align="left" width="180">
                <template #default="{ row }">{{ formatCtime(row.ctime) }}</template>
              </el-table-column>
            </el-table>
          </el-main>
        </el-aside>

        <!-- 右边 -->
        <el-container>
          <el-header style="height: auto;">
            <el-input v-model="filterText" placeholder="请输入正则表达式" style="width: 300px; margin-right: 10px;"></el-input>
            <el-button @click="applyFilter">筛选</el-button>
            <el-button @click="resetFilter" type="warning">取消筛选</el-button>
            <div style="margin-top: 10px; margin-bottom: 10px;">
              共有 {{ danmakuCount.user }} 位不同用户发送了 {{ danmakuCount.dm }} 条弹幕
            </div>
          </el-header>

          <el-main style="flex: 1;">
            <div id="chart" style="width: 100%; height: 100%;"></div>
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
