addCustomChart('leadingDigit', {
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
            title: { text: '弹幕中数字首位分布（非0）' },
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
            filterFn: (data) => data.filter(d => (d.content.match(/\d+/g) || []).some(n => n.replace(/^0+/, '')[0] === selectedDigit)),
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
});
