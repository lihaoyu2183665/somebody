// 数据访问层：自建 Node.js 后端（Express + MySQL）。
// 对外函数签名与原云端版本完全一致，页面与组件无需改动。
// 归属字段 owner_id 由后端根据登录态注入，前端从不传递。
const { cloud, request, uploadFile } = require('./cloud');

// database 链式适配器：仅用于极少数仍使用旧链式语法的调用点。
const database = {
    from(table) {
        const base = `/api/data/${table}`;
        const encode = value => encodeURIComponent(JSON.stringify(value || {}));
        return {
            select() {
                const state = { filters: [], order: 'created_at', ascending: false, limit: 1000 };
                const exec = () => request(`${base}?options=${encode(state)}`).then(result => {
                    if (result.error) return result;
                    return { data: result.data || [], error: null };
                });
                exec.eq = (column, value) => { state.filters.push({ column, value, method: 'eq' }); return exec; };
                exec.in = (column, value) => { state.filters.push({ column, value, method: 'in' }); return exec; };
                exec.order = (column, options) => { state.order = column; state.ascending = !!(options && options.ascending); return exec; };
                exec.limit = n => { state.limit = n; return exec; };
                exec.maybeSingle = async () => {
                    state.limit = 1;
                    const result = await exec();
                    if (result.error) return result;
                    const rows = result.data || [];
                    return { data: rows.length ? rows[0] : null, error: null };
                };
                exec.then = (resolve, reject) => exec().then(resolve, reject);
                return exec;
            },
            insert(payload) {
                const exec = () => request(base, { method: 'POST', data: payload }).then(result => {
                    if (result.error) return result;
                    return { data: result.data ? [result.data] : [], error: null };
                });
                exec.select = () => exec();
                exec.then = (resolve, reject) => exec().then(resolve, reject);
                return exec;
            },
            update(patch) {
                let id = null;
                const exec = () => request(`${base}/${id}`, { method: 'PUT', data: patch }).then(result => {
                    if (result.error) return result;
                    return { data: result.data ? [result.data] : [], error: null };
                });
                exec.eq = (column, value) => { if (column === 'id') id = value; return exec; };
                exec.then = (resolve, reject) => exec().then(resolve, reject);
                return exec;
            },
            delete() {
                let id = null;
                const exec = () => request(`${base}/${id}`, { method: 'DELETE' }).then(result => {
                    if (result.error) return result;
                    return { data: [{ removed: 1 }], error: null };
                });
                exec.eq = (column, value) => { if (column === 'id') id = value; return exec; };
                exec.then = (resolve, reject) => exec().then(resolve, reject);
                return exec;
            },
        };
    },
};

function failure(message) {
    return { data: null, error: { message } };
}

// 返回裸 session 对象 { user, member, token } 或 null，与迁移前云端 SDK 契约一致。
// 所有页面（mine/coaches/coach-edit/member-edit）与 guard 都按 session.user.id 使用，
// 切勿直接返回 request 的 { data, error } 包装，否则 session.user 为 undefined 会导致页面卡在加载态。
async function getSession() {
    const result = await request('/api/auth/session');
    if (result.error || !result.data) return null;
    getApp().globalData.session = result.data;
    return result.data;
}

// 会员注册：首次登录后创建档案；每次调用都从后端重读，确保审核结果实时生效。
async function ensureMember() {
    const app = getApp();
    const session = await getSession();
    if (!session || !session.user) {
        app.globalData.member = null;
        return null;
    }
    const result = await request('/api/members/ensure', {
        method: 'POST',
        data: { name: session.user.name },
    });
    if (result.error) {
        app.globalData.member = null;
        return null;
    }
    app.globalData.member = result.data;
    return result.data;
}

async function reviewMember(id, status, note) {
    return request(`/api/members/review/${id}`, { method: 'POST', data: { status, note: note || null } });
}

async function submitForReview() {
    return updateMember({ status: 'pending' });
}

async function withdrawReview() {
    return updateMember({ status: 'draft' });
}

async function setMemberRole(id, role) {
    return request(`/api/members/role/${id}`, { method: 'POST', data: { role } });
}

