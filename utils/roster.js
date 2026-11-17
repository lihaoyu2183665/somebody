// 名单数据与工作表构造（纯函数，不调用小程序 API）。
// 参团订单名单 / 活动详情单活动导出，以及拼车报名人员的档案装饰共用这套逻辑。
// 全站台账与全站导出页面已下线，名单只在活动详情页按单个活动查看与导出。
// 身份证号一律完整写入，读取范围由云端 RLS 与安全视图限制为本人与管理员。
const payment = require('./payment');
const profile = require('./profile');
const ui = require('./ui');

const ORDER_COLUMNS = [
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
    { title: '滑雪水平', width: 20 },
    { title: '报名状态', width: 14 },
    { title: '支付状态', width: 14 },
    { title: '收款方式', width: 14 },
    { title: '业务单号', width: 28 },
    { title: '付款信息', width: 24 },
    { title: '备注', width: 24 },
    { title: '报名时间', width: 20 },
];

const CARPOOL_COLUMNS = [
    { title: '序号', width: 8 },
    { title: '类型', width: 12 },
    { title: '信息标题', width: 28 },
    { title: '出发时间', width: 20 },
    { title: '返程时间', width: 20 },
    { title: '目的雪场', width: 18 },
    { title: '发起人', width: 16 },
    { title: '报名人数', width: 12 },
    { title: '姓名', width: 14 },
    { title: '性别', width: 12 },
    { title: '身份证号', width: 24 },
    { title: '手机号', width: 16 },
    { title: '会员昵称', width: 16 },
    { title: '权限角色', width: 16 },
    { title: '滑雪水平', width: 20 },
    { title: '报名状态', width: 14 },
    { title: '报名联系方式', width: 22 },
    { title: '备注', width: 24 },
    { title: '报名时间', width: 20 },
];

