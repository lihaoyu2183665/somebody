const api = require('../../utils/api');
const ui = require('../../utils/ui');
const profile = require('../../utils/profile');
const avatarUtil = require('../../utils/avatar');
const agreement = require('../../utils/agreement');

// 提前标出协议里的子项，WXML 只做条件渲染：小程序插值里不允许调用 JS 方法。
const AGREEMENT_SECTIONS = agreement.SECTIONS.map(section => ({
    title: section.title,
    lines: section.lines.map(text => ({ text, sub: text.indexOf('- ') === 0 })),
}));

// 兼容不同基础库：优先 chooseMedia，回退 chooseImage。
function chooseImage() {
    return new Promise(resolve => {
        if (wx.chooseMedia) {
            wx.chooseMedia({
                count: 1,
                mediaType: ['image'],
                sourceType: ['album', 'camera'],
                success: response => resolve((response.tempFiles && response.tempFiles[0].tempFilePath) || ''),
                fail: () => resolve(''),
            });
        } else {
            wx.chooseImage({
                count: 1,
                success: response => resolve((response.tempFilePaths && response.tempFilePaths[0]) || ''),
                fail: () => resolve(''),
            });
        }
    });
}

// 把当前表单值组装成与云端 members 行同形状的对象：完整度校验与提交都基于它。
function formMember(data) {
    return {
        display_name: data.displayName,
        real_name: data.realName,
        id_card_no: profile.normalizeIdCard(data.idCardNo),
        phone: data.phone,
        gender: profile.GENDERS[data.genderIndex] ? profile.GENDERS[data.genderIndex].value : '',
        snow_level: ui.LEVELS[data.levelIndex] ? ui.LEVELS[data.levelIndex].value : '',
    };
}

