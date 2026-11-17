import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from './api';
import { positionsByDistance, sfuTrackIds } from './sfu-selection';

const EMPTY = [];
const KEEP_SPEAKER_MS = 1500;

export function useSfuVoice({ enabled, visitId, partnerId, stream, peerIds, guests, seat, gains, pans }) {
  const session = useRef(null);
  const context = useRef(null);
  const latest = useRef(null);
  const [talking, setTalking] = useState(EMPTY);
  const [connecting, setConnecting] = useState(false);
  latest.current = {stream,peerIds,guests,seat,gains,pans};

  const resume = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const ctx = context.current || (context.current = new AudioContext());
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setTalking(EMPTY);
      setConnecting(false);
      return;
    }
    let closed = false, retry, room;
    const playback = new Map();
    const recent = new Map();
    const subscriptions = new Set();

    function disconnectTrack(id) {
      const nodes = playback.get(id);
      if (!nodes) return;
      nodes.source.disconnect();
      nodes.gain.disconnect();
      nodes.pan?.disconnect();
      nodes.element.srcObject = null;
      playback.delete(id);
    }

    function applyVolumes() {
      for (const [id, nodes] of playback) {
        const {gains,pans} = latest.current;
        nodes.gain.gain.setTargetAtTime(gains[id] ?? 0, nodes.context.currentTime, .08);
        nodes.pan?.pan.setTargetAtTime(pans[id] ?? 0, nodes.context.currentTime, .08);
      }
    }

    function selectTracks() {
      if (closed || !room) return;
      const {gains,guests,seat,peerIds} = latest.current;
      const ordered = positionsByDistance(guests, peerIds, seat, gains);
      const selected = sfuTrackIds(ordered, recent, Date.now()-KEEP_SPEAKER_MS, partnerId);
      subscriptions.clear();
      for (const id of selected) subscriptions.add(id);
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.audioTrackPublications.values()) {
          const wanted = subscriptions.has(participant.identity);
          if (wanted !== publication.isDesired) publication.setSubscribed(wanted);
        }
      }
      const audible = room.activeSpeakers.map(person => person.identity).filter(id => subscriptions.has(id));
      setTalking(previous => previous.join() === audible.join() ? previous : audible);
    }

    async function connect() {
      if (closed) return;
      setConnecting(true);
      try {
        const [sdk,{result}] = await Promise.all([
          import('livekit-client'),
          call('voice-sfu',{visitId,partnerId}),
        ]);
        if (closed) return;
        const {Room,RoomEvent,Track} = sdk;
        room = new Room({disconnectOnPageLeave:true});
        const current = {room,source:null,published:null,work:Promise.resolve()};
        session.current = current;

        current.refresh = () => {
          if (closed || !current.connected) return;
          const ids = latest.current.peerIds;
          const permissionKey = ids.join(',');
          if (current.permissionKey !== permissionKey) {
            room.localParticipant.setTrackSubscriptionPermissions(false, ids.map(participantIdentity => ({participantIdentity,allowAll:true})));
            current.permissionKey = permissionKey;
          }
          const applyMicrophone = async () => {
            if (closed || !current.connected) return;
            const next = latest.current.stream?.getAudioTracks().find(track=>track.readyState==='live') || null;
            if (next === current.source) return;
            if (current.published) {
              const previous = current.published;
              previous.stop();
              current.published = null;
              current.source = null;
              await room.localParticipant.unpublishTrack(previous,false);
            }
            if (closed || !next || next.readyState !== 'live') return;
            const clone = next.clone();
            current.published = clone;
            try {
              await room.localParticipant.publishTrack(clone,{source:Track.Source.Microphone,dtx:true,audioPreset:{maxBitrate:32000}});
              if (!closed) current.source = next;
            } catch {
              clone.stop();
              current.published = null;
              if (!closed) setConnecting(true);
            }
          };
          current.work = current.work.then(applyMicrophone).catch(()=>{});
          selectTracks();
          applyVolumes();
        };

        room.on(RoomEvent.TrackSubscribed,(track,_publication,participant)=>{
          if (closed || track.kind !== Track.Kind.Audio) return;
          const ctx = resume();
          if (!ctx) return;
          const id = participant.identity;
          disconnectTrack(id);
          const remote = new MediaStream([track.mediaStreamTrack]);
          const element = new Audio();
          element.muted = true;
          element.srcObject = remote;
          element.play().catch(()=>{});
          const source = ctx.createMediaStreamSource(remote);
          const gain = ctx.createGain();
          gain.gain.value = latest.current.gains[id] ?? 0;
          const pan = ctx.createStereoPanner?.();
          source.connect(gain);
          if (pan) {
            pan.pan.value = latest.current.pans[id] ?? 0;
            gain.connect(pan);
            pan.connect(ctx.destination);
          } else gain.connect(ctx.destination);
          playback.set(id,{track,context:ctx,source,gain,pan,element});
        });
        room.on(RoomEvent.TrackUnsubscribed,(track,_publication,participant)=>{
          if (playback.get(participant.identity)?.track === track) disconnectTrack(participant.identity);
        });
        room.on(RoomEvent.TrackPublished,selectTracks);
        room.on(RoomEvent.ActiveSpeakersChanged,people=>{
          const now = Date.now();
          for (const person of people) recent.set(person.identity,now);
          selectTracks();
        });
        room.on(RoomEvent.Reconnecting,()=>{
          if (!closed) setConnecting(true);
        });
        room.on(RoomEvent.Reconnected,()=>{
          if (closed) return;
          setConnecting(false);
          current.permissionKey = null;
          current.refresh();
        });
        room.on(RoomEvent.Disconnected,()=>{
          if (closed || !current.connected) return;
          current.connected = false;
          current.published?.stop();
          for (const id of playback.keys()) disconnectTrack(id);
          setTalking(EMPTY);
          setConnecting(true);
          retry = setTimeout(connect,1500);
        });
        await room.connect(result.url,result.token,{autoSubscribe:false});
        if (closed) {
          await room.disconnect();
          return;
        }
        current.connected = true;
        current.refresh();
        setConnecting(false);
      } catch (error) {
        await room?.disconnect().catch(()=>{});
        if (closed) return;
        if (error.status === 403 || error.status === 503) return;
        retry = setTimeout(connect,1500);
      }
    }
    connect();
    const cleanupTopics = setInterval(selectTracks, 1000);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(cleanupTopics);
      session.current?.published?.stop();
      session.current = null;
      for (const id of playback.keys()) disconnectTrack(id);
      room?.disconnect().catch(()=>{});
      setTalking(EMPTY);
    };
  }, [enabled,visitId,partnerId,resume]);

  const peersKey = peerIds.join(',');
  useEffect(() => { session.current?.refresh(); }, [peersKey,stream,seat,guests,gains,pans]);
  useEffect(() => () => { context.current?.close().catch(()=>{}); }, []);
  return {resume,talking,connecting};
}
