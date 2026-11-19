const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./config');
const { pool, normalizeRow } = require('./db');

const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';

function signToken(openid) {
    return jwt.sign({ sub: openid }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyToken(token) {
    try {
        const payload = jwt.verify(token, config.jwtSecret);
        return payload && payload.sub ? payload.sub : null;
    } catch (e) {
        return null;
    }
}

// 从请求里解析 Bearer token → openid。
function openidFromRequest(req) {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return null;
    return verifyToken(match[1].trim());
}

// code → openid。
// - 生产：配置 WX_APPID / WX_SECRET 后走微信官方 code2session。
// - 兼容：未配置密钥时，code 以 wx: 开头则原样作为 openid（迁移后老用户凭此恢复身份）；
//   否则用 code 的稳定哈希生成 openid（开发者工具 / 本地联调）。
async function codeToOpenid(code) {
    if (!code || typeof code !== 'string') throw new Error('缺少登录 code');
    if (WX_APPID && WX_SECRET) {
        const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(WX_APPID)}&secret=${encodeURIComponent(WX_SECRET)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.openid) throw new Error(data.errmsg || '微信登录失败');
        return `wx:${data.openid}`;
    }
    if (code.startsWith('wx:')) return code;
    return `wx:dev_${crypto.createHash('sha256').update(code).digest('hex').slice(0, 24)}`;
}

// 读取会员档案并计算访问状态，形状对齐小程序 utils/guard.js 的 access()。
async function loadAccess(openid) {
    if (!openid) return baseAccess('guest', null, openid);
    const [rows] = await pool.execute('SELECT * FROM members WHERE owner_id = ? LIMIT 1', [openid]);
    const member = rows.length ? normalizeRow(rows[0]) : null;
    if (!member) return baseAccess('guest', null, openid);
    let state = 'draft';
    if ((member.role === 'admin' || member.role === 'super_admin') && member.status === 'active') state = 'admin';
    else if (member.status === 'active') state = 'active';
    else if (member.status === 'cancelled') state = 'cancelled';
    else if (member.status === 'rejected') state = 'rejected';
    else if (member.status === 'pending') state = 'pending';
    return baseAccess(state, member, openid);
}

function baseAccess(state, member, openid) {
    const isAdmin = state === 'admin';
    const isSuperAdmin = isAdmin && member && member.role === 'super_admin';
    const isCoach = state === 'active' && member && member.role === 'coach';
    const allowed = state === 'active' || state === 'admin';
    return {
        openid, state, member,
        isAdmin, isSuperAdmin, isCoach,
        canCoach: isAdmin || isCoach,
        canView: allowed, canPublish: allowed,
    };
}

// 登录态中间件：解析 token，加载 access（含 member），挂到 req。
async function attachAccess(req, res, next) {
    try {
        const openid = openidFromRequest(req);
        req.openid = openid;
        req.access = await loadAccess(openid);
        next();
    } catch (e) {
        next(e);
    }
}

function requireLogin(req, res, next) {
    if (!req.openid) return res.status(401).json({ data: null, error: { message: '请先登录' } });
    next();
}

function requireActive(req, res, next) {
    if (!req.openid) return res.status(401).json({ data: null, error: { message: '请先登录' } });
    if (!req.access.canView) {
        return res.status(403).json({ data: null, error: { message: '需管理员审核通过后才能使用' } });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.openid) return res.status(401).json({ data: null, error: { message: '请先登录' } });
    if (!req.access.isAdmin) return res.status(403).json({ data: null, error: { message: '仅管理员可用' } });
    next();
}

module.exports = {
    signToken, verifyToken, openidFromRequest, codeToOpenid,
    loadAccess, attachAccess, requireLogin, requireActive, requireAdmin,
};