async function deleteMember(id) {
    const result = await request(`/api/members/${id}`, { method: 'DELETE' });
    return result.error ? result : { data: { removed: result.data && result.data.removed }, error: null };
}

async function reviewContent(table, id, status, note) {
    return update(table, id, { review_status: status, review_note: note || null });
}

// 俱乐部收款配置：全站单行，仅管理员可读可保存（后端 /api/payment 已做管理员校验）。
async function getPaymentSettings() {
    return request('/api/payment/settings');
}

async function savePaymentSettings(patch) {
    return request('/api/payment/settings', { method: 'PUT', data: patch });
}

async function setOrderPaid(id, paid) {
    return request(`/api/payment/order/${id}/paid`, { method: 'POST', data: { paid } });
}

async function updateMember(patch) {
    const result = await request('/api/members/me', { method: 'PATCH', data: patch });
    if (!result.error && result.data && getApp()) getApp().globalData.member = result.data;
    return result;
}

async function list(table, options) {
    const config = options || {};
    const state = {
        filters: config.filters || [],
        order: config.order || 'created_at',
        ascending: config.ascending === true,
        limit: config.limit || 100,
    };
    return request(`/api/data/${table}?options=${encodeURIComponent(JSON.stringify(state))}`);
}

async function get(table, id) {
    if (id === undefined || id === null || id === '') return failure('缺少记录 id');
    return request(`/api/data/${table}/${id}`);
}

async function create(table, payload) {
    return request(`/api/data/${table}`, { method: 'POST', data: payload });
}

async function update(table, id, patch) {
    if (id === undefined || id === null || id === '') return failure('缺少记录 id');
    return request(`/api/data/${table}/${id}`, { method: 'PUT', data: patch });
}

async function remove(table, id) {
    if (id === undefined || id === null || id === '') return failure('缺少记录 id');
    return request(`/api/data/${table}/${id}`, { method: 'DELETE' });
}

function signInWithWechat() {
    return new Promise(resolve => {
        wx.login({
            success: async ({ code }) => {
                try {
                    let appid = '';
                    try { appid = wx.getAccountInfoSync().miniProgram.appId; } catch (e) { /* ignore */ }
                    const result = await cloud.auth.signInWithWechat(code, appid);
                    if (result.error) return resolve(failure(result.error.message || '微信登录失败，请重试'));
                    getApp().setSession(result.data);
                    resolve({ data: result.data, error: null });
                } catch (error) {
                    resolve(failure('微信登录失败，请重试'));
                }
            },
            fail: error => resolve(failure((error && error.errMsg) || '微信登录不可用')),
        });
    });
}

async function signOut() {
    const result = await cloud.auth.signOut();
    getApp().resetSession();
    return result;
}

// 图片上传到自建后端，返回可持久保存的文件名。
async function uploadImages(tempPaths) {
    const saved = [];
    for (let index = 0; index < tempPaths.length; index += 1) {
        const result = await uploadFile(tempPaths[index]);
        if (result.error) return failure(result.error.message || '图片上传失败');
        saved.push(result.data);
    }
    return { data: saved, error: null };
}

async function uploadAvatar(tempPath) {
    const result = await uploadFile(tempPath);
    if (result.error) return failure(result.error.message || '头像上传失败');
    return { data: result.data, error: null };
}

async function removeImage(path) {
    if (!path) return { data: true, error: null };
    return request('/api/storage/remove', { method: 'DELETE', data: { path } });
}

async function signedUrls(paths) {
    if (!paths || paths.length === 0) return [];
    const result = await request('/api/storage/signed-urls', { method: 'POST', data: { paths } });
    if (result.error) return paths.map(() => '');
    return result.data || [];
}

module.exports = {
    cloud, database, getSession, ensureMember, updateMember,
    reviewMember, submitForReview, withdrawReview, setMemberRole, deleteMember,
    reviewContent, getPaymentSettings, savePaymentSettings, setOrderPaid,
    list, get, create, update, remove,
    signInWithWechat, signOut, uploadImages, uploadAvatar, removeImage, signedUrls,
};
