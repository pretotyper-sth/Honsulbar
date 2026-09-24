import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from './api';

const GATHER_TIMEOUT = 3000;
const RETRY_MS = 15000;

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
export function useMesh({ enabled, selfId, peerIds, stream, iceServers, gains }) {
  const peers = useRef(new Map());
  const context = useRef(null);
  const track = useRef(null);
  const gainValues = useRef({});
  const active = useRef(enabled);
  const [talking, setTalking] = useState([]);
  track.current = stream?.getAudioTracks()[0] || null;
  gainValues.current = gains;
  active.current = enabled;

  const audio = useCallback(() => {
    if (!context.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context.current = new AudioContext();
    }
    if (context.current.state === 'suspended') context.current.resume().catch(() => {});
    return context.current;
  }, []);

  const close = useCallback(id => {
    const peer = peers.current.get(id);
    if (!peer) return;
    clearTimeout(peer.retry);
    peer.pc.ontrack = null; peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.source?.disconnect(); peer.gain?.disconnect();
    if (peer.element) { peer.element.srcObject = null; }
    peers.current.delete(id);
  }, []);

  const create = useCallback((id, initiator) => {
    const pc = new RTCPeerConnection({ iceServers });
    const peer = { id, pc, initiator };
    if (initiator) peer.transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.ontrack = event => {
      const remote = event.streams[0] || new MediaStream([event.track]);
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
      peer.gain.connect(ctx.destination);
    };
    peers.current.set(id, peer);
    return peer;
  }, [iceServers, audio]);

  const describe = useCallback(async peer => {
    await waitForIce(peer.pc);
    if (peers.current.get(peer.id) !== peer || !peer.pc.localDescription) return;
    const { type, sdp } = peer.pc.localDescription;
    await call('signal', { targetId: peer.id, signal: { type, sdp, session: peer.session } });
  }, []);

  const offer = useCallback(async id => {
    close(id);
    if (!active.current) return;
    const peer = create(id, true);
    peer.session = crypto.randomUUID();
    try {
      await peer.transceiver.sender.replaceTrack(track.current);
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await describe(peer);
    } catch {}
    peer.retry = setTimeout(() => {
      if (peers.current.get(id) === peer && peer.pc.connectionState !== 'connected') offer(id);
    }, RETRY_MS);
    peer.pc.onconnectionstatechange = () => {
      if (peer.pc.connectionState === 'failed' && peers.current.get(id) === peer) offer(id);
    };
  }, [close, create, describe]);

  const receive = useCallback(async signals => {
    for (const { sender, data } of signals || []) {
      if (!active.current || !data?.sdp) continue;
      try {
        if (data.type === 'offer') {
          close(sender);
          const peer = create(sender, false);
          peer.session = data.session;
          await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          peer.transceiver = peer.pc.getTransceivers()[0];
          if (peer.transceiver) { peer.transceiver.direction = 'sendrecv'; await peer.transceiver.sender.replaceTrack(track.current); }
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          await describe(peer);
        } else if (data.type === 'answer') {
          const peer = peers.current.get(sender);
          if (peer?.session === data.session && peer.pc.signalingState === 'have-local-offer') await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        }
      } catch {}
    }
  }, [close, create, describe]);

  const peerKey = [...peerIds].sort().join(',');
  useEffect(() => {
    if (!enabled || !selfId) { [...peers.current.keys()].forEach(close); return; }
    const wanted = new Set(peerIds);
    for (const id of [...peers.current.keys()]) if (!wanted.has(id)) close(id);
    for (const id of wanted) if (!peers.current.has(id) && selfId < id) offer(id);
  }, [enabled, selfId, peerKey]);

  useEffect(() => () => { [...peers.current.keys()].forEach(close); context.current?.close().catch(() => {}); }, [close]);

  useEffect(() => {
    for (const peer of peers.current.values()) peer.transceiver?.sender.replaceTrack(track.current).catch(() => {});
  }, [stream]);

  useEffect(() => {
    const ctx = context.current;
    for (const [id, peer] of peers.current) if (peer.gain && ctx) peer.gain.gain.setTargetAtTime(gains[id] ?? 0, ctx.currentTime, 0.08);
  }, [JSON.stringify(gains)]);

  useEffect(() => {
    if (!enabled) { setTalking([]); return undefined; }
    const buffer = new Float32Array(512);
    const timer = setInterval(() => {
      const next = [];
      for (const [id, peer] of peers.current) {
        if (!peer.analyser) continue;
        peer.analyser.getFloatTimeDomainData(buffer);
        const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
        if (rms > 0.02) next.push(id);
      }
      setTalking(previous => (previous.join() === next.join() ? previous : next));
    }, 200);
    return () => clearInterval(timer);
  }, [enabled]);

  return { receive, talking, resume: audio };
}
