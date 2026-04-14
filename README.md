**项目3.0版本迁移至[bili-data-statistic](https://github.com/ZBpine/bili-data-statistic)，这里不再维护**

---

# B站视频弹幕统计
获取B站视频页弹幕数据，并生成统计页面。**看看到底是哪个b崽子弹幕刷屏🔪**

### 下载
[bilibili 视频弹幕统计|下载|查询发送者](https://greasyfork.org/zh-CN/scripts/534432-bilibili-%E8%A7%86%E9%A2%91%E5%BC%B9%E5%B9%95%E7%BB%9F%E8%AE%A1-%E4%B8%8B%E8%BD%BD-%E6%9F%A5%E8%AF%A2%E5%8F%91%E9%80%81%E8%80%85)

### 功能
1. 点击左下角“弹幕统计”按钮会弹出统计面板，点击其他区域收回。
2. 可加载XML弹幕、ProtoBuf实时弹幕、历史弹幕（超全）。
3. 可统计用户发送、弹幕词云、密度分布统计等。
4. 右上方文本框输入正则表达式，可筛选弹幕。
5. 点击用户弹幕统计可单独查看某用户发的弹幕。再点击左边的用户midhash可反查用户📦。
6. 与图表交互可筛选/排除弹幕。
7. 可在用户主页空间查看midHash，然后在用户弹幕统计定位用户。
8.  可转为[长条图片](https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/images/bili-danmaku-statistic-example02.png)。
9.  可下载html文件至本地。先新标签页打开，再点击保存。下载至本地后所有图表的交互都保留。
10. 可添加自定义图表，详见：[添加自定义图表](https://github.com/ZBpine/bili-danmaku-statistic/blob/main/docs/addchart.md)。

![图片06](https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/images/bili-danmaku-statistic-example06.png)
![图片01](https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/images/bili-danmaku-statistic-example01.png)
![图片04](https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/images/bili-danmaku-statistic-example04.png)
![图片05](https://cdn.jsdelivr.net/gh/ZBpine/bili-danmaku-statistic/images/bili-danmaku-statistic-example05.png)

### 注意
- 实时弹幕池容量有限（根据视频类型500-8000条不等），无法获取所有弹幕。
- midHash为用户id的哈希，想获得用户id可以暴力搜索。参考[怎么根据 midHash 反查 用户id?](https://github.com/SocialSisterYi/bilibili-API-collect/issues/698#issuecomment-1577172809)、["mid_hash" 反查为 “mid”](https://github.com/Aruelius/crc32-crack)。
- 10位数以上的用户id很可能查不到或查错 [UID讲解](https://www.bilibili.com/opus/921946620241641476)。
- 关于屏蔽等级：低于用户设定等级的弹幕将被屏蔽，也就是说屏蔽等级越低越容易被屏蔽。
- 关于条形图滑动条拖动问题：拖动滑轨上的滑条是缩放该轴，拖动突出来的滑条才是滚动该轴。
- 剧集只支持epid（`https://www.bilibili.com/bangumi/play/ep${id}`），不支持ssid（`https://www.bilibili.com/bangumi/play/ss${id}`）。因为ssid的链接是整季剧集，同样的ssid每个人看的剧集可能不一样。如果打开是ssid的链接，可以右边选集处点同一集，就会跳转epid的剧集了（还没出来按钮就刷新一下）。


### 感谢
- 大力感谢ChatGPT完成了80%的工作
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
  - [xml实时弹幕](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/danmaku/danmaku_xml.md)
  - [视频基本信息](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/video/info.md)
  - [剧集基本信息](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/bangumi/info.md#%E8%8E%B7%E5%8F%96%E5%89%A7%E9%9B%86%E6%98%8E%E7%BB%86web%E7%AB%AFssidepid%E6%96%B9%E5%BC%8F)
  - [用户名片信息](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/user/info.md#%E7%94%A8%E6%88%B7%E5%90%8D%E7%89%87%E4%BF%A1%E6%81%AF)
- [BiliBili_crc2mid](https://github.com/shafferjohn/bilibili-search)
- [iconfont](https://www.iconfont.cn/)

---
### 更新

**版本1.1**
- 优化弹幕统计ui，平时会隐藏于左下角
- 更新反查用户功能
- 封面、up头像查看

**版本1.2**
- 增加弹幕词云、弹幕密度分布、日期分布、时间分布统计

**版本1.3**
- 增加转为图片功能

**版本1.4**
- 增加新标签页打开功能
- 增加保存html至本地功能

**版本1.5**
- 增加图表关闭、调整顺序功能
- 增加弹幕列表收起功能

**版本1.6**
- 增加剧集弹幕统计
- 增加用户主页查看用户名片信息（计算midHash）

**版本1.7**
- 增加弹幕池统计图
- 增加提交子筛选功能
- 增加动态添加自定义统计图功能

**版本1.8**
- 增加虚拟化弹幕表格，加载更快

**版本1.9**
- 增加筛选排除功能
- 增加下载弹幕json功能，可配合 [YouTube 本地B站弹幕播放器](https://greasyfork.org/zh-CN/scripts/536159-youtube-%E6%9C%AC%E5%9C%B0b%E7%AB%99%E5%BC%B9%E5%B9%95%E6%92%AD%E6%94%BE%E5%99%A8) 使用

**版本1.10**
- 增加设置与缓存功能，可保存添加的图表
- 增加更多可选的图表

**版本2.0**
- 支持ProtoBuf实时弹幕、历史弹幕
- 支持子筛选排除
- 优化视频统计面板