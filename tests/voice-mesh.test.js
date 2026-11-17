import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/useMesh.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '').replace('export function', 'function');
const mic = { readyState:'live' };
const stream = { getAudioTracks:()=>[mic] };

function harness(selfId, otherId) {
  const connections = [], sent = [], refs = [], dependencies = [];
  const timers = new Map();
  let next = 0, effects = [], failAttach = false, sessionId = 0, timerId = 0;
  class PeerConnection {
    iceGatheringState = 'complete';
    signalingState = 'stable';
    connectionState = 'connected';
    constructor() { connections.push(this); }
    addTransceiver(track, options) {
      const sender = {
        track:track==='audio'?null:track,
        replaceTrack:async nextTrack=>{
          if (failAttach && nextTrack) throw new Error('Cannot replace track');
          sender.track=nextTrack;
        },
      };
      this.options=options;
      this.audio={sender,receiver:{track:{kind:'audio'}},currentDirection:'sendrecv'};
      return this.audio;
    }
    getTransceivers() { return this.audio ? [this.audio] : []; }
    async setRemoteDescription(description) {
      if (description.type==='offer' && !this.audio) this.addTransceiver('audio');
      this.remoteDescription=description;
      this.signalingState=description.type==='offer'?'have-remote-offer':'stable';
    }
    async setLocalDescription(description) {
      this.localDescription=description;
      this.signalingState=description.type==='offer'?'have-local-offer':'stable';
    }
    async createOffer(options) {
      this.offerOptions=options;
      return {type:'offer',sdp:'offer SDP'};
    }
    async createAnswer() { return {type:'answer',sdp:'answer SDP'}; }
    async addIceCandidate(candidate) { this.receivedCandidates ??= [];this.receivedCandidates.push(candidate); }
    close() { this.signalingState='closed'; }
  }
  const env={
    useRef:value=> (refs[next] ?? (refs[next]={current:value})) && refs[next++],
    useState:value=>[value,()=>{}],
    useCallback:callback=>callback,
    useEffect:(effect,deps)=>{
      const index=next++;
      const previous=dependencies[index];
      if (!previous || deps.some((value,i)=>value!==previous[i])) effects.push(effect);
      dependencies[index]=deps;
    },
    RTCPeerConnection:PeerConnection,crypto:{randomUUID:()=>String(++sessionId)},
    call:async (_action,data)=>sent.push(data.signal),
    setTimeout:(callback, delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;},
    clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},
    document:{addEventListener(){},removeEventListener(){}},
  };
  vm.createContext(env);
  vm.runInContext(source,env);
  return {
    connections,sent,timers,failAttach:()=>{failAttach=true;},
    render(localStream) {
      next=0;effects=[];
      const mesh=env.useMesh({enabled:true,selfId,peerIds:[otherId],stream:localStream,iceServers:[],gains:{}});
      effects.forEach(effect=>effect());
      return mesh;
    },
  };
}

test('a microphone already on is attached when the new peer offer is created', async () => {
  const fixture = harness('a','b');
  fixture.render(stream);
  await new Promise(setImmediate);
  assert.equal(fixture.connections[0].audio.sender.track,mic);
  assert.equal(fixture.connections[0].options.streams[0],stream);
  assert.equal(fixture.sent[0].type,'offer');
});

test('the receiving side explicitly requests a fresh offer if a late microphone cannot attach', async () => {
  const fixture = harness('b','a');
  const mesh = fixture.render(null);
  await mesh.receive([{sender:'a',data:{type:'offer',sdp:'offer SDP',session:'link'}}]);
  assert.equal(fixture.connections[0].audio.sender.track,null);
  fixture.failAttach();
  fixture.render(stream);
  await new Promise(setImmediate);
  assert.equal(fixture.sent.at(-1).type,'retry-audio');
  assert.equal(fixture.sent.at(-1).session,'link');
});

test('a brief disconnect keeps the peer and a sustained disconnect restarts ICE in place', async () => {
  const fixture=harness('a','b');
  const mesh=fixture.render(stream);
  await new Promise(setImmediate);
  const peer=fixture.connections[0];
  const session=fixture.sent[0].session;
  await mesh.receive([{sender:'b',data:{type:'answer',sdp:'answer SDP',session}}]);
  peer.connectionState='disconnected';
  peer.onconnectionstatechange();
  assert.equal([...fixture.timers.values()][0].delay,1800);
  peer.connectionState='connected';
  peer.onconnectionstatechange();
  assert.equal(fixture.timers.size,0);
  peer.connectionState='disconnected';
  peer.onconnectionstatechange();
  await [...fixture.timers.values()][0].callback();
  assert.equal(fixture.connections.length,1);
  assert.equal(peer.offerOptions.iceRestart,true);
  assert.equal(fixture.sent.at(-1).session,session);
});

test('re-offering with the same session leaves the receiver peer in place', async () => {
  const fixture=harness('b','a');
  const mesh=fixture.render(stream);
  const offer=[{sender:'a',data:{type:'offer',sdp:'first offer',session:'existing'}}];
  await mesh.receive(offer);
  await mesh.receive([{sender:'a',data:{...offer[0].data,sdp:'ICE restart offer'}}]);
  assert.equal(fixture.connections.length,1);
  assert.equal(fixture.sent.filter(signal=>signal.type==='answer').length,2);
});

test('a disconnect detected only by the receiver can restart the same call', async () => {
  const caller = harness('a', 'b');
  const callee = harness('b', 'a');
  const calling = caller.render(stream);
  const answering = callee.render(stream);
  await new Promise(setImmediate);
  const [offer] = caller.sent;
  await answering.receive([{ sender:'a', data:offer }]);
  await calling.receive([{ sender:'b', data:callee.sent[0] }]);
  const remote = callee.connections[0];
  remote.connectionState = 'disconnected';
  remote.onconnectionstatechange();
  remote.connectionState = 'connected';
  remote.onconnectionstatechange();
  assert.equal(callee.timers.size, 0);
  remote.connectionState = 'failed';
  remote.onconnectionstatechange();
  await [...callee.timers.values()][0].callback();
  const request = callee.sent.at(-1);
  assert.equal(request.type, 'restart-ice');
  await calling.receive([{ sender:'b', data:{ ...request, session:'old' } }]);
  assert.equal(caller.sent.length, 1);
  await calling.receive([{ sender:'b', data:request }]);
  assert.equal(caller.connections.length, 1);
  assert.equal(caller.connections[0].offerOptions.iceRestart, true);
  assert.equal(caller.sent.at(-1).session, offer.session);
});

test('a TURN candidate that arrives after the offer is forwarded and applied to the active session',async()=>{
  const fixture=harness('a','b');
  fixture.render(stream);
  await new Promise(setImmediate);
  const offer=fixture.sent[0];
  const candidate={candidate:'candidate:relay',sdpMid:'0',sdpMLineIndex:0};
  fixture.connections[0].onicecandidate({candidate:{toJSON:()=>candidate}});
  const lateIce=fixture.sent.at(-1);
  assert.equal(lateIce.type,'ice-candidates');
  const remote=harness('b','a');
  const mesh=remote.render(stream);
  await mesh.receive([{sender:'a',data:offer},{sender:'a',data:lateIce}]);
  assert.equal(remote.connections[0].receivedCandidates[0],candidate);
});
