const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const payment = require('../../utils/payment');

const STATE_TEXT = {
    blocking: { text: '待完成', tone: 'chip-warn' },
    unknown: { text: '需核实', tone: 'chip-muted' },
    todo: { text: '接入后操作', tone: 'chip-muted' },
};

function decorateChecks(list) {
    return (list || []).map((item, index) => {
        const state = STATE_TEXT[item.state] || STATE_TEXT.todo;
        return Object.assign({}, item, {
            key: item.key,
            order: index + 1,
            stateText: state.text,
            stateTone: state.tone,
        });
    });
}

function timeText(value) {
    if (!value) return '尚未保存';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '尚未保存';
    const pad = number => (number < 10 ? `0${number}` : `${number}`);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
    data: {
        loading: true,
        gate: null,
        isAdmin: false,
        gateway: null,
        checks: [],
        payeeName: '',
        payeeAccount: '',
        contact: '',
        offlineNote: '',
        gatewayNote: '',
        onlineEnabled: false,
        updatedText: '',
        saving: false,
        error: '',
    },

    onShow() {
        this.load();
    },

    async load() {
        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        if (!access.canView || !access.isAdmin) {
            this.setData({
                loading: false,
                gate: access.canView ? guard.gateData('forbiddenPayment') : access.gate,
                isAdmin: false,
                gateway: null,
                checks: [],
                payeeName: '',
                payeeAccount: '',
                contact: '',
                offlineNote: '',
                gatewayNote: '',
                onlineEnabled: false,
            });
            return;
        }
        const readiness = payment.readiness();
        const result = await api.getPaymentSettings();
        if (result.error) {
            this.setData({ loading: false, error: result.error.message });
            return;
        }
        const row = result.data || {};
        this.setData({
            loading: false,
            gate: null,
            isAdmin: access.isAdmin,
            gateway: readiness,
            checks: decorateChecks(readiness.checklist),
            payeeName: row.payee_name || '',
            payeeAccount: row.payee_account || '',
            contact: row.contact || '',
            offlineNote: row.offline_note || '',
            gatewayNote: row.gateway_note || '',
            onlineEnabled: !!row.online_enabled,
            updatedText: timeText(row.updated_at),
        });
    },

    onPayeeNameInput(event) { this.setData({ payeeName: event.detail.value }); },
    onPayeeAccountInput(event) { this.setData({ payeeAccount: event.detail.value }); },
    onContactInput(event) { this.setData({ contact: event.detail.value }); },
    onOfflineNoteInput(event) { this.setData({ offlineNote: event.detail.value }); },
    onGatewayNoteInput(event) { this.setData({ gatewayNote: event.detail.value }); },
    onOnlineChange(event) { this.setData({ onlineEnabled: event.detail.value }); },

    async onSave() {
        if (!this.data.isAdmin) {
            ui.toast('仅管理员可以保存收款配置');
            return;
        }
        this.setData({ saving: true, error: '' });
        const result = await api.savePaymentSettings({
            payee_name: this.data.payeeName.trim(),
            payee_account: this.data.payeeAccount.trim(),
            contact: this.data.contact.trim(),
            offline_note: this.data.offlineNote.trim(),
            gateway_note: this.data.gatewayNote.trim(),
            online_enabled: this.data.onlineEnabled,
        });
        this.setData({ saving: false });
        if (result.error) {
            this.setData({ error: result.error.message });
            ui.toast(result.error.message);
            return;
        }
        ui.success('收款配置已保存');
        this.load();
    },

    onReset() {
        this.load();
        ui.toast('已恢复到上次保存的配置');
    },

    onCopyAccount() {
        if (!this.data.payeeAccount) {
            ui.toast('管理员尚未填写收款账号');
            return;
        }
        wx.setClipboardData({ data: this.data.payeeAccount });
    },

    async onRefresh() {
        await this.load();
        if (this.data.gate) ui.toast('仍在审核中，请稍后再试');
        else ui.success('审核已通过，已解锁全部功能');
    },
});
