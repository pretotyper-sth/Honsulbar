import {database} from '../server/platform.js';
const nickname = process.env.TEST_NICKNAME?.trim();
if (!nickname) throw new Error('Nickname required');
const rows = await database(`hb_members?nickname=eq.${encodeURIComponent(nickname)}&select=id&limit=2`);
if (rows.length !== 1) throw new Error(`Expected one account, found ${rows.length}`);
const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
await database('hb_events', {method:'POST',body:{name:'photo-test-window',member_id:rows[0].id,data:{expiresAt}}});
console.log(JSON.stringify({activated:true,expiresAt,maxAttempts:36}));
