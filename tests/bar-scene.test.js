import assert from 'node:assert/strict';
import test from 'node:test';
import { barThemes } from '../src/bar-themes.js';
import { avatarOutfit, avatarPose, barSeats, cameraPitch, FIRST_PERSON_WALK_SPEED, flatFacingIndicator, firstPersonWalk, barVoice, paintBar, partnerFacing, seatWalk, swapWalk, walkCue, wrapFacing } from '../src/bar-scene.js';

test('walking sounds follow the steps and play one impact on sitting', () => {
  const walk = seatWalk(0, 5);
  const {start, end} = walk.legs[0];
  assert.equal(walkCue(walk, 0, start - 1), null);
  assert.equal(walkCue(walk, start - 1, start), 'step');
  assert.equal(walkCue(walk, start, start + 16), null);
  assert.equal(walkCue(walk, end - 1, end), null);
  assert.equal(walkCue(walk, walk.duration - 1, walk.duration), 'sit');
  assert.equal(walkCue(walk, walk.duration, walk.duration + 16), null);
});

test('a yielding guest remains clear of the other guest throughout every seat swap', () => {
  for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) {
    if (a === b) continue;
    const [first, yielding] = swapWalk(a, b);
    const [aside, resume] = yielding.legs;
    assert.deepEqual(avatarPose(a, yielding, aside.end).position, avatarPose(a, yielding, resume.start - 1).position);
    assert.equal(walkCue(yielding, aside.end, resume.start - 1), null);
    for (let time = 0; time < yielding.duration; time += 4) {
      const [x,z] = avatarPose(b, first, time).position;
      const [otherX,otherZ] = avatarPose(a, yielding, time).position;
      assert.ok(Math.hypot(x - otherX, z - otherZ) >= .93, `seats ${a} and ${b} at ${time}ms`);
    }
    assert.deepEqual(avatarPose(b, first, yielding.duration), avatarPose(b));
    assert.deepEqual(avatarPose(a, yielding, yielding.duration), avatarPose(a));
  }
});

test('seated avatars use the listener angle and distinct outfit palettes', () => {
  const angle = -Math.PI / 3;
  assert.equal(avatarPose(0, undefined, 0, angle).yaw, avatarPose(0).yaw + angle);
  assert.notDeepEqual(avatarOutfit('my-id', 'female'), avatarOutfit('my-id', 'male'));
});

const voiceAt = (from, to, degrees, firstPerson = false) =>
  barVoice({id:'me',seat:from},{id:'guest',seat:to},degrees,undefined,undefined,firstPerson);

test('rotation wraps and moves voice gain and balance with the first-person heading', () => {
  assert.equal(wrapFacing(190), -170);
  assert.equal(wrapFacing(-190), 170);
  assert.equal(cameraPitch(-1), -.58);
  assert.equal(cameraPitch(1), .14);
  const left = voiceAt(5,4,0,true);
  const right = voiceAt(5,6,0,true);
  assert.ok(left.pan < 0);
  assert.ok(right.pan > 0);
  assert.ok(voiceAt(5,6,60,true).gain > voiceAt(5,6,-60,true).gain);
  assert.ok(voiceAt(5,4,-60,true).gain > voiceAt(5,4,60,true).gain);
});

test('regular third-person seats retain the original gradual left and right focus', () => {
  assert.deepEqual(voiceAt(5,6,15), {gain:1,pan:0});
  assert.deepEqual(voiceAt(5,4,15), {gain:1 - .95 * 15 / 90,pan:0});
  assert.deepEqual(voiceAt(5,4,-15), {gain:1,pan:0});
  assert.deepEqual(voiceAt(5,6,-15), {gain:1 - .95 * 15 / 90,pan:0});
});

test('third-person rows stay aligned with equal spacing whether their seats are occupied or empty', () => {
  const gradient = {addColorStop(){}};
  const context = {
    createLinearGradient:()=>gradient, createRadialGradient:()=>gradient,
    fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, fill(){},
  };
  const pose = avatarPose(0);
  for (const [width,height] of [[288,330],[343,350],[448,420]]) {
    const points = paintBar(context,width,height,'third',[{id:'me',mine:true,seat:0,pose}],pose);
    const gap = points[1].top - points[0].top;
    for (let i = 0; i < 5; i++) {
      assert.ok(Math.abs(points[i].top - points[10-i].top) < 1e-8);
      if (i > 0) assert.ok(Math.abs(points[i].top - points[i-1].top - gap) < 1e-8);
    }
    assert.ok(points[0].depth > points[5].depth);
  }
});

