const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const payment = require('../../utils/payment');
const profile = require('../../utils/profile');
const roster = require('../../utils/roster');
const exporter = require('../../utils/export-file');
const person = require('../../utils/person');

// 订单卡片同时带收款展示字段与名单字段：管理员在活动详情里即可查看报名人员资料并导出名单。
function decorateOrder(row, trip, member) {
    return Object.assign(
        payment.decorateOrder(row),
        roster.decorateOrder(row, trip, member),
        {
            ownerText: row.owner_name || '雪友',
            contactText: row.contact_name || '未填写',
            noteText: row.note || '无备注',
            paymentNoteText: row.payment_note || '未提交付款信息',
            participantName: row.participant_name || row.contact_name || '未填写',
            participantIdText: profile.normalizeIdCard(row.participant_id_card) || '未填写',
            participantPhone: row.participant_phone || row.contact_phone || '未填写',
            participantGender: profile.genderLabel(row.participant_gender),
        }
    );
}

// 活动发布人（拼团人）完整档案：仅管理员可在名单里点开查看。
function publisherPerson(trip, member, tripTitle) {
    const row = member || {};
    const idCard = profile.normalizeIdCard(row.id_card_no || '');
    return {
        name: row.real_name || row.display_name || trip.owner_name || '俱乐部',
        phone: row.phone || '未填写',
        genderText: profile.genderLabel(row.gender),
        nickname: row.display_name || trip.owner_name || '俱乐部',
        idCardText: idCard || '未填写',
        idCardSource: idCard ? '会员档案' : '未填写',
        roleText: ui.roleLabel(row.role),
        roleColor: ui.roleColor(row.role, row.status),
        level: ui.levelLabel(row.snow_level),
        hasProfile: !!row.owner_id,
        extraLines: [
            person.line('参团活动', tripTitle),
            person.line('发布身份', '活动发布人 / 拼团人'),
        ],
    };
}

// 参团订单报名人：会员档案 + 订单与收款明细，点姓名后按管理员权限展示。
function orderPerson(order, member) {
    return {
        name: order.realName,
        phone: order.phone,
        genderText: order.genderText,
        nickname: order.nickname,
        idCardText: order.idCardText,
        idCardSource: order.idCardSource,
        roleText: order.roleText,
        roleColor: order.roleColor,
        level: order.level,
        hasProfile: !!(member && member.owner_id),
        extraLines: [
            person.line('参团活动', order.tripTitle),
            person.line('价格档位', `${order.optionText} × ${order.quantity}`),
            person.line('订单金额', `¥${order.amountText}`),
            person.line('报名 / 支付状态', `${order.orderStatusText} / ${order.paymentStatusText}`),
            person.line('收款方式', order.paymentChannelText),
            person.line('业务单号', order.outTradeNoText),
            person.line('付款信息', order.paymentNoteText),
            person.line('备注', order.noteText),
            person.line('报名时间', order.createdText),
        ],
    };
}

function safeFileName(value) {
    return String(value || '活动').replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 20);
}

function promptText(title, placeholder) {
    return new Promise(resolve => {
        wx.showModal({
            title,
            content: '',
            editable: true,
            placeholderText: placeholder,
            confirmText: '提交',
            cancelText: '取消',
            confirmColor: '#3D78A8',
            success: result => resolve(result.confirm ? (result.content || '').trim() : null),
            fail: () => resolve(null),
        });
    });
}

// 报名前的风险告知条款，集中维护；页面按序渲染，确认报名前必须逐条阅读并勾选同意。
const RISK_LINES = [
    '滑雪属于高风险体育运动，存在摔倒、碰撞、骨折等受伤甚至死亡的固有风险；',
    '本次为体育活动拼团，不是旅游组团；发起方不承诺全程无意外；',
    '本人确认身体健康，无心脏病、高血压等不适合滑雪的疾病；',
    '本人知晓应当购买滑雪专项意外伤害保险；',
    '本人将遵守雪场规则、听从现场工作人员提示，规范佩戴护具；',
    '因本人自身行为、装备问题、运动固有风险造成的损害，按法律规定划分责任；',
    '本人已经完整阅读并理解全部风险提示，自愿报名参加本次拼团活动。',
];

