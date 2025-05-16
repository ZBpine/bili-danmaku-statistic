export class BiliDanmakuUtils {
    constructor() {
        this.bvid = null;
        this.p = null;
        this.epid = null;
        this.cid = null;
        this.videoData = null;
        this.episodeData = null;
        this.danmakuData = null;
        this.danmakuXmlText = null;
        this.fetchtime = null;
        this.logStyle = {
            tag: 'Danmaku Utils',
            style: 'background: #00a2d8; color: white; padding: 2px 6px; border-radius: 3px;',
            errorStyle: 'background: #ff4d4f; color: white; padding: 2px 6px; border-radius: 3px;'
        };
    }
    logTag(...args) {
        console.log(`%c${this.logStyle.tag}`, this.logStyle.style, ...args);
    }
    logTagError(...args) {
        console.error(`%c${this.logStyle.tag}`, this.logStyle.errorStyle, ...args);
    }
    parseDanmakuXml(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        const dElements = xmlDoc.getElementsByTagName('d');
        const danmakus = [];
        for (const d of dElements) {
            const pAttr = d.getAttribute('p');
            if (!pAttr) continue;
            const parts = pAttr.split(',');
            if (parts.length < 8) continue;
            danmakus.push({
                progress: parseFloat(parts[0]) * 1000,
                mode: parseInt(parts[1]),
                fontsize: parseInt(parts[2]),
                color: parseInt(parts[3]),
                ctime: parseInt(parts[4]),
                pool: parseInt(parts[5]),
                midHash: parts[6],
                dmid: parts[7],
                weight: parseInt(parts[8]),
                content: d.textContent.trim()
            });
        }
        this.logTag(`解析弹幕xml文本完成，共 ${danmakus.length} 条弹幕`);
        return danmakus;
    }
    parseBiliUrl(url) {
        this.bvid = null;
        this.p = null;
        this.epid = null;
        const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
        if (bvidMatch) this.bvid = bvidMatch[0];
        if (this.bvid) {
            const pMatch = url.match(/[?&]p=(\d+)/);
            if (pMatch) {
                const parsedP = parseInt(pMatch[1], 10);
                if (!isNaN(parsedP) && parsedP >= 1) {
                    this.p = parsedP;
                }
            }
            if (this.p) {
                this.logTag(`解析 URL 得到 BVID=${this.bvid}, 分页p=${this.p}`);
            } else {
                this.logTag(`解析 URL 得到 BVID=${this.bvid}`);
            }
        } else {
            const epidMatch = url.match(/ep(\d+)/);
            if (epidMatch) {
                this.epid = parseInt(epidMatch[1]);
            } else {
                this.logTagError(`URL=${url} 解析未找到 ID 信息`);
            }
        }
    }
    _findCid() {
        if (this.bvid) {
            this.cid = this.videoData.pages[this.p - 1]?.cid || this.videoData.cid;
            return this.cid
        }
        if (this.epid) {
            if (Array.isArray(this.episodeData.episodes)) {
                const ep = this.episodeData.episodes.find(e => e.ep_id === this.epid || e.id === this.epid);
                if (ep) {
                    this.cid = ep.cid;
                    return this.cid
                }
            }
            if (Array.isArray(this.episodeData.section)) {
                for (const section of this.episodeData.section) {
                    const ep = section.episodes?.find(e => e.ep_id === this.epid || e.id === this.epid);
                    if (ep) {
                        this.cid = ep.cid;
                        return this.cid
                    }
                }
            }
        }
    }
    async getVideoData() {
        if (!this.bvid) return null;
        try {
            const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${this.bvid}`);
            const json = await res.json();
            if (json && json.data) {
                this.videoData = json.data;
                this.logTag('获取视频信息成功');
                this.fetchtime = Math.floor(Date.now() / 1000);
                return this.videoData;
            }
            else throw new Error(`视频信息接口请求失败，json：${json}`);
        } catch (e) {
            this.logTagError('请求视频信息失败:', e);
            return null;
        }
    }
    async getEpisodeData() {
        if (!this.epid) return null;
        try {
            const res = await fetch(`https://api.bilibili.com/pgc/view/web/season?ep_id=${this.epid}`);
            const json = await res.json();
            if (json && json.result) {
                this.episodeData = json.result;
                this.logTag('获取剧集信息成功');
                this.fetchtime = Math.floor(Date.now() / 1000);
                return this.episodeData;
            }
            else throw new Error(`剧集信息接口请求失败，json：${json}`);
        } catch (e) {
            this.logTagError('请求剧集信息失败:', e);
            return null;
        }
    }
    async getDanmakuData() {
        try {
            this._findCid();
            if (!this.cid) throw new Error('ChatID 缺失');

            const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${this.cid}`);
            if (!res.ok) throw new Error(`弹幕接口请求失败，状态码：${res.status}`);

            this.danmakuXmlText = await res.text();
            this.danmakuData = this.parseDanmakuXml(this.danmakuXmlText);
            this.logTag('获取弹幕数据成功');
            this.fetchtime = Math.floor(Date.now() / 1000);
            return this.danmakuData;
        } catch (err) {
            this.logTagError('获取弹幕数据失败:', err);
            return null;
        }
    }
    async fetchAllData(url) {
        this.parseBiliUrl(url);
        await this.getVideoData();
        await this.getEpisodeData();
        await this.getDanmakuData();
        return {
            videoData: this.videoData,
            danmakuData: this.danmakuData
        };
    }
    async getUserCardData(mid) {
        try {
            const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=true`);
            const json = await res.json();
            if (json.code === 0) {
                this.logTag(`获取用户名片成功：${mid}`);
                return json.data;
            } else {
                throw new Error(json.message || '获取用户信息失败');
            }
        } catch (e) {
            this.logTagError('请求用户信息失败:', e);
            return { card: { mid } };
        }
    }
}
