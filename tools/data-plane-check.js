/* 端侧 SDK 功能测试：管理员发布可见性、收款配置仅管理员可读、关闭重开数据仍在、
   订单私有性与匿名写入拦截。
   前置：由管理端 SQL 准备 PAYMENT-PERSIST-CHECK 活动（管理员发布，触发自动审核通过）。
   运行：node tools/data-plane-check.js */
const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk');

const endpoint = 'https://mp-api.app.workbuddy.host';
const publishableKey = 'wbpk_xhJPiLJadl0j56grjBsRzH_kh1AiyDhmSm3I8A6aN1Wf3GA3h8wDayK';
const FIXTURE = 'PAYMENT-PERSIST-CHECK';

if (typeof global.localStorage === 'undefined') {
    const store = {};
    global.localStorage = {
        getItem: key => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: key => { delete store[key]; },
    };
}

function client() {
    // 每次创建新客户端，模拟关闭小程序后重新打开。
    return createWorkBuddyCloud({ endpoint, publishableKey });
}

(async () => {
    let failed = 0;
    const check = (ok, name, detail) => {
        console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
        if (!ok) failed += 1;
    };

    const fresh = client();
    const visible = await fresh.database
        .from('trip_activities')
        .select('id,title,review_status,payment_method')
        .eq('title', FIXTURE)
        .limit(3);
    const hasFixture = !visible.error && visible.data && visible.data.length === 1;
    if (!hasFixture) {
        console.log('SKIP persistence-checks: 管理端未准备参团测试数据');
    } else {
        const row = visible.data[0];
        check(row.review_status === 'approved', 'admin-publish-approved', `status=${row.review_status}`);
        check(row.payment_method === 'online', 'payment-method-persist', `method=${row.payment_method}`);

        const reopened = client();
        const again = await reopened.database
            .from('trip_activities')
            .select('id')
            .eq('title', FIXTURE)
            .limit(3);
        check(!again.error && again.data && again.data.length === 1,
            'reopen-persist', again.error ? again.error.message : `rows=${(again.data || []).length}`);
    }

    // 收款配置仅管理员可读：匿名会话不应读到任何配置行（云端 RLS 已收紧为 is_admin()）。
    const settings = await fresh.database
        .from('club_payment_settings')
        .select('id,payee_name,online_enabled')
        .eq('id', 1)
        .limit(2);
    const settingsHidden = !!settings.error || !settings.data || settings.data.length === 0;
    check(settingsHidden, 'payment-settings-admin-only',
        settings.error ? settings.error.message : `rows=${(settings.data || []).length}`);

    // 订单是私有数据：匿名会话不应读到他人订单。
    const orders = await fresh.database.from('trip_orders').select('id').limit(3);
    check(!orders.error && (!orders.data || orders.data.length === 0),
        'orders-private', orders.error ? orders.error.message : `rows=${(orders.data || []).length}`);

    // 参团活动为管理员专属：匿名发布必须被拒。
    const tripWrite = await fresh.database.from('trip_activities').insert({
        title: 'ANON-TRIP-CHECK',
        depart_time: '2026-12-01 07:00',
        return_time: '2026-12-01 18:00',
        depart_place: '测试',
        gather_place: '测试',
        transport: '包车大巴',
    });
    const tripBlocked = !!tripWrite.error || !tripWrite.data || tripWrite.data.length === 0;
    check(tripBlocked, 'anon-trip-publish-denied');
    if (!tripBlocked) {
        await fresh.database.from('trip_activities').delete().eq('title', 'ANON-TRIP-CHECK');
    }

    // 收款配置只有管理员可改：匿名 update 应影响 0 行。
    const configWrite = await fresh.database
        .from('club_payment_settings')
        .update({ payee_name: 'ANON-TAMPER' })
        .eq('id', 1)
        .select();
    const configBlocked = !!configWrite.error || !configWrite.data || configWrite.data.length === 0;
    check(configBlocked, 'anon-payment-settings-denied');

    // 原有发布表仍需正式会员身份，匿名写入被拒。
    const write = await fresh.database.from('carpool_posts').insert({
        title: 'ANON-WRITE-CHECK',
        depart_time: '2026-12-01 07:00',
        return_time: '2026-12-01 18:00',
        depart_place: '测试',
        transport: '自驾拼车',
        seats: 1,
    });
    const blocked = !!write.error || !write.data || write.data.length === 0;
    check(blocked, 'anon-write-denied');
    if (!blocked) {
        await fresh.database.from('carpool_posts').delete().eq('title', 'ANON-WRITE-CHECK');
    }

    // 教练主页为教练 / 管理员专属：匿名发布必须被拒。
    const coachWrite = await fresh.database.from('coaches').insert({
        name: 'ANON-COACH-CHECK',
        title: '匿名发布检查',
        years: 0,
        price_per_hour: 0,
    });
    const coachBlocked = !!coachWrite.error || !coachWrite.data || coachWrite.data.length === 0;
    check(coachBlocked, 'anon-coach-publish-denied');
    if (!coachBlocked) {
        await fresh.database.from('coaches').delete().eq('name', 'ANON-COACH-CHECK');
    }

    // 新增的头像与实名资料列对端侧 SDK 可见（匿名读不到行，但不应报列不存在）。
    const memberProbe = await fresh.database.from('members')
        .select('id,avatar,real_name,id_card_no,gender,phone,status,submitted_at').limit(1);
    check(!memberProbe.error, 'profile-columns-visible', memberProbe.error ? memberProbe.error.message : 'columns ok');
    const orderProbe = await fresh.database.from('trip_orders')
        .select('id,participant_name,participant_id_card,participant_phone,participant_gender').limit(1);
    check(!orderProbe.error, 'participant-columns-visible', orderProbe.error ? orderProbe.error.message : 'columns ok');

    // 匿名会话既读不到实名资料，也不能写入或篡改他人证件号。
    const profileRead = await fresh.database.from('members').select('id,id_card_no').limit(3);
    check(!profileRead.error && (!profileRead.data || profileRead.data.length === 0),
        'member-profiles-private', profileRead.error ? profileRead.error.message : `rows=${(profileRead.data || []).length}`);
    const idWrite = await fresh.database.from('members')
        .update({ id_card_no: '11010519491231002X' })
        .eq('role', 'member')
        .select();
    const idBlocked = !!idWrite.error || !idWrite.data || idWrite.data.length === 0;
    check(idBlocked, 'anon-id-card-write-denied');
    const orderWrite = await fresh.database.from('trip_orders').insert({
        trip_id: 8,
        participant_name: 'ANON-ORDER-CHECK',
        participant_id_card: '11010519491231002X',
        quantity: 1,
    });
    const orderBlocked = !!orderWrite.error || !orderWrite.data || orderWrite.data.length === 0;
    check(orderBlocked, 'anon-order-insert-denied');
    if (!orderBlocked) {
        await fresh.database.from('trip_orders').delete().eq('participant_name', 'ANON-ORDER-CHECK');
    }

    // 角色只能由管理员调整：匿名把会员提权为教练应影响 0 行。
    const roleWrite = await fresh.database
        .from('members')
        .update({ role: 'coach' })
        .eq('role', 'member')
        .select();
    const roleBlocked = !!roleWrite.error || !roleWrite.data || roleWrite.data.length === 0;
    check(roleBlocked, 'anon-role-change-denied');

    // 匿名会话不能把「资料待完善」账号直接改成待审核（绕过资料完整度与提交步骤）。
    const reviewWrite = await fresh.database.from('members')
        .update({ status: 'pending' })
        .eq('status', 'draft')
        .select();
    const reviewBlocked = !!reviewWrite.error || !reviewWrite.data || reviewWrite.data.length === 0;
    check(reviewBlocked, 'anon-review-submit-denied');

    // 删除链路：历史留痕列仍对端侧 SDK 可见；匿名会话既不能删除会员档案，
    // 也不能把历史已停用账号改回在用状态（删除只由管理员专属 DELETE 策略放行）。
    const deleteProbe = await fresh.database.from('members')
        .select('id,status,deactivated_at,deactivated_by,deactivation_reason').limit(1);
    check(!deleteProbe.error, 'legacy-deactivation-columns-visible',
        deleteProbe.error ? deleteProbe.error.message : 'columns ok');
    const anonDelete = await fresh.database.from('members')
        .delete()
        .eq('status', 'cancelled')
        .select();
    const deleteBlocked = !!anonDelete.error || !anonDelete.data || anonDelete.data.length === 0;
    check(deleteBlocked, 'anon-member-delete-denied');
    const anonReactivate = await fresh.database.from('members')
        .update({ status: 'active' })
        .eq('status', 'cancelled')
        .select();
    const reactivateBlocked = !!anonReactivate.error || !anonReactivate.data || anonReactivate.data.length === 0;
    check(reactivateBlocked, 'anon-legacy-reactivate-denied');

    console.log('RESULT', failed === 0 ? 'DATA_PLANE_OK' : `${failed}_CHECKS_FAILED`);
    process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
    console.log('FAIL exception', error.message);
    process.exit(1);
});
