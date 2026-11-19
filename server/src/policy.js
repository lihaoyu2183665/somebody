// 数据访问策略：替代云端 PostgreSQL 的 RLS。
// 所有 list/get/create/update/remove 都经过这里判定，确保：
// 1) 高级管理员档案对任何非本人用户不可见；
// 2) 实名、证件、电话等敏感字段只按权限投影；
// 3) 未审核内容不对外展示（作者本人与管理员除外）。

const CONTENT_TABLES = ['carpool_posts', 'coaches', 'coach_slots', 'gear_items', 'trip_activities'];
const PERSONAL_TABLES = ['carpool_signups', 'coach_bookings', 'trip_orders'];

// 读过滤：返回 { where, params }，用于拼到 SQL 的 WHERE。
// 返回 null 表示无权读取（列表为空 / 详情拒绝）。
function readFilter(table, access) {
    const uid = access.openid || '';
    const admin = !!access.isAdmin;

    switch (table) {
        case 'members':
            // 管理员：排除其他 super_admin（本人可见）；普通用户：仅本人 + 排除 super_admin。
            if (admin) {
                if (access.isSuperAdmin) return { where: '1 = 1', params: [] };
                return { where: "(role <> 'super_admin' OR owner_id = ?)", params: [uid] };
            }
            if (!uid) return { where: '1 = 0', params: [] };
            return { where: "(owner_id = ? OR role <> 'super_admin')", params: [uid] };

        case 'carpool_signup_contacts':
            // 安全视图已做三要素投影与 super_admin 排除。
            return { where: '1 = 1', params: [] };

        case 'carpool_posts':
        case 'coaches':
        case 'coach_slots':
        case 'gear_items':
        case 'trip_activities':
            if (admin) return { where: '1 = 1', params: [] };
            if (!uid) return { where: "review_status = 'approved'", params: [] };
            return { where: "(review_status = 'approved' OR owner_id = ?)", params: [uid] };

        case 'carpool_signups':
            if (admin) return { where: '1 = 1', params: [] };
            if (!uid) return { where: '1 = 0', params: [] };
            return { where: '(owner_id = ? OR post_id IN (SELECT id FROM carpool_posts WHERE owner_id = ?))', params: [uid, uid] };

        case 'coach_bookings':
            if (admin) return { where: '1 = 1', params: [] };
            if (!uid) return { where: '1 = 0', params: [] };
            return { where: '(owner_id = ? OR coach_id IN (SELECT id FROM coaches WHERE owner_id = ?))', params: [uid, uid] };

        case 'trip_orders':
            // 关键：正式会员只能读自己的订单；管理员读全部。
            if (admin) return { where: '1 = 1', params: [] };
            if (!uid) return { where: '1 = 0', params: [] };
            return { where: 'owner_id = ?', params: [uid] };

        case 'trip_price_options':
            return { where: '1 = 1', params: [] };

        case 'club_payment_settings':
            return admin ? { where: '1 = 1', params: [] } : { where: '1 = 0', params: [] };

        default:
            return null;
    }
}

// 行级可见性（详情 get 时用）：在 readFilter 之上，针对单条行再做判断。
function canReadRow(table, row, access) {
    if (!row) return false;
    const filter = readFilter(table, access);
    if (!filter) return false;
    if (filter.where === '1 = 1') return true;
    if (filter.where === '1 = 0') return false;
    const uid = access.openid || '';
    switch (table) {
        case 'members':
            if (access.isAdmin) return row.role !== 'super_admin' || row.owner_id === uid || access.isSuperAdmin;
            return row.owner_id === uid || row.role !== 'super_admin';
        case 'carpool_signup_contacts':
            return true;
        case 'carpool_posts': case 'coaches': case 'coach_slots': case 'gear_items': case 'trip_activities':
            return row.review_status === 'approved' || row.owner_id === uid || access.isAdmin;
        case 'carpool_signups':
            return access.isAdmin || row.owner_id === uid;
        case 'coach_bookings':
            return access.isAdmin || row.owner_id === uid;
        case 'trip_orders':
            return access.isAdmin || row.owner_id === uid;
        case 'trip_price_options':
            return true;
        case 'club_payment_settings':
            return !!access.isAdmin;
        default:
            return false;
    }
}

// 字段投影：非管理员读 members 时只保留基础字段，且其他人的实名信息不下发。
function projectRow(table, row, access) {
    if (!row) return row;
    if (table === 'members' && !access.isAdmin) {
        const own = row.owner_id === access.openid;
        if (own) return row;
        // 其他会员仅可见展示型字段，绝不下发实名 / 证件 / 手机。
        return {
            id: row.id, owner_id: row.owner_id, display_name: row.display_name,
            snow_level: row.snow_level, role: row.role, status: row.status,
            avatar: row.avatar, created_at: row.created_at,
        };
    }
    return row;
}

