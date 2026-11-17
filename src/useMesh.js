import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from './api';
import { createVoiceBuffer, evidencePayload } from './voice-evidence';

const GATHER_TIMEOUT = 3000;
const RETRY_MS = 15000;
const DISCONNECT_GRACE_MS = 1800;
const isConnectionLost = pc => ['disconnected', 'failed'].includes(pc.connectionState);

function waitForIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); clearTimeout(timer); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, GATHER_TIMEOUT);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

// Full-mesh voice between guests in the same room. The member with the smaller id always offers,
// so both sides never create competing offers for the same pair.
export function useMesh({ enabled, selfId, peerIds, stream, iceServers, gains, pans = {}, evidenceEnabled = false, recordingEnabled = false }) {
  const peers = useRef(new Map());
  const context = useRef(null);
  const recording = useRef(null);
  const [recordingStream,setRecordingStream] = useState(null);
  const track = useRef(null);
  const localStream = useRef(null);
  const gainValues = useRef({});
  const panValues = useRef({});
  const active = useRef(enabled);
  const wantedPeers = useRef(new Set(peerIds));
  const incomingSignals = useRef(new Map());
  wantedPeers.current = new Set(peerIds);
  const [talking, setTalking] = useState([]);
  const [reconnecting, setReconnecting] = useState([]);
  track.current = stream?.getAudioTracks().find(item => item.readyState === 'live') || null;
  localStream.current = stream;
  gainValues.current = gains;
  panValues.current = pans;
  active.current = enabled;

  const flushCandidates = useCallback(peer => {
    const ice = peer.lateIce;
    if (!ice?.announced || !ice.pending.length || !active.current ||
        peers.current.get(peer.id) !== peer || !wantedPeers.current.has(peer.id)) return;
    call('signal', {targetId:peer.id,signal:{type:'ice-candidates',session:peer.session,candidates:ice.pending.splice(0)}}).catch(() => {});
  }, []);

  const audio = useCallback(() => {
    if (!context.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context.current = new AudioContext();

    }
    if (recordingEnabled && !recording.current) {
      recording.current = context.current.createMediaStreamDestination();
      setRecordingStream(recording.current.stream);
    }
    if (context.current.state === 'suspended' || context.current.state === 'interrupted') context.current.resume().catch(() => {});
    return context.current;
  }, []);

  const close = useCallback(id => {
    const peer = peers.current.get(id);
    if (!peer) return;
    clearTimeout(peer.retry);
    peer.pc.ontrack = null; peer.pc.onconnectionstatechange = null; peer.pc.onicecandidate = null;
    peer.pc.close();
    if (peer.capture) { peer.capture.onaudioprocess = null; peer.capture.disconnect(); }
    peer.evidence?.clear();
    peer.source?.disconnect(); peer.gain?.disconnect(); peer.pan?.disconnect();
    if (peer.element) { peer.element.srcObject = null; }
    peers.current.delete(id);
  }, []);

  const create = useCallback((id, initiator) => {
    const pc = new RTCPeerConnection({ iceServers });
    const peer = { id, pc, initiator };
    if (!initiator) {
      const requestRestart = async () => {
        if (!active.current || peers.current.get(id) !== peer ||
            !wantedPeers.current.has(id) || !isConnectionLost(pc)) return;
        await call('signal', {targetId:id, signal:{type:'restart-ice', session:peer.session}}).catch(() => {});
        if (peers.current.get(id) === peer && isConnectionLost(pc)) {
          clearTimeout(peer.retry);
          peer.retry = setTimeout(requestRestart, RETRY_MS);
        }
      };
      pc.onconnectionstatechange = () => {
        clearTimeout(peer.retry);
        if (isConnectionLost(pc)) {
          peer.retry = setTimeout(requestRestart, pc.connectionState === 'failed' ? 500 : DISCONNECT_GRACE_MS + 500);
        }
      };
    }
    if (initiator) peer.transceiver = pc.addTransceiver(track.current ?? 'audio', {
      direction: 'sendrecv',
      ...(track.current ? {streams: [localStream.current]} : {}),
    });
    pc.onicecandidate = event => {
      if (!event.candidate || !peer.lateIce) return;
      peer.lateIce.pending.push(event.candidate.toJSON());
      flushCandidates(peer);
    };
    pc.ontrack = event => {
      const remote = new MediaStream([event.track]);
      const ctx = audio();
      peer.element = new Audio();
      peer.element.muted = true;
      peer.element.srcObject = remote;
      peer.element.play().catch(() => {});
      peer.source = ctx.createMediaStreamSource(remote);
      peer.gain = ctx.createGain();
      peer.gain.gain.value = gainValues.current[id] ?? 0;
      peer.analyser = ctx.createAnalyser();
      peer.analyser.fftSize = 512;
      peer.source.connect(peer.analyser);
      peer.source.connect(peer.gain);
      if (ctx.createStereoPanner) {
        peer.pan = ctx.createStereoPanner();
        peer.pan.pan.value = panValues.current[id] ?? 0;
        peer.gain.connect(peer.pan);
        peer.pan.connect(ctx.destination);
      } else peer.gain.connect(ctx.destination);
      if (recording.current) peer.gain.connect(recording.current);
      if (evidenceEnabled) {
        peer.evidence = createVoiceBuffer();
        // Capture only this peer's audible output. Zero output avoids a second playback path.
        peer.capture = ctx.createScriptProcessor(4096, 1, 1);
        peer.capture.onaudioprocess = event => {
          event.outputBuffer.getChannelData(0).fill(0);
          if (document.hidden || !(gainValues.current[id] > 0)) { peer.evidence.clear(); return; }
          peer.evidence.append(event.inputBuffer.getChannelData(0), event.inputBuffer.sampleRate);
          peer.lastSampleAt = Date.now();
        };
        peer.gain.connect(peer.capture); peer.capture.connect(ctx.destination);
      }
    };
    peers.current.set(id, peer);
    return peer;
  }, [iceServers, audio, evidenceEnabled, flushCandidates]);

  const describe = useCallback(async peer => {
    await waitForIce(peer.pc);
    if (!active.current || !wantedPeers.current.has(peer.id) || peers.current.get(peer.id) !== peer || !peer.pc.localDescription) return;
    const { type, sdp } = peer.pc.localDescription;
    const ice = {announced:false,pending:[]};
    peer.lateIce = ice;
    await call('signal', { targetId: peer.id, signal: { type, sdp, session: peer.session } });
    ice.announced = true;
    if (peer.lateIce === ice) flushCandidates(peer);
  }, [flushCandidates]);

  const offer = useCallback((id, recoveredOffer = false) => {
    close(id);
    if (!active.current || !wantedPeers.current.has(id)) return;
    const peer = create(id, true);
    peer.recoveredOffer = recoveredOffer;
    peer.session = crypto.randomUUID();
    const isCurrent = () => active.current && wantedPeers.current.has(id) && peers.current.get(id) === peer;
    const schedule = (delay = RETRY_MS) => {
      clearTimeout(peer.retry);
      if (!isCurrent() || peer.pc.connectionState === 'connected') return;
      peer.retry = setTimeout(() => sendOffer(true), delay);
    };
    async function sendOffer(iceRestart, requestedByPeer = false) {
      if (!isCurrent() || peer.offering) return;
      if (iceRestart && !requestedByPeer && peer.pc.connectionState === 'connected') return;
      peer.offering = true;
      try {
        if (peer.pc.signalingState === 'stable') {
          peer.lateIce = null;
          await peer.pc.setLocalDescription(await peer.pc.createOffer(iceRestart ? {iceRestart:true} : undefined));
        }
        await describe(peer);
      } catch {}
      finally { peer.offering = false; schedule(); }
    }
    peer.pc.onconnectionstatechange = () => {
      const state = peer.pc.connectionState;
      schedule(state === 'failed' ? 200 : state === 'disconnected' ? DISCONNECT_GRACE_MS : RETRY_MS);
    };
    peer.scheduleRetry = schedule;
    peer.restartIce = () => sendOffer(true, true);
    return sendOffer(false);
  }, [close, create, describe]);

  const restoreAudio = useCallback(peer => {
    if (!track.current || !active.current || !wantedPeers.current.has(peer.id) ||
        peers.current.get(peer.id) !== peer || peer.audioRecovery) return;
    peer.audioRecovery = true;
    if (peer.initiator && !peer.recoveredOffer) offer(peer.id, true);
    else if (!peer.initiator) {
      call('signal', {targetId: peer.id, signal: {type: 'retry-audio', session: peer.session}}).catch(() => {
        peer.audioRecovery = false;
      });
    }
  }, [offer]);

  const syncAudioTrack = useCallback(async peer => {
    const transceiver = peer.transceiver;
    if (!transceiver || peers.current.get(peer.id) !== peer) return;
    const next = track.current;
    try {
      if (transceiver.sender.track !== next) await transceiver.sender.replaceTrack(next);
      if (next !== track.current || !next) return;
      if (peer.pc.signalingState === 'stable' &&
          (transceiver.currentDirection === 'recvonly' || transceiver.currentDirection === 'inactive')) restoreAudio(peer);
    } catch {
      if (next === track.current) restoreAudio(peer);
    }
  }, [restoreAudio]);

  const receive = useCallback(signals => Promise.all((signals || []).map(({ sender, data }) => {
    const queues = incomingSignals.current;
    const work = (queues.get(sender) ?? Promise.resolve()).then(async () => {
      if (!active.current || !wantedPeers.current.has(sender) || !data) return;
      let peer = peers.current.get(sender);
      if (data.type === 'restart-ice') {
        if (peer?.initiator && peer.session === data.session) await peer.restartIce();
        return;
      }
      if (data.type === 'retry-audio') {
        if (peer?.initiator && peer.session === data.session && !peer.recoveredOffer) offer(sender, true);
        return;
      }
      if (data.type === 'ice-candidates') {
        if (peer?.session === data.session && peer.pc.remoteDescription && Array.isArray(data.candidates)) {
          for (const candidate of data.candidates.slice(0,12)) {
            try { await peer.pc.addIceCandidate(candidate); } catch {}
          }
        }
        return;
      }
      if (!data.sdp) return;
      try {
        if (data.type === 'offer') {
          if (!peer || peer.initiator || peer.session !== data.session) {
            close(sender);
            peer = create(sender, false);
            peer.session = data.session;
          }
          await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          peer.transceiver = peer.pc.getTransceivers().find(item => item.receiver.track.kind === 'audio');
          if (peer.transceiver) {
            peer.transceiver.direction = 'sendrecv';
            await syncAudioTrack(peer);
          }
          peer.lateIce = null;
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          await describe(peer);
          await syncAudioTrack(peer);
        } else if (data.type === 'answer' && peer?.session === data.session && peer.pc.signalingState === 'have-local-offer') {
          await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await syncAudioTrack(peer);
        }
      } catch {}
    }).finally(() => {
      if (queues.get(sender) === work) queues.delete(sender);
    });
    queues.set(sender, work);
    return work;
  })), [close, create, describe, offer, syncAudioTrack]);

  const peerKey = [...peerIds].sort().join(',');
  useEffect(() => {
    if (!enabled || !selfId) { [...peers.current.keys()].forEach(close); return; }
    const wanted = new Set(peerIds);
    for (const id of [...peers.current.keys()]) if (!wanted.has(id)) close(id);
    for (const id of wanted) if (!peers.current.has(id) && selfId < id) offer(id);
  }, [enabled, selfId, peerKey, evidenceEnabled]);

  useEffect(() => {
    const clear = () => { if(document.hidden) for(const peer of peers.current.values())peer.evidence?.clear(); };
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);

  useEffect(() => () => { [...peers.current.keys()].forEach(close); context.current?.close().catch(() => {}); }, [close]);

  useEffect(() => {
    for (const peer of peers.current.values()) syncAudioTrack(peer);
  }, [stream, syncAudioTrack]);

  useEffect(() => {
    for (const peer of peers.current.values()) {
      try {
        peer.pc.setConfiguration({...peer.pc.getConfiguration(),iceServers});
        if (peer.pc.connectionState !== 'connected' && peer.pc.signalingState === 'stable') peer.scheduleRetry?.(200);
      } catch {}
    }
  }, [iceServers]);

  useEffect(() => {
    const ctx = context.current;
    for (const [id, peer] of peers.current) {
      if (!(gains[id] > 0)) peer.evidence?.clear();
      if (peer.gain && ctx) peer.gain.gain.setTargetAtTime(gains[id] ?? 0, ctx.currentTime, 0.08);
      if (peer.pan && ctx) peer.pan.pan.setTargetAtTime(pans[id] ?? 0, ctx.currentTime, 0.08);
    }
  }, [JSON.stringify(gains), JSON.stringify(pans)]);

  useEffect(() => {
    if (!enabled) { setTalking([]);setReconnecting([]);return undefined; }
    const buffer = new Float32Array(512);
    const timer = setInterval(() => {
      if (document.hidden) return;
      const next = [];
      const recovering = [];
      const now = Date.now();
      for (const [id, peer] of peers.current) {
        if (peer.pc.connectionState === 'connected') peer.wasConnected = true;
        else if (peer.wasConnected && ['disconnected','failed','connecting'].includes(peer.pc.connectionState)) recovering.push(id);
        if (!peer.analyser) continue;
        const sampleInterval = gainValues.current[id] > 0 ? 250 : 500;
        if (now - (peer.lastVoiceSample ?? 0) < sampleInterval - 20) {
          if (now - (peer.lastVoiceAt ?? 0) < 550) next.push(id);
          continue;
        }
        peer.lastVoiceSample = now;
        peer.analyser.getFloatTimeDomainData(buffer);
        const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
        if (rms > 0.014) peer.lastVoiceAt = now;
        if (now - (peer.lastVoiceAt ?? 0) < 550) next.push(id);
      }
      setTalking(previous => (previous.join() === next.join() ? previous : next));
      setReconnecting(previous => (previous.join() === recovering.join() ? previous : recovering));
    }, 250);
    return () => clearInterval(timer);
  }, [enabled]);

  const evidenceFor = id => {
    const peer=peers.current.get(id);
    if(document.hidden || !enabled || !evidenceEnabled || !(gains[id]>0) || !peer?.lastSampleAt || Date.now()-peer.lastSampleAt>2000)return null;
    return evidencePayload(peer.evidence);
  };
  return { receive, talking, reconnecting, resume: audio, evidenceFor, recordingStream };
}