function timeText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const pad = number => (number < 10 ? `0${number}` : `${number}`);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fileStamp() {
    const now = new Date();
    const pad = number => (number < 10 ? `0${number}` : `${number}`);
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// 参团订单 → 名单行：订单里的实名快照优先，缺失时回落会员档案。
function decorateOrder(row, trip, member) {
    const source = row || {};
    const activity = trip || {};
    const person = member || {};
    const idCardFull = profile.normalizeIdCard(source.participant_id_card || person.id_card_no || '');
    const amount = Number(source.amount || 0);
    const quantity = Number(source.quantity || 1);
    const isPaid = source.payment_status === 'paid';
    return {
        key: `order-${source.id}`,
        id: source.id,
        tripId: source.trip_id,
        tripTitle: activity.title || `活动 #${source.trip_id}`,
        departTime: activity.depart_time || '未记录',
        returnTime: activity.return_time || '未记录',
        gatherPlace: activity.gather_place || '未记录',
        optionText: source.option_name || '标准档',
        quantity,
        amount,
        amountText: ui.money(amount),
        realName: source.participant_name || source.contact_name || person.real_name || person.display_name || source.owner_name || '未填写',
        idCardFull,
        idCardText: idCardFull || '未填写',
        idCardSource: source.participant_id_card ? '报名时填写' : (person.id_card_no ? '会员档案' : '未填写'),
        phone: source.participant_phone || source.contact_phone || person.phone || '未填写',
        genderText: profile.genderLabel(source.participant_gender || person.gender || ''),
        nickname: person.display_name || source.owner_name || '雪友',
        roleText: ui.roleLabel(person.role),
        roleColor: ui.roleColor(person.role, person.status),
        level: ui.levelLabel(person.snow_level),
        orderStatusText: ui.statusLabel(source.status),
        paymentStatusText: payment.paymentStatusLabel(source.payment_status),
        paymentTone: payment.paymentTone(source.payment_status),
        paymentChannelText: payment.channelLabel(source.payment_method),
        outTradeNo: source.out_trade_no || '未生成',
        paymentNote: source.payment_note || '无',
        note: source.note || '无',
        createdText: timeText(source.created_at) || '未记录',
        isPaid,
    };
}

// 拼车 / 拼搭子报名 → 名单行：实名信息来自会员档案，只有管理员能读到全部档案。
function decorateSignup(row, post, member) {
    const source = row || {};
    const article = post || {};
    const person = member || {};
    const idCardFull = profile.normalizeIdCard(person.id_card_no || '');
    return {
        key: `signup-${source.id}`,
        id: source.id,
        postId: source.post_id,
        kind: article.kind || 'partner',
        kindText: ui.kindLabel(article.kind),
        postTitle: article.title || `信息 #${source.post_id}`,
        departTime: article.depart_time || '未记录',
        returnTime: article.return_time || '未记录',
        departPlace: article.depart_place || '未记录',
        resort: article.resort || '待定',
        hostText: article.owner_name || '雪友',
        seats: Number(source.seats || 1),
        realName: person.real_name || person.display_name || source.owner_name || '未填写',
        idCardFull,
        idCardText: idCardFull || '未填写',
        idCardSource: person.id_card_no ? '会员档案' : '未填写',
        phone: person.phone || '未填写',
        genderText: profile.genderLabel(person.gender || ''),
        nickname: person.display_name || source.owner_name || '雪友',
        roleText: ui.roleLabel(person.role),
        roleColor: ui.roleColor(person.role, person.status),
        level: ui.levelLabel(person.snow_level),
        statusText: ui.statusLabel(source.status),
        contactText: source.contact || person.phone || '未填写',
        note: source.note || '无',
        createdText: timeText(source.created_at) || '未记录',
        hasProfile: !!person.owner_id,
    };
}

function emptyRow(columns, text) {
    const empty = new Array(columns.length).fill('');
    empty[0] = '—';
    empty[1] = text;
    return empty;
}

function orderSheet(rows, emptyText) {
    const data = (rows || []).map((row, index) => [
        index + 1, row.tripTitle, row.departTime, row.returnTime, row.optionText,
        row.quantity, row.amount, row.realName, row.genderText,
        row.idCardFull,
        row.phone, row.nickname, row.roleText, row.level,
        row.orderStatusText, row.paymentStatusText, row.paymentChannelText,
        row.outTradeNo, row.paymentNote, row.note, row.createdText,
    ]);
    if (data.length === 0) data.push(emptyRow(ORDER_COLUMNS, emptyText || '当前筛选条件下暂无报名记录'));
    return { name: '参团人员名单', columns: ORDER_COLUMNS, rows: data };
}

function carpoolSheet(rows, emptyText) {
    const data = (rows || []).map((row, index) => [
        index + 1, row.kindText, row.postTitle, row.departTime, row.returnTime,
        row.resort, row.hostText, row.seats, row.realName, row.genderText,
        row.idCardFull,
        row.phone, row.nickname, row.roleText, row.level,
        row.statusText, row.contactText, row.note, row.createdText,
    ]);
    if (data.length === 0) data.push(emptyRow(CARPOOL_COLUMNS, emptyText || '当前筛选条件下暂无报名记录'));
    return { name: '拼车拼搭子报名名单', columns: CARPOOL_COLUMNS, rows: data };
}

function orderSummarySheet(rows) {
    const groups = {};
    (rows || []).forEach(row => {
        if (!groups[row.tripId]) {
            groups[row.tripId] = {
                title: row.tripTitle, orders: 0, people: 0, paid: 0,
                paidAmount: 0, unpaidAmount: 0, gatherPlace: row.gatherPlace,
            };
        }
        const group = groups[row.tripId];
        group.orders += 1;
        group.people += row.quantity;
        if (row.isPaid) { group.paid += 1; group.paidAmount += row.amount; }
        else group.unpaidAmount += row.amount;
    });
    const summaryRows = Object.keys(groups).map(key => {
        const group = groups[key];
        return [group.title, group.orders, group.people, group.paid,
            Number(group.paidAmount), Number(group.unpaidAmount), group.gatherPlace];
    });
    if (summaryRows.length === 0) summaryRows.push(['当前筛选暂无报名记录', 0, 0, 0, 0, 0, '—']);
    return {
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
        rows: summaryRows,
    };
}

function carpoolSummarySheet(rows) {
    const groups = {};
    (rows || []).forEach(row => {
        if (!groups[row.postId]) {
            groups[row.postId] = {
                title: row.postTitle, kind: row.kindText, host: row.hostText,
                signups: 0, people: 0, departTime: row.departTime, resort: row.resort,
            };
        }
        const group = groups[row.postId];
        group.signups += 1;
        group.people += row.seats;
    });
    const summaryRows = Object.keys(groups).map(key => {
        const group = groups[key];
        return [group.title, group.kind, group.signups, group.people, group.host, group.departTime, group.resort];
    });
    if (summaryRows.length === 0) summaryRows.push(['当前筛选暂无报名记录', '—', 0, 0, '—', '—', '—']);
    return {
        name: '信息汇总',
        columns: [
            { title: '信息标题', width: 30 },
            { title: '类型', width: 12 },
            { title: '报名记录', width: 14 },
            { title: '报名人次', width: 14 },
            { title: '发起人', width: 18 },
            { title: '出发时间', width: 20 },
            { title: '目的雪场', width: 20 },
        ],
        rows: summaryRows,
    };
}

function infoSheet(options) {
    const config = options || {};
    return {
        name: '导出说明',
        columns: [{ title: '项目', width: 20 }, { title: '内容', width: 64 }],
        rows: [
            ['导出时间', timeText(new Date()) || fileStamp()],
            ['导出人', config.adminName || '俱乐部管理员'],
            ['数据范围', config.scopeText || '全部记录'],
            ['导出记录数', config.rows ? config.rows.length : 0],
            ['证件号处理', '完整身份证号'],
            ['数据来源', config.source || '云端参团订单快照 + 会员实名档案'],
            ['用途', config.usage || '俱乐部参团人员管理 / 保险名单 / 收款核对'],
            ['隐私提示', '文件含个人敏感信息，请仅用于俱乐部管理并妥善保管，勿随意外发。'],
        ],
    };
}

// 参团名单：只供活动详情页的单活动导出使用，rows 固定为本活动的订单。
function buildOrderSheets(options) {
    const config = options || {};
    const rows = config.rows || [];
    return [
        orderSheet(rows, config.emptyText),
        orderSummarySheet(rows),
        infoSheet(Object.assign({}, config, { rows })),
    ];
}

function buildCarpoolSheets(options) {
    const config = options || {};
    const rows = config.rows || [];
    return [
        carpoolSheet(rows, config.emptyText),
        carpoolSummarySheet(rows),
        infoSheet(Object.assign({}, config, { rows }, {
            source: config.source || '云端拼车 / 拼搭子报名记录 + 会员实名档案',
            usage: config.usage || '拼车与拼搭子报名人员核对 / 出行联络',
        })),
    ];
}

module.exports = {
    ORDER_COLUMNS,
    CARPOOL_COLUMNS,
    timeText,
    fileStamp,
    decorateOrder,
    decorateSignup,
    orderSheet,
    carpoolSheet,
    orderSummarySheet,
    carpoolSummarySheet,
    infoSheet,
    buildOrderSheets,
    buildCarpoolSheets,
};