test('the host arrow points toward the louder seat in 2D and the third-person projection', () => {
  const gradient = {addColorStop(){}};
  const context = {createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}};
  assert.equal(voiceAt(11,3,0).gain, voiceAt(11,7,0).gain);
  for (const [degrees, near, far] of [[60,3,7],[-60,7,3]]) {
    const pose = avatarPose(11,undefined,0,-degrees * Math.PI / 180);
    const points = paintBar(context,343,350,'third',[{id:'me',mine:true,seat:11,pose}],pose);
    const direction = Math.sign(points[near].left - points[11].left);
    assert.equal(Math.sign(Math.sin(points[11].facingAngle * Math.PI / 180)),direction);
    assert.equal(Math.sign(Math.sin(flatFacingIndicator(11,degrees) * Math.PI / 180)),direction);
    assert.equal(voiceAt(11,near,degrees).gain, 1);
    assert.ok(Math.abs(voiceAt(11,far,degrees).gain - (1 - .95 * 60 / 90)) < 1e-8);
    assert.equal(voiceAt(11,5,degrees).gain, 1);
  }
});

test('bar themes add distinct decor and ambient motion without moving seat markers', () => {
  const context = {canvas:{width:343,height:350},clearRect(){},fillRect(){},createRadialGradient:()=>({addColorStop(){}})};
  const pose = avatarPose(0);
  const sceneFor = (theme, time = 0) => {
    let geometry;
    const renderer = {draw(faces){ geometry = faces.map(face=>face.points); return true; }};
    const points = paintBar(context,343,350,'third',[{id:'me',mine:true,seat:0,pose}],pose,undefined,renderer,theme,time);
    return {geometry, points};
  };
  const original = sceneFor(barThemes[0]);
  const settings = barThemes.slice(1).map(theme=>sceneFor(theme));
  for (const setting of settings) {
    assert.deepEqual(setting.points,original.points);
    assert.notDeepEqual(setting.geometry,original.geometry);
  }
  assert.equal(new Set(settings.map(setting=>JSON.stringify(setting.geometry))).size,settings.length);
  for (const theme of barThemes) {
    const before = sceneFor(theme);
    const after = sceneFor(theme,1900);
    assert.deepEqual(before.points,after.points);
    if (theme.id === 'holiday') assert.notDeepEqual(before.geometry,after.geometry);
    else assert.deepEqual(before.geometry,after.geometry);
  }
});

test('chairs away from the far end turn 45 degrees toward their 1:1 partner', () => {
  for (let seat = 1; seat < 9; seat++) {
    for (const [listener, partner] of [[seat, seat + 1], [seat + 1, seat]]) {
      const [x,z] = barSeats[listener];
      const toward = Math.atan2(barSeats[partner][0] - x, barSeats[partner][1] - z);
      const angle = partnerFacing(listener,partner);
      const baseYaw = avatarPose(listener).yaw;
      const turnedYaw = avatarPose(listener, undefined, 0, -angle * Math.PI / 180).yaw;
      assert.equal(Math.abs(angle), 45);
      assert.ok(Math.cos(turnedYaw - toward) > Math.cos(baseYaw - toward));
    }
  }
});

test('both far-end pairs face inward on absolute diagonals during 1:1', () => {
  for (const [seat, partner, diagonal] of [[0,1,45],[1,0,135],[9,10,-135],[10,9,-45]]) {
    const angle = partnerFacing(seat,partner);
    const yaw = avatarPose(seat, undefined, 0, -angle * Math.PI / 180).yaw * 180 / Math.PI;
    assert.ok(Math.abs(yaw - diagonal) < .5, `seat ${seat + 1} should face ${diagonal}°, got ${yaw}°`);
  }
});