Page({
    data: {
        id: null,
        loading: true,
        error: '',
        trip: null,
        options: [],
        orders: [],
        people: [],
        myOrders: [],
        selectedId: null,
        rosterCounts: { orders: 0, people: 0, paid: 0, totalAmount: '0.00' },
        detailPerson: null,
        exporting: false,
        adminName: '俱乐部管理员',
        canManage: false,
        isHost: false,
        isAdmin: false,
        userId: '',
        quantity: '1',
        realName: '',
        idCardNo: '',
        phone: '',
        genderIndex: 0,
        genderLabels: profile.GENDERS.map(item => item.label),
        profileHint: '',
        profileReady: false,
        note: '',
        totalText: '0.00',
        submitting: false,
        gate: null,
        payment: null,
        canAct: false,
        guest: false,
        actHint: '',
        riskVisible: false,
        riskAgreed: false,
        riskLines: RISK_LINES,
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
        // 详细信息仅对审核通过的正式会员 / 管理员开放：访客在列表页只看得到活动概览，
        // 点进详情即渲染注册 / 审核门禁，行程、集合信息、价格档位与报名人均不下发。
        if (!access.canView) {
            this.setData({
                loading: false, gate: access.gate, trip: null, options: [],
                orders: [], people: [], myOrders: [], detailPerson: null,
                canAct: false, guest: access.state === 'guest',
            });
            return;
        }
        const canAct = access.canView;
        const guest = access.state === 'guest';
        const actHint = guest
            ? '登录并注册会员、经管理员审核通过后即可选择价格类别并提交报名。'
            : '管理员审核通过后即可提交报名，并查看其他版块内容。';
        this.setData({ gate: null, canAct, guest, actHint });
        const userId = access.session ? access.session.user.id : '';
        // 与云端 is_admin() 保持一致：必须是 active 的管理员才能读取收款配置与管理报名。
        const isAdmin = access.isAdmin;
        const [tripResult, optionResult, orderResult, settingsResult, memberResult] = await Promise.all([
            api.get('trip_activities', id),
            api.list('trip_price_options', { filters: [{ column: 'trip_id', value: id }], order: 'sort_order', ascending: true, limit: 50 }),
            api.list('trip_orders', { filters: [{ column: 'trip_id', value: id }], order: 'created_at', ascending: true, limit: 100 }),
            isAdmin ? api.getPaymentSettings() : Promise.resolve({ data: {}, error: null }),
            isAdmin ? api.list('members', { limit: 200 }) : Promise.resolve({ data: [], error: null }),
        ]);
        if (tripResult.error || !tripResult.data) {
            this.setData({ loading: false, error: tripResult.error ? tripResult.error.message : '活动已不存在' });
            return;
        }
        const raw = tripResult.data;
        const settings = (!settingsResult.error && settingsResult.data) ? settingsResult.data : {};
        const readiness = payment.readiness();
        const degraded = raw.payment_method === 'online' && !readiness.ready;
        const trip = Object.assign({}, raw, {
            statusText: ui.statusLabel(raw.status),
            isOpen: raw.status === 'open',
            deadlineText: raw.deadline || '未设置',
            feeNoteText: raw.fee_note || '详见活动说明',
            itineraryText: raw.itinerary || '发起人未填写',
            ownerText: raw.owner_name || '俱乐部',
        });
        const options = (optionResult.error ? [] : optionResult.data).map(row => Object.assign({}, row, {
            priceText: ui.money(row.price),
            noteText: row.note || (row.capacity ? `限 ${row.capacity} 人` : '标准报名'),
        }));
        // 云端 RLS 已限制：正式会员只能读到自己的订单，只有管理员能读到本活动全部订单。
        const memberMap = {};
        ((memberResult.error ? [] : memberResult.data) || []).forEach(row => { memberMap[row.owner_id] = row; });
        const decorated = (orderResult.error ? [] : orderResult.data)
            .map(row => decorateOrder(row, raw, memberMap[row.owner_id] || {}));
        const orders = isAdmin ? decorated : [];
        // 名单只在管理员侧构建；正式会员连姓名都不会下发到页面。
        const publisher = publisherPerson(raw, memberMap[raw.owner_id], trip.title);
        const people = isAdmin ? [{
            key: 'host', roleKind: 'host', name: publisher.name,
            roleKindText: '拼团人 · 活动发布人', subText: '', statusText: '发布人',
            statusTone: 'chip-muted', orderId: null, isPaid: false,
            person: publisher,
        }].concat(orders.map(row => ({
            key: `order-${row.id}`, roleKind: 'signup',
            name: row.realName, roleKindText: '报名人',
            subText: `${row.optionText} · ${row.quantity} 份`,
            statusText: row.paymentStatusText, statusTone: row.paymentTone,
            orderId: row.id, isPaid: row.isPaid,
            person: orderPerson(row, memberMap[row.owner_id]),
        }))) : [];
        const selected = options.length > 0 ? options[0].id : null;
        const rosterCounts = {
            orders: orders.length,
            people: orders.reduce((sum, row) => sum + Number(row.quantity || 1), 0),
            paid: orders.filter(row => row.isPaid).length,
            totalAmount: ui.money(orders.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
        };
        const patch = {
            loading: false,
            trip,
            options,
            orders,
            people,
            rosterCounts,
            detailPerson: null,
            myOrders: decorated.filter(row => row.owner_id === userId),
            selectedId: selected,
            userId,
            isAdmin,
            adminName: (access.member && access.member.display_name) || '俱乐部管理员',
            isHost: !!userId && raw.owner_id === userId,
            canManage: isAdmin,
            payment: Object.assign({
                methodText: payment.methodLabel(raw.payment_method, degraded),
                channelText: payment.channelLabel(payment.effectiveMethod(raw.payment_method)),
                degraded,
                requestedOnline: raw.payment_method === 'online',
                ready: readiness.ready,
                gatewayText: readiness.statusText,
                gatewaySummary: readiness.summary,
                onlineEnabled: false,
            }, isAdmin ? {
                noteText: raw.payment_note || settings.offline_note || '请联系俱乐部管理员确认付款方式与付款时限。',
                payeeName: settings.payee_name || '俱乐部管理员',
                payeeAccount: settings.payee_account || '待管理员填写',
                contact: settings.contact || '待管理员填写',
                onlineEnabled: !!settings.online_enabled,
            } : {}),
        };
        // 报名表单自动带入本人云端实名资料；用户已经手动输入的内容不被覆盖。
        if (access.member) {
            const values = profile.signupValues(access.member);
            patch.realName = this.data.realName || values.realName;
            patch.idCardNo = this.data.idCardNo || values.idCardNo;
            patch.phone = this.data.phone || values.phone;
            if (!this.data.genderIndex && values.gender) {
                patch.genderIndex = Math.max(0, profile.GENDERS.findIndex(item => item.value === values.gender));
            }
            patch.profileReady = profile.isComplete(access.member);
            patch.profileHint = profile.completenessText(access.member);
        }
        this.setData(patch);
        this.updateTotal();
    },

    updateTotal() {
        const option = this.data.options.find(row => row.id === this.data.selectedId);
        const quantity = Number(this.data.quantity) || 0;
        const unit = option ? Number(option.price || 0) : 0;
        this.setData({ totalText: ui.money(unit * quantity) });
    },

    onSelectOption(event) {
        this.setData({ selectedId: Number(event.currentTarget.dataset.id) });
        this.updateTotal();
    },
    onQuantityInput(event) {
        this.setData({ quantity: event.detail.value });
        this.updateTotal();
    },
    onRealNameInput(event) { this.setData({ realName: event.detail.value }); },
    onIdCardInput(event) { this.setData({ idCardNo: event.detail.value }); },
    onPhoneInput(event) { this.setData({ phone: event.detail.value }); },
    onGenderChange(event) { this.setData({ genderIndex: Number(event.detail.value) }); },
    onNoteInput(event) { this.setData({ note: event.detail.value }); },

    // 一键调用会员档案里的姓名 / 证件号 / 手机号 / 性别，省去重复填写。
    async onUseProfile() {
        const member = await api.ensureMember();
        if (!member) {
            ui.toast('请先登录并注册会员');
            return;
        }
        const values = profile.signupValues(member);
        this.setData({
            realName: values.realName,
            idCardNo: values.idCardNo,
            phone: values.phone,
            genderIndex: Math.max(0, profile.GENDERS.findIndex(item => item.value === values.gender)),
            profileReady: profile.isComplete(member),
            profileHint: profile.completenessText(member),
        });
        ui.toast(profile.isComplete(member) ? '已带入你的实名资料' : '已带入已填写的资料，请补全其余项');
    },

    onEditProfile() {
        wx.navigateTo({ url: '/pages/member-edit/member-edit' });
    },

    onLogin() {
        if (this.data.guest) {
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }
        wx.switchTab({ url: '/pages/mine/mine' });
    },

    // 信息详情不再直接展开：点报名人 / 拼团人姓名后以弹层展示完整资料。
    onOpenPerson(event) {
        const key = event.currentTarget.dataset.key;
        const item = this.data.people.find(row => row.key === key);
        if (!item) return;
        this.setData({
            detailPerson: {
                title: person.detailTitle(item.roleKind, item.name),
                hint: '俱乐部管理员可查看完整资料与订单信息',
                lines: person.detailLines(item.person, true),
            },
        });
    },

    onClosePerson() {
        this.setData({ detailPerson: null });
    },

    // 单活动名单：只取本活动的订单，三个工作表与全站台账一致，便于直接用于保险名单。
    buildSheets() {
        return roster.buildOrderSheets({
            rows: this.data.orders,
            adminName: this.data.adminName,
            scopeText: `本活动：${(this.data.trip && this.data.trip.title) || '活动'} / 全部报名订单`,
            emptyText: '本活动暂无报名记录',
            source: '本活动报名订单快照 + 会员实名档案',
            usage: '单活动报名名单 / 保险名单 / 收款核对',
        });
    },

    exportNames() {
        const title = safeFileName(this.data.trip && this.data.trip.title);
        return { prefix: `trip_${this.data.id}_members`, label: `${title}_活动报名名单` };
    },

    async onExportRoster() {
        if (!this.data.orders.length) {
            ui.toast('本活动暂无报名记录');
            return;
        }
        const names = this.exportNames();
        this.setData({ exporting: true });
        try {
            await exporter.downloadWorkbook(this.buildSheets(), names.prefix, names.label);
        } catch (error) {
            ui.toast(error.message || '导出名单失败');
        } finally {
            this.setData({ exporting: false });
        }
    },

    async onShareRoster() {
        if (!this.data.orders.length) {
            ui.toast('本活动暂无报名记录');
            return;
        }
        const names = this.exportNames();
        this.setData({ exporting: true });
        try {
            await exporter.shareWorkbook(this.buildSheets(), names.prefix, names.label);
        } catch (error) {
            ui.toast(error.message || '导出名单失败');
        } finally {
            this.setData({ exporting: false });
        }
    },

    onCopyRoster() {
        if (!this.data.orders.length) {
            ui.toast('本活动暂无报名记录');
            return;
        }
        exporter.copySheet(this.buildSheets()[0]);
        ui.toast('本活动名单已复制，可直接粘贴到 Excel');
    },

    onOpenPayment() {
        if (!this.data.isAdmin) return;
        wx.navigateTo({ url: '/pages/payment/payment' });
    },

    onCopyAccount() {
        if (!this.data.isAdmin || !this.data.payment || !this.data.payment.payeeAccount) return;
        wx.setClipboardData({ data: this.data.payment.payeeAccount });
    },

    async onSubmit() {
        if (!(await guard.requireAction())) return;
        const option = this.data.options.find(row => row.id === this.data.selectedId);
        if (!option) {
            ui.toast('请先选择价格类别');
            return;
        }
        const quantity = Number(this.data.quantity);
        if (!Number.isFinite(quantity) || quantity < 1) {
            ui.toast('请填写正确的报名份数');
            return;
        }
        const realName = this.data.realName.trim();
        const idCardNo = profile.normalizeIdCard(this.data.idCardNo);
        const phone = this.data.phone.trim();
        const gender = (profile.GENDERS[this.data.genderIndex] || {}).value || '';
        const invalid = !gender ? '请选择性别（男 / 女）'
            : profile.validateRealName(realName)
                || profile.validatePhone(phone)
                || profile.validateIdCard(idCardNo);
        if (invalid) {
            ui.toast(invalid);
            return;
        }
        // 表单校验通过后才弹风险告知书；真正的落库由确认按钮 onAgreeRisk 完成。
        this.setData({ riskVisible: true, riskAgreed: false });
    },

    onRiskToggle() {
        this.setData({ riskAgreed: !this.data.riskAgreed });
    },

    onCloseRisk() {
        this.setData({ riskVisible: false, riskAgreed: false });
    },

    async onAgreeRisk() {
        if (this.data.submitting) return;
        if (!this.data.riskAgreed) {
            ui.toast('请先阅读并勾选「我已阅读并自愿承担以上风险」');
            return;
        }
        // 弹窗打开期间页面可能重新加载，这里再取一次价格档位，避免凭空下单。
        const option = this.data.options.find(row => row.id === this.data.selectedId);
        if (!option || !this.data.trip) {
            this.onCloseRisk();
            ui.toast('价格类别已变化，请重新选择');
            return;
        }
        const quantity = Number(this.data.quantity);
        const realName = this.data.realName.trim();
        const idCardNo = profile.normalizeIdCard(this.data.idCardNo);
        const phone = this.data.phone.trim();
        const gender = (profile.GENDERS[this.data.genderIndex] || {}).value || '';
        const invalid = !gender ? '请选择性别（男 / 女）'
            : profile.validateRealName(realName)
                || profile.validatePhone(phone)
                || profile.validateIdCard(idCardNo);
        if (invalid) {
            this.onCloseRisk();
            ui.toast(invalid);
            return;
        }
        this.setData({ riskVisible: false, submitting: true });
        // 参团人信息随订单落库为快照：管理员台账与导出表格读的是提交当时的真实资料。
        const result = await api.create('trip_orders', {
            trip_id: this.data.id,
            option_id: option.id,
            option_name: option.name,
            unit_price: Number(option.price || 0),
            quantity,
            amount: Number(option.price || 0) * quantity,
            contact_name: realName,
            contact_phone: phone,
            participant_name: realName,
            participant_id_card: idCardNo || null,
            participant_phone: phone,
            participant_gender: gender,
            note: this.data.note.trim(),
            status: 'pending',
            payment_method: payment.effectiveMethod(this.data.trip.payment_method),
            out_trade_no: payment.buildOutTradeNo(`T${this.data.id}`),
            payment_note: this.data.payment.degraded ? '报名已登记，待管理员确认' : '',
        });
        this.setData({ submitting: false });
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('报名成功，请联系俱乐部管理员完成付款确认');
        this.setData({ note: '', riskAgreed: false });
        this.load();
    },

    async onSubmitPaymentNote(event) {
        const id = Number(event.currentTarget.dataset.id);
        const note = await promptText('提交付款信息', '转账单号 / 付款时间 / 备注');
        if (note === null) return;
        if (!note) {
            ui.toast('请填写付款信息');
            return;
        }
        const result = await api.update('trip_orders', id, { payment_note: note });
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('付款信息已提交');
        this.load();
    },

    async onConfirmPaid(event) {
        const id = Number(event.currentTarget.dataset.id);
        const agreed = await ui.confirm('确认已收到这笔款项？确认后会员将无法自行取消订单。', '确认收款');
        if (!agreed) return;
        const result = await api.setOrderPaid(id, true);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已确认收款');
        this.load();
    },

    async onRevokePaid(event) {
        const id = Number(event.currentTarget.dataset.id);
        const agreed = await ui.confirm('撤销后订单回到待支付状态，请谨慎操作。', '撤销收款确认');
        if (!agreed) return;
        const result = await api.setOrderPaid(id, false);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已撤销');
        this.load();
    },

    async onCancelOrder(event) {
        const id = Number(event.currentTarget.dataset.id);
        const order = this.data.myOrders.find(row => row.id === id);
        if (order && order.isPaid) {
            ui.toast('已支付订单请联系管理员处理');
            return;
        }
        const agreed = await ui.confirm('确定取消这笔订单吗？', '取消订单');
        if (!agreed) return;
        const result = await api.remove('trip_orders', id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已取消');
        this.load();
    },

    async onRefresh() {
        await this.load();
        if (this.data.gate) ui.toast('仍在审核中，请稍后再试');
        else ui.success('审核已通过，已解锁全部功能');
    },

    onEdit() {
        wx.navigateTo({ url: `/pages/trip-edit/trip-edit?id=${this.data.id}` });
    },

    async onToggleOfficial() {
        const next = !this.data.trip.is_official;
        const result = await api.update('trip_activities', this.data.id, { is_official: next });
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success(next ? '已标记为官方活动' : '已取消官方标记');
        this.load();
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
