({
    name: 'weight',
    title: '弹幕屏蔽等级分布',
    refresh: true,
    menuItems: [{
        getName: (item) => '屏蔽等级：' + item.weight
    }],
    render(data) {
        const levelCount = {};
        data.forEach(d => {
            const level = d.weight;
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
            series: [{
                type: 'bar', data: yData,
                label: { show: true, position: 'top' }
            }]
        });
    },
    async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
        const level = Number(params.name);
        await applySubFilter({
            value: level,
            filterFn: data => (data || []).filter(d => (d.weight) === level),
            filterJudge: d => (d.weight) === level,
            labelVNode: h => h('span', [
                '屏蔽等级：',
                h(ELEMENT_PLUS.ElTag, { type: 'info', size: 'small', style: 'vertical-align: baseline' }, String(level))
            ])
        });
    }
})
