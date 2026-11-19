/* 【已弃用】旧 WorkBuddy Cloud 数据面连通测试。
   本项目已切换到 server/ 自建后端（Express + MySQL），此脚本依赖的云端 SDK 已从 package.json 移除，
   运行会报模块缺失。新后端的自检请运行：node server/scripts/selftest.js。 */
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
