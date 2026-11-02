import test from 'node:test';import assert from 'node:assert/strict';import{PGlite}from'@electric-sql/pglite';import{readFileSync}from'node:fs';
test('refund review is atomic, idempotent, service-only and never alters either member balance',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 for(const file of ['20260924_toss_login_disconnect.sql','20260924_service_backend.sql','20260924_admin_ops.sql','20261102_play_refund_review.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const member=(await db.query("select hb_login('12345') id")).rows[0].id;
 const other=(await db.query("select hb_login('54321') id")).rows[0].id;
 const order='play:'+'a'.repeat(64);
 await db.query("select hb_credit_order($1,$2,'honsulbar_p1000',1000,1100)",[member,order]);
 await db.query('update hb_members set balance=100 where id=$1',[member]);
 for(let i=0;i<3;i++)await db.query('select hb_review_play_refund($1)',[order]);
 assert.equal((await db.query('select balance from hb_members where id=$1',[member])).rows[0].balance,100);
 assert.equal((await db.query('select balance from hb_members where id=$1',[other])).rows[0].balance,2000);
 assert.equal((await db.query('select count(*)::int n from hb_tickets')).rows[0].n,1);
 assert.equal((await db.query('select status from hb_orders where order_id=$1',[order])).rows[0].status,'refund_review');
 await assert.rejects(db.query('select hb_review_play_refund($1)',['play:'+'b'.repeat(64)]),/not registered/);
 await assert.rejects(db.query('select hb_review_play_refund($1)',['toss-order-id']),/Invalid/);
 await db.exec('set role anon');await assert.rejects(db.query('select hb_review_play_refund($1)',[order]),/permission denied/);
 }finally{await db.close();}
});
