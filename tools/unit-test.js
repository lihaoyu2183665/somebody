/* 页面工具函数、权限守卫与支付状态机单元测试：node tools/unit-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ui = require('../utils/ui');
const payment = require('../utils/payment');
const profile = require('../utils/profile');
const xlsx = require('../utils/xlsx');
const roster = require('../utils/roster');
const personUtil = require('../utils/person');

// ui.js 的反馈函数引用小程序全局 wx，node 环境提供最小桩。
global.wx = {
    showToast: () => {},
    showModal: () => {},
    navigateTo: () => {},
    redirectTo: () => {},
    switchTab: () => {},
    navigateBack: () => {},
    setClipboardData: () => {},
};

let passed = 0;
function check(condition, label) {
    assert.ok(condition, label);
    passed += 1;
}
function eq(actual, expected, label) {
    assert.strictEqual(actual, expected, label);
    passed += 1;
}

eq(ui.money(12.5), '12.50', 'money');
eq(ui.money(undefined), '0.00', 'money empty');
assert.deepStrictEqual(ui.parseImages('["a","b"]'), ['a', 'b']); passed += 1;
assert.deepStrictEqual(ui.parseImages('bad'), []); passed += 1;
assert.deepStrictEqual(ui.parseImages(null), []); passed += 1;
assert.deepStrictEqual(ui.parseImages(['x']), ['x']); passed += 1;
eq(JSON.parse(ui.stringifyImages(['a', 'b']))[1], 'b', 'stringifyImages');
eq(ui.kindLabel('carpool'), '拼车', 'kindLabel');
eq(ui.kindLabel('partner'), '拼搭子', 'kindLabel partner');
eq(ui.statusLabel('open'), '报名中', 'statusLabel');
eq(ui.statusLabel('on_sale'), '在售', 'statusLabel on_sale');
eq(ui.statusLabel('booked'), '已预约', 'statusLabel booked');
eq(ui.reviewLabel('pending'), '待审核', 'reviewLabel');
eq(ui.reviewLabel('approved'), '已通过', 'reviewLabel approved');
eq(ui.reviewLabel('rejected'), '已驳回', 'reviewLabel rejected');
eq(ui.memberStatusLabel('active'), '正式会员', 'memberStatusLabel');
eq(ui.memberStatusLabel('pending'), '待审核会员', 'memberStatusLabel pending');
eq(ui.memberStatusLabel('draft'), '资料待完善', 'memberStatusLabel draft');
eq(ui.roleLabel('admin'), '俱乐部管理员', 'roleLabel admin');
eq(ui.roleLabel('member'), '注册会员', 'roleLabel member');
eq(ui.roleLabel(undefined), '注册会员', 'roleLabel fallback');
check(ui.levelLabel('beginner').indexOf('初级') >= 0, 'levelLabel');
eq(ui.joinDateTime('2026-12-01', '07:30'), '2026-12-01 07:30', 'joinDateTime');
assert.deepStrictEqual(ui.splitDateTime('2026-12-01 07:30'), { date: '2026-12-01', time: '07:30' }); passed += 1;
check(/^\d{4}-\d{2}-\d{2}$/.test(ui.today()), 'today');
eq(ui.shortText('1234567890', 5), '12345…', 'shortText');
eq(ui.initial('雪友'), '雪', 'initial');
eq(ui.markMine([{ id: 1, owner_id: 'u1' }], 'u1')[0].isMine, true, 'markMine true');
eq(ui.markMine([{ id: 1, owner_id: 'u1' }], 'u2')[0].isMine, false, 'markMine false');
check(ui.TRANSPORTS.length >= 5, 'TRANSPORTS');
check(ui.GEAR_CATEGORIES.length >= 8, 'GEAR_CATEGORIES');
eq(ui.LEVELS.length, 3, 'LEVELS');
eq(ui.KINDS.length, 2, 'KINDS');

// 支付接入状态与订单状态机
const readiness = payment.readiness();
eq(readiness.ready, false, 'gateway not ready');
eq(readiness.canStartOnlinePayment, false, 'no online payment');
eq(readiness.status, 'pending_binding', 'gateway status');
eq(readiness.checklist.length, 7, 'checklist size');
check(readiness.checklist.some(item => item.key === 'binding' && item.state === 'blocking'), 'binding blocking');
check(readiness.checklist.some(item => item.key === 'credential' && item.state === 'blocking'), 'credential blocking');
eq(payment.effectiveMethod('online'), 'offline', 'online degrades to offline');
eq(payment.effectiveMethod('offline'), 'offline', 'offline stays');
eq(payment.effectiveMethod(undefined), 'offline', 'default offline');
check(payment.methodLabel('online', true).indexOf('待接入') >= 0, 'degraded label');
eq(payment.methodLabel('offline'), '线下收款', 'offline label');
eq(payment.channelLabel('online'), '在线支付', 'channel label');
eq(payment.paymentStatusLabel('unpaid'), '待支付', 'unpaid label');
eq(payment.paymentStatusLabel('paid'), '已支付', 'paid label');
eq(payment.paymentTone('paid'), 'chip-ok', 'paid tone');
eq(payment.paymentTone('unpaid'), 'chip-warn', 'unpaid tone');
check(payment.paymentHint('unpaid').indexOf('管理员') >= 0, 'unpaid hint');
const no1 = payment.buildOutTradeNo('T12');
const no2 = payment.buildOutTradeNo('T12');
check(/^[A-Za-z0-9_\-|*@]{8,32}$/.test(no1), 'outTradeNo charset/length');
check(no1[0] !== '_', 'outTradeNo first char');
check(no1 !== no2, 'outTradeNo unique');
const decorated = payment.decorateOrder({ id: 1, payment_status: 'paid', payment_method: 'offline', out_trade_no: no1 });
eq(decorated.isPaid, true, 'decorate isPaid');
eq(decorated.paymentStatusText, '已支付', 'decorate status text');
eq(decorated.outTradeNoText, no1, 'decorate trade no');
eq(payment.decorateOrder({ payment_status: 'refunded' }).paymentStatusText, '已退款', 'refunded label');

// 合规断言：支付平台未就绪，项目代码不得出现任何支付 SDK / 签名 / 直连请求调用。
const sourceFiles = [];
const viewFiles = [];
function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.workbuddy') collect(full);
        } else if (entry.name.endsWith('.js')) {
            sourceFiles.push(full);
        } else if (/\.(wxml|wxss|json)$/.test(entry.name)) {
            viewFiles.push(full);
        }
    }
}
// 只扫描小程序运行时代码（测试脚本自身保存了这份禁用词清单，不参与扫描）。
const root = path.join(__dirname, '..');
['pages', 'utils', 'components'].forEach(dir => collect(path.join(root, dir)));
sourceFiles.push(path.join(root, 'app.js'));
const forbidden = /wechatVirtualPayment|requestVirtualPayment|wechatVirtualGoods|paySig|pay_sig|offerId|appKey/;
const offenders = sourceFiles.filter(file => forbidden.test(fs.readFileSync(file, 'utf8')));
eq(offenders.length, 0, 'no executable payment SDK code: ' + offenders.join(','));
const genderOptionOffenders = sourceFiles.filter(file => /保密|其他 \/ 保密/.test(fs.readFileSync(file, 'utf8')));
eq(genderOptionOffenders.length, 0, 'no confidential gender option: ' + genderOptionOffenders.join(','));
const maskOffenders = sourceFiles.filter(file => /maskIdCard|脱敏/.test(fs.readFileSync(file, 'utf8')));
eq(maskOffenders.length, 0, 'no id card masking in runtime code: ' + maskOffenders.join(','));
// 登录方式只保留微信授权：运行时代码（含页面模板 / 配置 / 样式）不得残留邮箱验证码链路。
const runtimeFiles = sourceFiles.concat(viewFiles, [path.join(root, 'app.wxss'), path.join(root, 'app.json')]);
const emailLoginOffenders = runtimeFiles.filter(file =>
    /邮箱|sendOtp|verifyOtp|login-panel|showEmail|onEmailSignedIn|onToggleEmail|EMAIL_RE|获取验证码|challenge/.test(fs.readFileSync(file, 'utf8')));
eq(emailLoginOffenders.length, 0, 'no email otp login in runtime code: ' + emailLoginOffenders.join(','));
eq(fs.existsSync(path.join(root, 'components/login-panel')), false, 'email otp component removed');
const loginPageNow = fs.readFileSync(path.join(root, 'pages/login/login.js'), 'utf8');
const loginPageViewNow = fs.readFileSync(path.join(root, 'pages/login/login.wxml'), 'utf8');
const loginPageConfigNow = fs.readFileSync(path.join(root, 'pages/login/login.json'), 'utf8');
check(loginPageNow.indexOf('api.signInWithWechat') >= 0 && loginPageNow.indexOf('onEmailSignedIn') < 0,
    'wechat sign-in is the only login path');
check(loginPageViewNow.indexOf('微信授权登录') >= 0 && loginPageViewNow.indexOf('login-panel') < 0
    && loginPageViewNow.indexOf('btn-plain') < 0, 'login page shows only the wechat button');
check(loginPageConfigNow.indexOf('login-panel') < 0 && loginPageConfigNow.indexOf('微信授权登录') >= 0,
    'login page config no longer registers otp component');

// 用 mock 依赖加载 guard.js，避免引入小程序 wx 运行时。
let currentMember = null;
const mockApi = {
    getSession: async () => (currentMember === null ? null : { user: { id: 'u1', name: '测试' } }),
    ensureMember: async () => currentMember,
};
let navigated = '';
const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    require: name => (name === './api' ? mockApi : ui),
    wx: {
        navigateTo: options => { navigated = options.url; },
        showToast: () => {},
    },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/guard.js'), 'utf8'), sandbox);
const guard = sandbox.module.exports;

// 用 mock cloud 加载 api.js，验证提权 / 撤权写入的字段。
const apiCalls = [];
const mockTable = {
    update(patch) {
        apiCalls.push({ op: 'update', patch });
        return {
            eq(column, value) {
                apiCalls.push({ op: 'eq', column, value });
                return { select: async () => ({ data: [{ id: value }], error: null }) };
            },
        };
    },
    delete() {
        apiCalls.push({ op: 'delete' });
        return {
            eq(column, value) {
                apiCalls.push({ op: 'eq', column, value });
                return { select: async () => ({ data: [{ id: value }], error: null }) };
            },
        };
    },
};
const mockCloud = {
    database: { from: table => { apiCalls.push({ op: 'from', table }); return mockTable; } },
    auth: { getSession: async () => ({ data: { user: { id: 'u1', name: '测试' } }, error: null }) },
    storage: {},
};
const apiSandbox = {
    module: { exports: {} },
    exports: {},
    console,
    require: name => (name === './cloud' ? { cloud: mockCloud } : null),
    getApp: () => ({ globalData: {} }),
    wx: {},
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/api.js'), 'utf8'), apiSandbox);
const api = apiSandbox.module.exports;
eq(typeof api.setMemberRole, 'function', 'setMemberRole exported');
eq(typeof api.submitForReview, 'function', 'submitForReview exported');
eq(typeof api.withdrawReview, 'function', 'withdrawReview exported');
eq(typeof api.deleteMember, 'function', 'deleteMember exported');
eq(typeof api.cancelMember, 'undefined', 'cancelMember removed');
eq(typeof api.restoreMember, 'undefined', 'restoreMember removed');

eq(guard.gateData('pending').title, '注册申请已提交', 'gate pending');
eq(guard.gateData('draft').title, '请先完善基本信息', 'gate draft');
eq(guard.gateData('draft').showEdit, true, 'draft gate opens profile editor');
eq(guard.gateData('draft').primaryText, '去完善基本信息', 'draft gate primary action');
eq(guard.STEPS.length, 5, 'registration flow has five steps');
eq(guard.actionHint('draft'), '请先完善基本信息并提交审核', 'draft action hint');
eq(guard.actionHint('pending'), '需管理员审核通过后才能使用', 'pending action hint');
eq(guard.gateData('rejected').primaryText, '刷新审核状态', 'gate rejected');
eq(guard.gateData('guest').showLogin, true, 'gate guest');
eq(guard.gateData('active'), null, 'gate active');
eq(guard.gateData('forbidden').showHome, true, 'gate forbidden');
eq(guard.gateData('forbiddenTrip').title, '仅管理员可发布', 'gate forbiddenTrip');
check(guard.gateData('forbiddenTrip').desc.indexOf('管理员') >= 0, 'forbiddenTrip desc');
assert.deepStrictEqual(
    guard.approvedOnly([
        { id: 1, review_status: 'pending' },
        { id: 2, review_status: 'approved' },
        { id: 3, review_status: 'rejected' },
    ]).map(row => row.id),
    [2],
); passed += 1;

(async () => {
    currentMember = null;
    const guest = await guard.access();
    eq(guest.state, 'guest', 'access guest');
    eq(guest.canView, false, 'guest canView');
    const guestAdmin = await guard.adminAccess();
    eq(guestAdmin.ok, false, 'guest is not admin');
    eq(guestAdmin.gate.state, 'guest', 'guest admin gate');

    currentMember = { role: 'member', status: 'draft' };
    const draft = await guard.access();
    eq(draft.state, 'draft', 'access draft');
    eq(draft.canView, false, 'draft cannot view');
    eq(draft.canPublish, false, 'draft cannot publish');
    eq(draft.gate.showEdit, true, 'draft gate requires profile');

    currentMember = { role: 'member', status: 'pending' };
    const pending = await guard.access();
    eq(pending.state, 'pending', 'access pending');
    eq(pending.canView, false, 'pending canView');
    eq(pending.canPublish, false, 'pending canPublish');
    eq(pending.gate.state, 'pending', 'pending gate');

    currentMember = { role: 'member', status: 'rejected' };
    eq((await guard.access()).state, 'rejected', 'access rejected');

    currentMember = { role: 'member', status: 'active' };
    const active = await guard.access();
    eq(active.state, 'active', 'access active');
    eq(active.canView, true, 'active canView');
    eq(active.canPublish, true, 'active canPublish');
    eq(active.gate, null, 'active gate');
    const memberAdmin = await guard.adminAccess();
    eq(memberAdmin.ok, false, 'active member is not admin');
    eq(memberAdmin.gate.state, 'forbiddenTrip', 'member admin gate');
    navigated = '';
    await guard.requireAdminPublish('/pages/trip-edit/trip-edit');
    eq(navigated, '', 'member cannot open admin publish');

    // 与数据库 is_admin() 一致：角色是管理员但状态失效时不授予管理权限。
    currentMember = { role: 'admin', status: 'rejected' };
    const inactiveAdmin = await guard.access();
    eq(inactiveAdmin.isAdmin, false, 'inactive admin has no admin rights');
    eq(inactiveAdmin.state, 'rejected', 'inactive admin state matches db');

    currentMember = { role: 'admin', status: 'active' };
    const admin = await guard.access();
    eq(admin.state, 'admin', 'access admin');
    eq(admin.isAdmin, true, 'admin isAdmin');
    eq(admin.gate, null, 'admin gate');
    const adminAccess = await guard.adminAccess();
    eq(adminAccess.ok, true, 'adminAccess ok');
    eq(adminAccess.gate, null, 'adminAccess gate');
    eq((await guard.requireAdminPage()).ok, true, 'requireAdminPage ok');
    await guard.requireAdminPublish('/pages/trip-edit/trip-edit');
    eq(navigated, '/pages/trip-edit/trip-edit', 'admin can open publish');

    // 历史已移除账号（兼容旧数据）：无论原角色是管理员还是会员，都只进入重新注册提示门禁。
    currentMember = { role: 'admin', status: 'cancelled' };
    const cancelledAdmin = await guard.access();
    eq(cancelledAdmin.state, 'cancelled', 'cancelled admin state');
    eq(cancelledAdmin.isAdmin, false, 'cancelled admin has no admin rights');
    eq(cancelledAdmin.canView, false, 'cancelled admin cannot view');
    eq(cancelledAdmin.gate.state, 'cancelled', 'cancelled gate shown');
    eq((await guard.adminAccess()).ok, false, 'cancelled admin blocked from admin pages');
    currentMember = { role: 'member', status: 'cancelled' };
    const cancelledMember = await guard.access();
    eq(cancelledMember.state, 'cancelled', 'cancelled member state');
    eq(cancelledMember.canPublish, false, 'cancelled member cannot publish');
    eq(guard.actionHint('cancelled'), '该账号已被管理员移除，请重新登录注册', 'removed account action hint');

    // 删除用户走物理删除：不再通过改状态停用，也不再提供恢复动作。
    apiCalls.length = 0;
    const deletedResult = await api.deleteMember(9);
    eq(deletedResult.error, null, 'deleteMember returns no error');
    check(apiCalls.some(call => call.op === 'from' && call.table === 'members'), 'deleteMember targets members table');
    check(apiCalls.some(call => call.op === 'delete'), 'deleteMember issues a hard delete');
    check(apiCalls.some(call => call.op === 'eq' && call.column === 'id' && call.value === 9), 'deleteMember targets member id');
    check(apiCalls.every(call => call.op !== 'update'), 'deleteMember does not soft-delete by status');

    // 审核中心提权 / 撤权的请求字段
    apiCalls.length = 0;
    const promoted = await api.setMemberRole(7, 'admin');
    eq(promoted.error, null, 'promote returns no error');
    const promotePatch = apiCalls.find(call => call.op === 'update').patch;
    eq(promotePatch.role, 'admin', 'promote sets admin role');
    eq(promotePatch.status, 'active', 'promote activates member');
    eq(promotePatch.review_note, null, 'promote clears review note');
    check(apiCalls.some(call => call.op === 'eq' && call.column === 'id' && call.value === 7), 'promote targets member id');
    apiCalls.length = 0;
    const demoted = await api.setMemberRole(7, 'member');
    eq(demoted.error, null, 'demote returns no error');
    const demotePatch = apiCalls.find(call => call.op === 'update').patch;
    eq(demotePatch.role, 'member', 'demote resets role');
    eq(demotePatch.status, undefined, 'demote keeps audit status');

    // 会员主动提交 / 撤回审核：只写 status，完整度由云端触发器最终把关。
    apiCalls.length = 0;
    const submitted = await api.submitForReview();
    eq(submitted.error, null, 'submitForReview returns no error');
    const submitPatch = apiCalls.find(call => call.op === 'update').patch;
    eq(submitPatch.status, 'pending', 'submit writes pending status');
    check(apiCalls.some(call => call.op === 'eq' && call.column === 'owner_id'), 'submit targets own row');
    apiCalls.length = 0;
    const withdrawn = await api.withdrawReview();
    eq(withdrawn.error, null, 'withdrawReview returns no error');
    const withdrawPatch = apiCalls.find(call => call.op === 'update').patch;
    eq(withdrawPatch.status, 'draft', 'withdraw writes draft status');

    // 教练权限层级：三级角色、教练门禁、提权请求字段与页面接线。
    eq(ui.roleLabel('coach'), '认证教练', 'roleLabel coach');
    eq(guard.gateData('forbiddenCoach').title, '仅认证教练可用', 'gate forbiddenCoach');
    eq(typeof guard.coachAccess, 'function', 'coachAccess exported');
    eq(typeof guard.requireCoachPublish, 'function', 'requireCoachPublish exported');
    eq(typeof guard.requireCoachPage, 'function', 'requireCoachPage exported');

    currentMember = { role: 'member', status: 'active' };
    const memberCoach = await guard.coachAccess();
    eq(memberCoach.ok, false, 'member cannot host coaching');
    eq(memberCoach.gate.state, 'forbiddenCoach', 'member coach gate');
    eq((await guard.requireCoachPage()).ok, false, 'member blocked from coach page');
    navigated = '';
    await guard.requireCoachPublish('/pages/coach-edit/coach-edit');
    eq(navigated, '', 'member cannot open coach publish');

    currentMember = { role: 'coach', status: 'active' };
    const coach = await guard.access();
    eq(coach.state, 'active', 'coach keeps active state');
    eq(coach.isCoach, true, 'coach isCoach');
    eq(coach.canCoach, true, 'coach canCoach');
    eq(coach.isAdmin, false, 'coach is not admin');
    eq(coach.canView, true, 'coach canView');
    const coachState = await guard.coachAccess();
    eq(coachState.ok, true, 'coachAccess ok');
    eq(coachState.gate, null, 'coachAccess gate');
    eq((await guard.requireCoachPage()).ok, true, 'requireCoachPage ok');
    navigated = '';
    await guard.requireCoachPublish('/pages/coach-edit/coach-edit');
    eq(navigated, '/pages/coach-edit/coach-edit', 'coach can open publish');
    eq((await guard.adminAccess()).ok, false, 'coach is not admin');
    eq((await guard.requireAdminPage()).ok, false, 'coach blocked from admin page');

    currentMember = { role: 'coach', status: 'rejected' };
    const inactiveCoach = await guard.access();
    eq(inactiveCoach.isCoach, false, 'inactive coach loses rights');
    eq(inactiveCoach.canCoach, false, 'inactive coach cannot host');
    eq((await guard.coachAccess()).ok, false, 'inactive coach blocked');

    currentMember = { role: 'admin', status: 'active' };
    const adminCoach = await guard.access();
    eq(adminCoach.isCoach, false, 'admin is not coach tier');
    eq(adminCoach.canCoach, true, 'admin can host coaching');
    eq((await guard.coachAccess()).ok, true, 'admin coachAccess ok');

    apiCalls.length = 0;
    const coachResult = await api.setMemberRole(9, 'coach');
    eq(coachResult.error, null, 'set coach returns no error');
    const coachPatch = apiCalls.find(call => call.op === 'update').patch;
    eq(coachPatch.role, 'coach', 'set coach writes role');
    eq(coachPatch.status, 'active', 'set coach activates member');
    check(apiCalls.some(call => call.op === 'eq' && call.column === 'id' && call.value === 9), 'set coach targets member id');

    // 审核中心与教练页面的接线断言
    const adminSource = fs.readFileSync(path.join(root, 'pages/admin/admin.js'), 'utf8');
    const adminView = fs.readFileSync(path.join(root, 'pages/admin/admin.wxml'), 'utf8');
    const coachEditSource = fs.readFileSync(path.join(root, 'pages/coach-edit/coach-edit.js'), 'utf8');
    const coachesSource = fs.readFileSync(path.join(root, 'pages/coaches/coaches.js'), 'utf8');
    check(adminSource.indexOf("label: '教练'") >= 0, 'admin coach filter');
    check(adminSource.indexOf("setMemberRole(Number(id), 'coach')") >= 0, 'admin promote to coach');
    check(adminSource.indexOf('coachCount') >= 0, 'admin coach count');
    check(adminView.indexOf('onSetCoach') >= 0 && adminView.indexOf('onRevokeCoach') >= 0, 'admin coach buttons');
    check(coachEditSource.indexOf('requireCoachPage') >= 0, 'coach edit page gate');
    check(coachesSource.indexOf('requireCoachPublish') >= 0, 'coaches publish gate');

    // 权限配色、头像预设、快捷入口与管理员用户名录
    eq(ui.roleColor('admin', 'active'), '#B23A32', 'admin role is red');
    eq(ui.roleColor('coach', 'active'), '#2F6FB0', 'coach role is blue');
    eq(ui.roleColor('member', 'active'), '#374D62', 'formal member uses soft slate');
    eq(ui.roleColor('member', 'pending'), '#8FA8BC', 'plain member is soft blue grey');
    eq(ui.roleColor('admin', 'rejected'), '#8FA8BC', 'inactive admin falls back to soft grey');
    eq(ui.roleTone('coach', 'active'), 'coach', 'roleTone coach');
    eq(ui.roleTone('member', 'active'), 'formal', 'roleTone formal');
    eq(typeof ui.AVATAR_PRESETS, 'undefined', 'legacy text avatar presets are removed');
    eq(ui.avatarPreset('preset:2'), null, 'legacy text avatar no longer resolves');
    eq(ui.avatarPreset('preset:9'), null, 'unknown avatar preset');
    eq(ui.isPhotoAvatar('shared/u1/avatars/a.jpg'), true, 'photo avatar detected');
    eq(ui.isPhotoAvatar('preset:1'), false, 'preset avatar detected');
    eq(ui.isPhotoAvatar(''), false, 'empty avatar is not photo');
    eq(typeof api.uploadAvatar, 'function', 'uploadAvatar exported');

    const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    const mineSource = fs.readFileSync(path.join(root, 'pages/mine/mine.js'), 'utf8');
    const mineView = fs.readFileSync(path.join(root, 'pages/mine/mine.wxml'), 'utf8');
    const memberEditSource = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.js'), 'utf8');
    const memberEditView = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.wxml'), 'utf8');
    const recordsSource = fs.readFileSync(path.join(root, 'pages/my-records/my-records.js'), 'utf8');
    const membersSource = fs.readFileSync(path.join(root, 'pages/members/members.js'), 'utf8');
    const membersView = fs.readFileSync(path.join(root, 'pages/members/members.wxml'), 'utf8');
    const adminViewNow = fs.readFileSync(path.join(root, 'pages/admin/admin.wxml'), 'utf8');
    check(appJson.pages.indexOf('pages/members/members') >= 0, 'members page registered');
    check(mineSource.indexOf('/pages/members/members') >= 0, 'admin members entry');
    check(mineSource.indexOf('my-records?tab=${tab}') >= 0, 'stat quick link');
    check(mineView.indexOf('bindtap="onStat"') >= 0, 'stat cells tappable');
    check(mineView.indexOf('style="color:{{roleColor}}"') >= 0, 'mine role color');
    check(memberEditSource.indexOf('uploadAvatar') >= 0 && memberEditSource.indexOf('onPickPreset') >= 0, 'avatar editor wired');
    check(memberEditView.indexOf('系统头像') < 0 && memberEditView.indexOf('系统文字头像') < 0
        && memberEditView.indexOf('wx:for="{{presets}}"') < 0
        && memberEditView.indexOf('卡通头像') >= 0
        && memberEditView.indexOf('上传照片作为头像') >= 0,
        'only cartoon presets are offered alongside photo upload');

    // 9 张内置卡通头像：本地资源、预设值、解析结果、选择界面与展示接线。
    eq(ui.AVATAR_ILLUSTRATIONS.length, 9, 'nine built-in cartoon avatars');
    eq(ui.avatarPreset('preset:art:1').label, '女1', 'cartoon avatar lookup by key');
    eq(ui.avatarImage('preset:art:1'), '/assets/avatar-art-1.jpg', 'cartoon avatar resolves local image');
    eq(ui.avatarImage('preset:1'), '', 'legacy text preset has no built-in image');
    eq(ui.avatarImage('shared/u1/avatars/a.jpg'), '', 'uploaded photo has no built-in image');
    eq(ui.isPhotoAvatar('preset:art:1'), false, 'cartoon avatar is not a cloud photo object');
    check(ui.AVATAR_ILLUSTRATIONS.every(item => item.key.indexOf('preset:art:') === 0
        && item.label && item.image
        && fs.existsSync(path.join(root, item.image.replace(/^\//, '')))),
        'every cartoon avatar has a label and an existing local asset');
    check(ui.AVATAR_ILLUSTRATIONS.every(item =>
        fs.statSync(path.join(root, item.image.replace(/^\//, ''))).size > 5000),
        'cartoon avatar assets are real compressed images');
    const avatarSandbox = {
        module: { exports: {} },
        exports: {},
        console,
        require: name => (name === './api' ? { signedUrls: async () => [] } : ui),
        wx: {},
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/avatar.js'), 'utf8'), avatarSandbox);
    const resolvedArt = await avatarSandbox.module.exports.resolve('preset:art:1', '雪友');
    eq(resolvedArt.photoUrl, '/assets/avatar-art-1.jpg', 'built-in avatar resolves to local image');
    eq(resolvedArt.isPhoto, true, 'built-in avatar renders as an image');
    const resolvedLegacy = await avatarSandbox.module.exports.resolve('preset:2', '雪友');
    eq(resolvedLegacy.photoUrl, '', 'legacy text avatar falls back to a glyph');
    eq(resolvedLegacy.className, '', 'legacy text avatar has no color class');
    eq(resolvedLegacy.glyph, '雪', 'legacy text avatar uses the nickname initial');
    const avatarUtilSource = fs.readFileSync(path.join(root, 'utils/avatar.js'), 'utf8');
    check(avatarUtilSource.indexOf('ui.avatarImage(value)') >= 0
        && avatarUtilSource.indexOf('photoUrl: builtin') >= 0,
        'avatar resolver prefers built-in images over cloud signed urls');
    check(memberEditSource.indexOf('artPresets: ui.AVATAR_ILLUSTRATIONS') >= 0
        && memberEditSource.indexOf('presets: ui.AVATAR_PRESETS') < 0
        && memberEditSource.indexOf('avatarUtil.resolve(key,') >= 0
        && memberEditSource.indexOf('原有文字头像已下线') >= 0,
        'avatar editor lists only cartoon avatars and guides legacy users');
    check(memberEditView.indexOf('wx:for="{{artPresets}}"') >= 0
        && memberEditView.indexOf('wx:for="{{presets}}"') < 0
        && memberEditView.indexOf('src="{{item.image}}"') >= 0
        && memberEditView.indexOf('卡通头像') >= 0,
        'cartoon avatar grid renders local images');
    check(recordsSource.indexOf('options.tab') >= 0, 'records read tab from query');
    check(membersSource.indexOf("api.list('members'") >= 0, 'members page loads all users');
    check(membersView.indexOf('完整注册信息') >= 0, 'members full profile');
    check(adminViewNow.indexOf('onMembers') >= 0, 'admin link to all users');

    // 实名资料：格式 / 校验位 / 完整展示 / 报名自动带入
    eq(profile.isValidIdCard('11010519491231002X'), true, 'valid id card checksum');
    eq(profile.isValidIdCard('110105198806150032'), true, 'second valid id card');
    eq(profile.isValidIdCard('110105194912310021'), false, 'invalid id card checksum');
    eq(profile.isValidIdCard('123'), false, 'short id card rejected');
    eq(profile.validateIdCard(''), '', 'empty id card is optional');
    check(profile.validateIdCard('1101051949123100').indexOf('18 位') >= 0, 'id card length error');
    eq(profile.normalizeIdCard(' 11010519491231002x '), '11010519491231002X', 'normalize id card');
    eq(profile.maskIdCard, undefined, 'id card masking removed');
    eq(profile.normalizeIdCard('11010519491231002X'), '11010519491231002X', 'full id card kept');
    eq(profile.maskPhone('13800138000'), '138****8000', 'mask phone');
    eq(profile.validatePhone('13800138000'), '', 'valid phone');
    check(profile.validatePhone('12345').indexOf('11 位') >= 0, 'invalid phone');
    eq(profile.validateRealName('张三'), '', 'valid real name');
    check(profile.validateRealName('A').indexOf('2-20') >= 0, 'short real name rejected');
    eq(profile.GENDERS.filter(item => item.value).length, 2, 'only male / female are selectable values');
    eq(profile.GENDERS.filter(item => item.value).map(item => item.label).join('/'), '男/女', 'gender option labels');
    eq(profile.GENDERS[0].value, '', 'gender placeholder has no value');
    eq(profile.GENDER_PLACEHOLDER, '请选择性别', 'gender placeholder');
    eq(profile.genderLabel('male'), '男', 'gender label male');
    eq(profile.genderLabel('female'), '女', 'gender label female');
    eq(profile.genderLabel('女'), '女', 'legacy chinese gender');
    eq(profile.genderLabel(''), '未填写', 'gender label empty');
    eq(profile.genderLabel('other'), '未填写', 'legacy other gender hidden');
    eq(profile.genderLabel('保密'), '未填写', 'legacy confidential gender hidden');
    const fullProfile = {
        real_name: '张三', id_card_no: '11010519491231002X', phone: '13800138000',
        gender: 'male', display_name: '雪友',
    };
    assert.deepStrictEqual(profile.signupValues(fullProfile), {
        realName: '张三', idCardNo: '11010519491231002X', phone: '13800138000', gender: 'male',
    }); passed += 1;
    eq(profile.signupValues({ display_name: '雪友' }).realName, '雪友', 'signup falls back to nickname');
    eq(profile.isComplete(fullProfile), true, 'complete profile');
    eq(profile.isComplete(Object.assign({}, fullProfile, { gender: 'other' })), false, 'other gender not complete');
    eq(profile.isComplete({ display_name: '雪友' }), false, 'incomplete profile');
    check(profile.completenessText(fullProfile).indexOf('已完整') >= 0, 'completeness text');
    assert.deepStrictEqual(profile.profileOf({}), {
        realName: '', idCardNo: '', phone: '', gender: '',
    }); passed += 1;

    // 真 .xlsx：ZIP 头、工作表 XML、长数字以文本保存、CSV / TSV 兜底
    const workbook = xlsx.buildWorkbook([
        {
            name: '参团人员名单',
            columns: [{ title: '序号', width: 8 }, { title: '姓名' }, { title: '身份证号' }, { title: '金额' }],
            rows: [[1, '张三', '11010519491231002X', 1280.5], [2, '<测试&', '', 0]],
        },
        { name: '活动汇总', columns: [{ title: '活动' }, { title: '订单数' }], rows: [['北大湖跨年团', 1]] },
    ]);
    check(workbook instanceof ArrayBuffer, 'workbook is ArrayBuffer');
    const wbBytes = Buffer.from(workbook);
    eq(wbBytes.slice(0, 4).toString('hex'), '504b0304', 'xlsx zip signature');
    const wbText = wbBytes.toString('utf8');
    check(wbText.indexOf('[Content_Types].xml') >= 0, 'xlsx content types part');
    check(wbText.indexOf('xl/worksheets/sheet1.xml') >= 0, 'xlsx sheet1 part');
    check(wbText.indexOf('xl/worksheets/sheet2.xml') >= 0, 'xlsx sheet2 part');
    check(wbText.indexOf('参团人员名单') >= 0 && wbText.indexOf('活动汇总') >= 0, 'xlsx sheet names');
    check(wbText.indexOf('11010519491231002X') >= 0, 'xlsx keeps id card as text');
    check(wbText.indexOf('<v>1280.5</v>') >= 0, 'xlsx numeric cell');
    check(wbText.indexOf('&lt;测试&amp;') >= 0, 'xml special chars escaped');
    const table = xlsx.tableRows({ columns: [{ title: '姓名' }, { title: '金额' }], rows: [['张三', 12]] });
    assert.deepStrictEqual(table, [['姓名', '金额'], ['张三', 12]]); passed += 1;
    eq(xlsx.toCsv([['姓名'], ['张三']]).charCodeAt(0), 0xFEFF, 'csv has UTF-8 BOM');
    check(xlsx.toCsv([['=1+1']]).indexOf("'=1+1") >= 0, 'csv formula injection guarded');
    eq(xlsx.toTsv([['姓名', '金额'], ['张三', 12]]), '姓名\t金额\n张三\t12', 'tsv for clipboard');

    // 页面接线：实名资料、报名自动带入；全站台账 / 导出已下线，只保留单活动导出。
    const appJsonNow = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    const memberEditNow = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.js'), 'utf8');
    const memberEditViewNow = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.wxml'), 'utf8');
    const tripDetailNow = fs.readFileSync(path.join(root, 'pages/trip-detail/trip-detail.js'), 'utf8');
    const tripDetailViewNow = fs.readFileSync(path.join(root, 'pages/trip-detail/trip-detail.wxml'), 'utf8');
    const mineViewNow = fs.readFileSync(path.join(root, 'pages/mine/mine.wxml'), 'utf8');
    const tripsViewNow = fs.readFileSync(path.join(root, 'pages/trips/trips.wxml'), 'utf8');
    const tripsLogicNow = fs.readFileSync(path.join(root, 'pages/trips/trips.js'), 'utf8');
    check(appJsonNow.pages.indexOf('pages/trip-members/trip-members') < 0
        && appJsonNow.pages.indexOf('pages/carpool-members/carpool-members') < 0
        && !fs.existsSync(path.join(root, 'pages/trip-members/trip-members.js'))
        && !fs.existsSync(path.join(root, 'pages/carpool-members/carpool-members.js')),
        'global roster and export pages removed');
    check(memberEditNow.indexOf('real_name') >= 0 && memberEditNow.indexOf('id_card_no') >= 0
        && memberEditNow.indexOf('gender') >= 0, 'member edit saves profile');
    check(memberEditViewNow.indexOf('实名信息') >= 0 && memberEditViewNow.indexOf('onGenderChange') >= 0, 'profile form fields');
    check(tripDetailNow.indexOf('onUseProfile') >= 0 && tripDetailNow.indexOf('participant_id_card') >= 0,
        'signup autofill and participant snapshot');
    check(tripDetailViewNow.indexOf('调用我的资料') >= 0 && tripDetailViewNow.indexOf('onIdCardInput') >= 0,
        'signup form has real-name fields');
    const rosterSource = fs.readFileSync(path.join(root, 'utils/roster.js'), 'utf8');
    const exportFileSource = fs.readFileSync(path.join(root, 'utils/export-file.js'), 'utf8');
    check(tripDetailNow.indexOf('roster.buildOrderSheets') >= 0
        && tripDetailNow.indexOf('onExportRoster') >= 0
        && tripDetailNow.indexOf('onShareRoster') >= 0
        && tripDetailNow.indexOf('onCopyRoster') >= 0
        && exportFileSource.indexOf('xlsx.buildWorkbook') >= 0
        && tripDetailNow.indexOf('onRoster') < 0,
        'only the in-activity export remains');
    check(tripDetailNow.indexOf('maskIdCard') < 0 && rosterSource.indexOf('idCardFull') >= 0
        && rosterSource.indexOf("['证件号处理', '完整身份证号']") >= 0 && rosterSource.indexOf('活动汇总') >= 0,
        'roster shows full id and builds summary sheet');
    check(tripsViewNow.indexOf('onRoster') < 0 && tripsLogicNow.indexOf('onRoster') < 0
        && tripsViewNow.indexOf('参团人员台账') < 0 && tripsViewNow.indexOf('Excel 导出') < 0,
        'trip module has no global export entry');
    check(mineViewNow.indexOf('onTripMembers') < 0 && mineViewNow.indexOf('参团人员台账') < 0
        && adminViewNow.indexOf('onTripMembers') < 0 && adminViewNow.indexOf('item.detail.realName') >= 0,
        'admin entries no longer link to global ledger; review keeps real-name info');

    // 提交审核前的资料完整度：与云端 member_profile_complete 保持同一套必填项
    const completeForReview = {
        display_name: '雪友', real_name: '张三', id_card_no: '11010519491231002X',
        phone: '13800138000', gender: 'male', snow_level: 'beginner',
    };
    eq(profile.REVIEW_FIELDS.length, 6, 'six mandatory fields');
    eq(profile.reviewCheck(completeForReview).complete, true, 'complete registration profile');
    eq(profile.reviewCheck(completeForReview).missing.length, 0, 'no missing fields');
    eq(profile.reviewChecklist(completeForReview).length, 6, 'checklist has all fields');
    check(profile.reviewChecklist(completeForReview).every(item => item.done), 'checklist all done');
    // 紧急联系人已下线：运行时代码、页面与导出列都不应再出现该字段或该项。
    const removedFieldFiles = ['utils/api.js', 'utils/profile.js', 'utils/guard.js',
        'pages/member-edit/member-edit.js', 'pages/member-edit/member-edit.wxml',
        'pages/admin/admin.js', 'pages/admin/admin.wxml', 'pages/members/members.js',
        'pages/members/members.wxml', 'pages/mine/mine.wxml'];
    const fieldOffenders = removedFieldFiles.filter(file =>
        /emergency_contact|emergencyContact|紧急联系人/.test(fs.readFileSync(path.join(root, file), 'utf8')));
    eq(fieldOffenders.length, 0, 'emergency contact fully removed: ' + fieldOffenders.join(','));
    const badCard = Object.assign({}, completeForReview, { id_card_no: '110105194912310021' });
    check(profile.reviewCheck(badCard).missing.some(item => item.indexOf('身份证号') >= 0), 'invalid id card blocks submit');
    const badPhone = Object.assign({}, completeForReview, { phone: '12345' });
    check(profile.reviewCheck(badPhone).missing.some(item => item.indexOf('手机号') >= 0), 'invalid phone blocks submit');
    const noGender = Object.assign({}, completeForReview, { gender: '' });
    check(profile.reviewCheck(noGender).missing.indexOf('性别') >= 0, 'missing gender blocks submit');
    const otherGender = Object.assign({}, completeForReview, { gender: 'other' });
    check(profile.reviewCheck(otherGender).missing.indexOf('性别') >= 0, 'other gender cannot submit review');
    check(memberEditViewNow.indexOf('genderLabels[genderIndex]') >= 0
        && tripDetailViewNow.indexOf('genderLabels[genderIndex]') >= 0,
        'gender pickers render selected label');
    eq(profile.GENDERS[0].label, profile.GENDER_PLACEHOLDER, 'picker starts at placeholder');
    check(tripDetailNow.indexOf('请选择性别') >= 0, 'signup requires gender selection');
    eq(profile.reviewCheck({}).complete, false, 'empty profile cannot submit');
    check(profile.reviewHint(completeForReview).indexOf('可以提交审核') >= 0, 'complete hint');
    check(profile.reviewHint(Object.assign({}, completeForReview, { gender: '' })).indexOf('性别') >= 0,
        'incomplete hint lists missing');

    // 资料完整 → 提交审核 → 管理员审批 的页面与云函数接线
    const reviewEdit = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.js'), 'utf8');
    const reviewEditView = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.wxml'), 'utf8');
    const membersDraft = fs.readFileSync(path.join(root, 'pages/members/members.js'), 'utf8');
    const loginSource = fs.readFileSync(path.join(root, 'pages/login/login.js'), 'utf8');
    const gateSource = fs.readFileSync(path.join(root, 'components/access-gate/access-gate.js'), 'utf8');
    const apiSource = fs.readFileSync(path.join(root, 'utils/api.js'), 'utf8');
    check(reviewEdit.indexOf('onSubmitReview') >= 0 && reviewEdit.indexOf('api.submitForReview') >= 0,
        'submit review action wired');
    check(reviewEdit.indexOf('onWithdraw') >= 0 && reviewEdit.indexOf('api.withdrawReview') >= 0,
        'withdraw review action wired');
    check(reviewEdit.indexOf('refreshReview') >= 0 && reviewEdit.indexOf('buildPayload') >= 0,
        'profile saves before submitting');
    check(reviewEditView.indexOf('提交审核') >= 0 && reviewEditView.indexOf('撤回申请') >= 0,
        'review buttons visible');
    check(adminSource.indexOf("label: '未提交'") >= 0
        && adminSource.indexOf("canApprove: row.status === 'pending'") >= 0,
        'admin only approves submitted requests');
    check(membersDraft.indexOf("label: '未提交'") >= 0, 'user directory has draft filter');
    check(mineSource.indexOf("draft: { text: '资料待完善'") >= 0, 'mine draft state');
    check(loginSource.indexOf("member.status === 'draft'") >= 0, 'login draft toast');
    check(gateSource.indexOf('showEdit') >= 0, 'gate routes to profile editor');
    check(apiSource.indexOf('function submitForReview') >= 0 && apiSource.indexOf('function withdrawReview') >= 0,
        'api review actions exported');

    // 共享名单模块：参团 / 拼车两套列定义、装饰字段与三工作表真 .xlsx。
    eq(roster.ORDER_COLUMNS.length, 21, 'order export has 21 columns');
    eq(roster.CARPOOL_COLUMNS.length, 19, 'carpool export has 19 columns');
    eq(roster.ORDER_COLUMNS[9].title, '身份证号', 'order export includes id card');
    eq(roster.CARPOOL_COLUMNS[10].title, '身份证号', 'carpool export includes id card');
    const orderFixture = {
        id: 31, trip_id: 8, owner_id: 'u1', owner_name: '雪友',
        option_name: '标准档', quantity: 2, amount: 400,
        participant_name: '张三', participant_id_card: '11010519491231002X',
        participant_phone: '13800138000', participant_gender: 'male',
        payment_status: 'unpaid', payment_method: 'offline', out_trade_no: 'SKI31',
        status: 'pending', note: '靠窗', payment_note: '',
        created_at: '2026-11-10T10:00:00Z',
    };
    const tripFixture = {
        id: 8, title: '北大湖跨年团', depart_time: '2026-12-01 07:00',
        return_time: '2026-12-01 18:00', gather_place: '东门',
    };
    const memberFixture = {
        owner_id: 'u1', display_name: '雪友一号', real_name: '张三',
        id_card_no: '11010519491231002X', phone: '13800138000', gender: 'male',
        snow_level: 'beginner', role: 'admin', status: 'active',
    };
    const decoratedOrder = roster.decorateOrder(orderFixture, tripFixture, memberFixture);
    eq(decoratedOrder.idCardFull, '11010519491231002X', 'order roster keeps full id card');
    eq(decoratedOrder.roleText, '俱乐部管理员', 'order roster shows admin role');
    eq(decoratedOrder.idCardSource, '报名时填写', 'order roster prefers order snapshot');
    eq(decoratedOrder.realName, '张三', 'order roster shows real name');
    const carpoolFixture = {
        id: 7, post_id: 5, owner_id: 'u1', owner_name: '雪友一号', seats: 2,
        note: '可带装备', contact: '', status: 'joined', created_at: '2026-11-10T10:00:00Z',
    };
    const postFixture = {
        id: 5, kind: 'carpool', title: '周末拼车', depart_time: '2026-12-01 07:00',
        return_time: '2026-12-01 18:00', depart_place: '市区', resort: '北大湖', owner_name: '发起人',
    };
    const decoratedSignup = roster.decorateSignup(carpoolFixture, postFixture, memberFixture);
    eq(decoratedSignup.idCardFull, '11010519491231002X', 'carpool roster keeps full id card');
    eq(decoratedSignup.kindText, '拼车', 'carpool roster labels kind');
    eq(decoratedSignup.seats, 2, 'carpool roster keeps seats');
    eq(decoratedSignup.hasProfile, true, 'carpool roster marks linked profile');
    eq(roster.decorateSignup(carpoolFixture, postFixture, {}).idCardText, '未填写', 'missing profile degrades gracefully');
    const orderSheets = roster.buildOrderSheets({ rows: [decoratedOrder], adminName: '管理员', scopeText: '本活动' });
    const carpoolSheets = roster.buildCarpoolSheets({ rows: [decoratedSignup], adminName: '管理员', scopeText: '全部信息' });
    eq(orderSheets.length, 3, 'order export has three sheets');
    eq(carpoolSheets.length, 3, 'carpool export has three sheets');
    eq(orderSheets[0].rows[0].length, roster.ORDER_COLUMNS.length, 'order rows align with columns');
    eq(carpoolSheets[0].rows[0].length, roster.CARPOOL_COLUMNS.length, 'carpool rows align with columns');
    eq(orderSheets[0].rows[0][9], '11010519491231002X', 'order sheet writes full id card');
    eq(carpoolSheets[0].rows[0][10], '11010519491231002X', 'carpool sheet writes full id card');
    [orderSheets, carpoolSheets].forEach((sheets, index) => {
        const bytes = Buffer.from(xlsx.buildWorkbook(sheets));
        eq(bytes.slice(0, 4).toString('hex'), '504b0304', `roster ${index} xlsx zip signature`);
        check(bytes.toString('utf8').indexOf('11010519491231002X') >= 0, `roster ${index} xlsx keeps full id card`);
    });

    // 页面接线：拼车 / 拼搭子报名人员信息、单活动名单导出、管理员可报名。
    const carpoolDetailNow = fs.readFileSync(path.join(root, 'pages/carpool-detail/carpool-detail.js'), 'utf8');
    const carpoolDetailViewNow = fs.readFileSync(path.join(root, 'pages/carpool-detail/carpool-detail.wxml'), 'utf8');
    const indexViewNow = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8');
    const indexLogicNow = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8');
    check(carpoolDetailNow.indexOf('roster.decorateSignup') >= 0 && carpoolDetailNow.indexOf("api.list('members'") >= 0,
        'carpool detail loads signup profiles for admin');
    check(carpoolDetailViewNow.indexOf('报名人员信息（') >= 0
        && carpoolDetailViewNow.indexOf('报名名单') < 0
        && carpoolDetailViewNow.indexOf('onCarpoolMembers') < 0
        && carpoolDetailViewNow.indexOf('member-detail') < 0
        && carpoolDetailViewNow.indexOf('onOpenPerson') >= 0,
        'carpool detail lists people with click-through details only');
    check(carpoolDetailNow.indexOf("isAdmin ? 'carpool_signups' : 'carpool_signup_contacts'") >= 0
        && carpoolDetailNow.indexOf('person.detailLines(item.person, this.data.isAdmin)') >= 0
        && carpoolDetailNow.indexOf("key: 'host'") >= 0,
        'normal members read limited view; admin also sees the host');
    check(carpoolDetailViewNow.indexOf('data-key="{{item.key}}" bindtap="onOpenPerson"') >= 0
        && carpoolDetailViewNow.indexOf('person-panel') >= 0
        && carpoolDetailViewNow.indexOf('onClosePerson') >= 0,
        'person names open a role-aware detail popup');
    check(indexViewNow.indexOf('报名人员汇总') < 0 && indexViewNow.indexOf('onCarpoolMembers') < 0
        && indexLogicNow.indexOf('onCarpoolMembers') < 0
        && mineSource.indexOf('/pages/carpool-members/carpool-members') < 0,
        'buddy module and mine have no roster summary entry');
    check(tripDetailNow.indexOf('roster.buildOrderSheets') >= 0
        && tripDetailNow.indexOf('onExportRoster') >= 0 && tripDetailNow.indexOf('onShareRoster') >= 0
        && tripDetailNow.indexOf('onCopyRoster') >= 0 && tripDetailNow.indexOf("api.list('members'") >= 0,
        'trip detail exports single-activity roster');
    check(tripDetailViewNow.indexOf('导出本活动名单') >= 0
        && tripDetailViewNow.indexOf('onOpenPerson') >= 0
        && tripDetailViewNow.indexOf('onToggleOrderDetail') < 0
        && tripDetailViewNow.indexOf('全部活动台账') < 0
        && tripDetailViewNow.indexOf('member-detail') < 0,
        'trip detail keeps only in-activity export and click-through person details');
    check(tripDetailNow.indexOf('contactText: row.contact_name') >= 0,
        'my orders keep contact text after roster refactor');
    check(tripDetailViewNow.indexOf('wx:if="{{trip.isOpen}}"') >= 0
        && tripDetailViewNow.indexOf('wx:if="{{!loading && !error}}"') >= 0
        && tripDetailViewNow.indexOf('!canManage && trip.isOpen') < 0,
        'admin can sign up for a trip');
    check(carpoolDetailViewNow.indexOf('wx:if="{{!mySignup && post.isOpen}}"') >= 0
        && carpoolDetailViewNow.indexOf('wx:if="{{!loading && !error}}"') >= 0
        && carpoolDetailViewNow.indexOf('!canManage') < 0,
        'admin can sign up for carpool / partner');

    // 收款与支付说明：仅管理员可见，且会员端完全不请求收款配置。
    const paymentPageNow = fs.readFileSync(path.join(root, 'pages/payment/payment.js'), 'utf8');
    const paymentPageViewNow = fs.readFileSync(path.join(root, 'pages/payment/payment.wxml'), 'utf8');
    const guardUtilNow = fs.readFileSync(path.join(root, 'utils/guard.js'), 'utf8');
    const paymentUtilNow = fs.readFileSync(path.join(root, 'utils/payment.js'), 'utf8');
    check(guardUtilNow.indexOf('forbiddenPayment') >= 0
        && paymentPageNow.indexOf("gateData('forbiddenPayment')") >= 0
        && paymentPageNow.indexOf('!access.isAdmin') >= 0, 'payment page has admin-only gate');
    check(paymentPageViewNow.indexOf('<view class="card" wx:else>') < 0
        && paymentPageViewNow.indexOf('{{payeeAccount ||') < 0
        && paymentPageViewNow.indexOf('复制收款账号') < 0,
        'payment page removed member read-only payee card');
    check(mineViewNow.indexOf('收款与支付说明') < 0
        && mineSource.indexOf('仅管理员可查看收款与支付说明') >= 0,
        'mine payment menu is admin-only');
    check(tripsViewNow.indexOf('class="section-more" wx:if="{{isAdmin}}">支付接入') >= 0
        && tripsViewNow.indexOf('class="small muted" wx:if="{{isAdmin}}">{{item.paymentText}}') >= 0
        && tripsLogicNow.indexOf('if (!this.data.isAdmin) return;') >= 0,
        'trips hides payment entry and payment method from members');
    check(tripDetailViewNow.indexOf('<block wx:if="{{isAdmin}}">\n        <view class="section">\n            <text class="section-title"><text class="section-mark"></text>收款与支付（管理员）</text>') >= 0,
        'trip detail payment card is wrapped in admin block');
    check(tripDetailViewNow.indexOf('合计金额<block wx:if="{{isAdmin}}">') >= 0
        && tripDetailViewNow.indexOf('class="chip chip-muted" wx:if="{{isAdmin}}">{{item.paymentChannelText}}') >= 0,
        'trip detail hides payment channel from members');
    check(tripDetailNow.indexOf('isAdmin ? api.getPaymentSettings()') >= 0
        && tripDetailNow.indexOf('const isAdmin = access.isAdmin') >= 0
        && tripDetailNow.indexOf('payeeAccount: settings.payee_account') >= 0,
        'trip detail only loads payee settings for admins');
    check(tripDetailNow.indexOf("if (!this.data.isAdmin) return;") >= 0
        && tripDetailNow.indexOf('请按收款说明付款') < 0
        && paymentUtilNow.indexOf('请按收款说明付款') < 0,
        'payment actions are admin-only and signup wording is neutral');
    check(apiSource.indexOf('仅管理员可读可保存') >= 0,
        'api documents admin-only payment settings');
    check(tripDetailViewNow.indexOf('提交后请联系俱乐部管理员完成付款确认') >= 0,
        'members get a neutral payment next step without seeing payee details');

    // 管理员用户管理：物理删除用户（不可恢复、下次登录重新注册、本人与最后一名管理员受保护）。
    const deleteApiNow = fs.readFileSync(path.join(root, 'utils/api.js'), 'utf8');
    const memberAdminNow = fs.readFileSync(path.join(root, 'utils/member-admin.js'), 'utf8');
    const membersLogicNow = fs.readFileSync(path.join(root, 'pages/members/members.js'), 'utf8');
    const membersViewNow = fs.readFileSync(path.join(root, 'pages/members/members.wxml'), 'utf8');
    const adminLogicNow = fs.readFileSync(path.join(root, 'pages/admin/admin.js'), 'utf8');
    const mineLogicNow = fs.readFileSync(path.join(root, 'pages/mine/mine.js'), 'utf8');
    const memberEditLogicNow = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.js'), 'utf8');
    const loginLogicNow = fs.readFileSync(path.join(root, 'pages/login/login.js'), 'utf8');
    const guardLogicNow = fs.readFileSync(path.join(root, 'utils/guard.js'), 'utf8');
    eq(ui.memberStatusLabel('cancelled'), '账号已被移除', 'legacy removed status label');
    check(guardLogicNow.indexOf("cancelled: {") >= 0 && guardLogicNow.indexOf("state = 'cancelled'") >= 0
        && guardLogicNow.indexOf('该账号已被管理员移除，请重新登录注册') >= 0,
        'legacy removed accounts are told to re-register');
    check(deleteApiNow.indexOf('async function deleteMember') >= 0
        && deleteApiNow.indexOf("return remove('members', id)") >= 0
        && deleteApiNow.indexOf('async function cancelMember') < 0
        && deleteApiNow.indexOf('async function restoreMember') < 0,
        'api hard-deletes members with no cancel / restore path');
    check(deleteApiNow.indexOf('async function ensureMember') >= 0
        && deleteApiNow.indexOf('if (found.data)') >= 0
        && deleteApiNow.indexOf('.insert({') >= 0,
        'deleted account re-registers automatically on next login');
    check(loginLogicNow.indexOf("const active = member && member.status === 'active'") >= 0
        && loginLogicNow.indexOf('该账号已被管理员移除，请重新登录注册') >= 0,
        'login shows re-register guidance for legacy removed accounts');
    check(memberEditLogicNow.indexOf("member.status === 'cancelled'") >= 0
        && memberEditLogicNow.indexOf("wx.switchTab({ url: '/pages/mine/mine' })") >= 0
        && mineLogicNow.indexOf("cancelled: { text: '账号已被移除'") >= 0,
        'legacy removed accounts stay blocked from profile editing');
    check(memberAdminNow.indexOf("title: '删除用户'") >= 0
        && memberAdminNow.indexOf("confirmText: '确认删除'") >= 0
        && memberAdminNow.indexOf('editable') < 0
        && memberAdminNow.indexOf('placeholderText') < 0
        && memberAdminNow.indexOf('请输入「删除」') < 0
        && memberAdminNow.indexOf("resolve(!!result.confirm)") >= 0
        && memberAdminNow.indexOf('api.deleteMember') >= 0
        && memberAdminNow.indexOf('下次使用同一微信登录') >= 0,
        'delete needs only one confirm tap with no typed input, and explains re-registration');
    check(membersLogicNow.indexOf('canDelete: !isSelf') >= 0
        && membersLogicNow.indexOf('async onDeleteMember(event)') >= 0
        && membersLogicNow.indexOf('memberAdmin.remove(id, name)') >= 0
        && membersLogicNow.indexOf("{ value: 'cancelled', label: '已注销' }") < 0,
        'member management exposes delete only, with self protection');
    check(membersViewNow.indexOf('bindtap="onDeleteMember">删除用户') >= 0
        && membersViewNow.indexOf('「删除用户」会永久删除') >= 0
        && membersViewNow.indexOf('恢复账号') < 0 && membersViewNow.indexOf('注销留档') < 0,
        'member management shows delete button without restore or cancellation trail');
    check(adminLogicNow.indexOf('canDelete: row.owner_id !== selfUid') >= 0
        && adminLogicNow.indexOf('async onDeleteMember(event)') >= 0
        && adminViewNow.indexOf('bindtap="onDeleteMember">删除用户') >= 0
        && adminViewNow.indexOf('恢复账号') < 0,
        'review center shares the same delete flow');
    const hardDeleteOffenders = sourceFiles.filter(file => /remove\(['"]members['"]/.test(fs.readFileSync(file, 'utf8')));
    eq(hardDeleteOffenders.length, 1, 'only api.js can hard-delete member profiles: ' + hardDeleteOffenders.join(','));

    // 用户信息查看页：角色标签后直接附实名姓名，历史已移除账号无名可显则只显示角色。
    const uiSourceNow = fs.readFileSync(path.join(root, 'utils/ui.js'), 'utf8');
    eq(ui.memberRoleName('member', '张三'), '注册会员 · 张三', 'member role with real name');
    eq(ui.memberRoleName('admin', '李四'), '俱乐部管理员 · 李四', 'admin role with real name');
    eq(ui.memberRoleName('coach', ' 王五 '), '认证教练 · 王五', 'coach role trims real name');
    eq(ui.memberRoleName('member', ''), '注册会员', 'member role without real name');
    eq(ui.memberRoleName('member', '   '), '注册会员', 'member role with blank real name');
    eq(ui.memberRoleName('member', null), '注册会员', 'member role with null real name');
    check(uiSourceNow.indexOf('function memberRoleName') >= 0
        && membersLogicNow.indexOf('ui.memberRoleName(row.role, row.real_name)') >= 0
        && membersLogicNow.indexOf(': ui.roleLabel(row.role)') >= 0
        && membersViewNow.indexOf('{{isAdmin ? item.roleNameText : item.roleText}}') >= 0
        && adminLogicNow.indexOf('ui.memberRoleName(row.role, row.real_name)') >= 0
        && adminViewNow.indexOf('{{isAdmin ? item.roleNameText : item.typeText}}') >= 0
        && adminLogicNow.indexOf('roleNameText: source.typeText') >= 0,
        'member info views show real name right after role label');

    // 实名姓名与完整实名资料只有管理员可见：页面门禁、按权限生成字段、条件渲染、展开区实名行四层。
    const tripDetailViewPrivacy = fs.readFileSync(path.join(root, 'pages/trip-detail/trip-detail.wxml'), 'utf8');
    const carpoolDetailViewPrivacy = fs.readFileSync(path.join(root, 'pages/carpool-detail/carpool-detail.wxml'), 'utf8');
    check(membersLogicNow.indexOf('if (!access.isAdmin)') >= 0
        && adminLogicNow.indexOf('if (!access.isAdmin)') >= 0
        && membersLogicNow.indexOf('isAdmin: access.isAdmin') >= 0
        && adminLogicNow.indexOf('isAdmin: access.isAdmin') >= 0
        && membersViewNow.indexOf('<block wx:if="{{isAdmin}}">') >= 0
        && adminViewNow.indexOf('<block wx:if="{{isAdmin}}">') >= 0
        && membersViewNow.indexOf('<text class="chip chip-muted" wx:if="{{isAdmin}}">手机号') >= 0,
        'member info pages gate real-name fields behind admin role');
    check(tripDetailViewPrivacy.indexOf('<block wx:if="{{isAdmin}}">') >= 0
        && tripDetailNow.indexOf('const orders = isAdmin ? decorated : []') >= 0
        && tripDetailNow.indexOf('const people = isAdmin ?') >= 0
        && tripDetailNow.indexOf("api.list('members'") >= 0
        && carpoolDetailViewPrivacy.indexOf('报名人员信息（仅管理员可见）') < 0
        && carpoolDetailNow.indexOf('carpool_signup_contacts') >= 0,
        'activity roster stays admin only; carpool normal users get the limited view');
    check(membersViewNow.indexOf('仅管理员可查看：角色标签后的实名姓名') >= 0
        && adminViewNow.indexOf('仅管理员可见，教练与普通会员不可见') >= 0,
        'member info pages state the admin-only visibility rule');

    // 雪狸品牌 LOGO：透明资源、可复现脚本与四个展示位置。
    const brandLogoPath = path.join(root, 'assets/brand-logo.png');
    const brandMarkPath = path.join(root, 'assets/brand-mark.png');
    check(fs.existsSync(brandLogoPath) && fs.existsSync(brandMarkPath), 'brand logo assets exist');
    check(fs.existsSync(path.join(root, 'tools/brand-source.png'))
        && fs.existsSync(path.join(root, 'tools/build_brand_assets.py')), 'brand assets are reproducible');
    const brandPng = fs.readFileSync(brandLogoPath);
    const brandMarkPng = fs.readFileSync(brandMarkPath);
    check(brandPng.slice(1, 4).toString() === 'PNG' && brandPng[25] === 6
        && brandMarkPng[25] === 6, 'brand assets are transparent RGBA PNGs');
    check(brandPng.readUInt32BE(16) >= 400 && brandPng.readUInt32BE(20) > brandPng.readUInt32BE(16)
        && brandMarkPng.readUInt32BE(16) === brandMarkPng.readUInt32BE(20),
        'full logo is portrait while the mark is square');
    const brandIndexView = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8');
    const brandLoginView = fs.readFileSync(path.join(root, 'pages/login/login.wxml'), 'utf8');
    const brandGateView = fs.readFileSync(path.join(root, 'components/access-gate/access-gate.wxml'), 'utf8');
    const brandMineView = fs.readFileSync(path.join(root, 'pages/mine/mine.wxml'), 'utf8');
    const brandAppStyle = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8').replace(/\r\n/g, '\n');
    const brandGateStyle = fs.readFileSync(path.join(root, 'components/access-gate/access-gate.wxss'), 'utf8');
    check(brandLoginView.indexOf('/assets/brand-logo.png') >= 0
        && brandGateView.indexOf('/assets/brand-logo.png') >= 0
        && brandIndexView.indexOf('/assets/brand-mark.png') >= 0
        && brandMineView.indexOf('/assets/brand-mark.png') >= 0,
        'brand logo visible on login, access gate, home and profile');
    check(brandIndexView.indexOf('class="brand-bar"') >= 0
        && brandIndexView.indexOf('雪狸 · ARCTIC CIVET') >= 0
        && brandMineView.indexOf('class="brand-footer"') >= 0,
        'home brand bar and profile brand footer carry the brand name');
    check(brandAppStyle.indexOf('.brand-bar-mark') >= 0
        && brandAppStyle.indexOf('.login-logo {\n    width: 230rpx;') >= 0
        && brandGateStyle.indexOf('.gate-art {\n    display: block;\n    width: 200rpx;') >= 0,
        'brand logo sizes fit login, gate and home layouts');

    // 护眼淡蓝主题：低饱和主色、淡蓝底、柔和近白卡片；语义色保留。
    const themeAppJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    const themeStyle = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8');
    const themeGateStyle = fs.readFileSync(path.join(root, 'components/access-gate/access-gate.wxss'), 'utf8');
    const themeAssetScript = fs.readFileSync(path.join(root, 'tools/generate_assets.py'), 'utf8');
    eq(themeAppJson.window.navigationBarBackgroundColor, '#E9F3FA', 'nav bar uses soft pale blue');
    eq(themeAppJson.window.backgroundColor, '#E9F3FA', 'page background uses soft pale blue');
    eq(themeAppJson.tabBar.selectedColor, '#3D78A8', 'selected tab uses muted blue');
    eq(themeAppJson.tabBar.color, '#8FA8BC', 'idle tab uses soft blue grey');
    eq(themeAppJson.tabBar.backgroundColor, '#F7FBFD', 'tab bar avoids pure white glare');
    check(themeStyle.indexOf('background: #E9F3FA;') >= 0
        && themeStyle.indexOf('background: #F7FBFD;') >= 0
        && themeStyle.indexOf('#3D78A8') >= 0
        && themeStyle.indexOf('#0B6CC0') < 0 && themeStyle.indexOf('#F3F8FD') < 0
        && themeStyle.indexOf('background: #FFFFFF') < 0
        && themeStyle.indexOf('rgba(60, 88, 110,') >= 0
        && themeStyle.indexOf('rgba(38, 49, 42') < 0
        && themeStyle.indexOf('#5C8A6B') < 0 && themeStyle.indexOf('#F7F5EF') < 0,
        'global style uses the eye-friendly pale blue palette');
    const accentRgb = [1, 3, 5].map(i => parseInt('#3D78A8'.slice(i, i + 2), 16));
    const accentSat = (Math.max(...accentRgb) - Math.min(...accentRgb)) / Math.max(...accentRgb);
    check(accentSat < 0.7, 'accent is desaturated for eye comfort');
    check(themeStyle.indexOf('.avatar-preset-1') < 0, 'legacy text avatar styles are removed');
    check(themeGateStyle.indexOf('#5C8A6B') < 0 && themeGateStyle.indexOf('#3D78A8') >= 0,
        'access gate shares the pale blue theme');
    check(themeAssetScript.indexOf('BRAND = (61, 120, 168, 255)') >= 0
        && themeAssetScript.indexOf('MUTED = (143, 168, 188, 255)') >= 0
        && themeAssetScript.indexOf('GREEN') < 0,
        'tab icons, page icons and hero art are drawn in muted blue');
    eq(ui.ROLE_COLORS.admin, '#B23A32', 'admin red role color stays semantic');
    eq(ui.ROLE_COLORS.coach, '#2F6FB0', 'coach blue role color stays semantic');
    const walk = (dir, out) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!['node_modules', '.workbuddy', 'assets', 'tools'].includes(entry.name)) walk(full, out);
            } else if (/\.(wxss|wxml|js|json)$/.test(entry.name)) out.push(full);
        });
        return out;
    };
    const greenOffenders = walk(root, []).filter(file => (fs.readFileSync(file, 'utf8').match(/#[0-9A-Fa-f]{6}\b/g) || [])
        .some(hex => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return g > r + 12 && g > b + 12;
        }));
    eq(greenOffenders.length, 0, 'no green palette remains in runtime source: ' + greenOffenders.join(','));

    // 教练头像：点击可上传照片或选内置卡通图；所有头像网格只显示图片，不显示名称。
    const pickerDir = path.join(root, 'components/avatar-picker');
    ['avatar-picker.js', 'avatar-picker.json', 'avatar-picker.wxml', 'avatar-picker.wxss'].forEach(name => {
        check(fs.existsSync(path.join(pickerDir, name)), `avatar picker provides ${name}`);
    });
    const pickerJs = fs.readFileSync(path.join(pickerDir, 'avatar-picker.js'), 'utf8');
    const pickerWxml = fs.readFileSync(path.join(pickerDir, 'avatar-picker.wxml'), 'utf8');
    const pickerJson = JSON.parse(fs.readFileSync(path.join(pickerDir, 'avatar-picker.json'), 'utf8'));
    eq(pickerJson.component, true, 'avatar picker is registered as a component');
    check(pickerJs.indexOf('ui.AVATAR_ILLUSTRATIONS') >= 0
        && pickerJs.indexOf('api.uploadAvatar(temp)') >= 0
        && pickerJs.indexOf("triggerEvent('change'") >= 0
        && pickerJs.indexOf('wx.chooseMedia') >= 0 && pickerJs.indexOf('wx.chooseImage') >= 0,
        'avatar picker offers cartoon presets and photo upload with a legacy fallback');
    check(pickerWxml.indexOf('wx:for="{{presets}}"') >= 0
        && pickerWxml.indexOf('src="{{item.image}}"') >= 0
        && pickerWxml.indexOf('{{item.label}}') < 0
        && pickerWxml.indexOf('avatar-option-label') < 0
        && pickerWxml.indexOf('bindtap="onUpload"') >= 0
        && pickerWxml.indexOf('bindtap="onReset"') >= 0,
        'avatar picker shows images only, with upload and reset actions');

    const coachDetailJs = fs.readFileSync(path.join(root, 'pages/coach-detail/coach-detail.js'), 'utf8');
    const coachDetailWxml = fs.readFileSync(path.join(root, 'pages/coach-detail/coach-detail.wxml'), 'utf8');
    const coachDetailJson = JSON.parse(fs.readFileSync(path.join(root, 'pages/coach-detail/coach-detail.json'), 'utf8'));
    const coachEditJs = fs.readFileSync(path.join(root, 'pages/coach-edit/coach-edit.js'), 'utf8');
    const coachEditWxml = fs.readFileSync(path.join(root, 'pages/coach-edit/coach-edit.wxml'), 'utf8');
    const coachEditJson = JSON.parse(fs.readFileSync(path.join(root, 'pages/coach-edit/coach-edit.json'), 'utf8'));
    const coachListJs = fs.readFileSync(path.join(root, 'pages/coaches/coaches.js'), 'utf8');
    const coachListView = fs.readFileSync(path.join(root, 'pages/coaches/coaches.wxml'), 'utf8');
    eq(coachDetailJson.usingComponents['avatar-picker'], '../../components/avatar-picker/avatar-picker', 'coach detail registers avatar picker');
    eq(coachEditJson.usingComponents['avatar-picker'], '../../components/avatar-picker/avatar-picker', 'coach editor registers avatar picker');
    check(coachDetailWxml.indexOf('bindtap="onOpenPicker"') >= 0
        && coachDetailWxml.indexOf('coach.avatarUrl') >= 0
        && coachDetailWxml.indexOf('avatar-edit-hint') >= 0
        && coachDetailWxml.indexOf('<avatar-picker') >= 0,
        'coach homepage shows a tappable avatar with an edit hint');
    check(coachDetailJs.indexOf('avatarUtil.resolve(raw.avatar, raw.name)') >= 0
        && coachDetailJs.indexOf('if (!this.data.canManage) return;') >= 0
        && coachDetailJs.indexOf("api.update('coaches', this.data.id, { avatar: value || null })") >= 0
        && coachDetailJs.indexOf('ui.isPhotoAvatar(old) && old !== value') >= 0,
        'coach avatar update is owner/admin gated, avatar-only and cleans old photos');
    check(coachEditWxml.indexOf('bindtap="onOpenPicker"') >= 0
        && coachEditJs.indexOf('请先保存教练资料，再设置头像') >= 0
        && coachEditJs.indexOf("api.update('coaches', this.data.id, { avatar: value || null })") >= 0,
        'coach editor shares the picker with a save-first guard');
    check(coachListJs.indexOf('avatarUtil.resolve(row.avatar, row.name)') >= 0
        && coachListView.indexOf('item.avatarUrl') >= 0,
        'coach list renders the saved avatar image');
    const avatarNameEditJs = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.js'), 'utf8');
    const avatarNameMembersJs = fs.readFileSync(path.join(root, 'pages/members/members.js'), 'utf8');
    const avatarNameStyle = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8');
    check(memberEditViewNow.indexOf('avatar-option-label') < 0
        && avatarNameEditJs.indexOf('preset.label') < 0
        && avatarNameMembersJs.indexOf('preset.label') < 0
        && avatarNameStyle.indexOf('.avatar-option-label') < 0,
        'avatar names are removed from every grid, hint and style');

    // 「我的」不再单列「自定义头像」或「基本信息 / 会员资料」菜单，头像即基本信息页唯一入口。
    const avatarEntryMineView = fs.readFileSync(path.join(root, 'pages/mine/mine.wxml'), 'utf8');
    const avatarEntryMineJs = fs.readFileSync(path.join(root, 'pages/mine/mine.js'), 'utf8');
    const avatarEntryEditView = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.wxml'), 'utf8');
    const avatarEntryEditJs = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.js'), 'utf8');
    check(avatarEntryMineView.indexOf('自定义头像') < 0
        && avatarEntryMineView.indexOf('onAvatar') < 0
        && avatarEntryMineView.indexOf('bindtap="onEditMember"') >= 0
        && avatarEntryMineView.indexOf('基本信息 / 会员资料') < 0
        && avatarEntryMineView.indexOf('<view class="menu-item" bindtap="onEditMember"') < 0
        && avatarEntryMineView.indexOf('class="avatar avatar-lg') >= 0
        && avatarEntryMineJs.indexOf('onAvatar') < 0
        && avatarEntryMineJs.indexOf('section=avatar') < 0
        && avatarEntryMineJs.indexOf('onEditMember') >= 0
        && avatarEntryEditView.indexOf('自定义头像') < 0
        && avatarEntryEditView.indexOf('avatarSection') < 0
        && avatarEntryEditView.indexOf('上传照片作为头像') >= 0
        && avatarEntryEditJs.indexOf('avatarSection') < 0,
        'mine has no standalone avatar or profile menu entry; avatar is the only way in');
    check(avatarEntryMineView.indexOf('参团人员台账') < 0
        && avatarEntryMineView.indexOf('拼车 / 拼搭子报名人员') < 0
        && avatarEntryMineJs.indexOf('onTripMembers') < 0
        && avatarEntryMineJs.indexOf('onCarpoolMembers') < 0,
        'mine no longer links to global roster ledgers');

    // 四大模块顶部照片背景：压缩资源、逐页接线、渐变遮罩与可复现脚本。
    const moduleBackgrounds = [
        ['buddy', 'pages/index/index.wxml', '滑雪搭子'],
        ['trip', 'pages/trips/trips.wxml', '俱乐部参团'],
        ['coach', 'pages/coaches/coaches.wxml', '教练平台'],
        ['gear', 'pages/gears/gears.wxml', '二手交易'],
    ];
    moduleBackgrounds.forEach(item => {
        const key = item[0];
        const asset = path.join(root, 'assets/module-' + key + '.jpg');
        check(fs.existsSync(asset) && fs.statSync(asset).size > 30000,
            key + ' module background asset exists');
        const bytes = fs.readFileSync(asset);
        check(bytes[0] === 0xFF && bytes[1] === 0xD8, key + ' background is a real JPEG');
        const view = fs.readFileSync(path.join(root, item[1]), 'utf8');
        check(view.indexOf('class="hero hero-photo"') >= 0
            && view.indexOf('/assets/module-' + key + '.jpg') >= 0
            && view.indexOf('class="hero-photo-mask"') >= 0
            && view.indexOf('hero-mountain.png') < 0
            && view.indexOf(item[2]) >= 0,
            key + ' module hero renders its own photo behind a gradient mask');
    });
    const bgStyle = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8').replace(/\r\n/g, '\n');
    check(bgStyle.indexOf('.hero-photo-bg') >= 0
        && bgStyle.indexOf('.hero-photo-mask') >= 0
        && bgStyle.indexOf('linear-gradient(90deg, rgba(233, 243, 250') >= 0
        && bgStyle.indexOf('.hero-art') < 0,
        'photo hero keeps title readable and replaces the old illustration');
    check(fs.existsSync(path.join(root, 'tools/build_module_backgrounds.py'))
        && moduleBackgrounds.every(item =>
            fs.existsSync(path.join(root, 'tools/backgrounds/' + item[0] + '-source.jpg'))),
        'module backgrounds are reproducible from bundled source photos');

    // 原生 tabBar：未启用自定义 tabBar，custom-tab-bar 目录与 utils/tabbar.js 均已移除
    const tabAppJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    eq(tabAppJson.tabBar.custom, undefined, 'app.json uses the native tab bar (custom not enabled)');
    check(!fs.existsSync(path.join(root, 'custom-tab-bar'))
        && !fs.existsSync(path.join(root, 'utils/tabbar.js')),
        'custom tab bar component and sync helper are removed');
    ['index/index', 'trips/trips', 'coaches/coaches', 'gears/gears', 'mine/mine'].forEach(page => {
        const source = fs.readFileSync(path.join(root, 'pages', page + '.js'), 'utf8');
        const tabRequire = 'require(' + "'../../utils/" + "tabbar')";
        check(source.indexOf(tabRequire) < 0
            && source.indexOf('tabbar.activate(') < 0,
            'page ' + page + ' no longer drives the custom tab bar');
    });
    const layoutStyle = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8').replace(/\r\n/g, '\n');
    check(layoutStyle.indexOf('padding: 0 28rpx 180rpx') >= 0
        && layoutStyle.indexOf('bottom: 60rpx') >= 0,
        'page content and floating action button clear the native tab bar');

    // 报名人员 / 拼团人详情：普通会员三要素、管理员全字段，弹层展示而非直接展开。
    const fullPerson = {
        name: '张三', phone: '13800138000', genderText: '男', nickname: '雪友',
        idCardText: '11010519491231002X', idCardSource: '会员档案',
        roleText: '正式会员', roleColor: '#374D62', level: '初级', hasProfile: true,
        extraLines: [personUtil.line('备注', '自带装备')],
    };
    const publicLines = personUtil.detailLines(fullPerson, false);
    eq(publicLines.length, 3, 'public person detail has exactly three fields');
    assert.deepStrictEqual(publicLines.map(item => item.key), personUtil.PUBLIC_KEYS, 'public detail keys'); passed += 1;
    check(publicLines.every(item => item.value.indexOf('110105') < 0), 'public detail never leaks id card');
    const adminLines = personUtil.detailLines(fullPerson, true);
    check(adminLines.length > publicLines.length
        && adminLines.some(item => item.key === '身份证号' && item.value === '11010519491231002X')
        && adminLines.some(item => item.key === '权限角色')
        && adminLines.some(item => item.key === '备注')
        && adminLines.some(item => item.key === '资料状态'),
        'admin person detail keeps full profile and business lines');
    eq(personUtil.detailTitle('host', '张三'), '拼团人 · 张三', 'host detail title');
    eq(personUtil.detailTitle('signup', '李四'), '报名人 · 李四', 'signup detail title');
    check(publicLines.every(item => item.color === personUtil.DEFAULT_TEXT_COLOR),
        'detail lines always carry a readable color');
    const personStyle = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8');
    check(personStyle.indexOf('.person-mask') >= 0 && personStyle.indexOf('.person-panel') >= 0
        && personStyle.indexOf('.person-name') >= 0, 'detail popup styles available globally');
    const carpoolPopup = fs.readFileSync(path.join(root, 'pages/carpool-detail/carpool-detail.wxml'), 'utf8');
    const tripPopup = fs.readFileSync(path.join(root, 'pages/trip-detail/trip-detail.wxml'), 'utf8');
    check(carpoolPopup.indexOf('person-mask') >= 0 && tripPopup.indexOf('person-mask') >= 0
        && carpoolPopup.indexOf('member-detail') < 0 && tripPopup.indexOf('member-detail') < 0,
        'both details use popup instead of inline expansion');
    check(carpoolPopup.indexOf('报名人员汇总') < 0 && carpoolPopup.indexOf('报名名单') < 0
        && tripPopup.indexOf('导出本活动名单') >= 0,
        'buddy summary removed and only in-activity export kept');

    // 初始入口：访客无需登录即可浏览全部模块概览；点开任意详情仍需注册并通过审核。
    const guestIndex = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8');
    const guestTripsLogic = fs.readFileSync(path.join(root, 'pages/trips/trips.js'), 'utf8');
    const guestCoachesLogic = fs.readFileSync(path.join(root, 'pages/coaches/coaches.js'), 'utf8');
    const guestGearsLogic = fs.readFileSync(path.join(root, 'pages/gears/gears.js'), 'utf8');
    const guestViews = ['index/index', 'trips/trips', 'coaches/coaches', 'gears/gears']
        .map(page => fs.readFileSync(path.join(root, 'pages', page + '.wxml'), 'utf8'));
    const guestDetailLogic = fs.readFileSync(path.join(root, 'pages/trip-detail/trip-detail.js'), 'utf8');
    const guestCarpoolDetail = fs.readFileSync(path.join(root, 'pages/carpool-detail/carpool-detail.js'), 'utf8');
    const guestCoachDetail = fs.readFileSync(path.join(root, 'pages/coach-detail/coach-detail.js'), 'utf8');
    const guestGearDetail = fs.readFileSync(path.join(root, 'pages/gear-detail/gear-detail.js'), 'utf8');
    check([guestIndex, guestTripsLogic, guestCoachesLogic, guestGearsLogic]
        .every(source => source.indexOf('if (!access.canView)') < 0
            && source.indexOf('guard.visitorState(access)') >= 0
            && source.indexOf('gate: null') >= 0
            && source.indexOf('guard.approvedOnly') >= 0),
        'all four module lists are open to visitors and show approved content only');
    check(guestIndex.indexOf("wx.switchTab({ url: '/pages/trips/trips' })") < 0
        && guestIndex.indexOf('_guestRedirected') < 0,
        'visitor stays on the first tab instead of being redirected');
    check(guestViews.every(view => view.indexOf('访客浏览 · 内容概览') >= 0
        && view.indexOf('bindtap="onLogin"') >= 0
        && view.indexOf('bindtap="onOpen"') >= 0),
        'every module shows a visitor hint and keeps its detail entry');
    check(guestTripsLogic.indexOf('const canAct = access.canView') >= 0,
        'trip list still limits signup and publishing to active members');
    check([guestDetailLogic, guestCarpoolDetail, guestCoachDetail, guestGearDetail]
        .every(source => source.indexOf('if (!access.canView)') >= 0
            && source.indexOf('gate: access.gate') >= 0),
        'all four detail pages keep the registration and review gate');
    check(guestDetailLogic.indexOf('const orders = isAdmin ? decorated : []') >= 0,
        'trip orders remain admin-only behind the detail gate');
    const visitorGuest = guard.visitorState({ state: 'guest', canView: false });
    const visitorActive = guard.visitorState({ state: 'active', canView: true });
    check(visitorGuest.canView === false && visitorGuest.guest === true
        && visitorActive.canView === true && visitorActive.guest === false
        && visitorGuest.actHint.indexOf('详细信息') >= 0,
        'visitorState separates public browsing from gated detail access');
    check(guard.gateData('guest').desc.indexOf('全部模块的内容概览对所有访客开放') >= 0
        && guard.gateData('guest').desc.indexOf('查看详细信息') >= 0,
        'guest gate copy reflects public browsing and gated details');

    // 高级管理员：唯一最高层级，继承全部管理员能力，档案对其他用户不可见。
    const hierarchyGuard = fs.readFileSync(path.join(root, 'utils/guard.js'), 'utf8');
    const hierarchyMine = fs.readFileSync(path.join(root, 'pages/mine/mine.js'), 'utf8');
    const hierarchyEdit = fs.readFileSync(path.join(root, 'pages/member-edit/member-edit.js'), 'utf8');
    const hierarchyMembers = fs.readFileSync(path.join(root, 'pages/members/members.js'), 'utf8');
    const hierarchyAdmin = fs.readFileSync(path.join(root, 'pages/admin/admin.js'), 'utf8');
    eq(ui.roleLabel('super_admin'), '高级管理员', 'super admin role label');
    eq(ui.roleTone('super_admin', 'active'), 'super', 'super admin tone');
    eq(ui.roleColor('super_admin', 'active'), '#6B3FA0', 'super admin colour');
    check(hierarchyGuard.indexOf("member.role === 'super_admin'") >= 0
        && hierarchyGuard.indexOf('isSuperAdmin') >= 0,
        'guard recognises super admin with full admin powers');
    check(hierarchyMembers.indexOf("filter(row => row.role !== 'super_admin')") >= 0
        && hierarchyAdmin.indexOf("filter(row => row.role !== 'super_admin')") >= 0
        && hierarchyMine.indexOf("access.isSuperAdmin ? '高级管理员'") >= 0
        && hierarchyEdit.indexOf("isSuperAdmin ? '高级管理员'") >= 0,
        'super admin profile is hidden from member lists and labelled in profile pages');
    currentMember = { role: 'super_admin', status: 'active' };
    const superAdminAccess = await guard.access();
    eq(superAdminAccess.state, 'admin', 'super admin keeps admin state');
    eq(superAdminAccess.isAdmin, true, 'super admin inherits admin rights');
    eq(superAdminAccess.isSuperAdmin, true, 'super admin is flagged');
    eq(superAdminAccess.canView, true, 'super admin can view all details');
    currentMember = { role: 'admin', status: 'active' };
    const ordinaryAdminAccess = await guard.access();
    eq(ordinaryAdminAccess.isSuperAdmin, false, 'ordinary admin is not super admin');

    console.log(`PASS ${passed} 项工具函数、四级权限、提交审核门禁、角色配色、仅卡通头像、教练头像可更换与无名称标签、我的页无自定义头像入口、四大模块照片背景、实名资料、Excel 导出、报名人员名单、管理员报名、快捷入口、单一微信授权登录、收款与支付管理员专属、用户删除与重新注册、角色后实名姓名、雪狸品牌 LOGO 展示、护眼淡蓝主题、底部按钮式导航、报名人员点击详情与三要素权限、全站导出下线、我的页头像唯一入口、支付状态机、全模块访客概览与详情门禁、高级管理员层级、合规断言`);
})().catch(error => {
    console.error('FAIL', error.message);
    process.exit(1);
});
