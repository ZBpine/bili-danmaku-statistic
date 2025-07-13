({
    name: 'attr',
    title: '弹幕属性分布',
    refresh: true,
    chartMode: 'bit', // 'attr' | 'bit'
    actions: [
        {
            key: 'toggleMode',
            icon: '⇄',
            title: '切换统计方式',
            method: 'toggleChartMode'
        }
    ],
    toggleChartMode() {
        this.chartMode = this.chartMode === 'attr' ? 'bit' : 'attr';
        if (this.instance && typeof this.instance.clear === 'function') {
            this.instance.clear();
        }
        this.render(this.ctx.danmakuList.current || []);
    },
    getMenuItems() {
        return [
            { getName: (item) => '属性：' + this.getAttrBits(item.attr).str }
        ];
    },
    getAttrBits(attr) {
        attr = Number(attr);
        if (!Number.isInteger(attr) || attr === 0) return { str: 'bit:-', bits: [] };
        const bits = [];
        for (let i = 0; i < 32; i++) {
            if ((attr & (1 << i)) !== 0) bits.push(i);
        }
        if (bits.length) {
            return { str: 'bit:' + bits.join('|'), bits }
        } else {
            return { str: 'bit:-', bits: [] };
        }
    },
    render(data) {
        if (this.chartMode === 'bit') {
            // 统计每个bit位出现次数
            const bitCount = Array(32).fill(0);
            let zeroBitCount = 0;
            data.forEach(d => {
                const bits = this.getAttrBits(d.attr).bits;
                if (bits.length === 0) {
                    zeroBitCount++;
                } else {
                    bits.forEach(b => bitCount[b]++);
                }
            });
            const labels = [];
            const counts = [];
            if (zeroBitCount > 0) {
                labels.push('-');
                counts.push(zeroBitCount);
            }
            for (let i = 0; i < 32; i++) {
                if (bitCount[i] > 0) {
                    labels.push(i);
                    counts.push(bitCount[i]);
                }
            }
            this.instance.setOption({
                title: { text: '弹幕属性 bit位分布' },
                tooltip: {},
                xAxis: {
                    type: 'category',
                    data: labels,
                    name: 'bit位'
                },
                yAxis: {
                    type: 'value',
                    name: '出现次数'
                },
                series: [{
                    type: 'bar', data: counts,
                    label: { show: true, position: 'top' }
                }]
            });
        } else {
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
                        return `属性值：${attr}<br/>数量：${params.value}<br/>占比：${percentages[labels.indexOf(attr)]}%<br/>位说明：${this.getAttrBits(attr).str}`;
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
        }
    },
    async onClick({ params, applySubFilter, ELEMENT_PLUS }) {
        if (this.chartMode === 'bit') {
            let filterJudge;
            const bit = Number(params.name);
            if (isNaN(bit) || bit < 0) {
                filterJudge = d => (d.attr ?? 0) === 0;
            } else {
                filterJudge = d => ((d.attr ?? 0) & (1 << bit)) !== 0;
            }
            await applySubFilter({
                value: params.name,
                filterJudge,
                labelVNode: (h) => h('span', [
                    '弹幕属性 bit位 ',
                    h(ELEMENT_PLUS.ElTag, {
                        type: 'info',
                        size: 'small',
                        style: 'vertical-align: baseline;'
                    }, params.name)
                ])
            });
        } else {
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
                        this.getAttrBits(attr).str
                    ])
                ])
            });
        }
    }
})