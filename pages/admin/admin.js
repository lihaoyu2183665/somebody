const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const profile = require('../../utils/profile');
const memberAdmin = require('../../utils/member-admin');

const CONTENT_SOURCES = [
    {
        table: 'carpool_posts',
        typeText: '滑雪搭子',
        path: row => `/pages/carpool-detail/carpool-detail?id=${row.id}`,
    },
    {
        table: 'trip_activities',
        typeText: '俱乐部参团',
        path: row => `/pages/trip-detail/trip-detail?id=${row.id}`,
    },
    {
        table: 'gear_items',
        typeText: '雪具交易',
        path: row => `/pages/gear-detail/gear-detail?id=${row.id}`,
    },
    {
        table: 'coaches',
        typeText: '教练主页',
        path: row => `/pages/coach-detail/coach-detail?id=${row.id}`,
    },
    {
        table: 'coach_slots',
        typeText: '可约时段',
        path: row => `/pages/coach-detail/coach-detail?id=${row.coach_id}`,
    },
];

// 已通过 = 所有审核通过的用户（含教练与管理员）；教练 / 管理员另有专属角色页签。
// 会员状态与内容审核状态是两套取值，避免用 approved 去查 members.status。
const MEMBER_FILTERS = [
    { value: 'pending', label: '待审核' },
    { value: 'draft', label: '未提交' },
    { value: 'active', label: '已通过' },
    { value: 'coach', label: '教练' },
    { value: 'admin', label: '管理员' },
    { value: 'rejected', label: '已驳回' },
    { value: 'all', label: '全部' },
];

const CONTENT_FILTERS = [
    { value: 'pending', label: '待审核' },
    { value: 'approved', label: '已通过' },
    { value: 'rejected', label: '已驳回' },
];

function timeText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const pad = number => (number < 10 ? `0${number}` : `${number}`);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function maskUid(value) {
    const text = String(value || '');
    return text ? `${text.slice(0, 12)}…` : '未获取';
}

function confirmReject() {
    return new Promise(resolve => {
        wx.showModal({
            title: '驳回申请',
            content: '',
            editable: true,
            placeholderText: '填写驳回原因（选填）',
            confirmText: '确认驳回',
            cancelText: '取消',
            confirmColor: '#3D78A8',
            success: result => resolve(result.confirm ? (result.content || '').trim() : null),
            fail: () => resolve(null),
        });
    });
}

