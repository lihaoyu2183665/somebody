const express = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();
const ok = data => ({ data, error: null });
const fail = message => ({ data: null, error: { message } });

// 管理后台总览：各表数量 + 会员角色分布 + 收款概览。
router.get('/overview', requireAdmin, async (req, res) => {
    try {
        const tables = ['members', 'carpool_posts', 'carpool_signups', 'coaches', 'coach_slots',
            'coach_bookings', 'gear_items', 'trip_activities', 'trip_price_options', 'trip_orders'];
        const counts = {};
        for (const table of tables) {
            const [rows] = await pool.execute(`SELECT COUNT(*) AS n FROM \`${table}\``);
            counts[table] = Number(rows[0].n);
        }
        const [roles] = await pool.execute('SELECT role, status, COUNT(*) AS n FROM members GROUP BY role, status');
        const [amount] = await pool.execute("SELECT COALESCE(SUM(amount),0) AS total, SUM(payment_status = 'paid') AS paidCount, SUM(payment_status = 'unpaid') AS unpaidCount FROM trip_orders");
        return res.json(ok({
            counts,
            roles: roles.map(r => ({ role: r.role, status: r.status, n: Number(r.n) })),
            revenue: {
                total: Number(amount[0].total || 0),
                paidCount: Number(amount[0].paidCount || 0),
                unpaidCount: Number(amount[0].unpaidCount || 0),
            },
            generatedAt: new Date().toISOString(),
        }));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

module.exports = router;
