import { database, rpc } from '../server/platform.js';
import { checkEmptySafetyQueue } from '../server/safety-queue.js';

const result = await checkEmptySafetyQueue({ database, rpc });
const paused = await rpc('hb_safety_paused', {});
console.log(JSON.stringify({ ...result, safetyPaused: paused }));
