import { SEATS, drinkLevel } from './social.js';
import { DRINKS, proximity } from './model.js';
import { barMaterials, barThemes } from './bar-themes.js';

const THIRD_EYE = [0, 10.4, 12.7];
const THIRD_PITCH = -.64;
const MARKER_HEIGHT = 1.59;
const AVATAR_BODY_WIDTH = .72;
const depthAt = z => (THIRD_EYE[2] - z) * Math.cos(THIRD_PITCH)
  + (MARKER_HEIGHT - THIRD_EYE[1]) * Math.sin(THIRD_PITCH);
const rearDepth = depthAt((SEATS[0][1] - 50) * .13);
const frontDepth = depthAt((SEATS[4][1] - 50) * .13);
export const barSeats = SEATS.map(([x, y], i) => {
  const row = Math.min(i, 10 - i);
  if (row < 1 || row > 3) return [(x - 50) * .13, (y - 50) * .13];
  // Uniform spacing on screen follows reciprocal depth under perspective.
  const depth = 1 / ((1 - row / 4) / rearDepth + (row / 4) / frontDepth);
  const z = THIRD_EYE[2] - (depth - (MARKER_HEIGHT - THIRD_EYE[1]) * Math.sin(THIRD_PITCH)) / Math.cos(THIRD_PITCH);
  return [(x - 50) * .13, z];
});
const TAU = Math.PI * 2;
const STAND_MS = 165;
const STEP_MS = 160;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const turnDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const walkProgress = (t, entersMoving, exitsMoving) => {
  const ramp = .2;
  const start = entersMoving ? .35 : 0;
  const end = exitsMoving ? .35 : 0;
  const area = 1 - ramp * (2 - start - end) / 2;
  if (t < ramp) return (start * t + (1 - start) * t * t / (2 * ramp)) / area;
  if (t > 1 - ramp) return 1 - (end * (1 - t) + (1 - end) * (1 - t) ** 2 / (2 * ramp)) / area;
  return (t - ramp * (1 - start) / 2) / area;
};
const facingBar = ([x, z]) => Math.atan2(-x, -.5 - z);
export const FIRST_PERSON_PITCH = -.23;
export const wrapFacing = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;
export const cameraPitch = value => clamp(value, -.58, .14);
const facingYaw = (position, degrees) => facingBar(position) - degrees * Math.PI / 180;

export function partnerFacing(seat, otherSeat) {
  const from = barSeats[seat], to = barSeats[otherSeat];
  if (!from || !to || seat === otherSeat) return 0;
  const pairStart = Math.min(seat, otherSeat);
  if (Math.abs(seat - otherSeat) === 1 && (pairStart === 0 || pairStart === 9)) {
    const diagonal = Math.atan2(-Math.sign(from[0]), Math.sign(to[1] - from[1]));
    return Math.round(wrapFacing((facingBar(from) - diagonal) * 180 / Math.PI));
  }
  const toward = Math.atan2(to[0] - from[0], to[1] - from[1]);
  return 45 * Math.sign(wrapFacing((facingBar(from) - toward) * 180 / Math.PI));
}

export function firstPersonVoice(listener, speaker, degrees) {
  const from = barSeats[listener], to = barSeats[speaker];
  if (!from || !to || listener === speaker) return {gain:0, pan:0};
  const relative = facingYaw(from,degrees) - Math.atan2(to[0]-from[0],to[1]-from[1]);
  const focus = (1 + Math.cos(relative)) / 2;
  return {gain: proximity(listener,speaker) * (.22 + .78 * focus), pan: .8 * Math.sin(relative)};
}

const outerSeat = index => {
  const [x,z] = barSeats[index];
  return [x * 1.29, Math.max(-5.95, z * 1.29)];
};

export function seatWalk(from, to) {
  const start = barSeats[from];
  const end = barSeats[to];
  const path = [start];
  if (from === 11 || to === 11) {
    const guestSeat = from === 11 ? to : from;
    const edge = guestSeat < 5 ? 0 : 10;
    const [x] = outerSeat(edge);
    const aisle = [[0, -5.96], [x, -5.96], outerSeat(edge)];
    for (let i = edge; i !== guestSeat;) {
      i += edge === 0 ? 1 : -1;
      aisle.push(outerSeat(i));
    }
    path.push(...(from === 11 ? aisle : aisle.reverse()));
  } else {
    const clockwise = (to - from + 11) % 11;
    const step = clockwise <= 5 ? 1 : -1;
    for (let i = from; i !== to; i = (i + step + 11) % 11) path.push(outerSeat(i));
    path.push(outerSeat(to));
  }
  path.push(end);
  const route = walkRoute(path);
  const duration = clamp(route.total * 110 + 420, 800, 1550);
  return { duration, legs:[{...route, start:STAND_MS, end:duration - STAND_MS}] };
}

