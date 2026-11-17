const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const payment = require('../../utils/payment');

function timeText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const pad = number => (number < 10 ? `0${number}` : `${number}`);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const POST_SOURCES = [
    {
        table: 'carpool_posts',
        typeText: '滑雪搭子',
        path: id => `/pages/carpool-detail/carpool-detail?id=${id}`,
        edit: id => `/pages/carpool-edit/carpool-edit?id=${id}`,
    },
    {
        table: 'trip_activities',
        typeText: '俱乐部参团',
        path: id => `/pages/trip-detail/trip-detail?id=${id}`,
        edit: id => `/pages/trip-edit/trip-edit?id=${id}`,
    },
    {
        table: 'gear_items',
        typeText: '雪具交易',
        path: id => `/pages/gear-detail/gear-detail?id=${id}`,
        edit: id => `/pages/gear-edit/gear-edit?id=${id}`,
    },
    {
        table: 'coaches',
        typeText: '教练主页',
        path: id => `/pages/coach-detail/coach-detail?id=${id}`,
        edit: id => `/pages/coach-edit/coach-edit?id=${id}`,
    },
];

Page({
    data: {
        tab: 'posts',
        loading: true,
        error: '',
        list: [],
        gate: null,
    },

    onLoad(options) {
        const tabs = ['posts', 'signups', 'orders', 'bookings'];
        if (options && tabs.indexOf(options.tab) >= 0) {
            this.setData({ tab: options.tab });
        }
    },

    onShow() {
        this.load();
    },

    async load() {
        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        if (!access.canView) {
            this.setData({ loading: false, gate: access.gate, list: [] });
            return;
        }
        this.setData({ gate: null });
        const uid = access.session.user.id;
        const isAdmin = access.isAdmin;
        const ownerFilter = [{ column: 'owner_id', value: uid }];
        let list = [];
        if (this.data.tab === 'posts') {
            const results = await Promise.all(
                POST_SOURCES.map(source => api.list(source.table, { filters: ownerFilter, limit: 100 })),
            );
            list = [];
            results.forEach((result, index) => {
                if (result.error) return;
                const source = POST_SOURCES[index];
                result.data.forEach(row => list.push({
                    key: `${source.table}-${row.id}`,
                    id: row.id,
                    table: source.table,
                    typeText: source.typeText,
                    title: row.title || row.name || '未命名',
                    sub: row.depart_time || row.resort || row.specialties || '点击查看完整信息',
                    statusText: ui.statusLabel(row.status),
                    reviewText: ui.reviewLabel(row.review_status),
                    reviewNote: row.review_note || '',
                    timeText: timeText(row.created_at),
                    path: source.path(row.id),
                    // 参团活动仅管理员、教练资料仅教练 / 管理员可编辑，其他人不应看到编辑入口。
                    editPath: (source.table === 'trip_activities' && !isAdmin)
                        || (source.table === 'coaches' && !access.canCoach)
                        ? '' : source.edit(row.id),
                }));
            });
            list.sort((a, b) => (a.timeText < b.timeText ? 1 : -1));
        } else if (this.data.tab === 'signups') {
            const [records, posts] = await Promise.all([
                api.list('carpool_signups', { filters: ownerFilter, limit: 100 }),
                api.list('carpool_posts', { limit: 100 }),
            ]);
            if (records.error) {
                this.setData({ loading: false, error: records.error.message });
                return;
            }
            const lookup = {};
            (posts.error ? [] : posts.data).forEach(row => { lookup[row.id] = row; });
            list = records.data.map(row => ({
                key: `signup-${row.id}`,
                id: row.id,
                table: 'carpool_signups',
                typeText: '拼车报名',
                title: (lookup[row.post_id] && lookup[row.post_id].title) || '出行信息已删除',
                sub: `${row.seats} 人 · ${row.note || '无备注'}`,
                statusText: ui.statusLabel(row.status),
                timeText: timeText(row.created_at),
                path: row.post_id ? `/pages/carpool-detail/carpool-detail?id=${row.post_id}` : '',
                editPath: '',
            }));
        } else if (this.data.tab === 'orders') {
            const [records, trips] = await Promise.all([
                api.list('trip_orders', { filters: ownerFilter, limit: 100 }),
                api.list('trip_activities', { limit: 100 }),
            ]);
            if (records.error) {
                this.setData({ loading: false, error: records.error.message });
                return;
            }
            const lookup = {};
            (trips.error ? [] : trips.data).forEach(row => { lookup[row.id] = row; });
            list = records.data.map(row => ({
                key: `order-${row.id}`,
                id: row.id,
                table: 'trip_orders',
                typeText: '参团订单',
                title: (lookup[row.trip_id] && lookup[row.trip_id].title) || '活动已删除',
                sub: `${row.option_name || '标准档'} · ${row.quantity} 份 · 合计 ¥${ui.money(row.amount)}`,
                statusText: ui.statusLabel(row.status),
                paymentText: payment.paymentStatusLabel(row.payment_status),
                paymentTone: payment.paymentTone(row.payment_status),
                outTradeNo: row.out_trade_no || '',
                isPaid: row.payment_status === 'paid',
                paymentStatus: row.payment_status,
                timeText: timeText(row.created_at),
                path: row.trip_id ? `/pages/trip-detail/trip-detail?id=${row.trip_id}` : '',
                editPath: '',
            }));
        } else {
            const [records, coaches] = await Promise.all([
                api.list('coach_bookings', { filters: ownerFilter, limit: 100 }),
                api.list('coaches', { limit: 100 }),
            ]);
            if (records.error) {
                this.setData({ loading: false, error: records.error.message });
                return;
            }
            const lookup = {};
            (coaches.error ? [] : coaches.data).forEach(row => { lookup[row.id] = row; });
            list = records.data.map(row => ({
                key: `booking-${row.id}`,
                id: row.id,
                table: 'coach_bookings',
                typeText: '约课预约',
                title: (lookup[row.coach_id] && lookup[row.coach_id].name) || '教练资料已删除',
                sub: `${row.slot_text || '已选时段'} · ${row.contact_name || ''}`,
                statusText: ui.statusLabel(row.status),
                timeText: timeText(row.created_at),
                path: row.coach_id ? `/pages/coach-detail/coach-detail?id=${row.coach_id}` : '',
                editPath: '',
            }));
        }
        this.setData({ list, loading: false });
    },

    async onRefresh() {
        await this.load();
        if (this.data.gate) ui.toast('仍在审核中，请稍后再试');
        else ui.success('审核已通过，已解锁全部功能');
    },

    onTab(event) {
        this.setData({ tab: event.currentTarget.dataset.value });
        this.load();
    },

    onOpen(event) {
        const path = event.currentTarget.dataset.path;
        if (!path) {
            ui.toast('原始内容已删除');
            return;
        }
        wx.navigateTo({ url: path });
    },

    onEdit(event) {
        wx.navigateTo({ url: event.currentTarget.dataset.path });
    },

    async onRemove(event) {
        const table = event.currentTarget.dataset.table;
        const id = Number(event.currentTarget.dataset.id);
        const isPost = this.data.tab === 'posts';
        const target = this.data.list.find(row => row.id === id);
        if (target && target.isPaid) {
            ui.toast('已支付订单请联系管理员处理');
            return;
        }
        const agreed = await ui.confirm(
            isPost ? '删除后不可恢复，相关报名记录也会清除。' : '确定取消这条记录吗？',
            isPost ? '删除记录' : '取消记录',
        );
        if (!agreed) return;
        const result = await api.remove(table, id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success(isPost ? '已删除' : '已取消');
        this.load();
    },
});
