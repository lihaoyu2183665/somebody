const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');

const STATUSES = [
    { value: 'open', label: '报名中' },
    { value: 'full', label: '已满员' },
    { value: 'closed', label: '已结束' },
];

Page({
    data: {
        id: null,
        isEdit: false,
        kindIndex: 0,
        kindLabels: ui.KINDS.map(item => item.label),
        kindText: ui.KINDS[0].label,
        statusIndex: 0,
        statusLabels: STATUSES.map(item => item.label),
        statusText: STATUSES[0].label,
        transportIndex: 0,
        transports: ui.TRANSPORTS,
        transportText: ui.TRANSPORTS[0],
        title: '',
        resort: '',
        departDate: ui.today(),
        departTime: '07:00',
        returnDate: ui.today(),
        returnTime: '18:00',
        departPlace: '',
        returnPlace: '',
        seats: '2',
        feeRule: '',
        itinerary: '',
        contact: '',
        submitting: false,
        error: '',
    },

    async onLoad(options) {
        if (!(await guard.requirePublishPage())) return;
        if (options.id) {
            this.setData({ id: Number(options.id), isEdit: true });
            this.load(Number(options.id));
        }
    },

    async load(id) {
        const result = await api.get('carpool_posts', id);
        if (result.error || !result.data) {
            ui.toast(result.error ? result.error.message : '记录不存在');
            return;
        }
        const row = result.data;
        const depart = ui.splitDateTime(row.depart_time);
        const back = ui.splitDateTime(row.return_time);
        const kindIndex = Math.max(0, ui.KINDS.findIndex(item => item.value === row.kind));
        const transportIndex = Math.max(0, ui.TRANSPORTS.indexOf(row.transport));
        const statusIndex = Math.max(0, STATUSES.findIndex(item => item.value === row.status));
        this.setData({
            kindIndex,
            kindText: ui.KINDS[kindIndex].label,
            transportIndex,
            transportText: ui.TRANSPORTS[transportIndex],
            statusIndex,
            statusText: STATUSES[statusIndex].label,
            title: row.title || '',
            resort: row.resort || '',
            departDate: depart.date,
            departTime: depart.time,
            returnDate: back.date,
            returnTime: back.time,
            departPlace: row.depart_place || '',
            returnPlace: row.return_place || '',
            seats: String(row.seats || 1),
            feeRule: row.fee_rule || '',
            itinerary: row.itinerary || '',
            contact: row.contact || '',
        });
    },

    onKindChange(event) {
        const index = Number(event.detail.value);
        this.setData({ kindIndex: index, kindText: ui.KINDS[index].label });
    },
    onStatusChange(event) {
        const index = Number(event.detail.value);
        this.setData({ statusIndex: index, statusText: STATUSES[index].label });
    },
    onTransportChange(event) {
        const index = Number(event.detail.value);
        this.setData({ transportIndex: index, transportText: ui.TRANSPORTS[index] });
    },
    onDepartDate(event) { this.setData({ departDate: event.detail.value }); },
    onDepartTime(event) { this.setData({ departTime: event.detail.value }); },
    onReturnDate(event) { this.setData({ returnDate: event.detail.value }); },
    onReturnTime(event) { this.setData({ returnTime: event.detail.value }); },
    onTitleInput(event) { this.setData({ title: event.detail.value }); },
    onResortInput(event) { this.setData({ resort: event.detail.value }); },
    onDepartPlaceInput(event) { this.setData({ departPlace: event.detail.value }); },
    onReturnPlaceInput(event) { this.setData({ returnPlace: event.detail.value }); },
    onSeatsInput(event) { this.setData({ seats: event.detail.value }); },
    onFeeRuleInput(event) { this.setData({ feeRule: event.detail.value }); },
    onItineraryInput(event) { this.setData({ itinerary: event.detail.value }); },
    onContactInput(event) { this.setData({ contact: event.detail.value }); },

    async onSubmit() {
        const data = this.data;
        if (!data.title.trim()) {
            this.setData({ error: '请填写标题' });
            return;
        }
        if (!data.departPlace.trim()) {
            this.setData({ error: '请填写出发地点' });
            return;
        }
        if (!data.departDate || !data.returnDate) {
            this.setData({ error: '请选择出发与返程日期' });
            return;
        }
        const seats = Number(data.seats);
        if (!Number.isFinite(seats) || seats < 1) {
            this.setData({ error: '请填写正确的可拼人数' });
            return;
        }
        this.setData({ submitting: true, error: '' });
        const payload = {
            kind: ui.KINDS[data.kindIndex].value,
            title: data.title.trim(),
            resort: data.resort.trim(),
            depart_time: ui.joinDateTime(data.departDate, data.departTime),
            return_time: ui.joinDateTime(data.returnDate, data.returnTime),
            depart_place: data.departPlace.trim(),
            return_place: data.returnPlace.trim(),
            transport: ui.TRANSPORTS[data.transportIndex],
            seats,
            fee_rule: data.feeRule.trim(),
            itinerary: data.itinerary.trim(),
            contact: data.contact.trim(),
            status: STATUSES[data.statusIndex].value,
        };
        const result = data.isEdit
            ? await api.update('carpool_posts', data.id, payload)
            : await api.create('carpool_posts', payload);
        this.setData({ submitting: false });
        if (result.error) {
            this.setData({ error: result.error.message });
            return;
        }
        ui.success(data.isEdit ? '已提交重新审核' : '已提交审核，通过后展示');
        setTimeout(() => wx.navigateBack(), 700);
    },

    async onDelete() {
        const agreed = await ui.confirm('删除后不可恢复，确定继续吗？', '删除信息');
        if (!agreed) return;
        const result = await api.remove('carpool_posts', this.data.id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已删除');
        setTimeout(() => wx.navigateBack(), 700);
    },
});
