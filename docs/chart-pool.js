addCustomChart('pool', {
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
    async onClick({ params, data, applySubFilter, ELEMENT_PLUS }) {
        const poolLabel = params.name;
        const poolVal = this._poolIndexMap?.[poolLabel];
        await applySubFilter(
            data.filter(d => d.pool === poolVal),
            {
                chart: 'pool',
                value: poolLabel,
                labelVNode: (h) => h('span', [
                    h(ELEMENT_PLUS.ElTag, {
                        type: 'info',
                        size: 'small',
                        style: 'vertical-align: baseline;'
                    }, poolLabel)
                ])
            }
        );
    }
});
