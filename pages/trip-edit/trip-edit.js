const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const payment = require('../../utils/payment');

const STATUSES = [
    { value: 'open', label: '报名中' },
    { value: 'full', label: '已满员' },
    { value: 'closed', label: '已结束' },
];

const METHOD_LABELS = payment.METHODS.map(item => item.label);

let optionSeed = 0;
function newOption() {
    optionSeed += 1;
    return { key: `k${optionSeed}`, id: null, name: '', price: '', note: '', capacity: '' };
}

Page({
    data: {
        id: null,
        isEdit: false,
        isAdmin: true,
        gate: null,
        statusIndex: 0,
        statusLabels: STATUSES.map(item => item.label),
        statusText: STATUSES[0].label,
        transportIndex: 1,
        transports: ui.TRANSPORTS,
        transportText: ui.TRANSPORTS[1],
        methodIndex: 0,
        methodLabels: METHOD_LABELS,
        methodText: METHOD_LABELS[0],
        paymentNote: '',
        gatewayReady: false,
        gatewayText: '',
        title: '',
        resort: '',
        departDate: ui.today(),
        departTime: '07:00',
        returnDate: ui.today(),
        returnTime: '18:00',
        departPlace: '',
        gatherPlace: '',
        capacity: '20',
        deadline: ui.today(),
        feeNote: '',
        itinerary: '',
        isOfficial: true,
        options: [newOption()],
        oldOptionIds: [],
        submitting: false,
        error: '',
    },

    async onLoad(options) {
        const state = await guard.requireAdminPage();
        if (!state.ok) {
            this.setData({ gate: state.gate });
            return;
        }
        const readiness = payment.readiness();
        this.setData({
            gate: null,
            isAdmin: true,
            gatewayReady: readiness.ready,
            gatewayText: readiness.statusText,
        });
        if (options.id) {
            this.setData({ id: Number(options.id), isEdit: true });
            this.load(Number(options.id));
        }
    },

    async onRefresh() {
        const state = await guard.requireAdminPage();
        this.setData({ gate: state.ok ? null : state.gate });
        ui.toast(state.ok ? '已获得管理员权限' : '当前账号没有发布权限');
    },

    async load(id) {
        const [activityResult, optionResult] = await Promise.all([
            api.get('trip_activities', id),
            api.list('trip_price_options', { filters: [{ column: 'trip_id', value: id }], order: 'sort_order', ascending: true }),
        ]);
        if (activityResult.error || !activityResult.data) {
            ui.toast(activityResult.error ? activityResult.error.message : '活动不存在');
            return;
        }
        const row = activityResult.data;
        const depart = ui.splitDateTime(row.depart_time);
        const back = ui.splitDateTime(row.return_time);
        const transportIndex = Math.max(0, ui.TRANSPORTS.indexOf(row.transport));
        const statusIndex = Math.max(0, STATUSES.findIndex(item => item.value === row.status));
        const methodIndex = Math.max(0, payment.METHODS.findIndex(item => item.value === row.payment_method));
        const rows = optionResult.error ? [] : optionResult.data;
        const options = rows.length > 0
            ? rows.map(item => {
                optionSeed += 1;
                return {
                    key: `k${optionSeed}`,
                    id: item.id,
                    name: item.name || '',
                    price: String(item.price || 0),
                    note: item.note || '',
                    capacity: String(item.capacity || 0),
                };
            })
            : [newOption()];
        this.setData({
            title: row.title || '',
            resort: row.resort || '',
            isOfficial: !!row.is_official,
            statusIndex,
            statusText: STATUSES[statusIndex].label,
            transportIndex,
            transportText: ui.TRANSPORTS[transportIndex],
            methodIndex,
            methodText: METHOD_LABELS[methodIndex],
            paymentNote: row.payment_note || '',
            departDate: depart.date,
            departTime: depart.time,
            returnDate: back.date,
            returnTime: back.time,
            departPlace: row.depart_place || '',
            gatherPlace: row.gather_place || '',
            capacity: String(row.capacity || 20),
            deadline: row.deadline || ui.today(),
            feeNote: row.fee_note || '',
            itinerary: row.itinerary || '',
            options,
            oldOptionIds: rows.map(item => item.id),
        });
    },

    onTitleInput(event) { this.setData({ title: event.detail.value }); },
    onResortInput(event) { this.setData({ resort: event.detail.value }); },
    onDepartPlaceInput(event) { this.setData({ departPlace: event.detail.value }); },
    onGatherPlaceInput(event) { this.setData({ gatherPlace: event.detail.value }); },
    onCapacityInput(event) { this.setData({ capacity: event.detail.value }); },
    onFeeNoteInput(event) { this.setData({ feeNote: event.detail.value }); },
    onItineraryInput(event) { this.setData({ itinerary: event.detail.value }); },
    onPaymentNoteInput(event) { this.setData({ paymentNote: event.detail.value }); },
    onDepartDate(event) { this.setData({ departDate: event.detail.value }); },
    onDepartTime(event) { this.setData({ departTime: event.detail.value }); },
    onReturnDate(event) { this.setData({ returnDate: event.detail.value }); },
    onReturnTime(event) { this.setData({ returnTime: event.detail.value }); },
    onDeadline(event) { this.setData({ deadline: event.detail.value }); },
    onStatusChange(event) {
        const index = Number(event.detail.value);
        this.setData({ statusIndex: index, statusText: STATUSES[index].label });
    },
    onMethodChange(event) {
        const index = Number(event.detail.value);
        this.setData({ methodIndex: index, methodText: METHOD_LABELS[index] });
    },
    onTransportChange(event) {
        const index = Number(event.detail.value);
        this.setData({ transportIndex: index, transportText: ui.TRANSPORTS[index] });
    },
    onOfficialChange(event) {
        this.setData({ isOfficial: event.detail.value });
    },

    onGoPaymentSettings() {
        wx.navigateTo({ url: '/pages/payment/payment' });
    },

    onAddOption() {
        this.setData({ options: this.data.options.concat([newOption()]) });
    },

    onRemoveOption(event) {
        const index = Number(event.currentTarget.dataset.index);
        const options = this.data.options.slice();
        options.splice(index, 1);
        this.setData({ options });
    },

    onOptionInput(event) {
        const index = Number(event.currentTarget.dataset.index);
        const field = event.currentTarget.dataset.field;
        this.setData({ [`options[${index}].${field}`]: event.detail.value });
    },

    async onSubmit() {
        if (!(await guard.requireAdminPage()).ok) {
            ui.toast('仅俱乐部管理员可以发布参团活动');
            return;
        }
        const data = this.data;
        if (!data.title.trim()) {
            this.setData({ error: '请填写活动标题' });
            return;
        }
        if (!data.departPlace.trim() || !data.gatherPlace.trim()) {
            this.setData({ error: '请填写出发地点与集合地点' });
            return;
        }
        const capacity = Number(data.capacity);
        if (!Number.isFinite(capacity) || capacity < 1) {
            this.setData({ error: '请填写正确的总名额' });
            return;
        }
        const validOptions = [];
        for (const option of data.options) {
            if (!option.name.trim() && option.price === '') continue;
            if (!option.name.trim() || !Number.isFinite(Number(option.price)) || Number(option.price) < 0) {
                this.setData({ error: '每个价格类别都需要名称和不小于 0 的价格' });
                return;
            }
            validOptions.push(option);
        }
        if (validOptions.length === 0) {
            this.setData({ error: '请至少设置一个价格类别' });
            return;
        }
        this.setData({ submitting: true, error: '' });
        const payload = {
            title: data.title.trim(),
            resort: data.resort.trim(),
            depart_time: ui.joinDateTime(data.departDate, data.departTime),
            return_time: ui.joinDateTime(data.returnDate, data.returnTime),
            depart_place: data.departPlace.trim(),
            gather_place: data.gatherPlace.trim(),
            transport: ui.TRANSPORTS[data.transportIndex],
            fee_note: data.feeNote.trim(),
            itinerary: data.itinerary.trim(),
            capacity,
            deadline: data.deadline,
            status: STATUSES[data.statusIndex].value,
            is_official: data.isOfficial,
            payment_method: payment.METHODS[data.methodIndex].value,
            payment_note: data.paymentNote.trim(),
        };
        const saved = data.isEdit
            ? await api.update('trip_activities', data.id, payload)
            : await api.create('trip_activities', payload);
        if (saved.error || !saved.data) {
            this.setData({ submitting: false, error: saved.error ? saved.error.message : '保存失败' });
            return;
        }
        const tripId = saved.data.id;
        // 旧档位先清理，再按当前表单重建；订单保留价格快照，不受影响。
        for (const oldId of data.oldOptionIds) {
            await api.remove('trip_price_options', oldId);
        }
        for (let index = 0; index < validOptions.length; index += 1) {
            const option = validOptions[index];
            const created = await api.create('trip_price_options', {
                trip_id: tripId,
                name: option.name.trim(),
                price: Number(option.price),
                note: option.note.trim(),
                capacity: Number(option.capacity) || 0,
                sort_order: index,
            });
            if (created.error) {
                this.setData({ submitting: false, error: created.error.message });
                return;
            }
        }
        this.setData({ submitting: false });
        ui.success(data.isEdit ? '已保存，活动立即展示' : '活动已发布并展示');
        setTimeout(() => wx.navigateBack(), 700);
    },

    async onDelete() {
        const agreed = await ui.confirm('删除后不可恢复，价格档位与报名订单也会一并清除。', '删除活动');
        if (!agreed) return;
        const result = await api.remove('trip_activities', this.data.id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已删除');
        setTimeout(() => wx.navigateBack(), 700);
    },
});
