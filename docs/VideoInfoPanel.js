export default function createVideoInfoPanel(Vue, ElementPlus) {
    const { h, ref } = Vue;
    return {
        name: 'VideoInfoPanel',
        props: {
            videoInfo: Object
        },
        setup(props) {
            const statItems = [
                { key: 'like', label: '点赞' },
                { key: 'coin', label: '投币' },
                { key: 'favorite', label: '收藏' },
                { key: 'share', label: '分享' },
                { key: 'view', label: '播放' },
                { key: 'danmaku', label: '弹幕' },
                { key: 'reply', label: '评论' },
            ];
            const descExpanded = ref(false);

            return () =>
                h(ElementPlus.ElCard, { shadow: 'never', style: 'margin-bottom: 10px;' }, {
                    default: () => [
                        h('h3', { style: 'margin: 0 0 8px 0;' }, [
                            props.videoInfo.title || '加载中...',
                            props.videoInfo.subtitle
                                ? h('span', {
                                    style: 'margin-left: 10px; color: #999999;'
                                }, props.videoInfo.subtitle)
                                : null,
                            props.videoInfo.id
                                ? h(ElementPlus.ElLink, {
                                    href: props.videoInfo.url,
                                    target: '_blank',
                                    type: 'primary',
                                    style: 'margin-left: 10px; vertical-align: baseline;'
                                }, () => props.videoInfo.id)
                                : null,
                        ]),
                        h('div', {
                            style: 'display: flex; gap: 16px; margin-bottom: 8px;'
                        }, [
                            h('div', {
                                style: 'display: flex; flex-direction: column; gap: 8px;'
                            }, [
                                props.videoInfo.cover
                                    ? h(ElementPlus.ElImage, {
                                        src: props.videoInfo.cover,
                                        style: 'width: 160px; height: 90px; border-radius: 6px; flex-shrink: 0;',
                                        fit: 'cover',
                                        previewSrcList: [props.videoInfo.cover]
                                    })
                                    : null,
                                h('div', { style: 'flex: 1;' }, [
                                    h('div', {
                                        style: 'display: flex; align-items: center; gap: 10px;'
                                    }, [
                                        props.videoInfo.owner?.face
                                            ? h(ElementPlus.ElImage, {
                                                src: props.videoInfo.owner.face,
                                                style: 'width: 32px; height: 32px; border-radius: 50%;',
                                                fit: 'cover',
                                                previewSrcList: [props.videoInfo.owner.face]
                                            })
                                            : null,
                                        h(ElementPlus.ElLink, {
                                            href: `https://space.bilibili.com/${props.videoInfo.owner?.mid}`,
                                            target: '_blank',
                                            type: 'info'
                                        }, () => props.videoInfo.owner?.name || '未知UP主')
                                    ]),
                                ]),
                            ]),
                            props.videoInfo.desc
                                ? h(ElementPlus.ElText, {
                                    type: 'info',
                                    size: 'small',
                                    lineClamp: descExpanded.value ? undefined : 7,
                                    style: 'white-space: pre-wrap; align-self: flex-start; cursor: pointer;',
                                    onClick: () => {
                                        descExpanded.value = !descExpanded.value;
                                    }
                                }, () => props.videoInfo.desc)
                                : null,
                        ]),
                        h(ElementPlus.ElText, {
                            type: 'info',
                            size: 'small',
                            style: 'display: flex; flex-wrap: wrap; column-gap: 20px; align-items: center;'
                        }, [
                            h('span', {}, `视频发布：${props.videoInfo.pubtime ? new Date(props.videoInfo.pubtime * 1000).toLocaleString() : '-'}`),
                            h('span', {}, `抓取时间：${props.videoInfo.fetchtime ? new Date(props.videoInfo.fetchtime * 1000).toLocaleString() : '-'}`)
                        ]),
                        h(ElementPlus.ElDivider, { style: 'margin: 10px 0;' }, () => ''),
                        h(ElementPlus.ElRow, { gutter: 20 }, () =>
                            statItems.map(item =>
                                h(ElementPlus.ElCol, { span: 6, key: item.key }, () =>
                                    h(ElementPlus.ElStatistic, {
                                        title: item.label,
                                        value: props.videoInfo.stat?.[item.key] ?? '-'
                                    })
                                )
                            )
                        )
                    ]
                });
        }
    };
}