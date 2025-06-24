({
    name: 'date',
    title: '发送日期分布',
    instance: null,
    refresh: true,
    render(data) {
        const countMap = {};
        data.forEach(d => {
            const date = new Date(d.ctime * 1000).toLocaleDateString();
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
    async onClick({ params, applySubFilter }) {
        const selectedDate = params.name;
        await applySubFilter({
            value: selectedDate,
            filterFn: (data) => data.filter(d => new Date(d.ctime * 1000).toLocaleDateString() === selectedDate),
            filterJudge: d => new Date(d.ctime * 1000).toLocaleDateString() === selectedDate,
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
})