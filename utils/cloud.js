// 自建后端客户端：替代原 WorkBuddy Cloud SDK。
// 所有请求走 wx.request，会话 token 存本地。保留 cloud.auth 的形状，
// 让 app.js 与既有代码无感切换；api.js 直接用 request 调用 REST 接口。

// 部署后必须把这里替换为后端实际对外域名（Nginx 暴露的地址）。
const BASE_URL = 'https://ski.your-domain.com';

function getToken() {
    try { return wx.getStorageSync('ski_token') || ''; } catch (e) { return ''; }
}
function setToken(token) {
    try { wx.setStorageSync('ski_token', token || ''); } catch (e) { /* ignore */ }
}

// 统一请求：返回 { data, error }，与云端 SDK 的调用习惯一致。
function request(path, options) {
    const config = options || {};
    const token = getToken();
    const header = Object.assign({ 'content-type': 'application/json' }, config.header || {});
    if (token) header.Authorization = `Bearer ${token}`;
    return new Promise(resolve => {
        wx.request({
            url: BASE_URL + path,
            method: config.method || 'GET',
            data: config.data,
            header,
            timeout: 15000,
            success: res => {
                const body = res.data;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body && typeof body === 'object' && 'data' in body
                        ? { data: body.data, error: body.error || null }
                        : { data: body, error: null });
                } else {
                    const message = (body && body.error && body.error.message) || `请求失败(${res.statusCode})`;
                    resolve({ data: null, error: { message } });
                }
            },
            fail: () => resolve({ data: null, error: { message: '网络异常，请稍后重试' } }),
        });
    });
}

// 文件上传：multipart/form-data，返回后端保存的文件名。
function uploadFile(filePath) {
    return new Promise(resolve => {
        const token = getToken();
        wx.uploadFile({
            url: BASE_URL + '/api/storage/upload',
            filePath,
            name: 'file',
            header: token ? { Authorization: `Bearer ${token}` } : {},
            success: res => {
                let body = {};
                try { body = JSON.parse(res.data); } catch (e) {
                    return resolve({ data: null, error: { message: '上传返回异常' } });
                }
                resolve(body.error ? { data: null, error: body.error } : { data: body.data, error: null });
            },
            fail: () => resolve({ data: null, error: { message: '图片上传失败' } }),
        });
    });
}

const auth = {
    getSession() {
        return request('/api/auth/session');
    },
    async signInWithWechat(code, appid) {
        const result = await request('/api/auth/wechat-login', { method: 'POST', data: { code, appid } });
        if (!result.error && result.data && result.data.token) setToken(result.data.token);
        return result;
    },
    setSession(session) {
        if (session && session.token) setToken(session.token);
    },
    async signOut() {
        const result = await request('/api/auth/logout', { method: 'POST', data: {} });
        setToken('');
        return result;
    },
    resetSession() { setToken(''); },
    getToken,
};

// database 仅保留占位：app.js 只用到 auth.getSession。
// 所有数据访问统一经由 utils/api.js，避免误用旧 SDK 链式语法。
const database = {
    from() { throw new Error('已切换到自建后端，请通过 utils/api.js 访问数据'); },
};

const cloud = { auth, database, request, uploadFile, BASE_URL, setToken, getToken };
const publicConfig = { endpoint: BASE_URL };

module.exports = { cloud, request, uploadFile, BASE_URL, setToken, getToken, publicConfig };
