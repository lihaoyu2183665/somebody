// 页面通用文案、常量与交互反馈
const TRANSPORTS = ['自驾拼车', '包车大巴', '高铁 / 动车', '飞机 + 接驳', '雪场班车', '自行前往'];
const GEAR_CATEGORIES = ['双板雪板', '单板雪板', '雪鞋', '固定器', '雪服', '头盔', '护具', '雪镜', '手套', '其他'];
const LEVELS = [
    { value: 'beginner', label: '初级 · 初上雪道' },
    { value: 'intermediate', label: '中级 · 顺畅换刃' },
    { value: 'advanced', label: '高级 · 全山自由' },
];
const KINDS = [
    { value: 'carpool', label: '拼车' },
    { value: 'partner', label: '拼搭子' },
];

function toast(title) {
    wx.showToast({ title, icon: 'none', duration: 1800 });
}

function success(title) {
    wx.showToast({ title, icon: 'success', duration: 1500 });
}

function confirm(content, title) {
    return new Promise(resolve => {
        wx.showModal({
            title: title || '请确认',
            content,
            confirmText: '确定',
            cancelText: '取消',
            confirmColor: '#3D78A8',
            success: result => resolve(!!result.confirm),
            fail: () => resolve(false),
        });
    });
}

function money(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function parseImages(text) {
    if (!text) return [];
    if (Array.isArray(text)) return text;
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function stringifyImages(paths) {
    return JSON.stringify(paths || []);
}

function levelLabel(value) {
    const found = LEVELS.find(item => item.value === value);
    return found ? found.label : '未填写水平';
}

function kindLabel(value) {
    const found = KINDS.find(item => item.value === value);
    return found ? found.label : '拼搭子';
}

function statusLabel(value) {
    const map = {
        open: '报名中', full: '已满员', closed: '已结束',
        on_sale: '在售', reserved: '已预订', sold: '已售出',
        pending: '待确认', confirmed: '已确认', cancelled: '已取消',
        joined: '已加入', booked: '已预约', active: '可预约', inactive: '暂停预约',
    };
    return map[value] || value || '正常';
}

function reviewLabel(value) {
    const map = {
        pending: '待审核',
        approved: '已通过',
        rejected: '已驳回',
    };
    return map[value] || '待审核';
}

function memberStatusLabel(value) {
    const map = {
        guest: '未注册',
        draft: '资料待完善',
        pending: '待审核会员',
        active: '正式会员',
        rejected: '审核未通过',
        cancelled: '账号已被移除',
        admin: '俱乐部管理员',
        superAdmin: '高级管理员',
    };
    return map[value] || '资料待完善';
}

// 角色与审核状态是两个维度：角色决定权限层级，审核状态决定能否使用功能。
// 四级权限：member 注册会员 / coach 认证教练 / admin 俱乐部管理员（可多名）/ super_admin 高级管理员（唯一、最高权限）。
function roleLabel(value) {
    if (value === 'super_admin') return '高级管理员';
    if (value === 'admin') return '俱乐部管理员';
    if (value === 'coach') return '认证教练';
    return '注册会员';
}

// 用户信息列表：角色标签后附实名姓名，方便管理员不展开资料即可辨识具体会员。
// 历史已移除账号的实名资料会被清空，此时只显示角色，避免出现「未填写」之类的冗余后缀。
function memberRoleName(role, realName) {
    const label = roleLabel(role);
    const name = String(realName || '').trim();
    return name ? `${label} · ${name}` : label;
}

// 权限配色：高级管理员紫 / 管理员红 / 教练蓝 / 正式用户黑 / 普通会员（待审核、驳回、未注册）灰。
const ROLE_COLORS = {
    super: '#6B3FA0',
    admin: '#B23A32',
    coach: '#2F6FB0',
    formal: '#374D62',
    guest: '#8FA8BC',
};

function roleTone(role, status) {
    if (role === 'super_admin' && status === 'active') return 'super';
    if (role === 'admin' && status === 'active') return 'admin';
    if (role === 'coach' && status === 'active') return 'coach';
    if (status === 'active') return 'formal';
    return 'guest';
}

function roleColor(role, status) {
    return ROLE_COLORS[roleTone(role, status)];
}

// 系统可选头像只保留 9 张卡通插画：本地内置图片，仍以 preset: 开头，
// 因此不会被当成云端照片对象去取签名地址或误删云端文件。
// 资源由 tools/build_avatars.py 从 9 张雪友插画压缩生成（240x240 JPEG）。
// 界面只展示图片，不展示名称；label 仅作为资源元信息保留，方便日后替换原图。
const AVATAR_ILLUSTRATIONS = [
    { key: 'preset:art:1', label: '女1', image: '/assets/avatar-art-1.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:2', label: '女2', image: '/assets/avatar-art-2.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:3', label: '女3', image: '/assets/avatar-art-3.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:4', label: '女4', image: '/assets/avatar-art-4.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:5', label: '男1', image: '/assets/avatar-art-5.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:6', label: '男2', image: '/assets/avatar-art-6.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:7', label: '男3', image: '/assets/avatar-art-7.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:8', label: '男4', image: '/assets/avatar-art-8.jpg', glyph: '雪', className: '' },
    { key: 'preset:art:9', label: '男5', image: '/assets/avatar-art-9.jpg', glyph: '雪', className: '' },
];

// 历史 preset:1 ~ preset:6 文字头像已下线：查不到时返回 null，
// 展示层回退到昵称首字，并在资料页提示用户重新选择卡通头像。
const ALL_AVATAR_PRESETS = AVATAR_ILLUSTRATIONS;

function avatarPreset(value) {
    return ALL_AVATAR_PRESETS.find(item => item.key === value) || null;
}

// 卡通头像返回本地资源路径；上传照片与历史文字预设返回空串。
function avatarImage(value) {
    const preset = avatarPreset(value);
    return preset && preset.image ? preset.image : '';
}

// 非 preset: 开头的值即云端图片对象路径。
function isPhotoAvatar(value) {
    return !!value && String(value).indexOf('preset:') !== 0;
}

function pad(value) {
    return value < 10 ? `0${value}` : `${value}`;
}

function today() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function currentTime() {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function joinDateTime(date, time) {
    return `${date} ${time}`;
}

function splitDateTime(text) {
    const value = text || '';
    const parts = value.split(' ');
    return { date: parts[0] || today(), time: parts[1] || '09:00' };
}

function shortText(text, length) {
    const value = String(text || '');
    const max = length || 40;
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

function initial(text) {
    const value = String(text || '雪').trim();
    return value ? value.slice(0, 1) : '雪';
}

function markMine(rows, userId) {
    return (rows || []).map(row => Object.assign({}, row, { isMine: !!userId && row.owner_id === userId }));
}

module.exports = {
    TRANSPORTS,
    GEAR_CATEGORIES,
    LEVELS,
    KINDS,
    toast,
    success,
    confirm,
    money,
    parseImages,
    stringifyImages,
    levelLabel,
    kindLabel,
    statusLabel,
    reviewLabel,
    memberStatusLabel,
    roleLabel,
    memberRoleName,
    ROLE_COLORS,
    roleTone,
    roleColor,
    AVATAR_ILLUSTRATIONS,
    avatarPreset,
    avatarImage,
    isPhotoAvatar,
    today,
    currentTime,
    joinDateTime,
    splitDateTime,
    shortText,
    initial,
    markMine,
};
