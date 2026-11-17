/* 云端数据面连通测试：匿名读取各表，验证 SDK 初始化、端点与 RLS 公开读策略。
   运行：node tools/smoke-test.js
   不打印任何密钥或用户数据。 */
const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk');

const endpoint = 'https://mp-api.app.workbuddy.host';
const publishableKey = 'wbpk_xhJPiLJadl0j56grjBsRzH_kh1AiyDhmSm3I8A6aN1Wf3GA3h8wDayK';

if (typeof global.localStorage === 'undefined') {
    const store = {};
    global.localStorage = {
        getItem: key => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: key => { delete store[key]; },
    };
}

const TABLES = [
    'carpool_posts', 'carpool_signups',
    'gear_items', 'trip_activities', 'trip_price_options', 'trip_orders',
    'coaches', 'coach_slots', 'coach_bookings', 'members',
    'club_payment_settings',
];

(async () => {
    let cloud;
    try {
        cloud = createWorkBuddyCloud({ endpoint, publishableKey });
    } catch (error) {
        console.log('INIT_FAILED', error.message);
        process.exit(1);
    }
    let failed = 0;
    for (const table of TABLES) {
        try {
            const result = await cloud.database.from(table).select('id').limit(1);
            if (result.error) {
                console.log('FAIL', table, result.error.message);
                failed += 1;
            } else {
                console.log('PASS', table, 'rows=', (result.data || []).length);
            }
        } catch (error) {
            console.log('FAIL', table, error.message);
            failed += 1;
        }
    }
    console.log('RESULT', failed === 0 ? 'ALL_TABLES_REACHABLE' : `${failed}_TABLES_FAILED`);
    process.exit(failed === 0 ? 0 : 1);
})();