function walkRoute(path) {
  const lengths = path.slice(1).map(([x,z], i) => Math.hypot(x - path[i][0], z - path[i][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return { path, lengths, total };
}

function distanceToRoute(point, route) {
  return Math.min(...route.lengths.map((length, i) => {
    const [x,z] = route.path[i];
    const dx = route.path[i + 1][0] - x;
    const dz = route.path[i + 1][1] - z;
    const t = length ? clamp(((point[0] - x) * dx + (point[1] - z) * dz) / (length * length), 0, 1) : 0;
    return Math.hypot(point[0] - x - dx * t, point[1] - z - dz * t);
  }));
}

// One guest steps aside before the other crosses. Both clients choose the same order.
export function swapWalk(firstSeat, yieldingSeat) {
  const first = seatWalk(firstSeat, yieldingSeat);
  const second = seatWalk(yieldingSeat, firstSeat);
  const [x,z] = barSeats[yieldingSeat];
  const radial = Math.hypot(x,z);
  const [dx,dz] = [x/radial,z/radial];
  const pockets = [-1,1].map(side => [x + .24*dx - side*1.16*dz, z + .24*dz + side*1.16*dx]);
  const wait = pockets.sort((a,b) => distanceToRoute(b,first.legs[0]) - distanceToRoute(a,first.legs[0]))[0];
  const aside = walkRoute([[x,z], wait]);
  const back = walkRoute([wait, ...second.legs[0].path.slice(1)]);
  const parkedAt = STAND_MS + 310;
  const firstEnds = parkedAt + first.duration;
  return [
    { duration:firstEnds, legs:[{...first.legs[0], start:first.legs[0].start + parkedAt, end:firstEnds - STAND_MS}] },
    { duration:firstEnds + second.duration - STAND_MS, legs:[
      {...aside, start:STAND_MS, end:parkedAt},
      {...back, start:firstEnds, end:firstEnds + second.duration - 2*STAND_MS},
    ] },
  ];
}

export function walkCue(walk, before, elapsed, stepMs = STEP_MS) {
  if (before < walk.duration && elapsed >= walk.duration) return 'sit';
  const leg = walk.legs.find(({start,end}) => elapsed >= start && elapsed < end);
  if (leg && Math.floor((elapsed - leg.start) / stepMs) > Math.floor((before - leg.start) / stepMs)) return 'step';
  return null;
}

export function avatarPose(seat, walk, elapsed, angle = 0, startAngle = angle) {
  const position = barSeats[seat];
  const rest = { position, rise: 0, stride: 0, yaw: facingBar(position) + angle };
  if (!walk || elapsed >= walk.duration) return rest;
  const first = walk.legs[0];
  if (elapsed < first.start) {
    const from = first.path[0];
    return { ...rest, position:from, yaw:facingBar(from) + startAngle, rise:clamp((elapsed - first.start + STAND_MS) / STAND_MS, 0, 1) };
  }
  if (elapsed >= walk.duration - STAND_MS) return { ...rest, rise: (walk.duration - elapsed) / STAND_MS };
  const leg = walk.legs.find(({end}) => elapsed < end);
  if (elapsed < leg.start) {
    const waiting = leg.path[0];
    return { ...rest, position:waiting, rise:1, yaw:facingBar(waiting) };
  }

  let distance = leg.total * (elapsed - leg.start) / (leg.end - leg.start);
  let segment = 0;
  while (segment < leg.lengths.length - 1 && distance >= leg.lengths[segment]) {
    distance -= leg.lengths[segment++];
  }
  const [x,z] = leg.path[segment];
  const [nextX,nextZ] = leg.path[segment + 1];
  const t = clamp(distance / leg.lengths[segment], 0, 1);
  return {
    position: [mix(x, nextX, t), mix(z, nextZ, t)],
    rise: 1,
    stride: Math.sin((elapsed - leg.start) * Math.PI / STEP_MS),
    yaw: Math.atan2(nextX - x, nextZ - z),
  };
}

export function firstPersonWalk(seat, walk, startYaw, endAngle) {
  const phases = [];
  let duration = 0, elapsed = 0, yaw = startYaw;
  function phase(to, nextYaw, length = 0, corner = null) {
    const delta = turnDelta(yaw, nextYaw);
    const ms = Math.max((to - elapsed) * 1.45, length * 172, Math.abs(delta) * (corner ? 420 : 320));
    if (!ms) return;
    phases.push({start:duration, end:duration + ms, from:elapsed, to, yaw, delta, walking:length > 0, corner});
    duration += ms;
    elapsed = to;
    yaw += delta;
  }
  for (const leg of walk.legs) {
    const runs = [];
    leg.lengths.forEach((length, i) => {
      if (!length) return;
      const [x,z] = leg.path[i];
      const [nextX,nextZ] = leg.path[i + 1];
      const heading = Math.atan2(nextX - x, nextZ - z);
      const previous = runs.at(-1);
      if (previous && Math.abs(turnDelta(previous.heading, heading)) < 1e-8) previous.length += length;
      else runs.push({heading, length, start:leg.path[i]});
    });
    if (leg !== walk.legs[0]) phase(leg.start, yaw);
    let end = leg.start;
    const msPerUnit = (leg.end - leg.start) / leg.total;
    const incoming = runs.at(-2), approach = runs.at(-1);
    const round = leg === walk.legs.at(-1) && incoming
      ? Math.min(.48, incoming.length / 3, approach.length / 2)
      : 0;
    for (const [index, {heading, length}] of runs.entries()) {
      const last = index === runs.length - 1;
      if (last && round) phase(end + round * msPerUnit, heading, round * 2, {point:approach.start, radius:round});
      else phase(end, heading);
      end = last ? leg.end : end + msPerUnit * length;
      const trim = round && (last || index === runs.length - 2) ? round : 0;
      phase(last ? end : end - trim * msPerUnit, heading, length - trim);
      if (trim) phases.at(-1)[last ? 'entersMoving' : 'exitsMoving'] = true;
    }
  }
  const endYaw = avatarPose(seat, undefined, 0, endAngle).yaw;
  phase(walk.duration, endYaw);
  return {
    duration,
    at(time) {
      if (time <= 0) return {elapsed:time, yaw:startYaw};
      if (time >= duration) return {elapsed:walk.duration + (time - duration), yaw:endYaw};
      const {start, end, from, to, yaw, delta, walking, corner, entersMoving, exitsMoving} = phases.find(({end}) => time < end);
      const t = (time - start) / (end - start);
      const smooth = t * t * (3 - 2 * t);
      if (corner) {
        const before = [Math.sin(yaw), Math.cos(yaw)];
        const after = [Math.sin(yaw + delta), Math.cos(yaw + delta)];
        const tangent = before.map((value, i) => mix(value, after[i], t));
        return {
          elapsed:mix(from, to, t),
          yaw:Math.atan2(...tangent),
          position:corner.point.map((value, i) => value + corner.radius * (after[i] * t ** 2 - before[i] * (1 - t) ** 2)),
        };
      }
      return {elapsed:mix(from, to, walking ? walkProgress(t, entersMoving, exitsMoving) : smooth), yaw:yaw + delta * smooth};
    },
  };
}

function box(faces, x, y, z, width, height, depth, palette, yaw = 0) {
  const points = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
  ].map(([dx,dy,dz]) => {
    const px = dx * width / 2;
    const pz = dz * depth / 2;
    return [x + px * Math.cos(yaw) + pz * Math.sin(yaw), y + dy * height / 2, z - px * Math.sin(yaw) + pz * Math.cos(yaw)];
  });
  const sides = [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
  sides.forEach((side, index) => {
    faces.push({ points: side.map(i => points[i]), color: palette[index === 4 ? 0 : index === 1 || index === 2 ? 1 : 2] });
  });
}

function rounded(faces, x, y, z, width, height, depth, colors, yaw = 0) {
  const rings = [[-.5,.3],[-.29,.85],[.23,1],[.5,.58]].map(([dy,radius]) =>
    Array.from({length:8}, (_, i) => {
      const angle = i * TAU / 8;
      const px = Math.cos(angle) * width * radius / 2;
      const pz = Math.sin(angle) * depth * radius / 2;
      return [x + px * Math.cos(yaw) + pz * Math.sin(yaw), y + dy * height, z - px * Math.sin(yaw) + pz * Math.cos(yaw)];
    }));
  for (let row = 0; row < rings.length - 1; row++) {
    rings[row].forEach((point, i) => {
      const next = (i + 1) % rings[row].length;
      faces.push({points:[point,rings[row + 1][i],rings[row + 1][next],rings[row][next]],color:colors[i < 4 ? 1 : 2]});
    });
  }
  faces.push({points:[...rings.at(-1)].reverse(), color:colors[0]});
}

const { wood, trim, metal: brass, upholstery: olive, lamp: amber } = barMaterials;
const tops = {
  female: [
    ['#f5af9f','#d48076','#9e4f51'],
    ['#ddabc3','#b478a2','#87587d'],
    ['#f5c880','#c99352','#986738'],
  ],
  male: [
    ['#9cc8e3','#6397b9','#446986'],
    ['#8fcabd','#519b8d','#357169'],
    ['#afafe0','#8182be','#5c6094'],
  ],
};
const neutralTop = ['#ddc8a7','#aa9476','#80694e'];

export function avatarOutfit(id, gender) {
  const palette = tops[gender];
  if (!Array.isArray(palette)) return neutralTop;
  const color = [...id].reduce((value, char) => value + char.charCodeAt(0), 0);
  return palette[color % palette.length];
}

const room = [];
const walls = [];
const floor = [];
for (let row = -4; row <= 4; row++) {
  for (let col = 0; col < 7; col++) {
    const x = col * 1.9 - 7.1 + (row % 2 ? .45 : 0);
    const z = row * 1.58;
    const colors = barMaterials.floor;
    floor.push({points:[[x,0,z],[x,0,z+1.55],[x+1.88,0,z+1.55],[x+1.88,0,z]],color:colors[(col + row * row) % colors.length]});
  }
}
box(walls, 0, 1.65, -6.55, 13.1, 3.3, .16, barMaterials.rearWall);
box(room, 0, .28, -6.39, 13.1, .56, .16, trim);
box(room, 0, 1.13, -6.24, 8.4, .16, .44, wood);
box(room, 0, 2.05, -6.35, 8.4, .15, .48, wood);
for (let shelf = 0; shelf < 2; shelf++) {
  for (let i = 0; i < 12; i++) {
    const x = (i - 5.5) * .62;
    const base = shelf ? 2.13 : 1.22;
    const palette = [olive, brass, barMaterials.bottles][(i + shelf) % 3];
    box(room, x, base + .14, -6.15, .22, .28, .20, palette);
    box(room, x, base + .32, -6.15, .10, .12, .10, palette);
  }
}

function counter(x, z, width, depth) {
  box(room, x, .59, z, width - .13, 1.18, depth - .13, trim);
  box(room, x, 1.21, z, width, .15, depth, wood);
}

for (const side of [-1,1]) {
  for (let section = 0; section < 5; section++) counter(side * 2.78, -3.56 + section * 1.08, 1.05, 1.08);
}
counter(0, 1.92, 6.61, 1.24);
for (let i = -7; i <= 7; i++) box(room, i * .42, .64, 2.50, .055, .84, .055, wood);
const lamps = [[-2.78,-2.95],[2.78,-2.95],[0,1.92]];
for (const [x,z] of lamps) {
  box(room, x, 1.40, z, .07, .24, .07, brass);
  rounded(room, x, 1.62, z, .45, .25, .43, amber);
}

const firstPersonWalls = [];
const wallDetails = [];
for (const side of [-1,1]) {
  const wall = barMaterials.sideWall;
  box(firstPersonWalls, side * 6.45, 1.9, .18, .15, 3.8, 13.5, wall);
  box(wallDetails, side * 6.31, .46, .18, .13, .92, 13.5, trim);
  for (const z of [-3.4,0,3.4]) {
    box(wallDetails, side * 6.31, 1.35, z, .10, 2.7, .07, wood);
    rounded(wallDetails, side * 6.18, 2.18, z, .24, .40, .36, amber);
  }
}
box(firstPersonWalls, 0, 1.9, 6.93, 13, 3.8, .15, barMaterials.entryWall);
box(wallDetails, 0, .48, 6.78, 13, .96, .15, trim);
box(wallDetails, 0, 1.34, 6.79, 1.3, 2.68, .26, wood);

function chair(faces, i, angle = 0) {
  const [x,z] = barSeats[i];
  const yaw = facingBar([x,z]) + angle;
  box(faces, x, .28, z, .33, .54, .34, trim, yaw);
  box(faces, x, .58, z, .75, .15, .72, i === 11 ? brass : olive, yaw);
  box(faces, x - Math.sin(yaw) * .35, .79, z - Math.cos(yaw) * .35, .75, .30, .10, i === 11 ? brass : olive, yaw);
}
const chairs = barSeats.map((_, seat) => {
  const faces = [];
  chair(faces, seat);
  return faces;
});

const skin = ['#f3c8a8','#dca68a','#bb856d'];

function heldGlass(faces, x, y, z, person, yaw = 0, scale = 1) {
  const drink = DRINKS.find(item => item.id === person.drinkId);
  if (!drink) return;
  const fill = drinkLevel(person.seconds, person.unlimited, drink.minutes * 60).fill;
  const wine = drink.id === 'wine', beer = drink.id === 'beer';
  const height = (wine ? .28 : beer ? .40 : .36) * scale;
  const width = (beer ? .27 : .24) * scale;
  const rim = .024 * scale;
  const base = y + (wine ? .11 * scale : 0);
  const offset = (side, forward) => [x + Math.cos(yaw)*side + Math.sin(yaw)*forward, z - Math.sin(yaw)*side + Math.cos(yaw)*forward];
  const glass = ['#f0dfc4','#bcae9b','#8a847d'];
  const liquid = [drink.color, drink.color, drink.color];
  box(faces, x, y, z, width, rim, width, glass, yaw);
  if (wine) box(faces, x, (y+base)/2, z, .038*scale, base-y, .038*scale, glass, yaw);
  if (fill > 0) {
    const level = (height - 2 * rim) * fill;
    box(faces, x, base + rim + level/2, z, width - rim, level, width - rim, liquid, yaw);
    if (beer) box(faces, x, base + rim + level, z, width - rim, rim, width - rim, ['#f8eac9','#eedcb4','#e2cfa7'], yaw);
  }
  for (const side of [-1,1]) {
    const [cx,cz] = offset(side * width / 2, 0);
    box(faces, cx, base + height, cz, rim, rim, width, glass, yaw);
    for (const end of [-1,1]) {
      const [ex,ez] = offset(side * width / 2, end * width / 2);
      box(faces, ex, base + height / 2, ez, rim, height, rim, glass, yaw);
    }
    const [rx,rz] = offset(0, side * width / 2);
    box(faces, rx, base + height, rz, width, rim, rim, glass, yaw);
    box(faces, rx, base, rz, width, rim, rim, glass, yaw);
  }
  if (beer) {
    const [hx,hz] = offset(width / 2 + .035*scale, 0);
    box(faces, hx, base + height * .56, hz, .045*scale, height * .41, .08*scale, glass, yaw);
  }
}

function avatar(faces, pose, outfit, person) {
  const { position: [x,z], yaw, rise, stride } = pose;
  const point = (side, ahead) => [x + Math.cos(yaw)*side + Math.sin(yaw)*ahead, z - Math.sin(yaw)*side + Math.cos(yaw)*ahead];
  const trousers = ['#555468','#403f53','#343346'];
  for (const side of [-1,1]) {
    const [footX,footZ] = point(side * .16, mix(.25, side * stride * .19, rise));
    box(faces, footX, mix(.42, .24, rise), footZ, .23, mix(.29, .45, rise), .29, trousers, yaw);
    box(faces, footX, mix(.29, .08, rise) + Math.max(0, side * stride) * .11, footZ, .24, .16, .34, trim, yaw);
    const holding = side === 1 && !!person.drinkId;
    const [armX,armZ] = point(side * .37, holding ? .12 + stride * .025 : -side * stride * .09);
    rounded(faces, armX, 1 + rise * .22, armZ, .25, .29, .24, outfit);
    const handY = (holding ? .95 : .79) + rise * .22;
    rounded(faces, armX, handY, armZ, .18, .26, .18, skin);
    if (holding) {
      const [glassX,glassZ] = point(.46, .22 + stride * .025);
      heldGlass(faces, glassX, handY - .09, glassZ, person, yaw, 1.08);
    }
  }
  rounded(faces, x, 1 + rise * .24, z, AVATAR_BODY_WIDTH, .67, .52, outfit, yaw);
}

function projection(width, height, eye, yaw, pitch, zoom) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const tilt = Math.sin(pitch), level = Math.cos(pitch);
  const focal = Math.min(width * zoom, height * 1.57);
  const camera = ([x,y,z]) => {
    x -= eye[0]; y -= eye[1]; z -= eye[2];
    const forward = x * sin + z * cos;
    return [z * sin - x * cos, y * level - forward * tilt, forward * level + y * tilt];
  };
  const centerY = height * .52 + 8;
  const screen = ([x,y,depth]) => [width / 2 + x * focal / depth, centerY - y * focal / depth, depth];
  return {camera, screen, focal, lens:{eye, yaw:[sin,cos], pitch:[tilt,level], projection:[2*focal/width,2*focal/height,1-2*centerY/height]}};
}

// Clip polygons against the near plane so the view can move between chairs.
function clip(points) {
  const near = .24;
  return points.flatMap((current, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    const inFront = current[2] >= near;
    if (inFront === (previous[2] >= near)) return inFront ? [current] : [];
    const t = (near - previous[2]) / (current[2] - previous[2]);
    const edge = [mix(previous[0], current[0], t), mix(previous[1], current[1], t), near];
    return inFront ? [edge, current] : [edge];
  });
}

export function paintBar(context, width, height, view, people, ownPose, pitch = FIRST_PERSON_PITCH, depthRenderer = null, theme = barThemes[0]) {
  const first = view === 'first';
  const [x,z] = ownPose.position;
  const {camera, screen, focal, lens} = first
    ? projection(width, height, [x, 1.76 + ownPose.rise * .05, z], ownPose.yaw, pitch, .67)
    : projection(width, height, THIRD_EYE, Math.PI, THIRD_PITCH, 1.39);

  const faces = [...room];
  chairs.forEach((geometry, seat) => {
    const angle = people.find(person => person.seat === seat)?.chairAngle;
    if (angle) chair(faces, seat, angle);
    else faces.push(...geometry);
  });
  const visible = (polygons, project = camera) => polygons.map(({points, color}) => {
    const corners = clip(points.map(project)).map(screen);
    const depth = corners.reduce((sum, corner) => sum + corner[2], 0) / corners.length;
    return {corners,color,depth};
  }).filter(({corners}) => corners.length >= 3).sort((a,b) => b.depth - a.depth);
  function drawFaces(polygons) {
    for (const {corners,color} of polygons) {
      context.beginPath();
      corners.forEach(([px,py], i) => i === 0 ? context.moveTo(px,py) : context.lineTo(px,py));
      context.closePath();
      context.fillStyle = color;
      context.fill();
    }
  }
  const wallFaces = first ? [...walls, ...firstPersonWalls] : walls;
  const details = first ? wallDetails : [];
  const geometry = [floor, wallFaces, details, faces].map(layer => layer.map(face => {
    const color = theme.colors[face.color];
    return color ? { ...face, color } : face;
  }));
  const foreground = geometry[3];
  for (const person of people) {
    if (!first || !person.mine) avatar(foreground, person.pose, avatarOutfit(person.id, person.gender), person);
  }
  if (depthRenderer?.draw(geometry.flat(), lens, context.canvas.width, context.canvas.height)) {
    context.clearRect(0,0,width,height);
  } else {
    const background = context.createLinearGradient(0,0,0,height);
    background.addColorStop(0, theme.background[0]);
    background.addColorStop(1, theme.background[1]);
    context.fillStyle = background;
    context.fillRect(0,0,width,height);
    drawFaces(geometry.flatMap(layer => visible(layer)));
  }

  for (const [x,z] of first ? [] : lamps) {
    const point = camera([x,1.62,z]);
    if (point[2] < .55) continue;
    const [px,py,depth] = screen(point);
    const radius = Math.min(60, 360 / depth);
    const glow = context.createRadialGradient(px,py,0,px,py,radius);
    glow.addColorStop(0, theme.glow + '50');
    glow.addColorStop(1, theme.glow + '00');
    context.fillStyle = glow;
    context.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  }

  const me = people.find(person => person.mine);
  if (first && me?.drinkId) {
    const hand = [];
    rounded(hand, .64, -.55, 1.17, .23, .26, .26, skin);
    heldGlass(hand, .72, -.48, 1.27, me, 0, .73);
    drawFaces(visible(hand, point => point));
  }

  return barSeats.map(([seatX,seatZ], seat) => {
    const person = people.find(item => item.seat === seat);
    if (first && person?.mine) return null;
    const pose = person?.pose;
    const [px,pz] = pose?.position ?? [seatX,seatZ];
    const markerHeight = first
      ? pose ? 1.66 + pose.rise * .24 : .72
      : MARKER_HEIGHT + (pose?.rise ?? 0) * .3;
    const point = camera([px, markerHeight, pz]);
    if (point[2] < .55) return null;
    const [left,top,depth] = screen(point);
    if (left < 20 || left > width - 20 || top < 18 || top > height - 19) return null;
    return {left, top, depth, portraitSize:first && pose ? AVATAR_BODY_WIDTH * focal / depth : null};
  });
}
