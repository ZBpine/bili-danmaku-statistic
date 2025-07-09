({
    name: 'attr',
    title: '弹幕属性分布',
    refresh: true,
    getMenuItems() {
        return [
            { getName: (item) => '属性：' + this.getAttrBits(item.attr) }
        ];
    },
    getAttrBits(attr) {
        attr = Number(attr);
        if (!Number.isInteger(attr) || attr === 0) return 'bit:-';
        const bits = [];
        for (let i = 0; i < 32; i++) {
            if ((attr & (1 << i)) !== 0) bits.push(i);
        }
        return 'bit:' + (bits.length ? bits.join('|') : '-');
    },
    render(data) {
        // 统计不同attr出现次数
        const attrCount = {};
        data.forEach(d => {
            const attr = d.attr ?? 0;
            attrCount[attr] = (attrCount[attr] || 0) + 1;
        });
        const labels = Object.keys(attrCount);
        const counts = labels.map(k => attrCount[k]);
        const total = counts.reduce((a, b) => a + b, 0);
        const percentages = counts.map(c => ((c / total) * 100).toFixed(2));

        this.instance.setOption({
            title: { text: '弹幕属性分布' },
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    const attr = params.name;
                    return `属性值：${attr}<br/>数量：${params.value}<br/>占比：${percentages[labels.indexOf(attr)]}%<br/>位说明：${this.getAttrBits(attr)}`;
                }
            },
            series: [{
                type: 'pie',
                radius: '60%',
                data: labels.map((k, i) => ({
                    name: k,
                    value: counts[i]
                })),
                label: {
                    formatter: (p) => `${p.name}\n${percentages[p.dataIndex]}%`
                }
            }]
        });
    },
    async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
        const attr = Number(params.name);
        await applySubFilter({
            value: attr,
            filterJudge: d => (d.attr ?? 0) === attr,
            labelVNode: (h) => h('span', [
                '弹幕属性 ',
                h(ELEMENT_PLUS.ElTag, {
                    type: 'info',
                    size: 'small',
                    style: 'vertical-align: baseline;'
                }, [
                    String(attr),
                    ' ',
                    this.getAttrBits(attr)
                ])
            ])
        });
    }
})