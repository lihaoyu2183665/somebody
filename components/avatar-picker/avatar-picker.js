const api = require('../../utils/api');
const ui = require('../../utils/ui');

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

// 教练头像选择器：只负责「选图」，把最终 avatar 值抛给页面由页面写云端。
// 卡通头像一律以 preset:art:N 表示（本地资源），上传照片为云端对象路径，
// 两者都不会被当成需要清理的旧对象；恢复默认返回空串。
Component({
    properties: {
        show: { type: Boolean, value: false },
        value: { type: String, value: '' },
        title: { type: String, value: '更换头像' },
    },

    data: {
        presets: ui.AVATAR_ILLUSTRATIONS,
        uploading: false,
    },

    methods: {
        onClose() {
            if (this.data.uploading) return;
            this.triggerEvent('close');
        },

        // 阻止点击面板内容时冒泡到遮罩关闭。
        onNoop() {},

        onPick(event) {
            const key = event.currentTarget.dataset.key || '';
            if (key === this.data.value) {
                this.triggerEvent('close');
                return;
            }
            this.triggerEvent('change', { value: key });
        },

        async onUpload() {
            if (this.data.uploading) return;
            const temp = await chooseImage();
            if (!temp) return;
            this.setData({ uploading: true });
            const uploaded = await api.uploadAvatar(temp);
            this.setData({ uploading: false });
            if (uploaded.error) {
                ui.toast(uploaded.error.message);
                return;
            }
            this.triggerEvent('change', { value: uploaded.data });
        },

        onReset() {
            if (!this.data.value) return;
            this.triggerEvent('change', { value: '' });
        },
    },
});
