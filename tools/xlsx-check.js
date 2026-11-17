/* 生成并自检「活动详情单活动名单导出」Excel 示例：node tools/xlsx-check.js
   使用与小程序端完全相同的 utils/xlsx.js，证明文件是真正可被 Excel 打开的 .xlsx。
   全站台账与拼车报名汇总导出已下线；脚本仍会在内存中校验这些纯函数，但不再产出示例文件。
   示例数据为功能测试数据，证件号为完整号码。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const xlsx = require('../utils/xlsx');
const roster = require('../utils/roster');

// 示例文件可能正被文档预览器占用（Windows 上抛 EBUSY）；此时保留磁盘上的旧文件并跳过写入，
// 内存中的 xlsx 断言仍会完整执行，不因外部占用而误报失败。
function writeExample(target, data) {
    try {
        fs.writeFileSync(target, data);
        console.log(`OUTPUT ${target}`);
    } catch (error) {
        if (['EBUSY', 'EACCES', 'EPERM'].indexOf(error.code) >= 0) {
            console.log(`SKIP_OUTPUT_FILE_LOCKED ${target} (${error.code})`);
            return;
        }
        throw error;
    }
}

const COLUMNS = [
    { title: '序号', width: 8 },
    { title: '参团活动', width: 26 },
    { title: '出发时间', width: 20 },
    { title: '返程时间', width: 20 },
    { title: '价格档位', width: 16 },
    { title: '报名份数', width: 12 },
    { title: '订单金额(元)', width: 16 },
    { title: '姓名', width: 14 },
    { title: '性别', width: 12 },
    { title: '身份证号', width: 24 },
    { title: '手机号', width: 16 },
    { title: '会员昵称', width: 16 },
    { title: '权限角色', width: 16 },
    { title: '报名状态', width: 14 },
    { title: '支付状态', width: 14 },
    { title: '业务单号', width: 28 },
    { title: '报名时间', width: 20 },
];

const ROWS = [
    [1, '功能测试活动 #8', '2026-12-01 07:00', '2026-12-01 18:00', '测试档', 2, 4,
        '测试管理员', '男', '11010519491231002X', '13800138000', '李豪语', '俱乐部管理员',
        '已确认', '待支付', 'ROSTER-CHECK-A-1', '2026-11-09 19:50'],
    [2, '功能测试活动 #8', '2026-12-01 07:00', '2026-12-01 18:00', '测试档', 1, 2,
        '测试会员', '女', '110105198806150032', '13900139000', '雪友', '注册会员',
        '已确认', '待支付', 'ROSTER-CHECK-B-1', '2026-11-09 19:50'],
];

const sheets = [
    { name: '参团人员名单', columns: COLUMNS, rows: ROWS },
    {
        name: '活动汇总',
        columns: [
            { title: '参团活动', width: 28 },
            { title: '订单数', width: 12 },
            { title: '参团人次', width: 14 },
            { title: '已支付订单', width: 14 },
            { title: '已收款金额(元)', width: 18 },
            { title: '待支付金额(元)', width: 18 },
            { title: '集合地点', width: 26 },
        ],
        rows: [['功能测试活动 #8', 2, 3, 0, 0, 6, '测试集合点']],
    },
    {
        name: '导出说明',
        columns: [{ title: '项目', width: 20 }, { title: '内容', width: 64 }],
        rows: [
            ['文件性质', '小程序端 xlsx 工作簿内存格式自检（全站台账页面已下线）'],
            ['数据来源', '云端参团订单快照 + 会员实名档案（本次为功能测试数据）'],
            ['证件号处理', '完整身份证号'],
            ['表格用途', '俱乐部参团人员管理 / 保险名单 / 收款核对'],
            ['隐私提示', '文件含个人敏感信息，请仅用于俱乐部管理并妥善保管。'],
        ],
    },
];

const buffer = xlsx.buildWorkbook(sheets);
const bytes = Buffer.from(buffer);
assert.strictEqual(bytes.slice(0, 4).toString('hex'), '504b0304', 'ZIP 头不正确');
const text = bytes.toString('utf8');
['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml',
    '参团人员名单', '活动汇总', '导出说明', '测试管理员', '<v>4</v>', '11010519491231002X'].forEach(part => {
    assert.ok(text.indexOf(part) >= 0, `缺少 ${part}`);
});
assert.ok(text.indexOf('********') < 0, '示例不含脱敏号码');

// 全站台账页面已下线：只在内存里校验工作簿结构，不再写出对应的示例文件。

// 用小程序端同一套名单模块，生成「活动详情单活动导出」这一唯一在用的 .xlsx 示例。
const trip = {
    id: 8, title: '雪季首滑 · 北大湖', depart_time: '2026-12-01 07:00',
    return_time: '2026-12-01 18:00', gather_place: '俱乐部东门',
};
const adminMember = {
    owner_id: 'u1', display_name: '李豪语', real_name: '测试管理员',
    id_card_no: '11010519491231002X', phone: '13800138000', gender: 'male',
    snow_level: 'advanced', role: 'admin', status: 'active',
};
const plainMember = {
    owner_id: 'u2', display_name: '雪友', real_name: '测试会员',
    id_card_no: '110105198806150032', phone: '13900139000', gender: 'female',
    snow_level: 'beginner', role: 'member', status: 'active',
};
const singleRows = [
    roster.decorateOrder({
        id: 101, trip_id: 8, owner_id: 'u1', owner_name: '测试管理员', option_name: '标准档',
        quantity: 2, amount: 400, participant_name: '测试管理员',
        participant_id_card: '11010519491231002X', participant_phone: '13800138000',
        participant_gender: 'male', payment_status: 'paid', payment_method: 'offline',
        out_trade_no: 'SKI-ROSTER-1', status: 'confirmed', note: '', payment_note: '已转账',
        created_at: '2026-11-10T10:00:00Z',
    }, trip, adminMember),
    roster.decorateOrder({
        id: 102, trip_id: 8, owner_id: 'u2', owner_name: '雪友', option_name: '标准档',
        quantity: 1, amount: 200, participant_name: '测试会员',
        participant_id_card: '110105198806150032', participant_phone: '13900139000',
        participant_gender: 'female', payment_status: 'unpaid', payment_method: 'offline',
        out_trade_no: 'SKI-ROSTER-2', status: 'pending', note: '靠窗', payment_note: '',
        created_at: '2026-11-10T11:00:00Z',
    }, trip, plainMember),
];
const singleSheets = roster.buildOrderSheets({
    rows: singleRows, adminName: '测试管理员',
    scopeText: '本活动：雪季首滑 · 北大湖 / 全部报名订单',
    source: '本活动报名订单快照 + 会员实名档案',
    usage: '单活动报名名单 / 保险名单 / 收款核对',
});
assert.strictEqual(singleSheets[0].rows.length, 2, '单活动名单应有 2 条订单');
assert.ok(singleSheets[0].rows.every(row => row[1] === trip.title), '单活动名单不得混入其它活动');
const singleBytes = Buffer.from(xlsx.buildWorkbook(singleSheets));
assert.strictEqual(singleBytes.slice(0, 4).toString('hex'), '504b0304', '单活动名单 ZIP 头不正确');
const singleText = singleBytes.toString('utf8');
['参团人员名单', '活动汇总', '导出说明', '11010519491231002X', '110105198806150032'].forEach(part => {
    assert.ok(singleText.indexOf(part) >= 0, `单活动名单缺少 ${part}`);
});
const singleOutput = path.join(__dirname, '..', '..', '俱乐部活动报名名单_单活动导出示例.xlsx');
writeExample(singleOutput, singleBytes);

const buddyRows = [
    roster.decorateSignup({
        id: 7, post_id: 5, owner_id: 'u1', owner_name: '测试管理员', seats: 2,
        note: '可带装备', contact: '', status: 'joined', created_at: '2026-11-10T10:00:00Z',
    }, {
        id: 5, kind: 'carpool', title: '周末北大湖拼车', depart_time: '2026-12-01 07:00',
        return_time: '2026-12-01 18:00', depart_place: '市区', resort: '北大湖', owner_name: '发起人',
    }, adminMember),
    roster.decorateSignup({
        id: 8, post_id: 6, owner_id: 'u2', owner_name: '雪友', seats: 1,
        note: '初级雪友', contact: '13900139000', status: 'joined', created_at: '2026-11-10T11:00:00Z',
    }, {
        id: 6, kind: 'partner', title: '找同道雪友', depart_time: '2026-12-05 08:00',
        return_time: '2026-12-05 17:00', depart_place: '市区', resort: '松花湖', owner_name: '发起人',
    }, plainMember),
];
const buddySheets = roster.buildCarpoolSheets({
    rows: buddyRows, adminName: '测试管理员', scopeText: '全部信息 / 全部类型',
});
assert.strictEqual(buddySheets[0].rows.length, 2, '拼车名单应有 2 条报名');
assert.ok(buddySheets[0].rows.some(row => row[1] === '拼车')
    && buddySheets[0].rows.some(row => row[1] === '拼搭子'), '拼车名单需同时覆盖两类信息');
const buddyBytes = Buffer.from(xlsx.buildWorkbook(buddySheets));
assert.strictEqual(buddyBytes.slice(0, 4).toString('hex'), '504b0304', '拼车名单 ZIP 头不正确');
const buddyText = buddyBytes.toString('utf8');
['拼车拼搭子报名名单', '信息汇总', '导出说明', '11010519491231002X', '拼搭子'].forEach(part => {
    assert.ok(buddyText.indexOf(part) >= 0, `拼车名单缺少 ${part}`);
});
// 拼车汇总导出已下线：仅保留内存断言，不写示例文件。

console.log(`XLSX_OK bytes=${bytes.length} sheets=${sheets.length} rows=${ROWS.length}`);
console.log(`SINGLE_TRIP_OK bytes=${singleBytes.length} sheets=${singleSheets.length} rows=${singleRows.length}`);
console.log(`BUDDY_ROSTER_OK bytes=${buddyBytes.length} sheets=${buddySheets.length} rows=${buddyRows.length}`);
