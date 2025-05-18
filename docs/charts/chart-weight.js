({
    name: 'weight',
    title: '弹幕屏蔽等级分布',
    render(data) {
        const levelCount = {};
        data.forEach(d => {
            const level = d.weight ?? 0;
            levelCount[level] = (levelCount[level] || 0) + 1;
        });

        const keys = Object.keys(levelCount).sort((a, b) => a - b);
        const xData = keys.map(k => Number(k));
        const yData = keys.map(k => levelCount[k]);

        this.instance.setOption({
            title: { text: '弹幕屏蔽等级分布' },
            tooltip: {},
            xAxis: { type: 'category', data: xData },
            yAxis: { type: 'value', name: '弹幕数' },
            series: [{ type: 'bar', data: yData }]
        });
    },
    async onClick({ params, applySubFilter, ELEMENT_PLUS, h }) {
        const level = Number(params.name); // 直接就是等级数
        await applySubFilter({
            value: level,
            filterFn: data => (data || []).filter(d => (d.weight ?? 0) === level),
            labelVNode: h => h('span', [
                '等级：',
                h(ELEMENT_PLUS.ElTag, { type: 'info', size: 'small', style: 'vertical-align: baseline' }, String(level))
            ])
        });
    }
})
