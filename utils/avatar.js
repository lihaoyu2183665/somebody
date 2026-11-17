// 头像解析：卡通头像用本地图片，上传照片用云端短时签名地址，
// 未设置或历史文字预设（preset:1~6）回退到昵称首字。
const ui = require('./ui');
const api = require('./api');

async function resolve(value, name) {
    const initial = ui.initial(name);
    const builtin = ui.avatarImage(value);
    if (builtin) {
        return {
            photoUrl: builtin,
            className: '',
            glyph: initial,
            isPhoto: true,
        };
    }
    if (ui.isPhotoAvatar(value)) {
        const urls = await api.signedUrls([value]);
        return {
            photoUrl: urls[0] || '',
            className: '',
            glyph: initial,
            isPhoto: true,
        };
    }
    const preset = ui.avatarPreset(value);
    return {
        photoUrl: '',
        className: preset ? preset.className : '',
        glyph: preset ? preset.glyph : initial,
        isPhoto: false,
    };
}

module.exports = { resolve };
