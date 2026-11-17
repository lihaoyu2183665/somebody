const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const profile = require('../../utils/profile');
const avatarUtil = require('../../utils/avatar');
const memberAdmin = require('../../utils/member-admin');

const FILTERS = [
    { value: 'all', label: '全部' },
    { value: 'admin', label: '管理员' },
    { value: 'coach', label: '教练' },
    { value: 'formal', label: '正式用户' },
    { value: 'pending', label: '待审核' },
    { value: 'draft', label: '未提交' },
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

Page({
    data: {
        gate: null,
        isAdmin: false,
        filter: 'all',
        filters: FILTERS,
        loading: true,
        error: '',
        all: [],
        list: [],
        expandedId: null,
        counts: { total: 0, admin: 0, coach: 0, formal: 0, pending: 0, draft: 0 },
    },

    onShow() {
        this.load();
    },

    async load() {
        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        if (!access.isAdmin) {
            this.setData({
                loading: false, all: [], list: [], isAdmin: false,
                gate: access.state === 'guest' ? access.gate : guard.gateData('forbidden'),
            });
            return;
        }
        // 实名姓名仅管理员可见：页面本身有管理员门禁，这里再按权限生成展示字段。
        this.setData({ gate: null, isAdmin: access.isAdmin });
        const selfUid = access.session && access.session.user ? access.session.user.id : '';
        const result = await api.list('members', { limit: 200 });
        if (result.error) {
            this.setData({ loading: false, error: result.error.message });
            return;
        }
        // 高级管理员档案已由云端 RLS 对其他用户隐藏，前端再过滤一次作为双保险。
        const rows = (result.data || []).filter(row => row.role !== 'super_admin');
        const all = await Promise.all(rows.map(async row => {
            const name = row.display_name || row.owner_name || '雪友';
            const info = await avatarUtil.resolve(row.avatar, name);
            const preset = ui.avatarPreset(row.avatar);
            const isSelf = row.owner_id === selfUid;
            return {
                key: `member-${row.id}`,
                id: row.id,
                role: row.role,
                status: row.status,
                name,
                // 删除不可恢复；本人与最后一名管理员由云端再次拦截。
                canDelete: !isSelf,
                roleText: ui.roleLabel(row.role),
                roleNameText: access.isAdmin
                    ? ui.memberRoleName(row.role, row.real_name)
                    : ui.roleLabel(row.role),
                roleColor: ui.roleColor(row.role, row.status),
                statusText: ui.memberStatusLabel(row.status),
                statusTone: row.status === 'active' ? 'chip-ok' : 'chip-warn',
                avatarPhotoUrl: info.photoUrl,
                avatarClass: info.className,
                avatarGlyph: info.glyph,
                phone: row.phone || '未填写',
                level: ui.levelLabel(row.snow_level),
                timeText: timeText(row.created_at) || '未记录',
                isSelf,
                detail: {
                    uid: maskUid(row.owner_id),
                    wxName: row.owner_name || '未填写',
                    realName: row.real_name || '未填写',
                    idCard: profile.normalizeIdCard(row.id_card_no) || '未填写',
                    gender: profile.genderLabel(row.gender),
                    avatarType: ui.isPhotoAvatar(row.avatar)
                        ? '上传照片'
                        : (preset ? '卡通头像' : '默认首字'),
                    role: ui.roleLabel(row.role),
                    status: ui.memberStatusLabel(row.status),
                    profileComplete: profile.reviewCheck(row).complete ? '已完整' : '未完整',
                    registeredAt: timeText(row.created_at) || '未记录',
                    submittedAt: timeText(row.submitted_at) || '尚未提交',
                    reviewedAt: timeText(row.reviewed_at) || '暂无',
                    reviewNote: row.review_note || '无',
                },
            };
        }));
        this.setData({
            loading: false,
            all,
            counts: {
                total: rows.length,
                admin: rows.filter(row => row.role === 'admin' && row.status === 'active').length,
                coach: rows.filter(row => row.role === 'coach' && row.status === 'active').length,
                formal: rows.filter(row => row.role === 'member' && row.status === 'active').length,
                pending: rows.filter(row => row.status === 'pending').length,
                draft: rows.filter(row => row.status === 'draft').length,
            },
        });
        this.applyFilter();
    },

    applyFilter() {
        const filter = this.data.filter;
        const list = this.data.all.filter(row => {
            if (filter === 'all') return true;
            if (filter === 'admin') return row.role === 'admin';
            if (filter === 'coach') return row.role === 'coach';
            if (filter === 'formal') return row.role === 'member' && row.status === 'active';
            if (filter === 'pending') return row.status === 'pending';
            if (filter === 'draft') return row.status === 'draft';
            return row.status === 'rejected';
        });
        this.setData({ list });
    },

    onFilter(event) {
        this.setData({ filter: event.currentTarget.dataset.value, expandedId: null });
        this.applyFilter();
    },

    onToggleDetail(event) {
        const id = Number(event.currentTarget.dataset.id);
        this.setData({ expandedId: this.data.expandedId === id ? null : id });
    },

    async onRefresh() {
        await this.load();
        ui.success('用户信息已刷新');
    },

    onReview() {
        wx.navigateTo({ url: '/pages/admin/admin' });
    },

    // 删除用户：一次确认后直接删除，无需输入文字；云端物理删除档案，操作不可恢复。
    async onDeleteMember(event) {
        const { id, name } = event.currentTarget.dataset;
        const done = await memberAdmin.remove(id, name);
        if (done) {
            this.setData({ expandedId: null });
            this.load();
        }
    },
});
