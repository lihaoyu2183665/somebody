const api = require('../../utils/api');
const ui = require('../../utils/ui');

Page({
    data: {
        wechatLoading: false,
        error: '',
    },

    async onWechatLogin() {
        if (this.data.wechatLoading) return;
        this.setData({ wechatLoading: true, error: '' });
        const result = await api.signInWithWechat();
        if (result.error) {
            this.setData({ wechatLoading: false, error: result.error.message });
            return;
        }
        await this.finishLogin();
    },

    async finishLogin() {
        let member = null;
        try {
            member = await api.ensureMember();
        } catch (error) {
            ui.toast('会员资料初始化失败，请重试');
        }
        this.setData({ wechatLoading: false, error: '' });
        const active = member && member.status === 'active';
        const draft = member && member.status === 'draft';
        const rejected = member && member.status === 'rejected';
        const cancelled = member && member.status === 'cancelled';
        ui.toast(active
            ? '登录成功'
            : (cancelled
                ? '该账号已被管理员移除，请重新登录注册'
                : (draft ? '注册成功，请完善基本信息并提交审核' : (rejected ? '审核未通过，请修改资料后重新提交' : '注册已提交，等待管理员审核'))));
        setTimeout(() => {
            const pages = getCurrentPages();
            if (pages.length > 1) wx.navigateBack();
            else wx.switchTab({ url: '/pages/index/index' });
        }, 800);
    },
});
