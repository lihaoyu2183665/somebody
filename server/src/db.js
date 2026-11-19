const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool(config.db);

const DATETIME_COLUMNS = new Set([
    'created_at', 'reviewed_at', 'submitted_at', 'deactivated_at',
    'terms_agreed_at', 'paid_at', 'updated_at',
]);
const DECIMAL_COLUMNS = new Set([
    'price', 'original_price', 'price_per_hour', 'unit_price', 'amount',
]);
const BOOL_COLUMNS = new Set(['is_official', 'online_enabled']);

// 把 mysql2 返回的行规整为前端习惯的形状：
// - 时间 → ISO 字符串（与云端一致）
// - DECIMAL → Number
// - TINYINT(1) → boolean
// - 剔除内部 generated 列 super_admin_key
function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    Object.keys(row).forEach(key => {
        const value = row[key];
        if (key === 'super_admin_key') return;
        if (value instanceof Date) out[key] = value.toISOString();
        else if (DATETIME_COLUMNS.has(key) && value != null) out[key] = new Date(value).toISOString();
        else if (DECIMAL_COLUMNS.has(key) && value != null) out[key] = Number(value);
        else if (BOOL_COLUMNS.has(key) && value != null) out[key] = Boolean(value);
        else out[key] = value;
    });
    return out;
}

function normalizeRows(rows) {
    return (rows || []).map(normalizeRow);
}

module.exports = { pool, normalizeRow, normalizeRows };
