"""把会员审核与内容审核接入详情页、编辑页与记录页（严格匹配，命中失败即报错）。"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def apply(rel, pairs):
    path = ROOT / rel
    text = path.read_text(encoding='utf-8')
    for old, new in pairs:
        if old not in text:
            raise SystemExit('MISS ' + rel + ' :: ' + repr(old[:70]))
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')
    print('OK', rel)


GUARD = "const ui = require('../../utils/ui');\n"
GUARD_NEW = GUARD + "const guard = require('../../utils/guard');\n"

GATE_FIELD = "        submitting: false,\n    },"
GATE_FIELD_NEW = "        submitting: false,\n        gate: null,\n    },"

REFRESH = """    async onRefresh() {
        await this.load();
        if (this.data.gate) ui.toast('仍在审核中，请稍后再试');
        else ui.success('审核已通过，已解锁全部功能');
    },

"""

ACCESS_CHECK = """        const access = await guard.access();
        if (!access.canView) {
            this.setData({ loading: false, gate: access.gate, list: [], %s });
            return;
        }
        this.setData({ gate: null });
"""

MEMBER_USE = """        const userId = access.session ? access.session.user.id : '';
        const role = access.member ? access.member.role : 'member';"""

# ---------- 拼车详情 ----------
apply('pages/carpool-detail/carpool-detail.js', [
    (GUARD, GUARD_NEW),
    (GATE_FIELD, GATE_FIELD_NEW),
    ("""        this.setData({ loading: true, error: '' });
        const [postResult, session, member, signupResult] = await Promise.all([
            api.get('carpool_posts', id),
            api.getSession(),
            api.ensureMember(),
            api.list('carpool_signups', {
                filters: [{ column: 'post_id', value: id }],
                order: 'created_at',
                ascending: true,
                limit: 100,
            }),
        ]);""",
     """        this.setData({ loading: true, error: '' });