Page({
    data: {
        gate: null,
        isAdmin: false,
        tab: 'members',
        status: 'pending',
        memberFilters: MEMBER_FILTERS,
        contentFilters: CONTENT_FILTERS,
        loading: true,
        error: '',
        list: [],
        expandedId: null,
        counts: { memberPending: 0, memberDraft: 0, contentPending: 0, coachCount: 0, adminCount: 0, memberTotal: 0 },
    },

    onShow() {
        this.load();
    },

    async load() {
        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        if (!access.isAdmin) {
            this.setData({
                loading: false,
                list: [],
                isAdmin: false,
                gate: access.state === 'guest' ? access.gate : guard.gateData('forbidden'),
            });
            return;
        }
        const selfUid = access.session && access.session.user ? access.session.user.id : '';
        // 实名姓名仅管理员可见：审核中心本身有管理员门禁，这里再按权限生成展示字段。
        this.setData({ gate: null, isAdmin: access.isAdmin });

        const tab = this.data.tab;
        const status = this.data.status;
        // 一次取回全部会员：既用于统计，也用于按状态 / 角色筛选与展示完整注册资料。
        const results = await Promise.all([
            api.list('members', { limit: 200 }),
        ].concat(CONTENT_SOURCES.map(source => api.list(source.table, {
            filters: [{ column: 'review_status', value: 'pending' }],
            limit: 200,
        }))));
        const memberResult = results[0];
        const pendingResults = results.slice(1);
        if (memberResult.error) {
            this.setData({ loading: false, error: memberResult.error.message });
            return;
        }

        // 高级管理员档案已由云端 RLS 对其他用户隐藏，前端再过滤一次作为双保险。
        const allMembers = (memberResult.data || []).filter(row => row.role !== 'super_admin');
        const adminCount = allMembers.filter(row => row.role === 'admin' && row.status === 'active').length;
        const coachCount = allMembers.filter(row => row.role === 'coach' && row.status === 'active').length;
        const memberPending = allMembers.filter(row => row.status === 'pending').length;
        const memberDraft = allMembers.filter(row => row.status === 'draft').length;
        const contentPending = pendingResults.reduce(
            (sum, result) => sum + (result.error ? 0 : result.data.length), 0);
        let list = [];

        if (tab === 'members') {
            const rows = allMembers.filter(row => {
                if (status === 'all') return true;
                if (status === 'admin') return row.role === 'admin';
                if (status === 'coach') return row.role === 'coach';
                if (status === 'active') return row.status === 'active';
                return row.status === status;
            });
            list = rows.map(row => ({
                key: `member-${row.id}`,
                id: row.id,
                table: 'members',
                isMember: true,
                typeText: ui.roleLabel(row.role),
                roleText: ui.roleLabel(row.role),
                roleNameText: access.isAdmin
                    ? ui.memberRoleName(row.role, row.real_name)
                    : ui.roleLabel(row.role),
                roleColor: ui.roleColor(row.role, row.status),
                isAdminRole: row.role === 'admin',
                isCoachRole: row.role === 'coach',
                isSelf: row.owner_id === selfUid,
                // 删除不可恢复；本人与最后一名管理员由云端再次拦截。
                canDelete: row.owner_id !== selfUid,
                title: row.display_name || row.owner_name || '新会员',
                sub: `手机号：${row.phone || '未填写'} · ${ui.levelLabel(row.snow_level)}`,
                timeText: timeText(row.created_at),
                statusText: ui.memberStatusLabel(row.status),
                statusTone: row.status === 'active' ? 'chip-ok' : 'chip-warn',
                noteText: row.review_note || '',
                path: '',
                // 只有已提交且资料完整的待审核申请才能通过；未提交的 draft 不进入审批动作。
                canApprove: row.status === 'pending',
                canReject: row.status === 'pending' || row.status === 'active',
                canReset: row.status !== 'pending' && row.status !== 'draft' && row.status !== 'cancelled',
                // 提权以正式会员为前提，不能把未提交审核的 draft 直接提为管理员。
                canPromote: row.role !== 'admin' && row.status === 'active',
                canDemote: row.role === 'admin' && row.status !== 'cancelled' && !(row.owner_id === selfUid && adminCount === 1),
                canSetCoach: row.role === 'member' && row.status === 'active',
                canRevokeCoach: row.role === 'coach' && row.status !== 'cancelled',
                detail: {
                    uid: maskUid(row.owner_id),
                    name: row.display_name || row.owner_name || '未填写',
                    wxName: row.owner_name || '未填写',
                    realName: row.real_name || '未填写',
                    idCard: profile.normalizeIdCard(row.id_card_no) || '未填写',
                    gender: profile.genderLabel(row.gender),
                    phone: row.phone || '未填写',
                    level: ui.levelLabel(row.snow_level),
                    role: ui.roleLabel(row.role),
                    status: ui.memberStatusLabel(row.status),
                    profileComplete: profile.reviewCheck(row).complete ? '已完整' : '未完整',
                    registeredAt: timeText(row.created_at) || '未记录',
                    submittedAt: timeText(row.submitted_at) || '尚未提交',
                    reviewedAt: timeText(row.reviewed_at) || '暂无',
                    reviewNote: row.review_note || '无',
                },
            }));
        } else {
            const contentResults = await Promise.all(CONTENT_SOURCES.map(source => api.list(source.table, {
                filters: [{ column: 'review_status', value: status }],
                limit: 100,
            })));
            contentResults.forEach((result, index) => {
                if (result.error) return;
                const source = CONTENT_SOURCES[index];
                result.data.forEach(row => list.push({
                    key: `${source.table}-${row.id}`,
                    id: row.id,
                    table: source.table,
                    isMember: false,
                    typeText: source.typeText,
                    roleNameText: source.typeText,
                    title: row.title || row.name || `${row.date || '可约时段'} ${row.start_time || ''}`.trim(),
                    sub: `发布者：${row.owner_name || '雪友'} · ${row.depart_place || row.resort || row.category || row.trade_place || '查看完整信息'}`,
                    timeText: timeText(row.created_at),
                    statusText: ui.reviewLabel(row.review_status),
                    statusTone: row.review_status === 'approved' ? 'chip-ok' : 'chip-warn',
                    noteText: row.review_note || '',
                    path: source.path(row),
                    canApprove: row.review_status !== 'approved',
                    canReject: row.review_status !== 'rejected',
                    canReset: row.review_status !== 'pending',
                    canPromote: false,
                    canDemote: false,
                    detail: null,
                }));
            });
            list.sort((a, b) => (a.timeText < b.timeText ? 1 : -1));
        }

        this.setData({
            loading: false,
            list,
            counts: {
                memberPending,
                memberDraft,
                contentPending,
                coachCount,
                adminCount,
                memberTotal: allMembers.length,
            },
        });
    },

    onTab(event) {
        this.setData({ tab: event.currentTarget.dataset.value, status: 'pending', expandedId: null });
        this.load();
    },

    onStatus(event) {
        this.setData({ status: event.currentTarget.dataset.value, expandedId: null });
        this.load();
    },

    onToggleDetail(event) {
        const id = Number(event.currentTarget.dataset.id);
        this.setData({ expandedId: this.data.expandedId === id ? null : id });
    },

    async onRefresh() {
        await this.load();
        ui.success('审核列表已刷新');
    },

    onOpen(event) {
        const path = event.currentTarget.dataset.path;
        if (path) wx.navigateTo({ url: path });
    },

    onMembers() {
        wx.navigateTo({ url: '/pages/members/members' });
    },

    async onApprove(event) {
        const { id, table } = event.currentTarget.dataset;
        const isMember = table === 'members';
        const result = isMember
            ? await api.reviewMember(Number(id), 'active', '')
            : await api.reviewContent(table, Number(id), 'approved', '');
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success(isMember ? '已通过，升级为正式会员' : '已通过，内容已公开展示');
        this.setData({ expandedId: null });
        this.load();
    },

    async onReject(event) {
        const note = await confirmReject();
        if (note === null) return;
        const { id, table } = event.currentTarget.dataset;
        const isMember = table === 'members';
        const result = isMember
            ? await api.reviewMember(Number(id), 'rejected', note)
            : await api.reviewContent(table, Number(id), 'rejected', note);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已驳回');
        this.setData({ expandedId: null });
        this.load();
    },

    async onReset(event) {
        const { id, table } = event.currentTarget.dataset;
        const isMember = table === 'members';
        const agreed = await ui.confirm('恢复为待审核后，该会员或内容将重新进入待办列表。', '恢复待审核');
        if (!agreed) return;
        const result = isMember
            ? await api.reviewMember(Number(id), 'pending', '')
            : await api.reviewContent(table, Number(id), 'pending', '');
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已恢复待审核');
        this.setData({ expandedId: null });
        this.load();
    },

    // 提权为教练：仅正式会员可提权，提权后可发布教练主页与可约时段。
    async onSetCoach(event) {
        const { id, name } = event.currentTarget.dataset;
        const agreed = await ui.confirm(
            `将「${name || '该会员'}」提升为认证教练？提权后可发布并管理教练主页、安排可约时段、查看学员预约；教练资料与时段仍需管理员审核通过后展示。`,
            '确认设为教练',
        );
        if (!agreed) return;
        const result = await api.setMemberRole(Number(id), 'coach');
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已提升为认证教练');
        this.setData({ expandedId: null });
        this.load();
    },

    async onRevokeCoach(event) {
        const { id, name } = event.currentTarget.dataset;
        const agreed = await ui.confirm(
            `撤销「${name || '该会员'}」的教练身份？撤销后仍保留正式会员身份，但不再能编辑或新增教练资料与可约时段。`,
            '确认撤销教练',
        );
        if (!agreed) return;
        const result = await api.setMemberRole(Number(id), 'member');
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已撤销教练身份');
        this.setData({ expandedId: null });
        this.load();
    },

    // 提权：把注册用户提升为管理员，同时激活为正式会员，无需再单独审核。
    async onPromote(event) {
        const { id, name } = event.currentTarget.dataset;
        const agreed = await ui.confirm(
            `将「${name || '该会员'}」提升为俱乐部管理员？提权后自动成为正式会员，可查看全部注册信息、审批会员与发布内容、发布参团活动并确认收款。`,
            '确认提权',
        );
        if (!agreed) return;
        const result = await api.setMemberRole(Number(id), 'admin');
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已提升为管理员');
        this.setData({ expandedId: null });
        this.load();
    },

    async onDemote(event) {
        const { id, name } = event.currentTarget.dataset;
        const agreed = await ui.confirm(
            `撤销「${name || '该会员'}」的管理员身份？撤销后仍保留正式会员身份，可继续使用全部会员功能。`,
            '确认撤销',
        );
        if (!agreed) return;
        const result = await api.setMemberRole(Number(id), 'member');
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已撤销管理员身份');
        this.setData({ expandedId: null });
        this.load();
    },

    // 删除用户，与「全部用户信息」页共用同一套一次确认与云端操作。
    async onDeleteMember(event) {
        const { id, name } = event.currentTarget.dataset;
        const done = await memberAdmin.remove(id, name);
        if (done) {
            this.setData({ expandedId: null });
            this.load();
        }
    },
});
