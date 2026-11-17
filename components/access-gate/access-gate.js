const ui = require('../../utils/ui');

Component({
    properties: {
        gate: {
            type: Object,
            value: null,
        },
    },

    methods: {
        onPrimary() {
            const gate = this.data.gate || {};
            if (gate.showLogin) {
                wx.navigateTo({ url: '/pages/login/login' });
                return;
            }
            if (gate.showRefresh) {
                this.triggerEvent('refresh');
                return;
            }
            if (gate.showEdit) {
                wx.navigateTo({ url: '/pages/member-edit/member-edit' });
                return;
            }
            if (gate.showHome) {
                wx.switchTab({ url: '/pages/mine/mine' });
                return;
            }
            ui.toast('请稍后重试');
        },

        onProfile() {
            wx.navigateTo({ url: '/pages/member-edit/member-edit' });
        },
    },
});