test('the third-person drink sits on the same right side as the first-person glass', () => {
  const context = {canvas:{width:343,height:350},clearRect(){},fillRect(){},createRadialGradient:()=>({addColorStop(){}})};
  const pose = avatarPose(11);
  const person = {id:'me',mine:true,seat:11,pose,drinkId:'highball',seconds:600};
  let glass;
  const renderer = {draw(faces){ glass = faces.filter(face=>face.color==='#ddb76d'); return true; }};
  paintBar(context,343,350,'third',[person],pose,undefined,renderer);
  assert.ok(glass.length > 0);
  const [x,z] = pose.position;
  const localSides = glass.flatMap(face=>face.points.map(([px,,pz])=>(px-x)*Math.cos(pose.yaw)-(pz-z)*Math.sin(pose.yaw)));
  assert.ok(localSides.every(side=>side < 0));
});

test('the renderer gets all world objects across rotations and the carried drink loses liquid with time', () => {
  let mesh;
  const renderer={draw(faces){mesh=faces;return true;}};
  const ctx={canvas:{width:343,height:330},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}};
  const render=(seconds,angle)=>{
    const pose=avatarPose(1,undefined,0,angle);
    const people=[{id:'me',mine:true,seat:1,pose},{id:'guest',seat:2,pose:avatarPose(2),drinkId:'wine',seconds}];
    paintBar(ctx,343,330,'first',people,pose,undefined,renderer);
    const liquid=mesh.filter(face=>face.color==='#b75c6b').flatMap(face=>face.points.map(point=>point[1]));
    return {count:mesh.length, height:liquid.length ? Math.max(...liquid)-Math.min(...liquid) : 0};
  };
  assert.deepEqual(render(900,0),render(900,Math.PI/3));
  assert.ok(render(900,0).height>render(300,0).height);
  assert.equal(render(0,0).height,0);
});

test('the first-person camera faces forward on straights and rounded chair approaches', () => {
  for (let from = 0; from < 12; from++) for (let to = 0; to < 12; to++) {
    if (from === to) continue;
    const [first, yielding] = swapWalk(to, from);
    const [starts, waits] = swapWalk(from, to);
    for (const [walk, other] of [[seatWalk(from, to)], [yielding, first], [starts, waits]]) {
      const timeline = firstPersonWalk(to, walk, avatarPose(from).yaw, 0);
      const cameraAt = time => {
        const {elapsed, yaw, position=avatarPose(to, walk, elapsed).position} = timeline.at(time);
        if (other) {
          const [x,z] = avatarPose(from, other, elapsed).position;
          assert.ok(Math.hypot(position[0] - x, position[1] - z) >= .93);
        }
        return {position, yaw};
      };
      assert.deepEqual(cameraAt(0).position, barSeats[from]);
      assert.deepEqual(cameraAt(timeline.duration), {position:barSeats[to], yaw:avatarPose(to).yaw});
      let last = cameraAt(0);
      for (let now = 8; now < timeline.duration + 8; now += 8) {
        const pose = cameraAt(now);
        const dx = pose.position[0] - last.position[0], dz = pose.position[1] - last.position[1];
        const distance = Math.hypot(dx, dz);
        assert.ok(Math.abs(wrapFacing((pose.yaw - last.yaw) * 180 / Math.PI)) < 3.0, `rotation from ${from} to ${to} at ${now}ms`);
        assert.ok(distance <= .060, `seats ${from} to ${to} at ${now}ms`);
        if (distance > 1e-5) assert.ok((dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw)) / distance > .998);
        last = pose;
      }
    }
  }
});

test('the accelerated first-person route reaches each footstep and the seat in half the time', () => {
  const walk = seatWalk(0, 11);
  const yaw = avatarPose(0).yaw;
  const original = firstPersonWalk(11, walk, yaw, 0);
  const accelerated = firstPersonWalk(11, walk, yaw, 0, FIRST_PERSON_WALK_SPEED);
  assert.equal(accelerated.duration, original.duration / 2);
  const cues = [];
  for (let time = 2; time <= Math.ceil(original.duration / 2) * 2; time += 2) {
    const cue = walkCue(walk, original.at(time - 2).elapsed, original.at(time).elapsed, 125);
    const step = walkCue(walk, accelerated.at((time - 2) / 2).elapsed, accelerated.at(time / 2).elapsed, 125);
    assert.equal(step, cue);
    if (step) cues.push(step);
  }
  assert.ok(cues.includes('step'));
  assert.equal(cues.at(-1), 'sit');
  assert.equal(accelerated.at(accelerated.duration + 12).elapsed, walk.duration + 24);
});
