import test from 'node:test';
import assert from 'node:assert/strict';
import {playReviewReady,playReviewMember} from '../server/play-review.js';
const aid='11111111-1111-4111-8111-111111111111',mid='22222222-2222-4222-8222-222222222222';
const env={HB_PLAY_REVIEW_ENABLED:'1',HB_PLAY_REVIEW_AUTH_USER_ID:aid,HB_PLAY_REVIEW_MEMBER_ID:mid,SUPABASE_PUBLISHABLE_KEY:'public'};
const user={id:aid,email_confirmed_at:'2026-11-05',identities:[{provider:'email'}]};
const options=(u=user,owners=[{member_id:mid}],m={adult:true,photo_checked:true,photo:'image'})=>({env,base:'https://example.test',fetcher:async()=>({ok:true,json:async()=>u}),db:async path=>path.startsWith('hb_login_identities')?owners:[m]});
test('review access stays disabled until explicit configuration',async()=>{
 assert.equal(playReviewReady({}),false);
 await assert.rejects(playReviewMember('x'.repeat(30),{...options(),env:{}}),e=>e.status===503);
});
test('only verified dedicated owner with completed adult/photo checks can sign in',async()=>{
 assert.equal(await playReviewMember('x'.repeat(30),options()),mid);
 for(const u of [{...user,id:mid},{...user,email_confirmed_at:null},{...user,is_anonymous:true},{...user,identities:[{provider:'google'}]}])await assert.rejects(playReviewMember('x'.repeat(30),options(u)));
 for(const owners of [[],[{member_id:mid},{member_id:aid}]])await assert.rejects(playReviewMember('x'.repeat(30),options(user,owners)));
 for(const m of [{adult:false,photo_checked:true,photo:'x'},{adult:true,photo_checked:false,photo:'x'},{adult:true,photo_checked:true,photo:null},{adult:true,photo_checked:true,photo:'x',banned_until:'2099-01-01'}])await assert.rejects(playReviewMember('x'.repeat(30),options(user,[{member_id:mid}],m)));
});
test('review identity rejects expired credentials and fails closed on network failure',async()=>{
 await assert.rejects(playReviewMember('x'.repeat(30),{...options(),fetcher:async()=>({ok:false,json:async()=>user})}));
 await assert.rejects(playReviewMember('x'.repeat(30),{...options(),fetcher:async()=>{throw Error('network');}}),e=>e.status===503);
});
