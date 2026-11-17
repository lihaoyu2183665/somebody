const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const avatarUtil = require('../../utils/avatar');

const STATUSES = [
    { value: 'active', label: '可预约' },
    { value: 'inactive', label: '暂停预约' },
];

Page({
    data: {
        id: null,
        name: '',
        title: '',
        certificates: '',
        years: '',
        price: '',
        resort: '',
        specialties: '',
        bio: '',
        contact: '',
        statusIndex: 0,
        statusLabels: STATUSES.map(item => item.label),
        statusText: STATUSES[0].label,
        slots: [],
        slotDate: ui.today(),
        slotStart: '09:00',
        slotEnd: '11:00',
        slotResort: '',
        slotCapacity: '1',
        submitting: false,
        error: '',
        gate: null,
        avatarValue: '',
        avatarUrl: '',
        avatarClass: '',
        avatarInitial: '教',
        pickerShow: false,
    },

    onLoad(options) {
        this.init(options);
    },

    async init(options) {
        const state = await guard.requireCoachPage();
        if (!state.ok) {
            this.setData({ gate: state.gate });
            return;
        }
        this.setData({ gate: null });
        if (options.id) {
            this.setData({ id: Number(options.id) });
            this.load(Number(options.id));
            return;
        }
        const session = await api.getSession();
        if (!session) {
            ui.toast('请先登录');
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }
        const result = await api.list('coaches', {
            filters: [{ column: 'owner_id', value: session.user.id }],
            limit: 1,
        });
        const mine = !result.error && result.data && result.data[0];
        if (mine) {
            this.setData({ id: mine.id });
            this.load(mine.id);
        }
    },

    async load(id) {
        const [coachResult, slotResult] = await Promise.all([
            api.get('coaches', id),
            api.list('coach_slots', { filters: [{ column: 'coach_id', value: id }], order: 'date', ascending: true, limit: 100 }),
        ]);
        const patch = {
            slots: (slotResult.error ? [] : slotResult.data).map(row => Object.assign({}, row, {
                resortText: row.resort || '雪场待定',
            })),
        };
        if (coachResult.data) {
            const row = coachResult.data;
            const avatarInfo = await avatarUtil.resolve(row.avatar, row.name);
            const statusIndex = Math.max(0, STATUSES.findIndex(item => item.value === row.status));
            Object.assign(patch, {
                avatarValue: row.avatar || '',
                avatarUrl: avatarInfo.photoUrl,
                avatarClass: avatarInfo.className,
                avatarInitial: avatarInfo.glyph,
                name: row.name || '',
                title: row.title || '',
                certificates: row.certificates || '',
                years: String(row.years || 0),
                price: String(row.price_per_hour || 0),
                resort: row.resort || '',
                specialties: row.specialties || '',
                bio: row.bio || '',
                contact: row.contact || '',
                statusIndex,
                statusText: STATUSES[statusIndex].label,
            });
        }
        this.setData(patch);
    },

    onNameInput(event) { this.setData({ name: event.detail.value }); },
    onTitleInput(event) { this.setData({ title: event.detail.value }); },
    onCertificatesInput(event) { this.setData({ certificates: event.detail.value }); },
    onYearsInput(event) { this.setData({ years: event.detail.value }); },
    onPriceInput(event) { this.setData({ price: event.detail.value }); },
    onResortInput(event) { this.setData({ resort: event.detail.value }); },
    onSpecialtiesInput(event) { this.setData({ specialties: event.detail.value }); },
    onBioInput(event) { this.setData({ bio: event.detail.value }); },
    onContactInput(event) { this.setData({ contact: event.detail.value }); },
    onSlotResortInput(event) { this.setData({ slotResort: event.detail.value }); },
    onSlotCapacityInput(event) { this.setData({ slotCapacity: event.detail.value }); },
    onSlotDate(event) { this.setData({ slotDate: event.detail.value }); },
    onSlotStart(event) { this.setData({ slotStart: event.detail.value }); },
    onSlotEnd(event) { this.setData({ slotEnd: event.detail.value }); },
    onStatusChange(event) {
        const index = Number(event.detail.value);
        this.setData({ statusIndex: index, statusText: STATUSES[index].label });
    },

    async onSubmit() {
        const data = this.data;
        if (!data.name.trim()) {
            this.setData({ error: '请填写教练姓名' });
            return;
        }
        if (data.price !== '' && (!Number.isFinite(Number(data.price)) || Number(data.price) < 0)) {
            this.setData({ error: '请填写正确的课时价' });
            return;
        }
        this.setData({ submitting: true, error: '' });
        const payload = {
            name: data.name.trim(),
            title: data.title.trim(),
            certificates: data.certificates.trim(),
            years: Number(data.years) || 0,
            resort: data.resort.trim(),
            specialties: data.specialties.trim(),
            price_per_hour: Number(data.price) || 0,
            bio: data.bio.trim(),
            contact: data.contact.trim(),
            status: STATUSES[data.statusIndex].value,
        };
        const result = data.id
            ? await api.update('coaches', data.id, payload)
            : await api.create('coaches', payload);
        this.setData({ submitting: false });
        if (result.error) {
            this.setData({ error: result.error.message });
            return;
        }
        ui.success('已提交审核，通过后展示');
        this.setData({ id: result.data.id });
        this.load(result.data.id);
    },

    async onAddSlot() {
        const data = this.data;
        if (!data.id) {
            ui.toast('请先保存教练资料');
            return;
        }
        const capacity = Number(data.slotCapacity);
        if (!Number.isFinite(capacity) || capacity < 1) {
            ui.toast('请填写正确的可约人数');
            return;
        }
        const result = await api.create('coach_slots', {
            coach_id: data.id,
            date: data.slotDate,
            start_time: data.slotStart,
            end_time: data.slotEnd,
            resort: data.slotResort.trim() || data.resort.trim(),
            capacity,
            status: 'open',
        });
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('时段已提交审核');
        this.load(data.id);
    },

    async onRemoveSlot(event) {
        const id = Number(event.currentTarget.dataset.id);
        const agreed = await ui.confirm('删除时段后，该时段下的预约也会取消。', '删除时段');
        if (!agreed) return;
        const result = await api.remove('coach_slots', id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已删除');
        this.load(this.data.id);
    },

    async onRefresh() {
        await this.init(this.data.id ? { id: this.data.id } : {});
        ui.toast(this.data.gate ? '教练权限尚未开通，请联系管理员提权' : '教练权限已生效');
    },

    // 编辑页与详情页共用同一套选择器：头像即时写库，不随「保存教练资料」提交。
    // 新建资料时尚无 id，先提示保存，避免产生找不到记录的更新。
    onOpenPicker() {
        if (!this.data.id) {
            ui.toast('请先保存教练资料，再设置头像');
            return;
        }
        this.setData({ pickerShow: true });
    },

    onClosePicker() {
        this.setData({ pickerShow: false });
    },

    async onAvatarChange(event) {
        const value = String(event.detail.value || '');
        const old = this.data.avatarValue;
        const result = await api.update('coaches', this.data.id, { avatar: value || null });
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        if (ui.isPhotoAvatar(old) && old !== value) await api.removeImage(old);
        this.setData({ pickerShow: false });
        ui.success(value ? '教练头像已更新' : '已恢复默认头像');
        this.load(this.data.id);
    },

    async onDelete() {
        const agreed = await ui.confirm('删除后不可恢复，教练资料、时段与预约都会清除。', '删除教练资料');
        if (!agreed) return;
        const result = await api.remove('coaches', this.data.id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已删除');
        setTimeout(() => wx.navigateBack(), 700);
    },
});
