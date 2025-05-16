export class BiliMidHashConverter {
    constructor() {
        this.crcTable = this._createCRCTable();
    }
    _createCRCTable() {
        const table = new Array(256);
        const CRCPOLYNOMIAL = 0xEDB88320;
        var crcreg,
            i, j;
        for (i = 0; i < 256; ++i) {
            crcreg = i;
            for (j = 0; j < 8; ++j) {
                if ((crcreg & 1) != 0) {
                    crcreg = CRCPOLYNOMIAL ^ (crcreg >>> 1);
                }
                else {
                    crcreg >>>= 1;
                }
            }
            table[i] = crcreg;
        }
        return table;
    }

    /**
     * mid → hash（用于弹幕中 midHash 显示）
     */
    midToHash(mid) {
        let crc = 0xFFFFFFFF;
        const input = mid.toString();
        for (let i = 0; i < input.length; i++) {
            const byte = input.charCodeAt(i);
            crc = (crc >>> 8) ^ this.crcTable[(crc ^ byte) & 0xFF];
        }
        return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16);
    }

    /**
     * 尝试通过 midHash 反查 mid（暴力逆向）
     * 若失败返回 -1
     * @param {string} hashStr 16进制字符串（如 '6c2b67a9'）
     * @param {number} maxTry 最大尝试次数（默认一亿）
     */
    hashToMid(hashStr, maxTry = 100_000_000) {
        var index = new Array(4);

        var ht = parseInt('0x' + hashStr) ^ 0xffffffff,
            snum, i, lastindex, deepCheckData;
        for (i = 3; i >= 0; i--) {
            index[3 - i] = this._getCRCIndex(ht >>> (i * 8));
            snum = this.crcTable[index[3 - i]];
            ht ^= snum >>> ((3 - i) * 8);
        }
        for (i = 0; i < maxTry; i++) {
            lastindex = this._crc32LastIndex(i);
            if (lastindex == index[3]) {
                deepCheckData = this._deepCheck(i, index)
                if (deepCheckData[0])
                    break;
            }
        }

        if (i == 100000000)
            return -1;
        return i + '' + deepCheckData[1];
    }
    _crc32(input) {
        if (typeof (input) != 'string')
            input = input.toString();
        var crcstart = 0xFFFFFFFF, len = input.length, index;
        for (var i = 0; i < len; ++i) {
            index = (crcstart ^ input.charCodeAt(i)) & 0xff;
            crcstart = (crcstart >>> 8) ^ this.crcTable[index];
        }
        return crcstart;
    }
    _crc32LastIndex(input) {
        if (typeof (input) != 'string')
            input = input.toString();
        var crcstart = 0xFFFFFFFF, len = input.length, index;
        for (var i = 0; i < len; ++i) {
            index = (crcstart ^ input.charCodeAt(i)) & 0xff;
            crcstart = (crcstart >>> 8) ^ this.crcTable[index];
        }
        return index;
    }
    _getCRCIndex(t) {
        //if(t>0)
        //t-=256;
        for (var i = 0; i < 256; i++) {
            if (this.crcTable[i] >>> 24 == t)
                return i;
        }
        return -1;
    }
    _deepCheck(i, index) {
        var tc = 0x00, str = '',
            hash = this._crc32(i);
        tc = hash & 0xff ^ index[2];
        if (!(tc <= 57 && tc >= 48))
            return [0];
        str += tc - 48;
        hash = this.crcTable[index[2]] ^ (hash >>> 8);
        tc = hash & 0xff ^ index[1];
        if (!(tc <= 57 && tc >= 48))
            return [0];
        str += tc - 48;
        hash = this.crcTable[index[1]] ^ (hash >>> 8);
        tc = hash & 0xff ^ index[0];
        if (!(tc <= 57 && tc >= 48))
            return [0];
        str += tc - 48;
        hash = this.crcTable[index[0]] ^ (hash >>> 8);
        return [1, str];
    }
}