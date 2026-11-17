// 管理员用户管理：删除用户的共用交互。
// 点一次确认即可删除，无需输入文字；云端负责权限校验与物理删除。
const api = require('./api');
const ui = require('./ui');

function confirmDelete(name) {
    return new Promise(resolve => {
        wx.showModal({
            title: '删除用户',
            content: `确定删除「${name || '该用户'}」吗？该会员档案、权限等级与实名资料会被永久删除且不可恢复；下次使用同一微信登录时，需重新填写基本信息并再次提交审核。历史参团订单、报名与收款记录保留作台账留档。本人账号与最后一名管理员不可删除。`,
            confirmText: '确认删除',
            cancelText: '取消',
            confirmColor: '#B23A32',
            success: result => resolve(!!result.confirm),
            fail: () => resolve(false),
        });
    });
}

async function remove(id, name) {
    const confirmed = await confirmDelete(name);
    if (!confirmed) return false;
    const result = await api.deleteMember(Number(id));
    if (result.error) {
        ui.toast(result.error.message);
        return false;
    }
    ui.success('用户已删除');
    return true;
}

module.exports = {
    confirmDelete,
    remove,
};
