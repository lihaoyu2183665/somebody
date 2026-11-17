const api = require('../../utils/api');
const ui = require('../../utils/ui');
const guard = require('../../utils/guard');
const roster = require('../../utils/roster');
const person = require('../../utils/person');

function createdText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const pad = number => (number < 10 ? `0${number}` : `${number}`);
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 管理员：把会员实名档案与报名记录合成一个可查看的完整人员对象。
function adminPerson(decorated, extraLines) {
    return {
        name: decorated.realName,
        phone: decorated.phone,
        genderText: decorated.genderText,
        nickname: decorated.nickname,
        idCardText: decorated.idCardText,
        idCardSource: decorated.idCardSource,
        roleText: decorated.roleText,
        roleColor: decorated.roleColor,
        level: decorated.level,
        hasProfile: decorated.hasProfile,
        extraLines: extraLines || [],
    };
}

// 普通正式会员：数据来自 public.carpool_signup_contacts 安全视图，只有姓名 / 电话 / 性别。
function publicPerson(row) {
    return {
        name: row.person_name || '雪友',
        phone: row.person_phone || '未填写',
        genderText: row.person_gender || '未填写',
    };
}

Page({
    data: {
        id: null,
        loading: true,
        error: '',
        post: null,
        people: [],
        signupPeople: 0,
        mySignup: null,
        canManage: false,
        isAdmin: false,
        userId: '',
        seats: '1',
        note: '',
        submitting: false,
        gate: null,
        detailPerson: null,
    },

    onLoad(options) {
        this.setData({ id: Number(options.id) || null });
    },

    onShow() {
        this.load();
    },

    async load() {
        const id = this.data.id;
        if (!id) {
            this.setData({ loading: false, error: '缺少记录 id' });
            return;
        }
        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        if (!access.canView) {
            this.setData({
                loading: false, gate: access.gate, post: null,
                people: [], signupPeople: 0, mySignup: null, detailPerson: null,
            });
            return;
        }
        this.setData({ gate: null });
        const userId = access.session ? access.session.user.id : '';
        const isAdmin = access.isAdmin;
        const postFilter = [{ column: 'post_id', value: id }];
        // 管理员读报名原表 + 会员档案；普通正式会员只读三要素安全视图，不下发实名档案。
        const [postResult, peopleResult, memberResult, mineResult] = await Promise.all([
            api.get('carpool_posts', id),
            api.list(isAdmin ? 'carpool_signups' : 'carpool_signup_contacts', {
                filters: postFilter, order: 'created_at', ascending: true, limit: 100,
            }),
            isAdmin ? api.list('members', { limit: 200 }) : Promise.resolve({ data: [], error: null }),
            api.list('carpool_signups', {
                filters: [{ column: 'post_id', value: id }, { column: 'owner_id', value: userId }], limit: 10,
            }),
        ]);
        if (postResult.error || !postResult.data) {
            this.setData({ loading: false, error: postResult.error ? postResult.error.message : '这条信息已不存在' });
            return;
        }
        const raw = postResult.data;
        const post = Object.assign({}, raw, {
            kindText: ui.kindLabel(raw.kind),
            statusText: ui.statusLabel(raw.status),
            isOpen: raw.status === 'open',
            returnPlaceText: raw.return_place || '同出发地',
            resortText: raw.resort || '待定',
            feeRuleText: raw.fee_rule || '费用面议',
            itineraryText: raw.itinerary || '发起人未填写',
            contactText: raw.contact || '报名后与发起人联系',
            ownerText: raw.owner_name || '雪友',
            createdText: createdText(raw.created_at),
        });
        const memberMap = {};
        ((memberResult.error ? [] : memberResult.data) || []).forEach(row => { memberMap[row.owner_id] = row; });
        const rows = peopleResult.error ? [] : peopleResult.data;
        const people = [];
        if (isAdmin) {
            // 拼团人（发起人）与每位报名人同样可点开查看完整信息。
            const host = roster.decorateSignup({
                id: 0, post_id: raw.id, owner_id: raw.owner_id, owner_name: raw.owner_name,
                seats: 0, note: '', contact: raw.contact, status: 'open', created_at: raw.created_at,
            }, raw, memberMap[raw.owner_id] || {});
            people.push({
                key: 'host', roleKind: 'host', name: host.realName,
                roleKindText: '拼团人 · 发起人', seatsText: '', statusText: '发起人',
                person: adminPerson(host, [
                    person.line('联系方式', post.contactText),
                    person.line('发起时间', post.createdText),
                ]),
            });
            rows.forEach(row => {
                const decorated = roster.decorateSignup(row, raw, memberMap[row.owner_id] || {});
                people.push({
                    key: `signup-${row.id}`, roleKind: 'signup', name: decorated.realName,
                    roleKindText: '报名人', seatsText: `${decorated.seats} 人`,
                    statusText: decorated.statusText,
                    person: adminPerson(decorated, [
                        person.line('报名人数', `${decorated.seats} 人`),
                        person.line('报名联系方式', decorated.contactText),
                        person.line('备注', decorated.note),
                        person.line('报名状态', decorated.statusText),
                        person.line('报名时间', decorated.createdText),
                    ]),
                });
            });
        } else {
            rows.forEach(row => {
                people.push({
                    key: `signup-${row.id}`, roleKind: 'signup',
                    name: row.person_name || '雪友',
                    roleKindText: '报名人', seatsText: `${Number(row.seats || 1)} 人`,
                    statusText: '报名人',
                    person: publicPerson(row),
                });
            });
        }
        const mine = (mineResult.error ? [] : mineResult.data)[0] || null;
        this.setData({
            loading: false,
            post,
            people,
            signupPeople: rows.reduce((sum, row) => sum + Number(row.seats || 1), 0),
            userId,
            isAdmin,
            canManage: (!!userId && raw.owner_id === userId) || isAdmin,
            mySignup: mine ? Object.assign({}, mine, { noteText: mine.note || '无备注' }) : null,
            detailPerson: null,
        });
    },

    // 信息详情不再在列表里展开：点报名人 / 拼团人姓名后以弹层按角色展示。
    onOpenPerson(event) {
        const key = event.currentTarget.dataset.key;
        const item = this.data.people.find(row => row.key === key);
        if (!item) return;
        this.setData({
            detailPerson: {
                title: person.detailTitle(item.roleKind, item.name),
                hint: this.data.isAdmin ? '俱乐部管理员可查看完整资料' : '仅展示姓名、电话、性别',
                lines: person.detailLines(item.person, this.data.isAdmin),
            },
        });
    },

    onClosePerson() {
        this.setData({ detailPerson: null });
    },

    onSeatsInput(event) {
        this.setData({ seats: event.detail.value });
    },

    onNoteInput(event) {
        this.setData({ note: event.detail.value });
    },

    async onSignup() {
        if (!(await guard.requireAction())) return;
        const seats = Number(this.data.seats);
        if (!Number.isFinite(seats) || seats < 1) {
            ui.toast('请填写正确的报名人数');
            return;
        }
        this.setData({ submitting: true });
        const result = await api.create('carpool_signups', {
            post_id: this.data.id,
            seats,
            note: this.data.note.trim(),
            status: 'joined',
        });
        this.setData({ submitting: false });
        if (result.error) {
            const text = String(result.error.message || '');
            ui.toast(text.indexOf('duplicate') >= 0 || text.indexOf('23505') >= 0 ? '你已经报名过了' : result.error.message);
            return;
        }
        ui.success('报名成功');
        this.setData({ note: '' });
        this.load();
    },

    async onCancelSignup() {
        const mine = this.data.mySignup;
        if (!mine) return;
        const agreed = await ui.confirm('确定取消这次报名吗？', '取消报名');
        if (!agreed) return;
        const result = await api.remove('carpool_signups', mine.id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已取消报名');
        this.load();
    },

    onEdit() {
        wx.navigateTo({ url: `/pages/carpool-edit/carpool-edit?id=${this.data.id}` });
    },

    async onDelete() {
        const agreed = await ui.confirm('删除后不可恢复，相关报名记录也会一并清除。', '删除信息');
        if (!agreed) return;
        const result = await api.remove('carpool_posts', this.data.id);
        if (result.error) {
            ui.toast(result.error.message);
            return;
        }
        ui.success('已删除');
        setTimeout(() => wx.navigateBack(), 700);
    },

    async onRefresh() {
        await this.load();
        if (this.data.gate) ui.toast('仍在审核中，请稍后再试');
        else ui.success('审核已通过，已解锁全部功能');
    },

    onGoRecords() {
        wx.navigateTo({ url: '/pages/my-records/my-records' });
    },
});
