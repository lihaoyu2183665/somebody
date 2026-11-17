const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');

Page({
    data: {
        id: null,
        loading: true,
        error: '',
        gear: null,
        images: [],
        paths: [],
        canManage: false,
        isAdmin: false,
        gate: null,
    },

    onLoad(options) {
        this.setData({ id: Number(options.id) || null });
    },

    onShow() {
        this.load();
    },

    async load() {
        const id = this.data.id;
        if (!id) {
            this.setData({ loading: false, error: '缺少记录 id' });
            return;
        }
        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        if (!access.canView) {
            this.setData({ loading: false, gate: access.gate, list: [], gear: null, images: [], paths: [] });
            return;
        }
        this.setData({ gate: null });
        const result = await api.get('gear_items', id);
        if (result.error || !result.data) {
            this.setData({ loading: false, error: result.error ? result.error.message : '装备已不存在' });
            return;
        }
        const raw = result.data;
        const paths = ui.parseImages(raw.images);
        const images = (await api.signedUrls(paths)).filter(Boolean);
        const userId = access.session ? access.session.user.id : '';
        const role = access.member ? access.member.role : 'member';
        this.setData({
            loading: false,
            paths,
            images,
            gear: Object.assign({}, raw, {
                conditionText: raw.condition_type === 'new' ? '全新' : '二手闲置',
                statusText: ui.statusLabel(raw.status),
                isOnSale: raw.status === 'on_sale',
                priceText: ui.money(raw.price),
                originalText: raw.original_price ? ui.money(raw.original_price) : '',
                tradePlaceText: raw.trade_place || '面交，具体商量',
                contactText: raw.contact || '发布者未填写',
                ownerText: raw.owner_name || '雪友',
                descriptionText: raw.description || '发布者未填写描述',
            }),
            isAdmin: role === 'admin' || role === 'super_admin',
            canManage: (!!userId && raw.owner_id === userId) || role === 'admin' || role === 'super_admin',
        });
    },

    async onCopyContact() {
        if (!(await guard.requireAction())) return;
        const text = this.data.gear.contact || '';
        if (!text) {
            ui.toast('发布者未填写联系方式');
            return;
        }
        wx.setClipboardData({
            data: text,
            success: () => ui.success('联系方式已复制'),
        });
    },

    async onRefresh() {
        await this.load();
        if (this.data.gate) ui.toast('仍在审核中，请稍后再试');
        else ui.success('审核已通过，已解锁全部功能');
    },

    onEdit() {
        wx.navigateTo({ url: `/pages/gear-edit/gear-edit?id=${this.data.id}` });
    },

    async onToggleSold() {
        const next = this.data.gear.isOnSale ? 'sold' : 'on_sale';
        const result = await api.update('gear_items', this.data.id, { status: next });
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success(next === 'sold' ? '已标记售出' : '已重新上架');
        this.load();
    },

    async onDelete() {
        const agreed = await ui.confirm('删除后不可恢复，云端图片也会一并清除。', '删除装备');
        if (!agreed) return;
        const result = await api.remove('gear_items', this.data.id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        for (const path of this.data.paths) {
            await api.removeImage(path);
        }
        ui.success('已删除');
        setTimeout(() => wx.navigateBack(), 700);
    },
});
