const express = require('express');
const { pool, normalizeRow, normalizeRows } = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();
const ok = data => ({ data, error: null });
const fail = message => ({ data: null, error: { message } });

// 收款配置（仅管理员）。
router.get('/settings', requireAdmin, async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM club_payment_settings WHERE id = 1 LIMIT 1');
    return res.json(ok(rows.length ? normalizeRow(rows[0]) : {}));
});

router.put('/settings', requireAdmin, async (req, res) => {
    try {
        const allow = ['payee_name', 'payee_account', 'contact', 'offline_note', 'gateway_note', 'online_enabled'];
        const patch = {};
        allow.forEach(k => { if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) patch[k] = req.body[k]; });
        patch.updated_by = req.openid;
        const keys = Object.keys(patch);
        await pool.execute(
            `UPDATE club_payment_settings SET ${keys.map(k => `\`${k}\` = ?`).join(',')}, updated_at = UTC_TIMESTAMP(6) WHERE id = 1`,
            keys.map(k => patch[k])
        );
        const [rows] = await pool.execute('SELECT * FROM club_payment_settings WHERE id = 1');
        return res.json(ok(normalizeRow(rows[0])));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

// 管理员确认 / 撤销收款。
router.post('/order/:id/paid', requireAdmin, async (req, res) => {
    try {
        const paid = !!(req.body || {}).paid;
        const paidAt = paid ? new Date().toISOString().slice(0, 23).replace('T', ' ') : null;
        await pool.execute(
            'UPDATE trip_orders SET payment_status = ?, paid_at = ?, paid_by = ? WHERE id = ?',
            [paid ? 'paid' : 'unpaid', paidAt, paid ? req.openid : null, req.params.id]
        );
        const [rows] = await pool.execute('SELECT * FROM trip_orders WHERE id = ?', [req.params.id]);
        return res.json(ok(normalizeRow(rows[0])));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

module.exports = router;
