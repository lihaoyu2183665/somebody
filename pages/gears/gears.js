const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');

Page({
    data: {
        condition: 'all',
        category: '全部',
        categories: ['全部'].concat(ui.GEAR_CATEGORIES),
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
        // 二手交易的内容概览对访客公开，点进装备详情时才要求注册并通过审核。
        this.setData(Object.assign({ gate: null }, guard.visitorState(access)));
        const result = await api.list('gear_items', { limit: 100 });
        if (result.error) {
            this.setData({ loading: false, error: result.error.message });
            return;
        }
        const rows = guard.approvedOnly(result.data).map(row => Object.assign({}, row, {
            conditionText: row.condition_type === 'new' ? '全新' : '二手闲置',
            statusText: ui.statusLabel(row.status),
            priceText: ui.money(row.price),
            originalText: row.original_price ? ui.money(row.original_price) : '',
            tradePlaceText: row.trade_place || '面交',
            coverPath: ui.parseImages(row.images)[0] || '',
            coverUrl: '',
        }));
        const paths = rows.map(row => row.coverPath);
        const urls = await api.signedUrls(paths.filter(Boolean));
        let cursor = 0;
        rows.forEach(row => {
            if (row.coverPath) {
                row.coverUrl = urls[cursor] || '';
                cursor += 1;
            }
        });
        this.setData({ all: rows, loading: false });
        this.applyFilter();
    },

    applyFilter() {
        const condition = this.data.condition;
        const category = this.data.category;
        this.setData({
            list: this.data.all.filter(row => {
                if (condition !== 'all' && row.condition_type !== condition) return false;
                if (category !== '全部' && row.category !== category) return false;
                return true;
            }),
        });
    },

    onCondition(event) {
        this.setData({ condition: event.currentTarget.dataset.value });
        this.applyFilter();
    },

    onCategory(event) {
        this.setData({ category: event.currentTarget.dataset.value });
        this.applyFilter();
    },

    onOpen(event) {
        wx.navigateTo({ url: `/pages/gear-detail/gear-detail?id=${event.currentTarget.dataset.id}` });
    },

    onPublish() {
        guard.requirePublish('/pages/gear-edit/gear-edit');
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
