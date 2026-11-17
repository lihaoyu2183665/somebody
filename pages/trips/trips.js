const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const payment = require('../../utils/payment');

Page({
    data: {
        filter: 'all',
        loading: true,
        error: '',
        list: [],
        all: [],
        gate: null,
        isAdmin: false,
        gatewayReady: false,
        canAct: false,
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
        // 所有模块的内容概览对访客公开：活动列表不再渲染会员审核门禁。
        // 报名、发布、收款等写操作仍只限审核通过的正式会员 / 管理员（canAct），
        // 点开活动详情则由详情页统一渲染注册 / 审核门禁。
        const visitor = guard.visitorState(access);
        const canAct = access.canView;
        const ready = payment.readiness().ready;
        this.setData({
            gate: null, isAdmin: access.isAdmin, gatewayReady: ready,
            canAct, canView: visitor.canView, guest: visitor.guest, actHint: visitor.actHint,
        });
        const [activityResult, optionResult] = await Promise.all([
            api.list('trip_activities', { limit: 100 }),
            api.list('trip_price_options', { limit: 300 }),
        ]);
        if (activityResult.error) {
            this.setData({ loading: false, error: activityResult.error.message });
            return;
        }
        const activities = guard.approvedOnly(activityResult.data);
        const visibleIds = {};
        activities.forEach(row => { visibleIds[row.id] = true; });
        const options = (optionResult.error ? [] : optionResult.data)
            .filter(option => visibleIds[option.trip_id]);
        const rows = activities.map(row => {
            const prices = options
                .filter(option => option.trip_id === row.id)
                .map(option => Number(option.price || 0))
                .filter(value => Number.isFinite(value));
            const lowest = prices.length > 0 ? Math.min.apply(null, prices) : null;
            const degraded = row.payment_method === 'online' && !ready;
            return Object.assign({}, row, {
                statusText: ui.statusLabel(row.status),
                isOpen: row.status === 'open',
                resortText: row.resort || '待定',
                priceText: lowest === null ? '价格待定' : `¥${ui.money(lowest)}`,
                paymentText: payment.methodLabel(row.payment_method, degraded),
                paymentOnline: row.payment_method === 'online',
            });
        });
        this.setData({ all: rows, loading: false });
        this.applyFilter();
    },

    applyFilter() {
        const filter = this.data.filter;
        let list = this.data.all;
        if (filter === 'official') list = list.filter(row => row.is_official);
        if (filter === 'other') list = list.filter(row => !row.is_official);
        this.setData({ list });
    },

    onFilter(event) {
        this.setData({ filter: event.currentTarget.dataset.value });
        this.applyFilter();
    },

    onOpen(event) {
        wx.navigateTo({
            url: `/pages/trip-detail/trip-detail?id=${event.currentTarget.dataset.id}`,
        });
    },

    onPublish() {
        guard.requireAdminPublish('/pages/trip-edit/trip-edit');
    },

    onPayment() {
        if (!this.data.isAdmin) return;
        wx.navigateTo({ url: '/pages/payment/payment' });
    },

    async onRefresh() {
        await this.load();
        ui.success('活动已刷新');
    },

    onLogin() {
        if (this.data.guest) {
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }
        wx.switchTab({ url: '/pages/mine/mine' });
    },
});
