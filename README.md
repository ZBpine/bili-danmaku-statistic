# B站视频弹幕统计
获取B站视频页弹幕数据，并生成统计页面。**看看到底是哪个b崽子弹幕刷屏🔪**

### 使用方法
1. 点击左下角“弹幕统计”按钮会弹出统计面板。点击其他区域收回。
2. 右上方文本框输入正则表达式，可筛选弹幕
3. 点击条形图可单独查看某用户发的弹幕（筛选后的）。若想查看全部，可点击右边的用户midHash
4. 点击弹幕列表可定位发送者在条形图中的位置。鼠标悬浮于弹幕内容上显示发送者和屏蔽等级（屏蔽等级低于用户设定等级的弹幕将被屏蔽，也就是说越低越容易被屏蔽）
5. 右上方“载入实时弹幕xx条”的链接点开为弹幕xml文件，ctrl+s下载

![图片01](images/bili-danmaku-statistic-example01.png)

### 注意
- 实时弹幕池容量有限（根据视频类型500-8000条不等）
- midHash为用户id的哈希，想获得用户id可以暴力搜索。参考[怎么根据 midHash 反查 用户id?](https://github.com/SocialSisterYi/bilibili-API-collect/issues/698#issuecomment-1577172809)、["mid_hash" 反查为 “mid”](https://github.com/Aruelius/crc32-crack)

### 感谢
- 大力感谢ChatGPT完成了80%的工作
- 感谢[bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
  - [xml实时弹幕api](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/danmaku/danmaku_xml.md)
  - [视频基本信息api](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/video/info.md)