function timeText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const pad = number => (number < 10 ? `0${number}` : `${number}`);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
    data: {
        displayName: '',
        realName: '',
        idCardNo: '',
        phone: '',
        genderIndex: 0,
        genderLabels: profile.GENDERS.map(item => item.label),
        profileHint: '',
        levelIndex: 0,
        levelLabels: ui.LEVELS.map(item => item.label),
        levelText: ui.LEVELS[0].label,
        roleText: '资料待完善',
        roleColor: ui.ROLE_COLORS.guest,
        statusHint: '',
        memberStatus: 'draft',
        reviewChecklist: [],
        reviewHint: '',
        canSubmitReview: false,
        reviewSubmitting: false,
        submittedAtText: '',
        avatar: '',
        avatarPhotoUrl: '',
        avatarClass: '',
        avatarGlyph: '雪',
        avatarHint: '尚未设置头像',
        artPresets: ui.AVATAR_ILLUSTRATIONS,
        uploading: false,
        submitting: false,
        error: '',
        agreementTitle: agreement.TITLE,
        agreementIntro: agreement.INTRO,
        agreementCheckboxText: agreement.CHECKBOX_TEXT,
        agreementSections: AGREEMENT_SECTIONS,
        agreementVisible: false,
        agreementChecked: false,
        agreementSaving: false,
        termsAgreedAtText: '',
    },

    onShow() {
        this.load();
    },

    async load() {
        const session = await api.getSession();
        if (!session) {
            ui.toast('请先登录');
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }
        const member = await api.ensureMember();
        if (!member) return;
        if (member.status === 'cancelled') {
            ui.toast('该账号已被管理员移除，请重新登录注册');
            wx.switchTab({ url: '/pages/mine/mine' });
            return;
        }
        const levelIndex = Math.max(0, ui.LEVELS.findIndex(item => item.value === member.snow_level));
        const genderIndex = Math.max(0, profile.GENDERS.findIndex(item => item.value === (member.gender || '')));
        const isSuperAdmin = member.role === 'super_admin' && member.status === 'active';
        const isAdmin = isSuperAdmin || (member.role === 'admin' && member.status === 'active');
        const isCoach = member.role === 'coach' && member.status === 'active';
        const status = member.status || 'draft';
        let statusHint = '资料待完善：填写完整后点「提交审核」，管理员通过后才能查看与发布内容。';
        if (isSuperAdmin) statusHint = '高级管理员：俱乐部最高权限，拥有全部管理与审批能力；此角色全局仅一名，你的档案不对其他用户可见。';
        else if (isAdmin) statusHint = '管理员可查看全部注册信息、审批会员与发布内容，并把正式会员提升为教练或管理员。角色仅由管理员调整。';
        else if (isCoach) statusHint = '认证教练：可发布与管理教练主页、安排可约时段并查看学员预约；资料与时段仍需管理员审核。角色仅由管理员调整。';
        else if (status === 'active') statusHint = '正式会员，可查看全部内容并发布信息（发布后仍需审核）。教练主页与排课需管理员提权为认证教练。';
        else if (status === 'pending') statusHint = '申请已提交，等待管理员审核。审核期间可撤回申请继续修改资料。';
        else if (status === 'rejected') statusHint = '审核未通过，请按管理员意见修改资料后重新提交审核。';
        const name = member.display_name || session.user.name || '雪友';
        const info = await avatarUtil.resolve(member.avatar, name);
        const preset = ui.avatarPreset(member.avatar);
        this.setData({
            displayName: member.display_name || '',
            realName: member.real_name || '',
            idCardNo: profile.normalizeIdCard(member.id_card_no),
            phone: member.phone || '',
            genderIndex,
            profileHint: profile.completenessText(member),
            levelIndex,
            levelText: ui.LEVELS[levelIndex].label,
            roleText: isSuperAdmin ? '高级管理员' : (isAdmin ? '俱乐部管理员' : (isCoach ? '认证教练' : ui.memberStatusLabel(status))),
            roleColor: ui.roleColor(member.role, status),
            statusHint,
            memberStatus: status,
            submittedAtText: timeText(member.submitted_at),
            avatar: member.avatar || '',
            avatarPhotoUrl: info.photoUrl,
            avatarClass: info.className,
            avatarGlyph: info.glyph,
            avatarHint: ui.isPhotoAvatar(member.avatar)
                ? '当前使用上传的照片头像'
                : (preset ? '当前使用卡通头像'
                    : (member.avatar ? '原有文字头像已下线，请重新选择卡通头像' : '尚未设置头像，显示昵称首字')),
            termsAgreedAtText: timeText(member.terms_agreed_at),
        });
        // 尚未同意协议的会员每次进入资料页都必须先阅读并勾选，云端留痕后不再重复弹出。
        if (!member.terms_agreed_at) {
            this.setData({ agreementVisible: true, agreementChecked: false });
        }
        this.refreshReview();
    },

    // 每次输入都刷新审核清单：列出还缺哪些基本信息，实时决定能否提交审核。
    refreshReview() {
        const member = formMember(this.data);
        const check = profile.reviewCheck(member);
        this.setData({
            reviewChecklist: check.checklist,
            reviewHint: profile.reviewHint(member),
            canSubmitReview: check.complete,
        });
    },

    // 用户服务协议：未同意时强制阅读；同意时间写入云端会员档案，作为可追溯记录。
    onOpenAgreement() {
        this.setData({ agreementVisible: true, agreementChecked: !!this.data.termsAgreedAtText });
    },

    onAgreementToggle() {
        this.setData({ agreementChecked: !this.data.agreementChecked });
    },

    onDeclineAgreement() {
        ui.toast('需同意《用户服务协议》后才能完善资料与使用小程序');
        wx.switchTab({ url: '/pages/mine/mine' });
    },

    async onAgreeAgreement() {
        if (this.data.agreementSaving) return;
        if (!this.data.agreementChecked) {
            ui.toast('请先勾选「' + agreement.CHECKBOX_TEXT + '」');
            return;
        }
        this.setData({ agreementSaving: true, error: '' });
        const result = await api.updateMember({ terms_agreed_at: new Date().toISOString() });
        this.setData({ agreementSaving: false });
        if (result.error) {
            this.setData({ error: result.error.message });
            ui.toast(result.error.message);
            return;
        }
        this.setData({
            agreementVisible: false,
            agreementChecked: false,
            termsAgreedAtText: timeText(result.data && result.data.terms_agreed_at),
        });
        ui.success('已同意《用户服务协议》');
    },

    buildPayload() {
        const member = formMember(this.data);
        return {
            display_name: String(member.display_name || '').trim(),
            real_name: member.real_name ? String(member.real_name).trim() : null,
            id_card_no: member.id_card_no || null,
            phone: String(member.phone || '').trim(),
            gender: member.gender || null,
            snow_level: member.snow_level,
        };
    },

    // 把头像值写入云端会员档案；旧照片不再引用时清理云端对象。
    async applyAvatar(value) {
        const old = this.data.avatar;
        const result = await api.updateMember({ avatar: value || null });
        if (result.error) {
            ui.toast(result.error.message);
            return false;
        }
        if (ui.isPhotoAvatar(old) && old !== value) await api.removeImage(old);
        return true;
    },

    async onPickPreset(event) {
        const key = event.currentTarget.dataset.key;
        if (key === this.data.avatar) return;
        const preset = ui.avatarPreset(key);
        if (!preset) return;
        if (!(await this.applyAvatar(key))) return;
        // 卡通头像 resolve 后返回本地图片路径。
        const info = await avatarUtil.resolve(key, this.data.displayName || '雪友');
        this.setData({
            avatar: key,
            avatarPhotoUrl: info.photoUrl,
            avatarClass: info.className,
            avatarGlyph: info.glyph,
            avatarHint: '已选用卡通头像',
        });
        ui.success('卡通头像已更新');
    },

    async onUploadAvatar() {
        const temp = await chooseImage();
        if (!temp) return;
        this.setData({ uploading: true, error: '' });
        const uploaded = await api.uploadAvatar(temp);
        if (uploaded.error) {
            this.setData({ uploading: false, error: uploaded.error.message });
            ui.toast(uploaded.error.message);
            return;
        }
        const ok = await this.applyAvatar(uploaded.data);
        this.setData({ uploading: false });
        if (!ok) return;
        const urls = await api.signedUrls([uploaded.data]);
        this.setData({
            avatar: uploaded.data,
            avatarPhotoUrl: urls[0] || '',
            avatarClass: '',
            avatarGlyph: '',
            avatarHint: '当前使用上传的照片头像',
        });
        ui.success('头像已更新');
    },

    async onResetAvatar() {
        if (!this.data.avatar) return;
        if (!(await this.applyAvatar(''))) return;
        const name = this.data.displayName || '雪友';
        this.setData({
            avatar: '',
            avatarPhotoUrl: '',
            avatarClass: '',
            avatarGlyph: ui.initial(name),
            avatarHint: '已恢复默认，显示昵称首字',
        });
        ui.success('已恢复默认头像');
    },

    onDisplayNameInput(event) { this.setData({ displayName: event.detail.value }); this.refreshReview(); },
    onRealNameInput(event) { this.setData({ realName: event.detail.value }); this.refreshReview(); },
    onIdCardInput(event) { this.setData({ idCardNo: event.detail.value }); this.refreshReview(); },
    onPhoneInput(event) { this.setData({ phone: event.detail.value }); this.refreshReview(); },
    onLevelChange(event) {
        const index = Number(event.detail.value);
        this.setData({ levelIndex: index, levelText: ui.LEVELS[index].label });
        this.refreshReview();
    },
    onGenderChange(event) {
        this.setData({ genderIndex: Number(event.detail.value) });
        this.refreshReview();
    },

    // 保存资料不等于提交审核：允许先保存半成品，之后再补全并正式提交。
    async onSubmit() {
        if (!this.data.termsAgreedAtText) {
            this.setData({ agreementVisible: true, agreementChecked: false, error: '请先阅读并同意《用户服务协议》' });
            return;
        }
        const member = formMember(this.data);
        const error = !String(member.display_name || '').trim()
            ? '请填写昵称'
            : (member.real_name ? profile.validateRealName(member.real_name) : '')
                || (member.phone ? profile.validatePhone(member.phone) : '')
                || profile.validateIdCard(member.id_card_no);
        if (error) {
            this.setData({ error });
            return;
        }
        this.setData({ submitting: true, error: '' });
        const result = await api.updateMember(this.buildPayload());
        this.setData({ submitting: false });
        if (result.error) {
            this.setData({ error: result.error.message });
            return;
        }
        this.setData({ idCardNo: member.id_card_no, profileHint: profile.completenessText(result.data) });
        this.refreshReview();
        ui.success('资料已保存');
        setTimeout(() => wx.navigateBack(), 700);
    },

    // 提交审核：先保存表单，再由云端触发器复核完整度并写入 submitted_at。
    async onSubmitReview() {
        if (this.data.reviewSubmitting) return;
        if (!this.data.termsAgreedAtText) {
            this.setData({ agreementVisible: true, agreementChecked: false, error: '请先阅读并同意《用户服务协议》' });
            return;
        }
        const check = profile.reviewCheck(formMember(this.data));
        if (!check.complete) {
            const message = `请先补充：${check.missing.join('、')}`;
            this.setData({ error: message });
            ui.toast('基本信息未填写完整，请按清单补全');
            return;
        }
        const agreed = await ui.confirm(
            '提交后管理员将看到你的完整注册信息并进行审核。审核期间如需修改，可撤回申请后重新提交。',
            '确认提交审核',
        );
        if (!agreed) return;
        this.setData({ reviewSubmitting: true, error: '' });
        const saved = await api.updateMember(this.buildPayload());
        if (saved.error) {
            this.setData({ reviewSubmitting: false, error: saved.error.message });
            ui.toast(saved.error.message);
            return;
        }
        const result = await api.submitForReview();
        this.setData({ reviewSubmitting: false });
        if (result.error) {
            this.setData({ error: result.error.message });
            ui.toast(result.error.message);
            return;
        }
        ui.success('已提交审核，等待管理员审批');
        await this.load();
    },

    // 撤回申请：回到 draft，资料保留，补全后再次提交。
    async onWithdraw() {
        if (this.data.reviewSubmitting) return;
        const agreed = await ui.confirm(
            '撤回后申请不再出现在管理员的待审核列表，你可以继续修改基本信息并重新提交。已填写的资料不会丢失。',
            '撤回审核申请',
        );
        if (!agreed) return;
        this.setData({ reviewSubmitting: true, error: '' });
        const result = await api.withdrawReview();
        this.setData({ reviewSubmitting: false });
        if (result.error) {
            this.setData({ error: result.error.message });
            ui.toast(result.error.message);
            return;
        }
        ui.success('已撤回申请');
        await this.load();
    },
});
