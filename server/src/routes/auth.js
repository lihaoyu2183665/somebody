const express = require('express');
const { signToken, codeToOpenid, openidFromRequest, loadAccess } = require('../auth');

const router = express.Router();
const ok = data => ({ data, error: null });
const fail = message => ({ data: null, error: { message } });

// 微信登录：小程序 wx.login 拿 code → 后端换 openid → 签发 JWT。
router.post('/wechat-login', async (req, res) => {
    try {
        const code = (req.body || {}).code;
        const openid = await codeToOpenid(code);
        const token = signToken(openid);
        return res.json(ok({ token, user: { id: openid, name: '' } }));
    } catch (e) {
        return res.json(fail(e.message || '微信登录失败'));
    }
});

// 网页管理后台登录：账号密码（超级管理员 / 管理员）。
router.post('/admin-login', async (req, res) => {
    const { username, password } = req.body || {};
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'skiclub2026';
    if (username !== adminUser || password !== adminPass) {
        return res.json(fail('账号或密码错误'));
    }
    // 网页管理员绑定高级管理员身份，拥有最高权限。
    const { pool } = require('../db');
    const [rows] = await pool.execute("SELECT owner_id FROM members WHERE role = 'super_admin' LIMIT 1");
    const openid = rows.length ? rows[0].owner_id : 'wx:admin';
    return res.json(ok({ token: signToken(openid), user: { id: openid, name: '俱乐部管理员' } }));
});

// getSession：从 token 还原会话 + 会员档案，形状对齐云端 getSession()。
router.get('/session', async (req, res) => {
    const openid = openidFromRequest(req);
    if (!openid) return res.json(ok(null));
    const access = await loadAccess(openid);
    return res.json(ok({ token: req.headers.authorization.replace(/^Bearer\s+/i, ''), user: { id: openid, name: access.member ? access.member.display_name : '' }, member: access.member }));
});

router.post('/logout', (req, res) => res.json(ok(true)));

module.exports = router;
