// 会员权限等级与访问守卫
// guest 未注册 / draft 资料待完善 / pending 待审核 / rejected 审核未通过 / cancelled 历史已移除账号（兼容旧数据） / active 正式会员 / admin 管理员
// 四级角色：member 注册会员 / coach 认证教练 / admin 俱乐部管理员（可多名）/ super_admin 高级管理员（唯一、最高权限）
// 各模块内容概览对所有访客开放；只有 active 与 admin 可以查看详细信息、报名与预约，教练内容仅 coach / admin 可发布。
// 普通会员注册后为 draft，必须填写完整基本信息并主动提交审核才会变成 pending。
const api = require('./api');
const ui = require('./ui');

const STEPS = ['微信授权注册', '完善基本信息', '提交会员审核', '管理员审核', '解锁全部功能'];

const GATES = {
    guest: {
        title: '登录后注册会员',
        subtitle: '详细信息仅对正式会员开放',
        desc: '俱乐部全部模块的内容概览对所有访客开放，可直接浏览滑雪搭子、俱乐部参团、教练平台与二手交易。查看详细信息、报名参团、预约课程与发布内容，需微信授权登录、完善基本信息并经管理员审核通过后解锁。',
        steps: STEPS,
        primaryText: '登录 / 注册',
        showLogin: true,
    },
    draft: {
        title: '请先完善基本信息',
        subtitle: '资料完整后才能提交审核',
        desc: '注册已成功，但申请尚未提交。请填完昵称、姓名、身份证号、手机号、性别与滑雪水平，全部通过校验后点「提交审核」；管理员只会看到已提交且资料完整的申请。',
        steps: STEPS,
        primaryText: '去完善基本信息',
        showEdit: true,
    },
    pending: {
        title: '注册申请已提交',
        subtitle: '等待管理员审核',
        desc: '审核通过后会自动升级为正式会员，届时可查看全部内容、发布信息、报名参团与预约课程。审核结果会在这里实时更新。',
        steps: STEPS,
        primaryText: '刷新审核状态',
        showRefresh: true,
        showProfile: true,
    },
    rejected: {
        title: '审核未通过',
        subtitle: '暂未开通会员权限',
        desc: '请完善会员资料并联系俱乐部管理员重新审核。审核通过后即可恢复查看与发布权限。',
        steps: STEPS,
        primaryText: '刷新审核状态',
        showRefresh: true,
        showProfile: true,
    },
    cancelled: {
        title: '账号已被移除',
        subtitle: '请重新登录注册',
        desc: '俱乐部管理员已删除此账号的会员档案，全部会员功能已停用。请用微信重新登录，重新填写基本信息并提交审核，管理员通过后即可再次使用；历史参团与报名记录仍保留作台账留档。此为历史已停用数据的兼容提示。',
        steps: [],
        primaryText: '返回我的',
        showHome: true,
    },
    forbidden: {
        title: '仅管理员可用',
        subtitle: '权限不足',
        desc: '审核中心仅供俱乐部管理员使用。如需开通会员权限，请联系管理员。',
        steps: [],
        primaryText: '返回我的',
        showHome: true,
    },
    forbiddenTrip: {
        title: '仅管理员可发布',
        subtitle: '参团活动由俱乐部统一发布',
        desc: '为保证行程、名额与收款信息准确，俱乐部参团活动与价格档位只能由管理员创建、编辑和删除。正式会员仍可查看全部活动、选择价格类别并报名支付。',
        steps: [],
        primaryText: '返回我的',
        showHome: true,
    },
    forbiddenPayment: {
        title: '仅管理员可用',
        subtitle: '收款与支付说明不对会员开放',
        desc: '收款配置、付款说明与在线支付接入清单仅供俱乐部管理员查看。报名参团不受影响，如需确认付款请联系管理员。',
        steps: [],
        primaryText: '返回我的',
        showHome: true,
    },
    forbiddenCoach: {
        title: '仅认证教练可用',
        subtitle: '教练权限尚未开通',
        desc: '教练主页与可约时段由俱乐部认证教练发布。请联系管理员在「审核中心 → 会员注册」把你的账号提升为教练权限；提权后即可管理教练资料、排课并查看学员预约。',
        steps: [],
        primaryText: '返回我的',
        showHome: true,
    },
};

function gateData(state) {
    const config = GATES[state];
    return config ? Object.assign({ state }, config) : null;
}

// 不同未开通状态给出可执行的下一步提示，而不是笼统的「审核通过后才可用」。
function actionHint(state) {
    if (state === 'draft') return '请先完善基本信息并提交审核';
    if (state === 'rejected') return '审核未通过，请完善资料后重新提交审核';
    if (state === 'cancelled') return '该账号已被管理员移除，请重新登录注册';
    return '需管理员审核通过后才能使用';
}

function pack(state, member, session) {
    const allowed = state === 'active' || state === 'admin';
    const gate = allowed ? null : gateData(state);
    if (gate && (state === 'rejected' || state === 'pending' || state === 'draft') && member && member.review_note) {
        gate.desc = `${gate.desc} 管理员意见：${member.review_note}`;
    }
    const role = member ? member.role : 'member';
    const isAdmin = state === 'admin';
    // 高级管理员复用 admin 状态以继承全部管理员能力，另以 isSuperAdmin 标识唯一的最高权限层级。
    const isSuperAdmin = isAdmin && role === 'super_admin';
    // isCoach 表示「教练」这一独立层级；canCoach 包含管理员，管理员天然拥有教练发布能力。
    const isCoach = state === 'active' && role === 'coach';
    return {
        state,
        levelText: isSuperAdmin ? '高级管理员' : ui.memberStatusLabel(state),
        member,
        session,
        role,
        isAdmin,
        isSuperAdmin,
        isCoach,
        canCoach: isAdmin || isCoach,
        canView: allowed,
        canPublish: allowed,
        gate,
    };
}

