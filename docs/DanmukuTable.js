export default function createDanmukuTable(Vue, ElementPlus) {
    const { ref, computed, nextTick, h } = Vue;
    return {
        name: 'DanmukuTable',
        props: {
            items: Array,
            itemHeight: { type: Number, default: 42 },
            virtualThreshold: { type: Number, default: 1200 },
            menuItems: Array
        },
        setup(props, { emit, expose }) {
            const scrollTop = ref(0);
            const scrollbarRef = ref(null);
            const isVirtual = computed(() => props.items.length > props.virtualThreshold);
            const start = computed(() => isVirtual.value ? Math.floor(scrollTop.value / props.itemHeight) : 0);
            const visibleCount = computed(() => isVirtual.value ? 50 : props.items.length);
            const visibleItems = computed(() =>
                props.items.slice(start.value, start.value + visibleCount.value)
            );
            const offsetTop = computed(() => isVirtual.value ? start.value * props.itemHeight : 0);
            const onScroll = ({ scrollTop: st }) => {
                scrollTop.value = st;
            };
            const highlightedRowIndex = ref(null);

            function formatTime(ts) {
                const d = new Date(ts * 1000);
                const [Y, M, D, h, m, s] = [
                    d.getFullYear(),
                    String(d.getMonth() + 1).padStart(2, '0'),
                    String(d.getDate()).padStart(2, '0'),
                    String(d.getHours()).padStart(2, '0'),
                    String(d.getMinutes()).padStart(2, '0'),
                    String(d.getSeconds()).padStart(2, '0')
                ];
                return `${Y}-${M}-${D} ${h}:${m}:${s}`;
            }
            function formatProgress(ms) {
                const s = Math.floor(ms / 1000);
                const min = String(Math.floor(s / 60)).padStart(2, '0');
                const sec = String(s % 60).padStart(2, '0');
                return `${min}:${sec}`;
            }
            function createCell(text, style = {}) {
                return h('div', {
                    style: {
                        padding: '8px',
                        boxSizing: 'border-box',
                        borderRight: '1px solid #ebeef5',
                        ...style
                    }
                }, text);
            }
            function createMenu(item) {
                const menuItems = props.menuItems;
                const items = menuItems.map((menu, idx) =>
                    h(ElementPlus.ElMenuItem, {
                        index: idx,
                        disabled: menu.disabled,
                        style: { height: '36px', padding: '0 10px' }
                    }, () => menu.getName(item))
                );

                // 菜单选择事件
                const handleMenuSelect = async (index) => {
                    const menu = menuItems[index];
                    if (menu && typeof menu.onSelect === 'function') {
                        menu.disabled = true;
                        await menu.onSelect(item);
                        menu.disabled = false;
                    }
                };

                return h(ElementPlus.ElMenu, {
                    onSelect: handleMenuSelect,
                    style: { width: 'fit-content', borderRight: '0' }
                }, items);
            }
            const scrollToRow = (idx) => {
                nextTick(() => {
                    if (isVirtual.value) {
                        const top = Math.max(0, idx - 3) * props.itemHeight;
                        scrollbarRef.value?.wrapRef?.scrollTo?.({
                            top,
                            behavior: 'smooth'
                        });
                    } else {
                        const row = scrollbarRef.value?.$el?.querySelectorAll('.danmaku-row')[idx];
                        row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                    }
                    highlightedRowIndex.value = idx;
                    // 清除高亮
                    setTimeout(() => {
                        highlightedRowIndex.value = null;
                    }, 1500);
                });
            };
            expose({ scrollToRow });
            return () =>
                h('div', {
                    class: { 'danmuku-table': true, 'danmuku-table--virtual': isVirtual.value },
                    style: { display: 'flex', flexDirection: 'column', border: '1px solid #ebeef5', minHeight: 0 }
                }, [
                    // 表头
                    h('div', {
                        style: {
                            display: 'flex', fontWeight: 'bold', color: '#909399',
                            backgroundColor: '#fdfdfd', borderBottom: '1px solid #ebeef5'
                        }
                    }, [
                        createCell('时间', { width: '70px' }),
                        createCell('弹幕内容', { flex: 1 }),
                        createCell('发送时间', { width: '170px', borderRight: 'none' })
                    ]),
                    // 内容区域
                    h(ElementPlus.ElScrollbar, { ref: scrollbarRef, onScroll }, {
                        default: () => h('div', {
                            style: {
                                height: isVirtual.value ? (props.items.length * props.itemHeight + 'px') : 'auto',
                                position: 'relative'
                            }
                        }, [
                            h('div', {
                                style: { transform: `translateY(${offsetTop.value}px)` }
                            }, visibleItems.value.map((item, i) => {
                                const isHighlighted = start.value + i === highlightedRowIndex.value;
                                return h('div', {
                                    class: 'danmaku-row',
                                    style: {
                                        display: 'flex',
                                        borderBottom: '1px solid #ebeef5',
                                        transition: 'background-color 0.2s',
                                        backgroundColor: isHighlighted ? '#ecf5ff' : undefined
                                    },
                                    onMouseenter: (e) => e.currentTarget.style.backgroundColor = '#f5f7fa',
                                    onMouseleave: (e) => e.currentTarget.style.backgroundColor = '',
                                    onClick: () => emit('row-click', item)
                                }, [
                                    createCell(formatProgress(item.progress ?? 0), { width: '70px' }),
                                    h(ElementPlus.ElPopover, {
                                        placement: 'top-end',
                                        showAfter: 200,
                                        width: 'auto'
                                    }, {
                                        reference: () => createCell(item.content, {
                                            flex: 1,
                                            wordBreak: 'break-word',
                                            whiteSpace: 'normal',
                                            overflowWrap: 'anywhere',
                                        }),
                                        default: () => createMenu(item)
                                    }),
                                    createCell(formatTime(item.ctime), { width: '170px', borderRight: 'none' })
                                ])
                            }
                            ))
                        ])
                    })
                ]);
        }
    }
}