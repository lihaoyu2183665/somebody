// 会员实名资料：姓名 / 身份证号 / 手机号 / 性别。
// 仅本人可编辑（members_update_policy），本人与管理员可读（members_read_own / members_admin_read）。
// 证件号在会员资料、参团台账与导出中完整展示；读取范围仍由 RLS 限制为本人与管理员。
// 性别取值仅男 / 女；首项是未选择时的占位提示，不计入性别取值。
const GENDER_PLACEHOLDER = '请选择性别';
const GENDERS = [
    { value: '', label: GENDER_PLACEHOLDER },
    { value: 'male', label: '男' },
    { value: 'female', label: '女' },
];

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

function normalizeIdCard(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/\s/g, '')
        .toUpperCase();
}

function plausibleBirth(birth) {
    const year = Number(birth.slice(0, 4));
    const month = Number(birth.slice(4, 6));
    const day = Number(birth.slice(6, 8));
    const now = new Date();
    if (year < 1900 || year > now.getFullYear()) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidIdCard(value) {
    const text = normalizeIdCard(value);
    if (!/^\d{17}[\dX]$/.test(text)) return false;
    if (!plausibleBirth(text.slice(6, 14))) return false;
    let sum = 0;
    for (let index = 0; index < 17; index += 1) {
        sum += Number(text[index]) * ID_WEIGHTS[index];
    }
    return ID_CHECK_CODES[sum % 11] === text[17];
}

// 返回错误文案，空字符串代表通过；证件号可留空（不影响报名，但会影响保险名单完整度）。
function validateIdCard(value) {
    const text = normalizeIdCard(value);
    if (!text) return '';
    if (!/^\d{17}[\dX]$/.test(text)) return '身份证号需为 18 位，末位可为 X';
    if (!isValidIdCard(text)) return '身份证号校验位或出生日期不正确，请核对';
    return '';
}

function validatePhone(value) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    if (!text) return '请填写手机号';
    return /^1[3-9]\d{9}$/.test(text) ? '' : '请填写正确的 11 位手机号';
}

function validateRealName(value) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    if (!text) return '请填写姓名';
    if (text.length < 2 || text.length > 20) return '姓名长度应为 2-20 个字符';
    return /^[\u4e00-\u9fa5A-Za-z·\s]+$/.test(text) ? '' : '姓名仅支持中文、字母与间隔号';
}

function genderLabel(value) {
    if (!value) return '未填写';
    const found = GENDERS.find(item => item.value && item.value === value);
    if (found) return found.label;
    // 兼容历史订单里直接存的中文性别；旧档案里的其它取值一律按未填写展示。
    if (value === '男' || value === '女') return value;
    return '未填写';
}

function maskPhone(value) {
    const text = String(value || '').trim();
    if (text.length < 7) return text || '未填写';
    return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

// 从会员档案取出实名四要素；旧账号没有新字段时给出可编辑的空值。
function profileOf(member) {
    const row = member || {};
    return {
        realName: row.real_name || '',
        idCardNo: normalizeIdCard(row.id_card_no),
        phone: row.phone || '',
        gender: row.gender || '',
    };
}

// 参团报名时「调用我的资料」：没有实名姓名时退回昵称，避免报不上名。
function signupValues(member) {
    const row = member || {};
    const info = profileOf(row);
    return {
        realName: info.realName || row.display_name || row.owner_name || '',
        idCardNo: info.idCardNo,
        phone: info.phone,
        gender: info.gender,
    };
}

function isComplete(member) {
    const info = profileOf(member);
    return !!(info.realName && info.phone
        && GENDERS.some(item => item.value && item.value === info.gender)
        && isValidIdCard(info.idCardNo));
}

function completenessText(member) {
    return isComplete(member) ? '实名资料已完整，报名时可直接调用' : '实名资料未填写完整，报名时仍可手动填写';
}

// 提交会员审核前必须填写完整的基本信息。与云端 member_profile_complete() 保持同一套规则，
// 前端负责逐项提示，数据库触发器负责最终拦截，避免绕过页面直接改 status。
// 必填项对齐「基本信息 = 姓名 / 身份证号 / 手机号 / 性别」的定义，
// 昵称由微信授权自动带入、滑雪水平注册时默认初级，二者也纳入校验但不会增加填写负担。
const REVIEW_FIELDS = [
    { key: 'display_name', label: '昵称' },
    { key: 'real_name', label: '姓名' },
    { key: 'id_card_no', label: '身份证号' },
    { key: 'phone', label: '手机号' },
    { key: 'gender', label: '性别' },
    { key: 'snow_level', label: '滑雪水平' },
];

const LEVEL_VALUES = ['beginner', 'intermediate', 'advanced'];

function fieldState(key, row) {
    const source = row || {};
    const text = String(source[key] === undefined || source[key] === null ? '' : source[key]).trim();
    if (key === 'display_name') {
        return text ? '' : REVIEW_FIELDS.find(item => item.key === key).label;
    }
    if (key === 'real_name') {
        return text ? (validateRealName(text) ? '姓名（格式不正确）' : '') : '姓名';
    }
    if (key === 'id_card_no') {
        const card = normalizeIdCard(text);
        return card ? (validateIdCard(card) ? '身份证号（格式或校验位不正确）' : '') : '身份证号';
    }
    if (key === 'phone') {
        return text ? (validatePhone(text) ? '手机号（格式不正确）' : '') : '手机号';
    }
    if (key === 'gender') {
        return GENDERS.some(item => item.value && item.value === text) ? '' : '性别';
    }
    if (key === 'snow_level') {
        return LEVEL_VALUES.indexOf(text) >= 0 ? '' : '滑雪水平';
    }
    return '';
}

// 返回逐项完成状态与缺失项，供资料页展示清单，也用于提交前的即时校验。
function reviewChecklist(member) {
    return REVIEW_FIELDS.map(item => {
        const reason = fieldState(item.key, member);
        return { key: item.key, label: item.label, done: !reason, reason };
    });
}

function reviewCheck(member) {
    const checklist = reviewChecklist(member);
    const missing = checklist.filter(item => !item.done).map(item => item.reason);
    return { complete: missing.length === 0, missing, checklist };
}

function reviewHint(member) {
    const result = reviewCheck(member);
    return result.complete
        ? '基本信息已填写完整，可以提交审核'
        : `还需补充：${result.missing.join('、')}`;
}

module.exports = {
    GENDERS,
    GENDER_PLACEHOLDER,
    normalizeIdCard,
    isValidIdCard,
    validateIdCard,
    validatePhone,
    validateRealName,
    genderLabel,
    maskPhone,
    profileOf,
    signupValues,
    isComplete,
    completenessText,
    REVIEW_FIELDS,
    reviewChecklist,
    reviewCheck,
    reviewHint,
};
