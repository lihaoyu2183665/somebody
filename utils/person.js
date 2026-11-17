// 报名人员 / 拼团人详情弹层：按角色生成可见字段。
// 普通正式会员只能看到姓名、电话、性别；管理员可以看到会员档案与业务字段全集。
// 数据侧双重限制：拼车报名人来自 public.carpool_signup_contacts 安全视图（只含三要素），
// members 实名档案与 trip_orders 订单明细由云端 RLS 限制为本人与管理员。
const PUBLIC_KEYS = ['姓名', '电话', '性别'];
const DEFAULT_TEXT_COLOR = '#374D62';

function line(key, value, color) {
    const text = value === undefined || value === null || value === '' ? '未填写' : String(value);
    return { key, value: text, color: color || DEFAULT_TEXT_COLOR };
}

// person 统一形状：name / phone / genderText / nickname / idCardText / idCardSource /
// roleText / roleColor / level / hasProfile / extraLines（订单、收款等业务行，仅管理员）。
function detailLines(person, isAdmin) {
    const p = person || {};
    if (!isAdmin) {
        return [
            line('姓名', p.name),
            line('电话', p.phone),
            line('性别', p.genderText),
        ];
    }
    return [
        line('姓名', p.name),
        line('会员昵称', p.nickname),
        line('性别', p.genderText),
        line('身份证号', p.idCardText),
        line('证件号来源', p.idCardSource),
        line('手机号', p.phone),
        line('权限角色', p.roleText, p.roleColor),
        line('滑雪水平', p.level),
    ].concat(p.extraLines || []).concat([
        line('资料状态', p.hasProfile ? '已关联会员档案' : '未关联会员档案'),
    ]);
}

function detailTitle(roleKind, name) {
    return `${roleKind === 'host' ? '拼团人' : '报名人'} · ${name || '雪友'}`;
}

module.exports = {
    PUBLIC_KEYS,
    DEFAULT_TEXT_COLOR,
    line,
    detailLines,
    detailTitle,
};
