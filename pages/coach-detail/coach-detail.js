const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const avatarUtil = require('../../utils/avatar');

function decorateBooking(row) {
    return Object.assign({}, row, {
        ownerText: row.owner_name || '雪友',
        slotText: row.slot_text || '已选时段',
        contactText: row.contact_name || '未填写',
        levelText: ui.levelLabel(row.level),
        noteText: row.note || '无备注',
        statusText: ui.statusLabel(row.status),
    });
}

Page({
    data: {
        id: null,
        loading: true,
        error: '',
        coach: null,
        slots: [],
        bookings: [],
        myBookings: [],
        selectedId: null,
        canManage: false,
        isHost: false,
        isAdmin: false,
        userId: '',
        levelIndex: 0,
        levelLabels: ui.LEVELS.map(item => item.label),
        levelText: ui.LEVELS[0].label,
        contactName: '',
        contactPhone: '',
        note: '',
        submitting: false,
        gate: null,
        pickerShow: false,
        avatarValue: '',
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
            this.setData({ loading: false, gate: access.gate, list: [], coach: null, slots: [], bookings: [], myBookings: [] });
            return;
        }
        this.setData({ gate: null });
        const [coachResult, slotResult, bookingResult] = await Promise.all([
            api.get('coaches', id),
            api.list('coach_slots', { filters: [{ column: 'coach_id', value: id }], order: 'date', ascending: true, limit: 100 }),
            api.list('coach_bookings', { filters: [{ column: 'coach_id', value: id }], order: 'created_at', ascending: true, limit: 100 }),
        ]);
        if (coachResult.error || !coachResult.data) {
            this.setData({ loading: false, error: coachResult.error ? coachResult.error.message : '教练资料已不存在' });
            return;
        }
        const raw = coachResult.data;
        const avatarInfo = await avatarUtil.resolve(raw.avatar, raw.name);
        const userId = access.session ? access.session.user.id : '';
        const isHost = !!userId && raw.owner_id === userId;
        const slots = (slotResult.error ? [] : slotResult.data)
            .filter(row => row.status === 'open' && row.review_status === 'approved')
            .map(row => Object.assign({}, row, { resortText: row.resort || raw.resort || '雪场待定' }));
        const bookings = (bookingResult.error ? [] : bookingResult.data).map(decorateBooking);
        const patch = {
            loading: false,
            coach: Object.assign({}, raw, {
                avatarUrl: avatarInfo.photoUrl,
                avatarClass: avatarInfo.className,
                initial: avatarInfo.glyph,
                titleText: raw.title || '滑雪教练',
                certificatesText: raw.certificates || '未填写',
                specialtiesText: raw.specialties || '双板 / 单板教学',
                priceText: ui.money(raw.price_per_hour),
                resortText: raw.resort || '雪场待定',
                yearsText: `${raw.years || 0} 年教龄`,
                contactText: raw.contact || '预约后联系',
                bioText: raw.bio || '教练还没有填写简介',
            }),
            slots,
            bookings,
            myBookings: bookings.filter(row => row.owner_id === userId),
            selectedId: slots.length > 0 ? slots[0].id : null,
            userId,
            isAdmin: access.isAdmin,
            isHost,
            avatarValue: raw.avatar || '',
            // 教练资料仅认证教练本人或管理员可继续编辑。
            canManage: access.isAdmin || (isHost && access.canCoach),
        };
        if (access.member) {
            patch.contactName = this.data.contactName || access.member.display_name || '';
            patch.contactPhone = this.data.contactPhone || access.member.phone || '';
        }
        this.setData(patch);
    },

    onSelectSlot(event) {
        this.setData({ selectedId: Number(event.currentTarget.dataset.id) });
    },
    onLevelChange(event) {
        const index = Number(event.detail.value);
        this.setData({ levelIndex: index, levelText: ui.LEVELS[index].label });
    },
    onContactNameInput(event) { this.setData({ contactName: event.detail.value }); },
    onContactPhoneInput(event) { this.setData({ contactPhone: event.detail.value }); },
    onNoteInput(event) { this.setData({ note: event.detail.value }); },

    async onSubmit() {
        if (!(await guard.requireAction())) return;
        const slot = this.data.slots.find(row => row.id === this.data.selectedId);
        if (!slot) {
            ui.toast('请先选择可约时段');
            return;
        }
        if (!this.data.contactName.trim() || !this.data.contactPhone.trim()) {
            ui.toast('请填写姓名和联系电话');
            return;
        }
        this.setData({ submitting: true });
        const result = await api.create('coach_bookings', {
            coach_id: this.data.id,
            slot_id: slot.id,
            slot_text: `${slot.date} ${slot.start_time}-${slot.end_time}`,
            contact_name: this.data.contactName.trim(),
            contact_phone: this.data.contactPhone.trim(),
            level: ui.LEVELS[this.data.levelIndex].value,
            note: this.data.note.trim(),
            status: 'booked',
        });
        this.setData({ submitting: false });
        if (result.error) {
            const text = String(result.error.message || '');
            ui.toast(text.indexOf('duplicate') >= 0 || text.indexOf('23505') >= 0 ? '你已经预约过这个时段' : result.error.message);
            return;
        }
        ui.success('预约成功');
        this.setData({ note: '' });
        this.load();
    },

    async onCancelBooking(event) {
        const id = Number(event.currentTarget.dataset.id);
        const agreed = await ui.confirm('确定取消这次预约吗？', '取消预约');
        if (!agreed) return;
        const result = await api.remove('coach_bookings', id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已取消预约');
        this.load();
    },

    async onRefresh() {
        await this.load();
        if (this.data.gate) ui.toast('仍在审核中，请稍后再试');
        else ui.success('审核已通过，已解锁全部功能');
    },

    onManage() {
        wx.navigateTo({ url: `/pages/coach-edit/coach-edit?id=${this.data.id}` });
    },

    // 点击教练头像打开选择器：仅教练本人与管理员可更换，学员点击不响应。
    onOpenPicker() {
        if (!this.data.canManage) return;
        this.setData({ pickerShow: true });
    },

    onClosePicker() {
        this.setData({ pickerShow: false });
    },

    // 选择器只回传头像值，写库与旧照片清理由页面统一处理。
    // 云端触发器对「仅改头像」保留原审核状态，已上架主页不会下架。
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
        this.load();
    },
});
