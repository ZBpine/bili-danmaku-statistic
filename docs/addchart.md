# 说明

> 最低`1.7.4`版本新增功能`添加自定义图表`

例如你看到[毕导视频讲本福特定律](https://www.bilibili.com/video/BV1VrVSz1Eme)，于是想统计一下弹幕验证一下：
![示例](https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/images/bili-danmaku-statistic-example03.png)

这就需要添加自定义图表：右上角设置->添加图表->输入代码->添加。统计首位数字的代码我已经~~找ChatGPT~~写好了，[以下：](https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/docs/charts/chart-leadingDigit.js)
```js
{
    name: 'leadingDigit',
    title: '弹幕中数字首位分布',
    expandedH: false,
    render(data) {
        const digitCount = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };
        const digitRegex = /\d+/g;

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
                    return `首位数字：${p.name}<br/>数量：${p.value}<br/>占比：${percentages[labels.indexOf(p.name)]}%`;
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
                    formatter: (val) => `${percentages[val.dataIndex]}%`
                }
            }]
        });
    },
    async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
        const selectedDigit = params.name;
        await applySubFilter({
            value: selectedDigit,
            filterJudge: d => (d.content.match(/\d+/g) || []).some(n => n.replace(/^0+/, '')[0] === selectedDigit),
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
}
```


# 写法
```js
{
    name: 'customChart', // 唯一键名
    title: '示例图表', // 标题
    refresh: true,   // 是否支持刷新图表（可选）
    expandedH: true 或 false, // 是否支持高度展开（可选）
    actions: [               // 图表操作按钮（可选）
        {
            key: 'actionKey',
            icon: '✨',
            title: '操作',
            method: 'actionMethod'  // 图表操作方法名
        }
    ],
    actionMethod: { },               // 图表操作方法实现
    menuItems:[{                      // 菜单项（可选）
        getName: (item) => item.midHash, // 名称
        onSelect: (item) => { }          // 点击方法
    }],
    getMenuItems(){                     // 与menuItems作用相同
        return [{
            getName: (item) => item.midHash,
            onSelect: async (item) => { 
                this.method(item);      // 便于调用this
            }
        }];
    },
    render(data) {
        // 图表绘制逻辑
        // data 是当前筛选后的弹幕数组
        // ECharts 实例通过 this.instance 访问
        // 使用 this.instance.setOption({...}) 绘制 ECharts 图表
    },
    async onClick({ params, data, applySubFilter, ELEMENT_PLUS }) {
        // 用户点击图表元素后触发（可选）
        // params 是 echarts 的点击项参数
        // data 是当前筛选后的弹幕数组
        // applySubFilter(subFilt) 可用于筛选弹幕
        // ELEMENT_PLUS 可用于生成 ElTag、ElLink 等 Element Plus 组件
    }
}
```

其中`applySubFilter`
```js
await applySubFilter({
    value: any,                  // （可选）当前筛选值
    filterJudge: d => true,      // （必须）传入弹幕
    labelVNode: (h) => VNode     // （必须）筛选说明 UI 标签
});
```

弹幕结构如下，参考[protobuf弹幕proto定义](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/danmaku/danmaku_proto.md)
```js
{
  progress: 93856,             // 弹幕出现在视频中的时间，单位毫秒
  mode: 1,                     // 弹幕模式（底部 / 顶部等）
  fontsize: 25,                // 字体大小
  color: 16777215,             // 弹幕颜色，十进制颜色值
  ctime: 1746982858,           // 弹幕发送时间（UNIX 时间戳，单位秒）
  pool: 0,                     // 弹幕池类型
  midHash: '6c2b67a9',         // 用户哈希（经过 CRC32 混淆的 mid）
  id: 106847964361106457,      // 弹幕唯一 ID（有可能超出number范围，使用idStr更准）
  idStr: '106847964361106457', // 弹幕唯一 ID 字符串
  weight: 2,                   // 弹幕屏蔽等级
  attr: 1070080,               // 弹幕属性（XML弹幕没有这个）
  content: '2333333哈哈哈'     // 弹幕文本内容
}
```
不会写就让AI写好了