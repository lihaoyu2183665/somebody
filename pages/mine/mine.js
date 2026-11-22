const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const avatarUtil = require('../../utils/avatar');

const EMPTY_STATS = { posts: 0, signups: 0, orders: 0, bookings: 0 };

const STATE_TEXT = {
    guest: { text: '未注册', desc: '登录后创建会员档案，填写完整基本信息并提交审核，管理员通过后即可成为正式会员。', tone: 'chip-warn' },
    draft: { text: '资料待完善', desc: '注册已成功，申请尚未提交。点击上方头像进入基本信息页，填完清单里的每一项并点「提交审核」；管理员只会看到已提交的申请。', tone: 'chip-warn' },
    pending: { text: '待审核会员', desc: '注册申请已提交，等待管理员审核。审核期间可撤回申请修改资料；审核通过前无法查看各分项目内容、发布信息或报名。', tone: 'chip-warn' },
    rejected: { text: '审核未通过', desc: '请按管理员意见点击头像进入基本信息页完善资料，并重新提交审核。', tone: 'chip-warn' },
    cancelled: { text: '账号已被移除', desc: '俱乐部管理员已删除此账号的会员档案，全部会员功能已停用。请用微信重新登录，重新填写基本信息并提交审核，管理员通过后即可再次使用。', tone: 'chip-warn' },
    active: { text: '正式会员', desc: '已解锁全部功能。你发布的信息仍需管理员审核通过后才会对外展示；教练主页与排课需管理员授予教练权限。', tone: 'chip-ok' },
    admin: { text: '俱乐部管理员', desc: '拥有全部功能权限，可在审核中心查看全部注册信息、审批会员与发布内容，并提升或撤销其他管理员。', tone: 'chip-ok' },
};

