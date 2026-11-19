// 把 server/data/cloud-export.json（云端只读导出）导入自建 MySQL。
// 幂等：按主键 INSERT ... ON DUPLICATE KEY UPDATE，可重复执行。
// 用法：node server/scripts/migrate.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DATA_FILE = path.join(__dirname, '..', 'data', 'cloud-export.json');

const TABLES = [
    'members', 'carpool_posts', 'carpool_signups', 'coaches', 'coach_slots',
    'coach_bookings', 'gear_items', 'trip_activities', 'trip_price_options',
    'trip_orders', 'club_payment_settings',
];

// 每张表允许写入的列（与 init.sql 对齐，排除 generated 列）。
const COLUMNS = {
    members: ['id','owner_id','owner_name','display_name','phone','snow_level','role','status','created_at','review_note','reviewed_at','reviewed_by','avatar','real_name','id_card_no','gender','submitted_at','deactivated_at','deactivated_by','deactivation_reason','terms_agreed_at'],
    carpool_posts: ['id','owner_id','owner_name','kind','title','resort','depart_time','return_time','depart_place','return_place','transport','seats','fee_rule','itinerary','contact','status','created_at','review_status','review_note','reviewed_at','reviewed_by'],
    carpool_signups: ['id','owner_id','owner_name','post_id','seats','note','contact','status','created_at'],
    coaches: ['id','owner_id','owner_name','name','avatar','title','certificates','years','resort','specialties','price_per_hour','bio','contact','status','created_at','review_status','review_note','reviewed_at','reviewed_by'],
    coach_slots: ['id','owner_id','coach_id','date','start_time','end_time','resort','capacity','status','created_at','review_status','review_note','reviewed_at','reviewed_by'],
    coach_bookings: ['id','owner_id','owner_name','coach_id','slot_id','slot_text','contact_name','contact_phone','level','note','status','created_at'],
    gear_items: ['id','owner_id','owner_name','title','category','condition_type','price','original_price','description','images','trade_place','contact','status','created_at','review_status','review_note','reviewed_at','reviewed_by'],
    trip_activities: ['id','owner_id','owner_name','title','resort','depart_time','return_time','depart_place','gather_place','transport','fee_note','itinerary','capacity','deadline','is_official','status','created_at','review_status','review_note','reviewed_at','reviewed_by','payment_method','payment_note'],
    trip_price_options: ['id','trip_id','name','price','note','capacity','sort_order','created_at'],
    trip_orders: ['id','owner_id','owner_name','trip_id','option_id','option_name','unit_price','quantity','amount','contact_name','contact_phone','note','status','created_at','payment_method','payment_status','out_trade_no','payment_note','paid_at','paid_by','participant_name','participant_id_card','participant_phone','participant_gender'],
    club_payment_settings: ['id','payee_name','payee_account','contact','offline_note','gateway_note','online_enabled','updated_at','updated_by'],
};

const DATETIME_COLS = new Set([
    'created_at','reviewed_at','submitted_at','deactivated_at','terms_agreed_at',
    'paid_at','updated_at',
]);

function normalize(col, value) {
    if (value === undefined || value === '') return null;
    if (DATETIME_COLS.has(col)) {
        const d = new Date(value);
        if (isNaN(d.getTime())) return null;
        // 转为 MySQL DATETIME 可识别的 UTC 字符串。
        return d.toISOString().slice(0, 23).replace('T', ' ');
    }
    if (col === 'is_official' || col === 'online_enabled') return value ? 1 : 0;
    return value;
}

async function main() {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'ski',
        password: process.env.DB_PASSWORD || 'ski_secret_change_me',
        database: process.env.DB_NAME || 'ski_club',
        multipleStatements: false,
    });
    let total = 0;
    try {
        for (const table of TABLES) {
            const rows = raw[table] || [];
            const cols = COLUMNS[table];
            if (rows.length === 0) {
                console.log(`  ${table.padEnd(22)} 0 行（跳过）`);
                continue;
            }
            const updates = cols.filter(c => c !== 'id').map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
            const sql = `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${updates}`;
            for (const row of rows) {
                const values = cols.map(c => normalize(c, row[c]));
                await conn.execute(sql, values);
            }
            total += rows.length;
            console.log(`  ${table.padEnd(22)} ${rows.length} 行 OK`);
        }
        console.log(`\n迁移完成，共写入 ${total} 行。`);
    } finally {
        await conn.end();
    }
}

main().catch(err => {
    console.error('迁移失败：', err.message);
    process.exit(1);
});