// 写权限：返回 { ok, reason }。
function canCreate(table, access) {
    if (!access.openid) return { ok: false, reason: '请先登录' };
    if (!access.canPublish) return { ok: false, reason: '需管理员审核通过后才能发布' };
    switch (table) {
        case 'trip_activities': case 'trip_price_options':
            return access.isAdmin ? { ok: true } : { ok: false, reason: '参团活动仅管理员可发布' };
        case 'coaches': case 'coach_slots':
            return access.canCoach ? { ok: true } : { ok: false, reason: '仅认证教练可发布' };
        case 'members': case 'club_payment_settings':
            return { ok: false, reason: '该表不支持直接新增' };
        case 'carpool_posts': case 'gear_items':
            return { ok: true };
        case 'carpool_signups': case 'coach_bookings': case 'trip_orders':
            return { ok: true };
        default:
            return { ok: false, reason: '未知数据表' };
    }
}

function canUpdate(table, row, access, patch) {
    if (!row) return { ok: false, reason: '记录不存在' };
    if (!access.openid) return { ok: false, reason: '请先登录' };
    const own = row.owner_id === access.openid;
    const admin = !!access.isAdmin;

    if (table === 'members') return { ok: false, reason: '会员资料请通过专门接口修改' };
    if (table === 'club_payment_settings') return admin ? { ok: true } : { ok: false, reason: '仅管理员可用' };
    if (table === 'trip_activities') return admin ? { ok: true } : { ok: false, reason: '仅管理员可修改参团活动' };
    if (table === 'trip_price_options') return admin ? { ok: true } : { ok: false, reason: '仅管理员可修改价格档位' };

    // 审核字段只有管理员能改。
    const reviewKeys = ['review_status', 'review_note', 'reviewed_at', 'reviewed_by'];
    if (patch && reviewKeys.some(k => Object.prototype.hasOwnProperty.call(patch, k)) && !admin) {
        return { ok: false, reason: '仅管理员可审核内容' };
    }
    if (table === 'coaches' || table === 'coach_slots') {
        if (!admin && !(own && access.canCoach)) return { ok: false, reason: '仅认证教练或管理员可修改' };
        return { ok: true };
    }
    if (table === 'carpool_posts' || table === 'gear_items') {
        if (!admin && !own) return { ok: false, reason: '只能修改自己发布的内容' };
        return { ok: true };
    }
    // 报名 / 订单：本人可改备注 etc；管理员可改任意。
    if (PERSONAL_TABLES.indexOf(table) >= 0) {
        if (!admin && !own) return { ok: false, reason: '只能修改自己的记录' };
        return { ok: true };
    }
    return { ok: false, reason: '未知数据表' };
}

function canDelete(table, row, access) {
    if (!row) return { ok: false, reason: '记录不存在' };
    if (!access.openid) return { ok: false, reason: '请先登录' };
    const own = row.owner_id === access.openid;
    const admin = !!access.isAdmin;
    if (table === 'members') return { ok: false, reason: '会员删除请通过专门接口操作' };
    if (table === 'club_payment_settings') return { ok: false, reason: '收款配置不可删除' };
    if (table === 'trip_activities' || table === 'trip_price_options') return admin ? { ok: true } : { ok: false, reason: '仅管理员可删除' };
    if (table === 'carpool_posts' || table === 'gear_items') {
        if (!admin && !own) return { ok: false, reason: '只能删除自己发布的内容' };
        return { ok: true };
    }
    if (table === 'coaches' || table === 'coach_slots') {
        if (!admin && !(own && access.canCoach)) return { ok: false, reason: '仅认证教练或管理员可删除' };
        return { ok: true };
    }
    if (PERSONAL_TABLES.indexOf(table) >= 0) {
        if (!admin && !own) return { ok: false, reason: '只能删除自己的记录' };
        return { ok: true };
    }
    return { ok: false, reason: '未知数据表' };
}

// 新增时由服务端强制注入的归属字段，前端传值一律忽略（防伪造 owner_id）。
function forceOwner(table) {
    return ['members', 'carpool_posts', 'carpool_signups', 'coaches', 'coach_slots',
        'coach_bookings', 'gear_items', 'trip_activities', 'trip_orders'].indexOf(table) >= 0;
}

module.exports = {
    CONTENT_TABLES, PERSONAL_TABLES,
    readFilter, canReadRow, projectRow,
    canCreate, canUpdate, canDelete, forceOwner,
};
