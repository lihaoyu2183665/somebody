const express = require('express');
const { pool, normalizeRows, normalizeRow } = require('../db');
const policy = require('../policy');
const { requireActive } = require('../auth');

const router = express.Router();

// 允许通过通用接口访问的表白名单（防止任意表读写）。
const ALLOWED_TABLES = [
    'members', 'carpool_posts', 'carpool_signups', 'carpool_signup_contacts',
    'coaches', 'coach_slots', 'coach_bookings', 'gear_items',
    'trip_activities', 'trip_price_options', 'trip_orders', 'club_payment_settings',
];
const SAFE_COLUMNS = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function ok(data) { return { data, error: null }; }
function fail(message) { return { data: null, error: { message } }; }

// 把前端 filters 数组转成 SQL，列名白名单校验防注入。
function buildFilters(filters) {
    const clauses = [];
    const params = [];
    (filters || []).forEach(f => {
        if (!f || !SAFE_COLUMNS.test(f.column || '')) return;
        if (f.method === 'in' && Array.isArray(f.value)) {
            if (f.value.length === 0) { clauses.push('1 = 0'); return; }
            clauses.push(`\`${f.column}\` IN (${f.value.map(() => '?').join(',')})`);
            params.push(...f.value);
        } else {
            clauses.push(`\`${f.column}\` = ?`);
            params.push(f.value);
        }
    });
    return { clauses, params };
}

// GET /api/data/:table?filters=&order=&ascending=&limit=
router.get('/:table', async (req, res) => {
    const table = req.params.table;
    if (ALLOWED_TABLES.indexOf(table) < 0) return res.json(fail('未知数据表'));
    try {
        const filter = policy.readFilter(table, req.access);
        if (!filter || filter.where === '1 = 0') return res.json(ok([]));

        let options = {};
        try { options = req.query.options ? JSON.parse(req.query.options) : {}; } catch (e) { options = {}; }
        const { clauses, params } = buildFilters(options.filters);
        const whereParts = [`(${filter.where})`].concat(clauses);
        const allParams = filter.params.concat(params);

        const orderCol = options.order && SAFE_COLUMNS.test(options.order) ? options.order : 'created_at';
        const dir = options.ascending === true ? 'ASC' : 'DESC';
        const limit = Math.min(Number(options.limit) || 1000, 2000);

        const sql = `SELECT * FROM \`${table}\` WHERE ${whereParts.join(' AND ')} ORDER BY \`${orderCol}\` ${dir} LIMIT ${limit}`;
        const [rows] = await pool.execute(sql, allParams);
        const shaped = normalizeRows(rows).map(row => policy.projectRow(table, row, req.access));
        return res.json(ok(shaped));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

// GET /api/data/:table/:id
router.get('/:table/:id', async (req, res) => {
    const table = req.params.table;
    if (ALLOWED_TABLES.indexOf(table) < 0) return res.json(fail('未知数据表'));
    try {
        const [rows] = await pool.execute(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [req.params.id]);
        const row = normalizeRow(rows[0]);
        if (!policy.canReadRow(table, row, req.access)) return res.json(ok(null));
        return res.json(ok(policy.projectRow(table, row, req.access)));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

// POST /api/data/:table
router.post('/:table', requireActive, async (req, res) => {
    const table = req.params.table;
    if (ALLOWED_TABLES.indexOf(table) < 0) return res.json(fail('未知数据表'));
    if (table === 'carpool_signup_contacts') return res.json(fail('安全视图只读'));
    try {
        const perm = policy.canCreate(table, req.access);
        if (!perm.ok) return res.json(fail(perm.reason));

        const payload = Object.assign({}, req.body || {});
        delete payload.id;
        delete payload.super_admin_key;
        if (policy.forceOwner(table)) payload.owner_id = req.openid;

        const keys = Object.keys(payload).filter(k => SAFE_COLUMNS.test(k));
        if (keys.length === 0) return res.json(fail('没有可保存的字段'));
        const sql = `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
        const [result] = await pool.execute(sql, keys.map(k => payload[k]));
        const [rows] = await pool.execute(`SELECT * FROM \`${table}\` WHERE id = ?`, [result.insertId]);
        return res.json(ok(normalizeRow(rows[0])));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

// PUT /api/data/:table/:id
router.put('/:table/:id', requireActive, async (req, res) => {
    const table = req.params.table;
    if (ALLOWED_TABLES.indexOf(table) < 0) return res.json(fail('未知数据表'));
    if (table === 'carpool_signup_contacts') return res.json(fail('安全视图只读'));
    try {
        const [rows] = await pool.execute(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [req.params.id]);
        const existing = normalizeRow(rows[0]);
        const patch = Object.assign({}, req.body || {});
        const perm = policy.canUpdate(table, existing, req.access, patch);
        if (!perm.ok) return res.json(fail(perm.reason));

        delete patch.id;
        delete patch.owner_id;
        delete patch.super_admin_key;
        const keys = Object.keys(patch).filter(k => SAFE_COLUMNS.test(k));
        if (keys.length === 0) return res.json(ok(existing));
        const sql = `UPDATE \`${table}\` SET ${keys.map(k => `\`${k}\` = ?`).join(',')} WHERE id = ?`;
        await pool.execute(sql, keys.map(k => patch[k]).concat([req.params.id]));
        const [after] = await pool.execute(`SELECT * FROM \`${table}\` WHERE id = ?`, [req.params.id]);
        return res.json(ok(normalizeRow(after[0])));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

// DELETE /api/data/:table/:id
router.delete('/:table/:id', requireActive, async (req, res) => {
    const table = req.params.table;
    if (ALLOWED_TABLES.indexOf(table) < 0) return res.json(fail('未知数据表'));
    if (table === 'carpool_signup_contacts') return res.json(fail('安全视图只读'));
    try {
        const [rows] = await pool.execute(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [req.params.id]);
        const existing = normalizeRow(rows[0]);
        const perm = policy.canDelete(table, existing, req.access);
        if (!perm.ok) return res.json(fail(perm.reason));
        await pool.execute(`DELETE FROM \`${table}\` WHERE id = ?`, [req.params.id]);
        return res.json(ok({ removed: 1 }));
    } catch (e) {
        return res.json(fail(e.message));
    }
});

module.exports = router;
