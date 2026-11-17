// 云端数据访问层：所有数据落在云数据库，图片落在云端存储。
// 归属字段 owner_id 由数据库 DEFAULT auth.uid() 填充，前端从不传递。
const { cloud } = require('./cloud');

function database() {
    return cloud.database;
}

function failure(message) {
    return { data: null, error: { message: message } };
}

async function safe(executor) {
    try {
        return await executor();
    } catch (error) {
        return failure((error && error.message) || '网络异常，请稍后重试');
    }
}

async function getSession() {
    const result = await safe(() => cloud.auth.getSession());
    if (result.error || !result.data) return null;
    getApp().globalData.session = result.data;
    return result.data;
}

// 会员注册：首次登录后创建档案；每次调用都从云端重读，确保审核结果实时生效。
// 首位注册者由数据库触发器设为管理员兼正式会员；其余注册后为 draft（资料待完善），
// 必须把基本信息填写完整并主动提交审核，才会进入管理员的待审核列表。
async function ensureMember() {
    const app = getApp();
    const current = await getSession();
    if (!current) {
        app.globalData.member = null;
        return null;
    }
    return safe(async () => {
        const found = await database()
            .from('members')
            .select('*')
            .eq('owner_id', current.user.id)
            .maybeSingle();
        if (found.error) return failure(found.error.message);
        if (found.data) {
            app.globalData.member = found.data;
            return { data: found.data, error: null };
        }
        const created = await database()
            .from('members')
            .insert({
                owner_name: current.user.name || null,
                display_name: current.user.name || '雪友',
                phone: '',
                snow_level: 'beginner',
            })
            .select();
        if (created.error) return failure(created.error.message);
        const row = (created.data && created.data[0]) || null;
        app.globalData.member = row;
        return { data: row, error: null };
    }).then(result => result.data || app.globalData.member);
}

// 管理员审核会员：通过 / 驳回 / 恢复待审核。
async function reviewMember(id, status, note) {
    return update('members', id, { status, review_note: note || null });
}

// 会员主动提交审核：数据库触发器会复核基本信息完整度，并写入 submitted_at。
// 资料未填完整、或试图从其它状态直接跳到待审核，都会被数据库打回。
async function submitForReview() {
    return updateMember({ status: 'pending' });
}

// 待审核期间可撤回申请，修改资料后重新提交；不会删除任何已填写信息。
async function withdrawReview() {
    return updateMember({ status: 'draft' });
}

// 管理员给注册用户提权 / 撤权：member 注册会员 / coach 认证教练 / admin 俱乐部管理员（可多名）。
// super_admin 高级管理员全局唯一，不通过此接口产生，其档案也不对其他用户可见。
// 提权为管理员或教练时同步激活为正式会员；数据库触发器会校验调用者是管理员，
// 拒绝普通会员自行改角色，并阻止撤销最后一名管理员。
async function setMemberRole(id, role) {
    if (role === 'admin' || role === 'coach') {
        return update('members', id, { role, status: 'active', review_note: null });
    }
    return update('members', id, { role: 'member' });
}

// 管理员删除用户：物理删除会员档案，权限等级与实名资料一并移除，操作不可恢复。
// 云端只允许管理员删除（不能删本人，也不能删最后一名在任管理员）；
// 删除后该用户下次微信登录时 ensureMember() 会重新建档为「资料待完善」，
// 必须重新填写基本信息并提交审核，管理员通过后才能再次使用。
// 历史参团订单、报名与收款记录保留作台账留档，不随档案删除。
async function deleteMember(id) {
    return remove('members', id);
}

// 管理员审核发布内容：只有审核通过的内容才会在列表与详情页公开。
async function reviewContent(table, id, status, note) {
    return update(table, id, { review_status: status, review_note: note || null });
}

// 俱乐部收款配置：全站单行，仅管理员可读可保存（云端 RLS 同步收紧为 is_admin()）。
async function getPaymentSettings() {
    return get('club_payment_settings', 1);
}

async function savePaymentSettings(patch) {
    return update('club_payment_settings', 1, Object.assign({ updated_at: new Date().toISOString() }, patch));
}

// 管理员确认 / 撤销收款；会员调用会被数据库触发器打回，无法伪造支付状态。
async function setOrderPaid(id, paid) {
    return update('trip_orders', id, { payment_status: paid ? 'paid' : 'unpaid' });
}

async function updateMember(patch) {
    const current = await getSession();
    if (!current) return failure('请先登录');
    return safe(async () => {
        const result = await database()
            .from('members')
            .update(patch)
            .eq('owner_id', current.user.id)
            .select();
        if (result.error) return failure(result.error.message);
        const row = (result.data && result.data[0]) || null;
        if (!row) return failure('资料未更新，请确认已注册会员');
        getApp().globalData.member = row;
        return { data: row, error: null };
    });
}

async function list(table, options) {
    const config = options || {};
    return safe(async () => {
        let query = database().from(table).select('*');
        const filters = config.filters || [];
        for (const filter of filters) {
            if (filter.method === 'in') query = query.in(filter.column, filter.value);
            else query = query.eq(filter.column, filter.value);
        }
        query = query.order(config.order || 'created_at', { ascending: config.ascending === true });
        if (config.limit) query = query.limit(config.limit);
        const result = await query;
        if (result.error) return failure(result.error.message);
        return { data: result.data || [], error: null };
    });
}

