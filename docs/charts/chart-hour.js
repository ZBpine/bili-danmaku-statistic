({
    name: 'hour',
    title: '发送时间分布',
    instance: null,
    refresh: true,
    render(data) {
        const hours = new Array(24).fill(0);
        data.forEach(d => {
            const hour = new Date(d.ctime * 1000).getHours();
            hours[hour]++;
        });
        this.instance.setOption({
            title: { text: '发送时间分布' },
            tooltip: {},
            xAxis: { type: 'category', data: hours.map((_, i) => i + '时') },
            yAxis: { type: 'value', name: '弹幕数量' },
            series: [{
                type: 'bar', data: hours,
                label: { show: true, position: 'top' }
            }]
        });
    },
    async onClick({ params, applySubFilter }) {
        const selectedHour = parseInt(params.name);
        await applySubFilter({
            value: selectedHour,
            filterFn: (data) => data.filter(d => new Date(d.ctime * 1000).getHours() === selectedHour),
            filterJudge: d => new Date(d.ctime * 1000).getHours() === selectedHour,
            labelVNode: (h) => h('span', [
                '每天',
                h(ELEMENT_PLUS.ElTag, {
                    type: 'info',
                    size: 'small',
                    style: 'vertical-align: baseline;'
                }, selectedHour),
                '点'
            ])
        });
    }
})