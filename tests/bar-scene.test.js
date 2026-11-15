import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarOutfit, avatarPose, barSeats, cameraPitch, firstPersonWalk, firstPersonVoice, paintBar, partnerFacing, seatWalk, swapWalk, walkCue, wrapFacing } from '../src/bar-scene.js';

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

test('first-person rotation wraps and moves voice gain and balance with the listener', () => {
  assert.equal(wrapFacing(190), -170);
  assert.equal(wrapFacing(-190), 170);
  assert.equal(cameraPitch(-1), -.58);
  assert.equal(cameraPitch(1), .14);
  const left = firstPersonVoice(5,4,0);
  const right = firstPersonVoice(5,6,0);
  assert.ok(left.pan < 0);
  assert.ok(right.pan > 0);
  assert.ok(firstPersonVoice(5,6,60).gain > firstPersonVoice(5,6,-60).gain);
  assert.ok(firstPersonVoice(5,4,-60).gain > firstPersonVoice(5,4,60).gain);
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
        assert.ok(distance <= .052, `seats ${from} to ${to} at ${now}ms`);
        if (distance > 1e-5) assert.ok((dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw)) / distance > .998);
        last = pose;
      }
    }
  }
});