Page({
    data: {
        loading: true,
        signedIn: false,
        canView: false,
        memberState: 'guest',
        isAdmin: false,
        isCoach: false,
        canCoach: false,
        displayName: '雪友',
        initial: '雪',
        roleText: '未注册',
        roleColor: ui.ROLE_COLORS.guest,
        avatarPhotoUrl: '',
        avatarClass: '',
        avatarGlyph: '雪',
        levelText: '未填写水平',
        statusText: '未注册',
        statusDesc: '',
        statusTone: 'chip-warn',
        stats: EMPTY_STATS,
    },

    onShow() {
        this.load();
    },

    async load() {
        this.setData({ loading: true });
        try {
            const access = await guard.access();
            const state = access.state;
            const stateInfo = STATE_TEXT[state] || STATE_TEXT.draft;
            if (state === 'guest') {
                this.setData({
                    loading: false,
                    signedIn: false,
                    canView: false,
                    memberState: state,
                    isAdmin: false,
                    isCoach: false,
                    canCoach: false,
                    displayName: '雪友',
                    initial: '雪',
                    roleText: '未注册',
                    roleColor: ui.ROLE_COLORS.guest,
                    avatarPhotoUrl: '',
                    avatarClass: '',
                    avatarGlyph: '雪',
                    levelText: '未填写水平',
                    statusText: stateInfo.text,
                    statusDesc: stateInfo.desc,
                    statusTone: stateInfo.tone,
                    stats: EMPTY_STATS,
                });
                return;
            }

            const member = access.member;
            const session = access.session || {};
            const uid = session.user && session.user.id;
            const ownerFilter = [{ column: 'owner_id', value: uid }];
            let stats = EMPTY_STATS;
            if (access.canView) {
                const [posts, trips, gears, coach, signups, orders, bookings] = await Promise.all([
                    api.list('carpool_posts', { filters: ownerFilter, limit: 100 }),
                    api.list('trip_activities', { filters: ownerFilter, limit: 100 }),
                    api.list('gear_items', { filters: ownerFilter, limit: 100 }),
                    api.list('coaches', { filters: ownerFilter, limit: 100 }),
                    api.list('carpool_signups', { filters: ownerFilter, limit: 100 }),
                    api.list('trip_orders', { filters: ownerFilter, limit: 100 }),
                    api.list('coach_bookings', { filters: ownerFilter, limit: 100 }),
                ]);
                const count = result => (result.error ? 0 : result.data.length);
                stats = {
                    posts: count(posts) + count(trips) + count(gears) + count(coach),
                    signups: count(signups),
                    orders: count(orders),
                    bookings: count(bookings),
                };
            }
            const name = (member && member.display_name) || (session.user && session.user.name) || '雪友';
            const avatarInfo = await avatarUtil.resolve(member && member.avatar, name);
            this.setData({
                loading: false,
                signedIn: true,
                canView: access.canView,
                memberState: state,
                isAdmin: access.isAdmin,
                isCoach: access.isCoach,
                canCoach: access.canCoach,
                displayName: name,
                initial: ui.initial(name),
                isSuperAdmin: access.isSuperAdmin,
                roleText: access.isSuperAdmin ? '高级管理员' : (access.isAdmin ? '俱乐部管理员' : (access.isCoach ? '认证教练' : stateInfo.text)),
                roleColor: ui.roleColor(member && member.role, member && member.status),
                avatarPhotoUrl: avatarInfo.photoUrl,
                avatarClass: avatarInfo.className,
                avatarGlyph: avatarInfo.glyph,
                levelText: member ? ui.levelLabel(member.snow_level) : '未填写水平',
                statusText: access.isSuperAdmin ? '高级管理员' : stateInfo.text,
                statusDesc: access.isSuperAdmin
                    ? '俱乐部最高权限，拥有全部管理与审批能力；高级管理员仅有一名，其档案不对其他用户可见。'
                    : (access.isCoach
                        ? '已获认证教练权限：可发布与管理教练主页、安排可约时段并查看学员预约；教练资料与时段仍需管理员审核通过后展示。'
                        : stateInfo.desc),
                statusTone: stateInfo.tone,
                stats,
            });
        } catch (e) {
            // 兜底：任何异常（网络/解析/字段缺失）都不能让页面永久卡在加载态。
            console.error('[mine] 加载会员信息失败', e);
            this.setData({ loading: false });
            ui.toast('会员信息加载失败，请稍后下拉重试');
        }
    },

    onLogin() {
        wx.navigateTo({ url: '/pages/login/login' });
    },

    async onRefreshStatus() {
        await this.load();
        const state = this.data.memberState;
        ui.toast(this.data.canView
            ? '审核已通过，功能已解锁'
            : (state === 'cancelled'
                ? '该账号已被管理员移除，请重新登录注册'
                : (state === 'draft' ? '请先完善基本信息并提交审核' : (state === 'rejected' ? '请修改资料后重新提交审核' : '仍在审核中，请稍后再试'))));
    },

    async requireLogin(action) {
        const allowed = await guard.requireAction();
        if (allowed) action();
    },

    onEditMember() {
        wx.navigateTo({ url: '/pages/member-edit/member-edit' });
    },

    // 统计格快捷入口：点「我的发布」等可直接查看对应记录分类。
    onStat(event) {
        const tab = event.currentTarget.dataset.tab;
        this.requireLogin(() => wx.navigateTo({ url: `/pages/my-records/my-records?tab=${tab}` }));
    },

    onRecords() {
        this.requireLogin(() => wx.navigateTo({ url: '/pages/my-records/my-records?tab=posts' }));
    },

    onMembers() {
        this.requireLogin(() => wx.navigateTo({ url: '/pages/members/members' }));
    },

    onCoach() {
        if (!this.data.canCoach) {
            wx.showModal({
                title: '申请成为认证教练',
                content: '教练主页与可约时段仅由俱乐部认证教练发布。请联系管理员在「审核中心 → 会员注册」把你的账号提升为教练权限，提权后立即生效。',
                showCancel: false,
                confirmText: '知道了',
                confirmColor: '#3D78A8',
            });
            return;
        }
        this.requireLogin(() => wx.navigateTo({ url: '/pages/coach-edit/coach-edit' }));
    },

    onAdmin() {
        this.requireLogin(() => wx.navigateTo({ url: '/pages/admin/admin' }));
    },

    onPayment() {
        this.requireLogin(() => {
            if (!this.data.isAdmin) {
                ui.toast('仅管理员可查看收款与支付说明');
                return;
            }
            wx.navigateTo({ url: '/pages/payment/payment' });
        });
    },

    async onLogout() {
        const agreed = await ui.confirm('退出后需要重新登录才能发布与报名。', '退出登录');
        if (!agreed) return;
        const result = await api.signOut();
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已退出');
        this.load();
    },
});
