const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const avatarUtil = require('../../utils/avatar');

Page({
    data: {
        filter: 'all',
        loading: true,
        error: '',
        list: [],
        all: [],
        userId: '',
        myCoachId: null,
        pendingMine: false,
        canCoach: false,
        gate: null,
        canView: false,
        guest: false,
        actHint: '',
    },

    onShow() {
        this.load();
    },

    async load() {
        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        // 教练平台的内容概览对访客公开；教练主页详情、可约时段与预约仍由详情页门禁管控。
        this.setData(Object.assign({ gate: null }, guard.visitorState(access)));
        const [result, session] = await Promise.all([
            api.list('coaches', { limit: 100 }),
            api.getSession(),
        ]);
        if (result.error) {
            this.setData({ loading: false, error: result.error.message });
            return;
        }
        const userId = session ? session.user.id : '';
        // 教练头像与会员头像共用解析逻辑：卡通图用本地资源、上传照片用短时签名地址。
        const rows = await Promise.all(result.data.map(async row => {
            const avatar = await avatarUtil.resolve(row.avatar, row.name);
            return Object.assign({}, row, {
                avatarUrl: avatar.photoUrl,
                avatarClass: avatar.className,
                initial: avatar.glyph,
                isMine: !!userId && row.owner_id === userId,
                titleText: row.title || '滑雪教练',
                resortText: row.resort || '雪场待定',
                yearsText: `${row.years || 0} 年教龄`,
                specialtiesText: ui.shortText(row.specialties || '擅长双板 / 单板教学', 46),
                priceText: ui.money(row.price_per_hour),
                statusText: ui.statusLabel(row.status),
            });
        }));
        // 待审核 / 驳回的资料自己可见，但不会出现在对外列表中。
        const mine = rows.find(row => row.isMine);
        const publicRows = guard.approvedOnly(rows);
        this.setData({
            all: publicRows,
            loading: false,
            canCoach: access.canCoach,
            userId,
            myCoachId: mine ? mine.id : null,
            pendingMine: !!mine && mine.review_status !== 'approved',
        });
        this.applyFilter();
    },

    applyFilter() {
        const filter = this.data.filter;
        let list = this.data.all;
        if (filter === 'active') list = list.filter(row => row.status === 'active');
        if (filter === 'mine') list = list.filter(row => row.isMine);
        this.setData({ list });
    },

    onFilter(event) {
        this.setData({ filter: event.currentTarget.dataset.value });
        this.applyFilter();
    },

    onOpen(event) {
        wx.navigateTo({ url: `/pages/coach-detail/coach-detail?id=${event.currentTarget.dataset.id}` });
    },

    onPublish() {
        if (!this.data.canCoach) {
            wx.showModal({
                title: '成为认证教练',
                content: '教练主页与可约时段仅由俱乐部认证教练发布。请联系管理员在「审核中心 → 会员注册」把你的账号提升为教练权限，提权后立即生效。',
                showCancel: false,
                confirmText: '知道了',
                confirmColor: '#3D78A8',
            });
            return;
        }
        const url = this.data.myCoachId
            ? `/pages/coach-edit/coach-edit?id=${this.data.myCoachId}`
            : '/pages/coach-edit/coach-edit';
        guard.requireCoachPublish(url);
    },

    onLogin() {
        if (this.data.guest) {
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }
        wx.switchTab({ url: '/pages/mine/mine' });
    },

    async onRefresh() {
        await this.load();
        ui.success('列表已刷新');
    },
});
