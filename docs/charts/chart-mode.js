({
    name: 'mode',
    title: '弹幕类型分布',
    expandedH: false,
    render(data) {
        const labelMap = {
            1: '普通弹幕',
            2: '普通弹幕2',
            3: '普通弹幕3',
            4: '底部弹幕',
            5: '顶部弹幕',
            6: '逆向弹幕',
            7: '高级弹幕',
            8: '代码弹幕',
            9: 'BAS弹幕'
        };

        const countMap = {};
        data.forEach(d => {
            const key = d.mode;
            countMap[key] = (countMap[key] || 0) + 1;
        });

        const keys = Object.keys(countMap);
        const xData = keys.map(k => labelMap[k] || `类型:${k}`);
        const yData = keys.map(k => countMap[k]);

        this._typeIndexMap = Object.fromEntries(xData.map((label, i) => [label, Number(keys[i])]));

        this.instance.setOption({
            title: { text: '弹幕类型分布' },
            tooltip: {},
            xAxis: { type: 'category', data: xData },
            yAxis: { type: 'value', name: '弹幕数' },
            series: [{ type: 'bar', data: yData }]
        });
    },
    async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
        const typeLabel = params.name;
        const typeVal = this._typeIndexMap?.[typeLabel];
        if (typeof typeVal !== 'number') return;

        await applySubFilter({
            value: typeVal,
            filterFn: data => data.filter(d => d.mode === typeVal),
            filterJudge: d => d.mode === typeVal,
            labelVNode: h => h('span', [
                '类型：',
                h(ELEMENT_PLUS.ElTag, { type: 'info', size: 'small', style: 'vertical-align: baseline' }, typeLabel)
            ])
        });
    }
})
