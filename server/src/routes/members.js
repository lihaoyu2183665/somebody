const express = require('express');
const { pool, normalizeRow, normalizeRows } = require('../db');
const { requireLogin, requireAdmin, loadAccess } = require('../auth');

const router = express.Router();
const ok = data => ({ data, error: null });
const fail = message => ({ data: null, error: { message } });

// 首位注册者自动成为超级管理员 + active（迁移后数据库已有超管，此逻辑仅对新空库生效）。
async function isFirstMember() {
    const [rows] = await pool.execute('SELECT COUNT(*) AS n FROM members');
    return Number(rows[0].n) === 0;
}

// ensureMember：首次登录建档；每次从库中重读，保证审核结果实时生效。
router.post('/ensure', requireLogin, async (req, res) => {
    try {
        const uid = req.openid;
        const [found] = await pool.execute('SELECT * FROM members WHERE owner_id = ? LIMIT 1', [uid]);
        if (found.length) {
            const member = normalizeRow(found[0]);
            req.app.locals.member = member;
            return res.json(member);
        }
        const first = await isFirstMember();
        const role = first ? 'super_admin' : 'member';
        const status = first ? 'active' : 'draft';
        const name = (req.body && req.body.name) || '雪友';
        const [result] = await pool.execute(
            `INSERT INTO members (owner_id, owner_name, display_name, phone, snow_level, role, status, created_at)
             VALUES (?, ?, ?, '', 'beginner', ?, ?, UTC_TIMESTAMP(6))`,
            [uid, name, name, role, status]
        );
        const [rows] = await pool.execute('SELECT * FROM members WHERE id = ?', [result.insertId]);
        return res.json(normalizeRow(rows[0]));
    } catch (e) {
        return res.status(500).json(fail(e.message));
    }
});

// 当前会员档案（供 me 接口使用）。
router.get('/me', requireLogin, async (req, res) => {
    const member = req.access.member;
    if (!member) return res.json(null);
    return res.json(member);
});

// 更新本人资料：字段白名单，禁止改 role / status / owner_id 越权字段。
const SELF_EDITABLE = new Set([
    'display_name', 'owner_name', 'phone', 'snow_level', 'real_name', 'id_card_no',
    'gender', 'avatar', 'review_note', 'terms_agreed_at', 'status',
]);
router.patch('/me', requireLogin, async (req, res) => {
    try {
        const member = req.access.member;
        if (!member) return res.status(404).json(fail('请先注册会员'));
        const patch = {};
        Object.keys(req.body || {}).forEach(k => {
            if (SELF_EDITABLE.has(k)) patch[k] = req.body[k];
        });
        // status 仅允许 draft <-> pending 之间由用户自己切换（提交 / 撤回审核）。
        if (patch.status && !['draft', 'pending'].includes(patch.status)) delete patch.status;
        const keys = Object.keys(patch);
        if (keys.length === 0) return res.json(normalizeRow(member));
        await pool.execute(
            `UPDATE members SET ${keys.map(k => `\`${k}\` = ?`).join(',')} WHERE id = ?`,
            keys.map(k => patch[k]).concat([member.id])
        );
        const [rows] = await pool.execute('SELECT * FROM members WHERE id = ?', [member.id]);
        return res.json(normalizeRow(rows[0]));
    } catch (e) {
        return res.status(500).json(fail(e.message));
    }
});

// 管理员审核会员：通过 / 驳回 / 回退待审核。
router.post('/review/:id', requireAdmin, async (req, res) => {
    try {
        const { status, note } = req.body || {};
        if (!['active', 'rejected', 'pending'].includes(status)) return res.json(fail('非法审核状态'));
        const [rows] = await pool.execute('SELECT * FROM members WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.json(fail('会员不存在'));
        const target = rows[0];
        if (target.role === 'super_admin' && !req.access.isSuperAdmin) {
            return res.json(fail('无权操作高级管理员'));
        }
        await pool.execute(
            'UPDATE members SET status = ?, review_note = ?, reviewed_at = UTC_TIMESTAMP(6), reviewed_by = ? WHERE id = ?',
            [status, note || null, req.openid, req.params.id]
        );
        const [after] = await pool.execute('SELECT * FROM members WHERE id = ?', [req.params.id]);
        return res.json(ok(normalizeRow(after[0])));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

// 管理员提权 / 撤权。
router.post('/role/:id', requireAdmin, async (req, res) => {
    try {
        const role = (req.body || {}).role;
        if (!['member', 'coach', 'admin'].includes(role)) return res.json(fail('非法角色'));
        const [rows] = await pool.execute('SELECT * FROM members WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.json(fail('会员不存在'));
        const target = rows[0];
        if (target.role === 'super_admin' && !req.access.isSuperAdmin) {
            return res.json(fail('无权修改高级管理员'));
        }
        if (Number(target.id) === req.access.member.id) return res.json(fail('不能修改自己的角色'));
        if (role === 'member' && target.role === 'admin') {
            const [admins] = await pool.execute("SELECT COUNT(*) AS n FROM members WHERE role IN ('admin','super_admin') AND status = 'active'");
            if (Number(admins[0].n) <= 1) return res.json(fail('不能撤销最后一名管理员'));
        }
        if (role === 'admin' || role === 'coach') {
            await pool.execute(
                "UPDATE members SET role = ?, status = 'active', review_note = NULL WHERE id = ?",
                [role, req.params.id]
            );
        } else {
            await pool.execute('UPDATE members SET role = ? WHERE id = ?', [role, req.params.id]);
        }
        const [after] = await pool.execute('SELECT * FROM members WHERE id = ?', [req.params.id]);
        return res.json(ok(normalizeRow(after[0])));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

// 管理员删除会员：不可删本人、不可删高级管理员（除非本人是超管）、不可删最后一名管理员。
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM members WHERE id = ? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.json(fail('会员不存在'));
        const target = rows[0];
        if (Number(target.id) === req.access.member.id) return res.json(fail('不能删除自己'));
        if (target.role === 'super_admin') return res.json(fail('高级管理员不可删除'));
        if (target.role === 'admin' && target.status === 'active') {
            const [admins] = await pool.execute("SELECT COUNT(*) AS n FROM members WHERE role IN ('admin','super_admin') AND status = 'active'");
            if (Number(admins[0].n) <= 1) return res.json(fail('不能删除最后一名管理员'));
        }
        await pool.execute('DELETE FROM members WHERE id = ?', [req.params.id]);
        return res.json(ok({ removed: 1 }));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

module.exports = router;
