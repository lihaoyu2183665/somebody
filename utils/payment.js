// 参团收款状态与支付接入清单（纯业务层，不含任何支付 SDK 调用）。
//
// 平台预检结论（2026-11-08）：当前应用为试用小程序（trial），尚未绑定已注册小程序，
// 支付参数未配置，虚拟支付能力处于 blocked_by_binding 状态。按平台规范，此状态下
// 不生成可执行的微信支付调用代码；因此报名收款先走「线下登记 + 管理员确认」闭环，
// 订单已预留合规的业务单号、支付渠道与支付状态字段，绑定完成后即可接入在线支付。

const GATEWAY = {
    id: 'wechat_virtual_payment',
    name: '微信小程序虚拟支付',
    status: 'pending_binding',
    statusText: '待接入',
    appType: 'trial',
    bindingStatus: 'authorized',
    paymentConfigured: false,
    capabilityStatus: 'binding_not_ready',
    summary: '当前为试用小程序，尚未绑定已注册小程序，也未配置支付参数，在线支付暂不可发起。',
    nextAction: 'bind_existing_miniprogram',
};

// state: blocking 平台侧未完成 / unknown 需到微信 MP 后台确认 / todo 接入后操作
const CHECKLIST = [
    {
        key: 'binding',
        label: '绑定已注册小程序',
        state: 'blocking',
        detail: '当前应用类型为试用（trial），需改为绑定 existing 小程序并完成授权。',
        action: '在 WorkBuddy 中通过既有的小程序重新绑定流程完成绑定。',
    },
    {
        key: 'scope',
        label: '补齐虚拟支付管理权限（权限集 157）',
        state: 'blocking',
        detail: '重新绑定 / 重新授权时需勾选权限集 157，否则支付能力不可用。',
        action: '通过既有的小程序重新绑定 / 重新授权流程补齐权限。',
    },
    {
        key: 'credential',
        label: '配置支付参数',
        state: 'blocking',
        detail: '支付凭据尚未配置，平台无法代签支付请求。',
        action: '在 WorkBuddy 完成支付凭据配置并确认校验通过。',
    },
    {
        key: 'category',
        label: '确认主体类型与服务类目',
        state: 'unknown',
        detail: '个人主体需包含「工具」服务类目；主体类型当前无法从试用绑定读取。',
        action: '由创建人前往微信 MP 后台「支付与交易 → 虚拟支付」核实。',
    },
    {
        key: 'verification',
        label: '完成微信认证',
        state: 'unknown',
        detail: '真实支付生效前需完成小程序微信认证。',
        action: '在微信 MP 后台完成认证后重新检查接入状态。',
    },
    {
        key: 'filing',
        label: '完成 ICP 备案',
        state: 'unknown',
        detail: '真实支付生效前需完成小程序 ICP 备案。',
        action: '在微信 MP 后台完成备案后重新检查接入状态。',
    },
    {
        key: 'goods',
        label: '发布支付道具并接入下单',
        state: 'todo',
        detail: '道具发布后约 10 分钟生效，之后才能用平台 SDK 发起支付。',
        action: '以上条件全部满足后，再在活动报名流程中启用在线支付。',
    },
];

const METHODS = [
    { value: 'offline', label: '线下收款' },
    { value: 'online', label: '在线支付' },
];

const PAYMENT_STATUS = {
    unpaid: { label: '待支付', tone: 'chip-warn', hint: '请联系俱乐部管理员完成付款确认，确认后报名生效。' },
    paid: { label: '已支付', tone: 'chip-ok', hint: '管理员已确认收款，报名生效。' },
    refunded: { label: '已退款', tone: 'chip-muted', hint: '款项已退回，请联系管理员。' },
};

const CHANNEL = {
    offline: '线下收款',
    online: '在线支付',
};

function readiness() {
    return {
        ready: false,
        id: GATEWAY.id,
        name: GATEWAY.name,
        status: GATEWAY.status,
        statusText: GATEWAY.statusText,
        summary: GATEWAY.summary,
        checklist: CHECKLIST,
        canStartOnlinePayment: false,
    };
}

// 管理员可为活动设定目标收款方式；平台未就绪时实际执行方式降级为线下收款。
function effectiveMethod(activityMethod) {
    if (activityMethod === 'online' && !readiness().ready) return 'offline';
    return activityMethod === 'online' ? 'online' : 'offline';
}

function methodLabel(value, isDegraded) {
    if (value === 'online') return isDegraded ? '在线支付（待接入，暂按线下收款）' : '在线支付';
    return '线下收款';
}

function channelLabel(value) {
    return CHANNEL[value] || CHANNEL.offline;
}

function paymentStatusLabel(value) {
    return (PAYMENT_STATUS[value] || PAYMENT_STATUS.unpaid).label;
}

function paymentTone(value) {
    return (PAYMENT_STATUS[value] || PAYMENT_STATUS.unpaid).tone;
}

function paymentHint(value) {
    return (PAYMENT_STATUS[value] || PAYMENT_STATUS.unpaid).hint;
}

// 业务单号：8~32 位，仅字母数字与 _ - | * @，且不以 _ 开头；符合日后支付接入的幂等要求。
function buildOutTradeNo(seed) {
    const stamp = Date.now().toString(36).toUpperCase();
    const salt = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
    const extra = String(seed || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
    return `SKI${stamp}${salt}${extra}`.slice(0, 32);
}

// 订单卡片展示用的装饰字段，避免 WXML 里调用函数。
function decorateOrder(row) {
    const payment = PAYMENT_STATUS[row.payment_status] || PAYMENT_STATUS.unpaid;
    return Object.assign({}, row, {
        paymentStatusText: payment.label,
        paymentTone: payment.tone,
        paymentHint: payment.hint,
        paymentChannelText: channelLabel(row.payment_method),
        isPaid: row.payment_status === 'paid',
        outTradeNoText: row.out_trade_no || '未生成',
    });
}

module.exports = {
    GATEWAY,
    CHECKLIST,
    METHODS,
    PAYMENT_STATUS,
    readiness,
    effectiveMethod,
    methodLabel,
    channelLabel,
    paymentStatusLabel,
    paymentTone,
    paymentHint,
    buildOutTradeNo,
    decorateOrder,
};
