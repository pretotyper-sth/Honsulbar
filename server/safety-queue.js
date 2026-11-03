// An empty report queue can be checked by the server. This is deliberately
// recorded as a system check, never as an operator reviewing actual reports.
export async function checkEmptySafetyQueue({ database, rpc, now = Date.now() }) {
  const ops = await database('hb_safety_ops?select=reviewed_at&limit=1');
  const checkedAt = Date.parse(ops?.[0]?.reviewed_at);
  if (!Number.isFinite(checkedAt)) throw new Error('safety_check_state_unavailable');
  if (now - checkedAt < 24 * 3600000) return { resumed: false, reason: 'recent-check' };
  const reports = await database('hb_tickets?select=id&kind=eq.report&status=in.(pending,reviewing)&limit=1');
  if (!Array.isArray(reports)) throw new Error('report_queue_unavailable');
  if (reports.length) return { resumed: false, reason: 'open-reports' };
  await rpc('hb_ops_ping', { p_email: 'system:verified-empty-report-queue' });
  await rpc('hb_sync_safety_time', {});
  // Re-evaluate after the update: an overdue report must still keep it paused.
  const paused = await rpc('hb_safety_paused', {});
  return { resumed: paused === false, reason: paused === false ? 'verified-empty-queue' : 'still-paused' };
}

export async function safetySnapshot(args, { database, rpc }) {
  const state = await rpc('hb_snapshot', args);
  if (!state?.safetyPaused) return state;
  const result = await checkEmptySafetyQueue({ database, rpc });
  return result.resumed ? rpc('hb_snapshot', args) : state;
}