// 每次都读取云端会员档案，管理员审核 / 提权后无需重新登录即可解锁。
async function access() {
    const session = await api.getSession();
    if (!session) return pack('guest', null, null);
    const member = await api.ensureMember();
    if (!member) return pack('guest', null, session);
    let state = 'draft';
    // 与数据库 is_admin() 保持一致：管理员与高级管理员都必须是 active 才拥有管理权限。
    if ((member.role === 'admin' || member.role === 'super_admin') && member.status === 'active') state = 'admin';
    else if (member.status === 'active') state = 'active';
    else if (member.status === 'cancelled') state = 'cancelled';
    else if (member.status === 'rejected') state = 'rejected';
    else if (member.status === 'pending') state = 'pending';
    return pack(state, member, session);
}

async function requirePublish(url) {
    const current = await access();
    if (current.state === 'guest') {
        ui.toast('请先登录并注册会员');
        wx.navigateTo({ url: '/pages/login/login' });
        return;
    }
    if (!current.canPublish) {
        ui.toast(actionHint(current.state));
        return;
    }
    wx.navigateTo({ url });
}

// 编辑 / 发布页直达入口：未登录或审核未通过时立即离开。
async function requirePublishPage() {
    const current = await access();
    if (current.state === 'guest') {
        ui.toast('请先登录并注册会员');
        wx.redirectTo({ url: '/pages/login/login' });
        return false;
    }
    if (!current.canPublish) {
        ui.toast(actionHint(current.state));
        wx.navigateBack();
        return false;
    }
    return true;
}

async function requireAction() {
    const current = await access();
    if (current.state === 'guest') {
        ui.toast('请先登录并注册会员');
        wx.navigateTo({ url: '/pages/login/login' });
        return false;
    }
    if (!current.canView) {
        ui.toast(actionHint(current.state));
        return false;
    }
    return true;
}

async function requireAdmin() {
    const current = await access();
    return current.isAdmin;
}

// 参团活动（含价格档位）为管理员专属：返回门禁信息供页面渲染访问屏障。
async function adminAccess() {
    const current = await access();
    if (current.isAdmin) return { ok: true, access: current, gate: null };
    if (current.state === 'guest') return { ok: false, access: current, gate: gateData('guest') };
    if (!current.canView) return { ok: false, access: current, gate: current.gate };
    return { ok: false, access: current, gate: gateData('forbiddenTrip') };
}

async function requireAdminPublish(url) {
    const state = await adminAccess();
    if (!state.ok) {
        ui.toast(state.access.state === 'guest' ? '请先登录并注册会员' : '仅俱乐部管理员可以发布参团活动');
        return;
    }
    wx.navigateTo({ url });
}

async function requireAdminPage() {
    const state = await adminAccess();
    return { ok: state.ok, gate: state.gate };
}

// 教练主页与可约时段为教练 / 管理员专属：正式会员只能浏览与预约。
async function coachAccess() {
    const current = await access();
    if (current.canCoach) return { ok: true, access: current, gate: null };
    if (current.state === 'guest') return { ok: false, access: current, gate: gateData('guest') };
    if (!current.canView) return { ok: false, access: current, gate: current.gate };
    return { ok: false, access: current, gate: gateData('forbiddenCoach') };
}

async function requireCoachPublish(url) {
    const state = await coachAccess();
    if (!state.ok) {
        ui.toast(state.access.state === 'guest'
            ? '请先登录并注册会员'
            : (state.access.canView ? '仅认证教练可发布教练资料，请联系管理员提权' : actionHint(state.access.state)));
        return;
    }
    wx.navigateTo({ url });
}

async function requireCoachPage() {
    const state = await coachAccess();
    return { ok: state.ok, gate: state.gate };
}

// 列表只呈现审核通过的内容：作者本人与管理员虽能读到待审核行，也不对外展示。
function approvedOnly(rows) {
    return (rows || []).filter(row => row.review_status === 'approved');
}

// 各模块列表页统一的访客态：内容概览公开，详细信息与写操作仍需要审核通过的正式会员。
// 详情页不调用此函数，而是直接渲染 gate，保证「点开详情」才要求注册与审核。
function visitorState(access) {
    const guest = access.state === 'guest';
    return {
        canView: access.canView,
        guest,
        actHint: guest
            ? '登录并注册会员、经管理员审核通过后，即可查看详细信息、报名预约与发布内容。'
            : '管理员审核通过后，即可查看详细信息、报名预约与发布内容。',
    };
}

module.exports = {
    GATES,
    STEPS,
    gateData,
    actionHint,
    access,
    requirePublish,
    requirePublishPage,
    requireAction,
    requireAdmin,
    adminAccess,
    requireAdminPublish,
    requireAdminPage,
    coachAccess,
    requireCoachPublish,
    requireCoachPage,
    approvedOnly,
    visitorState,
};
