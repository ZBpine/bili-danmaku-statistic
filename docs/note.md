代码基本上是chatGPT写的，记录一下整个脚本运行逻辑以及遇到的bug

首先把最外层的函数收起来，总共有这些函数：
```js
initIframeApp;  //渲染页面
BiliDanmakuUtils; //获取数据
insertButton;   //插入初始按钮
openPanel; //打开iframe弹幕统计面板
openPanelInNewTab;  //打开新标签页弹幕统计面板
savePanel;  //保存弹幕统计面板
```
按代码运行的顺序讲解，首先运行的是insertButton(); 就是生成一个`弹幕统计`的按钮插入B站页面，做为脚本运行的入口。按钮点击事件绑定了`btn.onclick = openIframe;` 

点击按钮就会运行`openIframe` ，生成蒙层、iframe并插入B站页面。
> 之所以用iframe是因为原本插入div报错，B站本身的图片、评论看不见了
> 
> ` Uncaught TypeError: Vue.use is not a function`
> 
> chatgpt分析原因：
> 1. 在 Vue 3 中，`Vue.use()` 这个 API 被取消了。Vue 3 直接通过 `app.use()`，而不是 `Vue.use()`。
> 2. B站本身（`s1.hdslb.com`的静态资源）在自己的代码里使用了 Vue 2，而且它调用了 Vue.use()。
> 3. 油猴脚本在全局引入了 Vue3，把B站原本 Vue2 覆盖了
> 4. 建议在一个 iframe 里面跑你自己的 Vue3 应用，B站本身页面继续使用他们自己的 Vue2，不互相污染。

`openIframe`在`iframe.onload`载入iframe时获取数据，渲染页面

1. **获取数据：**

调用`BiliDanmakuUtils`获取数据
```js
const { bvid, p } = parseBiliUrl(location.href);
const videoData = await getVideoData(bvid, p);
const danmakuData = await getDanmakuData(videoData);
```
首先从页面的url获取视频的bvid和分p视频的页数，然后从 [视频基本信息API](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/video/info.md) 获取videoData，再从 [xml实时弹幕API](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/danmaku/danmaku_xml.md) 获取弹幕数据。

> 每个视频有一个cid(chatid)，通过cid就能获取对应视频的弹幕。
> 
> cid在视频基本信息中（`videoData.cid`）。
> 
> 由于页面本身的`window.__INITIAL_STATE__.videoData`脚本获取不到，所以使用B站API获取。
> 
> 只有bvid就能获取videoData.cid，但是如果是分p视频，每p视频都有自己的cid，在`videoData.pages`数组里面，所以要知道p以确定数组索引。
>
> `getDanmakuData` 获取了xml弹幕数据后会调用`parseDanmakuXml`解析为json对象，参考[xml格式结构](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/danmaku/danmaku_xml.md#xml%E6%A0%BC%E5%BC%8F%E7%BB%93%E6%9E%84)

1. **渲染页面：**

调用`initIframeApp`渲染页面

iframe创建后里面是空的html，`initIframeApp`首先把引用的css和js塞进去，然后创建一个div作为Vue的挂载点，然后挂载Vue，然后`app setup()`里面没什么好讲的了。细节复制过去问chatGPT就行。

> `onMounted`挂载时改造了`videoData`，如果p有值，那么会记录进`videoData`，以便后续调用。并且如果是分p视频，那么duration记录的是总时长，`onMounted`会把pages里面的duration覆盖原本的。
> ```js
> videoData.page_cur = videoData.pages[p - 1];
> ```

> 其中`biliCrc2Mid`是从[bilibili-search](https://github.com/shafferjohn/bilibili-search/blob/master/crc32.js)复制来的，速度很快，比[常规的暴力搜索](https://github.com/SocialSisterYi/bilibili-API-collect/issues/698#issuecomment-1577172809)快很多。

再讲讲新标签页打开和本地保存，具体做法是写一个HTML 字符串，通过`${initIframeApp.toString()}`把整个渲染代码插入到新HTML里面，然后生成 blob URL，再打开或保存。

> 如果插入新HTML的代码里又含有`${initIframeApp.toString()}`，那会导致新页面显示这些js代码。
> 
> 所以`openPanelInNewTab`、`savePanel`这两个函数不能写到`initIframeApp`里面，里面的`openInNewTab`调用它们。
> 
> 由于相同原因，新标签页自己不能保存页面，得传消息回主页面，让主页面保存html

> 原本获取数据是在Vue挂载时`onMounted`调用的，但是加了新标签页打开和本地保存功能后，显然分离数据获取和页面渲染更好。
>
> 1. 主页面直接fetch数据
> 2. 新标签页通过和主页面通信获取数据
> 3. 保存本地直接把数据记成字符串
>
> 只要准备好数据、一个iframe、`initIframeApp`函数，就能渲染出统计面板了

> 如果外面不包iframe，打开新标签页，直接将面板插入到body里，高度会错乱。
>
> 比如template右半边，`el-main`有高度，`<div id="wrapper-chart">`高度auto，里面的每个图表`height: 50%`，那这个高度是不定的。
>
> 但是放进iframe里就是正常显示的，图表`height: 50%`也不知道按什么地方算的，和el-main高度的一半比较接近。另外iframe得设置`position = 'fixed'`,不然高度也是错的。太复杂懒得纠结了。

---
新增
```js
BiliMidHashConverter;   //计算mid的crc32 hash
initUserIframeApp;  //渲染用户空间页面
BiliDanmakuUtils.getUserCardData //获取用户名片信息
BiliDanmakuUtils.getEpisodeData //获取剧集信息
```

`BiliMidHashConverter`为原本`biliCrc2Mid`改过来的，除了原本的反查mid，还增加了mid转hash方法。

因为新增了在`space.bilibili.com`页面查看用户信息功能，所以新增函数`initUserIframeApp`渲染此面板，在`openPanel`处判断url，以此决定调用`initIframeApp`还是`initUserIframeApp`。数据从[用户名片信息api](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/user/info.md#%E7%94%A8%E6%88%B7%E5%90%8D%E7%89%87%E4%BF%A1%E6%81%AF)获取。

此外新增了支持剧集弹幕统计。从[剧集基本信息api](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/bangumi/info.md#%E8%8E%B7%E5%8F%96%E5%89%A7%E9%9B%86%E6%98%8E%E7%BB%86web%E7%AB%AFssidepid%E6%96%B9%E5%BC%8F)处获取数据，获取到的是整部剧的数据，需要根据epid找到对应的剧集。`episodes[]`里面是正片，`section[].episodes[]`里面是非正片内容。比如`section[].title='花絮'`，`section[].episodes[]`里就是花絮剧集。

> 由于懒得改动其他代码，故在`onMounted`挂载时把剧集信息塞进了`videoData`。
