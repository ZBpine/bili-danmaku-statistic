addCustomChart('densityRange', {
    render(data) {
        const { formatProgress, videoData } = this.ctx;
        const duration = videoData.value.duration * 1000;
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
            title: { text: '弹幕密度分布（选取范围）' },
            tooltip: {
                trigger: 'axis',
                formatter: function (params) {
                    const ms = params[0].value[0] * 1000;
                    return `时间段：${formatProgress(ms)}<br/>弹幕数：${params[0].value[1]}`;
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
                areaStyle: {} // 可选加背景区域
            }]
        });
    },
    clickBuffer: [],
    tempMarkLine: null,
    async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
        const { formatProgress } = this.ctx;
        const sec = params.value[0];
        this.clickBuffer.push(sec);

        // 第一次点击，添加辅助线
        if (this.clickBuffer.length === 1) {
            this.tempMarkLine = {
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
            };
            this.instance.setOption({
                series: [{
                    markLine: this.tempMarkLine
                }]
            });
            ELEMENT_PLUS.ElMessage.info('请点击结束时间');
            return;
        }

        // 第二次点击，清除临时标记 + 应用时间范围筛选
        const [startSec, endSec] = this.clickBuffer.sort((a, b) => a - b);
        const startMs = startSec * 1000;
        const endMs = endSec * 1000;
        this.clickBuffer = [];
        this.tempMarkLine = null;

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
            }]
        });

        await applySubFilter({
            value: `${formatProgress(startMs)} ~ ${formatProgress(endMs)}`,
            filterFn: (data) => data.filter(d => d.progress >= startMs && d.progress <= endMs),
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
        this.instance.setOption({
            series: [{
                markLine: null,
                markArea: null
            }]
        });
    }
});
