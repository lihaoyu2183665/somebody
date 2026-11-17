const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');

Page({
    data: {
        filter: 'all',
        loading: true,
        error: '',
        list: [],
        all: [],
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
        // 初始入口无需登录：访客直接停留在滑雪搭子，也能切换到任意模块浏览内容概览。
        // 详细信息由各详情页统一渲染注册 / 审核门禁（gate），列表页不再拦截。
        this.setData(Object.assign({ gate: null }, guard.visitorState(access)));
        const result = await api.list('carpool_posts', { limit: 100 });
        if (result.error) {
            this.setData({ loading: false, error: result.error.message });
            return;
        }
        const rows = guard.approvedOnly(result.data).map(row => Object.assign({}, row, {
            kindText: ui.kindLabel(row.kind),
            statusText: ui.statusLabel(row.status),
            isOpen: row.status === 'open',
            resortText: row.resort || '待定',
            ownerText: row.owner_name || '雪友',
            feeShort: ui.shortText(row.fee_rule || '费用面议', 18),
        }));
        this.setData({ all: rows, loading: false });
        this.applyFilter();
    },

    applyFilter() {
        const filter = this.data.filter;
        const list = filter === 'all'
            ? this.data.all
            : this.data.all.filter(row => row.kind === filter);
        this.setData({ list });
    },

    onFilter(event) {
        this.setData({ filter: event.currentTarget.dataset.value });
        this.applyFilter();
    },

    onOpen(event) {
        wx.navigateTo({
            url: `/pages/carpool-detail/carpool-detail?id=${event.currentTarget.dataset.id}`,
        });
    },

    onPublish() {
        guard.requirePublish('/pages/carpool-edit/carpool-edit');
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