async function get(table, id) {
    if (id === undefined || id === null || id === '') return failure('缺少记录 id');
    return safe(async () => {
        const result = await database().from(table).select('*').eq('id', id).maybeSingle();
        if (result.error) return failure(result.error.message);
        return { data: result.data || null, error: null };
    });
}

async function create(table, payload) {
    return safe(async () => {
        const result = await database().from(table).insert(payload).select();
        if (result.error) return failure(result.error.message);
        const rows = result.data || [];
        if (rows.length === 0) return failure('没有保存成功，请确认已登录或有权限');
        return { data: rows[0], error: null };
    });
}

async function update(table, id, patch) {
    if (id === undefined || id === null || id === '') return failure('缺少记录 id');
    return safe(async () => {
        const result = await database().from(table).update(patch).eq('id', id).select();
        if (result.error) return failure(result.error.message);
        const rows = result.data || [];
        if (rows.length === 0) return failure('没有保存成功，记录可能已删除或无权修改');
        return { data: rows[0], error: null };
    });
}

async function remove(table, id) {
    if (id === undefined || id === null || id === '') return failure('缺少记录 id');
    return safe(async () => {
        const result = await database().from(table).delete().eq('id', id).select();
        if (result.error) return failure(result.error.message);
        const rows = result.data || [];
        if (rows.length === 0) return failure('没有删除成功，记录可能已删除或无权修改');
        return { data: { removed: rows.length }, error: null };
    });
}

// 微信授权登录：wx.login 拿 code，交给 SDK 换取会话。
function signInWithWechat() {
    return new Promise(resolve => {
        wx.login({
            success: async ({ code }) => {
                try {
                    const appid = wx.getAccountInfoSync().miniProgram.appId;
                    const result = await cloud.auth.signInWithWechat(code, appid);
                    if (result.error) {
                        resolve(failure(result.error.message || '微信登录失败，请重试'));
                        return;
                    }
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
    const result = await safe(() => cloud.auth.signOut());
    getApp().resetSession();
    return result;
}

function readFile(filePath) {
    return new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
            filePath,
            success: response => resolve(response.data),
            fail: () => reject(new Error('读取图片失败')),
        });
    });
}

// 把本地临时图片上传到云端 shared 目录，返回可持久保存的对象路径。
async function uploadImages(tempPaths) {
    const current = await getSession();
    if (!current) return failure('请先登录');
    return safe(async () => {
        const saved = [];
        for (let index = 0; index < tempPaths.length; index += 1) {
            const temp = tempPaths[index];
            const rawExt = (temp.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(rawExt) >= 0 ? rawExt : 'jpg';
            const mime = ext === 'jpg' ? 'jpeg' : ext;
            const filename = `gears/${Date.now()}_${index}_${Math.floor(Math.random() * 100000)}.${ext}`;
            const path = cloud.storage.sharedPath(current.user.id, filename);
            const body = await readFile(temp);
            const uploaded = await cloud.storage.upload(path, body, {
                contentType: `image/${mime}`,
                upsert: false,
            });
            if (uploaded.error) return failure(uploaded.error.message || '图片上传失败');
            saved.push((uploaded.data && uploaded.data.path) || path);
        }
        return { data: saved, error: null };
    });
}

// 上传照片头像：与装备图片一样落在当前用户的云端 shared 目录，
// 返回可持久保存的对象路径，写入 members.avatar。
async function uploadAvatar(tempPath) {
    const current = await getSession();
    if (!current) return failure('请先登录');
    return safe(async () => {
        const rawExt = (tempPath.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(rawExt) >= 0 ? rawExt : 'jpg';
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        const filename = `avatars/${Date.now()}_${Math.floor(Math.random() * 100000)}.${ext}`;
        const path = cloud.storage.sharedPath(current.user.id, filename);
        const body = await readFile(tempPath);
        const uploaded = await cloud.storage.upload(path, body, {
            contentType: `image/${mime}`,
            upsert: false,
        });
        if (uploaded.error) return failure(uploaded.error.message || '头像上传失败');
        return { data: (uploaded.data && uploaded.data.path) || path, error: null };
    });
}

// 删除不再被引用的云端图片对象。
async function removeImage(path) {
    const current = await getSession();
    if (!current) return failure('请先登录');
    return safe(async () => {
        const result = await cloud.storage.remove([path]);
        if (result.error) return failure(result.error.message);
        return { data: true, error: null };
    });
}

// 云端图片使用短时签名地址展示，路径本身持久化在数据库。
async function signedUrls(paths) {
    if (!paths || paths.length === 0) return [];
    const urls = [];
    for (const path of paths) {
        const result = await safe(() => cloud.storage.createSignedUrl(path, 3600));
        const url = result.data && result.data.signedUrl ? result.data.signedUrl : '';
        urls.push(url);
    }
    return urls;
}

module.exports = {
    cloud,
    getSession,
    ensureMember,
    updateMember,
    reviewMember,
    submitForReview,
    withdrawReview,
    setMemberRole,
    deleteMember,
    reviewContent,
    getPaymentSettings,
    savePaymentSettings,
    setOrderPaid,
    list,
    get,
    create,
    update,
    remove,
    signInWithWechat,
    signOut,
    uploadImages,
    uploadAvatar,
    removeImage,
    signedUrls,
};
