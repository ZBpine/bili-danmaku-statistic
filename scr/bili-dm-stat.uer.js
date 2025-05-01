// ==UserScript==
// @name         bilibili 视频弹幕统计|下载|查询发送者
// @namespace    https://github.com/ZBpine/bili-danmaku-statistic
// @version      1.1.6
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
    btn.style.borderRadius = '20px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '16px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'space-between';
    btn.style.boxShadow = '0 0 5px rgba(0, 172, 229, 0.3)';
    btn.style.transition = 'left 0.3s ease-in-out, background-color 0.2s ease-in-out';

    btn.onmouseenter = () => {
      btn.style.left = '10px';
      btn.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
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
        const loading = ref(true);
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
          }
          return danmakus;
        }

        function midHashOnClick() {
          if (!currentUserMidHash.value) return;
          ELEMENT_PLUS.ElMessageBox.confirm(
            '是否尝试反查用户ID？（可能需要一段时间）',
            '提示',
            {
              confirmButtonText: '是',
              cancelButtonText: '否',
              type: 'warning',
            }
          ).then(() => {
            // 开始反查用户ID
            var midcrc = new biliCrc2Mid();
            var result = midcrc(currentUserMidHash.value);
            if (result && result !== '-1') {
              ELEMENT_PLUS.ElMessageBox.alert(
                `已查到用户ID：
                <a href="https://space.bilibili.com/${result}" target="_blank" style="color:#409eff;text-decoration:none;">
                  点击访问用户空间
                </a>`,
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
            navigator.clipboard.writeText(currentUserMidHash.value).then(() => {
              ELEMENT_PLUS.ElMessage.success('midHash已复制到剪贴板');
            }).catch(() => {
              ELEMENT_PLUS.ElMessage.error('复制失败');
            });
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
                endValue: userNames.length >= 20 ? 19 : userNames.length,
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

        function handleRowClick(row) {
          if (!chart) return;

          const userMid = row.midHash;
          const option = chart.getOption();

          const index = option.yAxis[0].data.indexOf(userMid);
          if (index >= 0) {
            chart.setOption({
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
                startValue: Math.min(option.yAxis[0].data.length - 20, Math.max(0, index - 9)),
                endValue: Math.min(option.yAxis[0].data.length - 1, Math.max(0, index - 9) + 19)
              }]
            });
          }
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
          const url = location.href;
          let bvid = null;

          // 判断是否为 watchlater 链接
          if (url.includes('/list/watchlater')) {
            const match = url.match(/[?&]bvid=(BV\w+)/);
            if (match) {
              bvid = match[1];
            }
          } else {
            const match = url.match(/\/video\/(BV\w+)/);
            if (match) {
              bvid = match[1];
            }
          }

          if (!bvid) {
            console.error('找不到 BVID');
            return null;
          }
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
          videoData.value = await getVideoData();
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
          loading.value = false;
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
          loading,
          midHashOnClick,
          handleRowClick,
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
              <h3>{{ videoData.title || '加载中...' }}
                <el-popover
                  placement="right"
                  v-if="videoData.pic"
                  popper-style="width: 360px; height: 180px; padding: 10px; box-sizing: content-box;"
                >
                  <div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                    <img
                      :src="videoData.pic"
                      alt="视频封面"
                      style="max-width: 100%; max-height: 100%;"
                    />
                  </div>
                  <template v-slot:reference>
                    <el-link
                      :href="videoData.pic"
                      target="_blank"
                      type="primary"
                    >
                      <svg t="1746010439489" class="icon" viewBox="0 0 1029 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5042"
                      width="20" height="20">
                      <path d="M487.966546 867.289336c-0.191055 0-0.38211 0-0.577318-0.008306-85.119089-0.926201-171.396967-8.3898-256.428835-22.178976a29.812863 29.812863 0 0 0-0.598085-0.095528c-75.890309-13.224318-150.032051-79.636645-165.274905-148.050895l-0.161981-0.751759c-33.405525-161.104925-33.405525-324.473435 0-485.570054 0.053994-0.249202 0.103834-0.498404 0.161981-0.743452C80.326104 141.467809 154.471999 75.051329 230.370615 61.835317l0.593931-0.09968a1713.961362 1713.961362 0 0 1 550.250427 0.09968c75.890309 13.207705 150.036204 79.624185 165.279059 148.055049 0.058147 0.249202 0.107988 0.494251 0.157827 0.743452 21.672265 104.444702 29.385067 210.417843 22.943196 314.962227-1.761027 28.620847-26.390489 50.355413-55.011337 48.627612-28.625001-1.765181-50.38864-26.390489-48.627612-55.011336 5.864553-95.195155-1.158789-191.769229-20.878973-287.043298-6.836441-29.630115-51.015798-62.56631-81.414286-67.99476a1610.243499 1610.243499 0 0 0-515.735953 0c-30.394335 5.432603-74.577845 38.368798-81.422593 67.990606-30.377721 146.817345-30.381874 295.690607 0 442.512105 6.853054 29.621808 51.028258 62.55385 81.422593 67.986453 79.81524 12.925276 160.756042 19.923698 240.587896 20.791752 28.670688 0.315656 51.65957 23.802942 51.352221 52.481936-0.311502 28.479633-23.49144 51.352221-51.900465 51.352221z" p-id="5043" fill="#409eff"></path><path d="M727.790223 570.539621c20.272581 20.272581 53.150628 20.276734 73.427362 0s20.276734-53.146475 0-73.423209l-102.762589-102.766742a51.917079 51.917079 0 0 0-73.427362 0l-86.036983 86.036982-66.055138-66.055137c-20.272581-20.272581-53.146475-20.272581-73.423209 0l-162.716431 162.712278c-20.272581 20.280888-20.272581 53.150628 0 73.423209a51.759251 51.759251 0 0 0 36.711604 15.209628c13.286619 0 26.573238-5.075414 36.711605-15.209628l126.004827-126.004826 66.055137 66.055137c20.276734 20.280888 53.146475 20.280888 73.419056 0l86.04529-86.036983 66.046831 66.059291zM974.911364 766.408222c-20.272581-20.272581-53.142322-20.272581-73.427363 0l-40.877431 40.881585v-133.318905c0-28.670688-23.246391-51.917079-51.917079-51.917079s-51.917079 23.246391-51.917078 51.917079v133.318905l-40.877432-40.881585c-20.285041-20.272581-53.154782-20.272581-73.427362 0-20.272581 20.280888-20.272581 53.150628 0 73.427363l129.510268 129.501961c10.138367 10.134214 23.424986 15.205474 36.711604 15.205474s26.569084-5.07126 36.711605-15.205474l129.510268-129.501961c20.268428-20.276734 20.268428-53.146475 0-73.427363z" p-id="5044" fill="#409eff"></path>
                      </svg>
                    </el-link>
                  </template>
                </el-popover>
              </h3>
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
                </el-link>
                <el-popover
                  placement="right"
                  v-if="videoData.owner"
                  popper-style="width: 100px; height: 100px; padding: 10px; box-sizing: content-box;"
                >
                  <div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                    <img
                      :src="videoData.owner.face"
                      alt="UP主头像"
                      style="max-width: 100%; max-height: 100%; border-radius: 50%;"
                    />
                  </div>
                  <template v-slot:reference>
                    <el-link
                      :href="videoData.owner.face"
                      target="_blank"
                      type="primary"
                      style="margin-left: 8px; vertical-align: -2px;"
                    >
                      <svg t="1746010657723" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="10144"
                      width="16" height="16">
                      <path d="M1024 512c0-281.6-230.4-512-512-512S0 230.4 0 512s230.4 512 512 512 512-230.4 512-512z m-512 448c-249.6 0-448-198.4-448-448s198.4-448 448-448 448 198.4 448 448-198.4 448-448 448z" fill="#409eff" p-id="10145"></path><path d="M627.2 505.6c44.8-38.4 76.8-89.6 76.8-153.6 0-108.8-83.2-192-192-192s-192 83.2-192 192c0 64 32 115.2 76.8 153.6-102.4 44.8-172.8 147.2-172.8 262.4 0 19.2 12.8 32 32 32s32-12.8 32-32c0-121.6 102.4-224 224-224s224 102.4 224 224c0 19.2 12.8 32 32 32s32-12.8 32-32c0-115.2-70.4-217.6-172.8-262.4zM512 480c-70.4 0-128-57.6-128-128s57.6-128 128-128 128 57.6 128 128-57.6 128-128 128z" fill="#409eff" p-id="10146"></path>
                      </svg>
                    </el-link>
                  </template>
                </el-popover><br/>
                发布时间：
                <el-tag type="info" size="small" style="vertical-align: baseline;">
                  {{ videoData.pubdate ? formatTime(videoData.pubdate) : '-' }}
                </el-tag><br/>
                截止 <el-tag type="info" size="small" style="vertical-align: baseline;"> {{ formatTime(Math.floor(Date.now()/1000)) }} </el-tag>
                播放量:
                <el-tag type="primary" size="small" style="vertical-align: baseline;">
                  {{ videoData.stat.view || '-' }}
                </el-tag><br/>
                总弹幕数:
                <el-tag type="primary" size="small" style="vertical-align: baseline;">
                  {{ videoData.stat.danmaku || '-' }}
                 </el-tag>
                 ，载入实时弹幕
                <el-link
                  v-if="videoData.owner"
                  :href="'https://api.bilibili.com/x/v1/dm/list.so?oid=' + videoData.cid"
                  target="_blank"
                  type="primary"
                  style="vertical-align: baseline;"
                  title="下载弹幕"
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
            <el-table
              :data="displayedDanmakus"
              style="width: 100%;"
              height="calc(100% - 50px)"
              border
              @row-click="handleRowClick"
              v-loading="loading"
            >
              <el-table-column prop="progress" label="时间" align="left" width="80">
                <template #default="{ row }">{{ formatProgress(row.progress) }}</template>
              </el-table-column>
              <el-table-column prop="content" label="弹幕内容" align="left">
                <template #default="{ row }">
                  <el-tooltip
                    class="item"
                    placement="top-start"
                    :content="'发送用户: ' + row.midHash + '\\n屏蔽等级: ' + row.weight"
                  >
                    <span>{{ row.content }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column prop="ctime" label="发送时间" align="left" width="160">
                <template #default="{ row }">{{ formatCtime(row.ctime) }}</template>
              </el-table-column>
            </el-table>
          </el-main>
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

/*
图标来源
https://www.iconfont.cn/
*/