""" + (ACCESS_CHECK % 'post: null, signups: [], mySignup: null') + """        const [postResult, signupResult] = await Promise.all([
            api.get('carpool_posts', id),
            api.list('carpool_signups', {
                filters: [{ column: 'post_id', value: id }],
                order: 'created_at',
                ascending: true,
                limit: 100,
            }),
        ]);"""),
    ("""        const userId = session ? session.user.id : '';
        const role = member ? member.role : 'member';""", MEMBER_USE),
    ("""    async onSignup() {
        const session = await api.getSession();
        if (!session) {
            ui.toast('请先登录再报名');
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }""",
     """    async onSignup() {
        if (!(await guard.requireAction())) return;"""),
    ('    onGoRecords() {', REFRESH + '    onGoRecords() {'),
])

# ---------- 参团详情 ----------
apply('pages/trip-detail/trip-detail.js', [
    (GUARD, GUARD_NEW),
    (GATE_FIELD, GATE_FIELD_NEW),
    ("""        this.setData({ loading: true, error: '' });
        const [tripResult, optionResult, orderResult, session, member] = await Promise.all([
            api.get('trip_activities', id),
            api.list('trip_price_options', { filters: [{ column: 'trip_id', value: id }], order: 'sort_order', ascending: true, limit: 50 }),
            api.list('trip_orders', { filters: [{ column: 'trip_id', value: id }], order: 'created_at', ascending: true, limit: 100 }),
            api.getSession(),
            api.ensureMember(),
        ]);""",
     """        this.setData({ loading: true, error: '' });
""" + (ACCESS_CHECK % 'trip: null, options: [], orders: [], myOrders: []') + """        const [tripResult, optionResult, orderResult] = await Promise.all([
            api.get('trip_activities', id),
            api.list('trip_price_options', { filters: [{ column: 'trip_id', value: id }], order: 'sort_order', ascending: true, limit: 50 }),
            api.list('trip_orders', { filters: [{ column: 'trip_id', value: id }], order: 'created_at', ascending: true, limit: 100 }),
        ]);"""),
    ("""        const userId = session ? session.user.id : '';
        const role = member ? member.role : 'member';""", MEMBER_USE),
    ("""        if (member) {
            patch.contactName = this.data.contactName || member.display_name || '';
            patch.contactPhone = this.data.contactPhone || member.phone || '';
        }""",
     """        if (access.member) {
            patch.contactName = this.data.contactName || access.member.display_name || '';
            patch.contactPhone = this.data.contactPhone || access.member.phone || '';
        }"""),
    ("""    async onSubmit() {
        const session = await api.getSession();
        if (!session) {
            ui.toast('请先登录再报名');
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }""",
     """    async onSubmit() {
        if (!(await guard.requireAction())) return;"""),
    ('    onEdit() {', REFRESH + '    onEdit() {'),
])

# ---------- 雪具详情 ----------
apply('pages/gear-detail/gear-detail.js', [
    (GUARD, GUARD_NEW),
    ("""        isAdmin: false,
    },""", """        isAdmin: false,
        gate: null,
    },"""),
    ("""        this.setData({ loading: true, error: '' });
        const [result, session, member] = await Promise.all([
            api.get('gear_items', id),
            api.getSession(),
            api.ensureMember(),
        ]);""",
     """        this.setData({ loading: true, error: '' });
""" + (ACCESS_CHECK % 'gear: null, images: [], paths: []') + """        const result = await api.get('gear_items', id);"""),
    ("""        const userId = session ? session.user.id : '';
        const role = member ? member.role : 'member';""", MEMBER_USE),
    ("""    onCopyContact() {""",
     """    async onCopyContact() {
        if (!(await guard.requireAction())) return;"""),
    ('    onEdit() {', REFRESH + '    onEdit() {'),
])

# ---------- 教练详情 ----------
apply('pages/coach-detail/coach-detail.js', [
    (GUARD, GUARD_NEW),
    (GATE_FIELD, GATE_FIELD_NEW),
    ("""        this.setData({ loading: true, error: '' });
        const [coachResult, slotResult, bookingResult, session, member] = await Promise.all([
            api.get('coaches', id),
            api.list('coach_slots', { filters: [{ column: 'coach_id', value: id }], order: 'date', ascending: true, limit: 100 }),
            api.list('coach_bookings', { filters: [{ column: 'coach_id', value: id }], order: 'created_at', ascending: true, limit: 100 }),
            api.getSession(),
            api.ensureMember(),
        ]);""",
     """        this.setData({ loading: true, error: '' });
""" + (ACCESS_CHECK % 'coach: null, slots: [], bookings: [], myBookings: []') + """        const [coachResult, slotResult, bookingResult] = await Promise.all([
            api.get('coaches', id),
            api.list('coach_slots', { filters: [{ column: 'coach_id', value: id }], order: 'date', ascending: true, limit: 100 }),
            api.list('coach_bookings', { filters: [{ column: 'coach_id', value: id }], order: 'created_at', ascending: true, limit: 100 }),
        ]);"""),
    ("""            .filter(row => row.status === 'open')""",
     """            .filter(row => row.status === 'open' && row.review_status === 'approved')"""),
    ("""        const userId = session ? session.user.id : '';
        const role = member ? member.role : 'member';""", MEMBER_USE),
    ("""        if (member) {
            patch.contactName = this.data.contactName || member.display_name || '';
            patch.contactPhone = this.data.contactPhone || member.phone || '';
        }""",
     """        if (access.member) {
            patch.contactName = this.data.contactName || access.member.display_name || '';
            patch.contactPhone = this.data.contactPhone || access.member.phone || '';
        }"""),
    ("""    async onSubmit() {
        const session = await api.getSession();
        if (!session) {
            ui.toast('请先登录再约课');
            wx.navigateTo({ url: '/pages/login/login' });
            return;
        }""",
     """    async onSubmit() {
        if (!(await guard.requireAction())) return;"""),
    ('    onManage() {', REFRESH + '    onManage() {'),
])

# ---------- 我的记录 ----------
apply('pages/my-records/my-records.js', [
    (GUARD, GUARD_NEW),
    ("""        error: '',
        list: [],
    },""", """        error: '',
        list: [],
        gate: null,
    },"""),
    ("""        this.setData({ loading: true, error: '' });
        const session = await api.getSession();
        if (!session) {
            this.setData({ loading: false, error: '请先登录后再查看记录' });
            return;
        }
        const uid = session.user.id;""",
     """        this.setData({ loading: true, error: '' });
        const access = await guard.access();
        if (!access.canView) {
            this.setData({ loading: false, gate: access.gate, list: [] });
            return;
        }
        this.setData({ gate: null });
        const uid = access.session.user.id;"""),
    ("""                    statusText: ui.statusLabel(row.status),
                    timeText: timeText(row.created_at),""",
     """                    statusText: ui.statusLabel(row.status),
                    reviewText: ui.reviewLabel(row.review_status),
                    reviewNote: row.review_note || '',
                    timeText: timeText(row.created_at),"""),
    ('    onTab(event) {', REFRESH + '    onTab(event) {'),
])

# ---------- 发布 / 编辑页 ----------
EDIT_PAGES = [
    ('pages/carpool-edit/carpool-edit.js', """    onLoad(options) {
        if (options.id) {""", """    async onLoad(options) {
        if (!(await guard.requirePublishPage())) return;
        if (options.id) {"""),
    ('pages/trip-edit/trip-edit.js', """    onLoad(options) {
        api.ensureMember().then(member => {""", """    async onLoad(options) {
        if (!(await guard.requirePublishPage())) return;
        api.ensureMember().then(member => {"""),
    ('pages/gear-edit/gear-edit.js', """    onLoad(options) {
        if (options.id) {""", """    async onLoad(options) {
        if (!(await guard.requirePublishPage())) return;
        if (options.id) {"""),
    ('pages/coach-edit/coach-edit.js', """    async onLoad(options) {
        if (options.id) {""", """    async onLoad(options) {
        if (!(await guard.requirePublishPage())) return;
        if (options.id) {"""),
]

for rel, old, new in EDIT_PAGES:
    apply(rel, [(GUARD, GUARD_NEW), (old, new)])

apply('pages/carpool-edit/carpool-edit.js', [
    ("ui.success(data.isEdit ? '已保存' : '发布成功');", "ui.success(data.isEdit ? '已提交重新审核' : '已提交审核，通过后展示');"),
])
apply('pages/trip-edit/trip-edit.js', [
    ("ui.success(data.isEdit ? '已保存' : '发布成功');", "ui.success(data.isEdit ? '已提交重新审核' : '已提交审核，通过后展示');"),
])
apply('pages/gear-edit/gear-edit.js', [
    ("ui.success(data.isEdit ? '已保存' : '发布成功');", "ui.success(data.isEdit ? '已提交重新审核' : '已提交审核，通过后展示');"),
])
apply('pages/coach-edit/coach-edit.js', [
    ("ui.success('资料已保存');", "ui.success('已提交审核，通过后展示');"),
    ("ui.success('时段已添加');", "ui.success('时段已提交审核');"),
])

# ---------- 编辑页审核提示 ----------
HINT = '    <view class="review-tip">提交后需管理员审核，通过才会对外展示；修改内容会重新进入审核。</view>\n'
for page in ['carpool-edit/carpool-edit', 'trip-edit/trip-edit', 'gear-edit/gear-edit', 'coach-edit/coach-edit']:
    path = ROOT / ('pages/' + page + '.wxml')
    text = path.read_text(encoding='utf-8')
    if 'review-tip' not in text:
        lines = text.splitlines()
        start = next(i for i, line in enumerate(lines) if line.startswith('<view class="page'))
        lines.insert(start + 1, HINT.rstrip('\n'))
        path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        print('HINT', page)

# ---------- 我的记录：审核状态标签 ----------
records = ROOT / 'pages/my-records/my-records.wxml'
text = records.read_text(encoding='utf-8')
if 'item.reviewText' not in text:
    old = """            <view class="chip-row">
                <text class="chip chip-muted">{{item.typeText}}</text>
            </view>"""
    new = """            <view class="chip-row">
                <text class="chip chip-muted">{{item.typeText}}</text>
                <text class="chip {{item.reviewText === '已通过' ? 'chip-ok' : 'chip-warn'}}" wx:if="{{tab === 'posts'}}">{{item.reviewText}}</text>
            </view>
            <text class="card-desc" wx:if="{{item.reviewNote}}">审核意见：{{item.reviewNote}}</text>"""
    if old not in text:
        raise SystemExit('MISS my-records.wxml chip-row')
    records.write_text(text.replace(old, new, 1), encoding='utf-8')
    print('OK pages/my-records/my-records.wxml')

# ---------- 全局样式补充 ----------
style = ROOT / 'app.wxss'
css = style.read_text(encoding='utf-8')
if '.review-tip' not in css:
    css += """

.review-tip {
    margin-bottom: 22rpx;
    padding: 20rpx 24rpx;
    border-radius: 18rpx;
    background: #DCEBF7;
    color: #356A94;
    font-size: 24rpx;
    line-height: 1.6;
}

.chip-warn {
    color: #8A6A3C;
    background: #F5EEE0;
}

.chip-ok {
    color: #356A94;
    background: #DCEBF7;
}

.gate-badge {
    min-width: 36rpx;
    height: 36rpx;
    line-height: 36rpx;
    padding: 0 10rpx;
    border-radius: 18rpx;
    background: #3D78A8;
    color: #FFFFFF;
    font-size: 22rpx;
    text-align: center;
}
"""
    style.write_text(css, encoding='utf-8')
    print('OK app.wxss')

print('REVIEW_FLOW_APPLIED')
