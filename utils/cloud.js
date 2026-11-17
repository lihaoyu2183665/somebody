// 唯一的云服务客户端实例：所有页面与组件共用。
const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');

// 仅包含可公开的端侧配置，来自云服务激活返回的 publicConfig。
const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_xhJPiLJadl0j56grjBsRzH_kh1AiyDhmSm3I8A6aN1Wf3GA3h8wDayK',
    workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_xhJPiLJadl0j56grjBsRzH',
};

const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
    wx: createDiagnosticWx(wx),
});

module.exports = { cloud, publicConfig };
