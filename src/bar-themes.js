export const barMaterials = {
  wood: ['#b57b51', '#78472f', '#653927'],
  trim: ['#694132', '#4b2c25', '#362320'],
  metal: ['#edc28a', '#bf8a4e', '#8e6036'],
  upholstery: ['#819175', '#5c745f', '#425246'],
  lamp: ['#ffe4a4', '#f5bb68', '#d38a41'],
  floor: ['#48302a', '#51352c', '#57392e', '#4d322b'],
  rearWall: ['#4c5149', '#373e36', '#292d29'],
  sideWall: ['#586457', '#414e44', '#29372f'],
  entryWall: ['#514a41', '#454139', '#373632'],
  bottles: ['#bd8981', '#8c625c', '#6b4543'],
};

function createTheme(id, background, glow, materials) {
  const colors = {};
  if (materials) {
    for (const [material, defaults] of Object.entries(barMaterials)) {
      defaults.forEach((color, index) => { colors[color] = materials[material][index]; });
    }
  }
  return { id, background, glow, colors };
}

export const barThemes = [
  createTheme('original', ['#252c2b', '#33211e'], '#ffd38e'),
  createTheme('jazz', ['#2d1d2a', '#371b24'], '#ffb1a6', {
    wood: ['#aa6574', '#754053', '#58313e'],
    trim: ['#734452', '#522c3d', '#391e2c'],
    metal: ['#e8ab94', '#b67464', '#855047'],
    upholstery: ['#bd778a', '#934b65', '#642f49'],
    lamp: ['#ffcec0', '#ef9690', '#bd646d'],
    floor: ['#482a3a', '#532e40', '#5a3344', '#4d2a3b'],
    rearWall: ['#624659', '#473346', '#322436'],
    sideWall: ['#694759', '#503548', '#39283c'],
    entryWall: ['#654351', '#4b3240', '#352633'],
    bottles: ['#c28b9e', '#8b5979', '#69405e'],
  }),
  createTheme('midnight', ['#182b40', '#171f36'], '#a8c9ff', {
    wood: ['#7389ab', '#485c81', '#364661'],
    trim: ['#455877', '#31415e', '#222d47'],
    metal: ['#b7c8e1', '#8199bd', '#586f95'],
    upholstery: ['#7d9bbc', '#52749e', '#39577e'],
    lamp: ['#c3dbff', '#94b4e8', '#627eb7'],
    floor: ['#27394f', '#2b405a', '#304661', '#293b54'],
    rearWall: ['#495c7a', '#354764', '#26364e'],
    sideWall: ['#4b6482', '#374e70', '#293b57'],
    entryWall: ['#455875', '#364560', '#2a374f'],
    bottles: ['#9b8fc2', '#746da0', '#535480'],
  }),
  createTheme('garden', ['#203330', '#192b25'], '#d4e9ab', {
    wood: ['#8b9b63', '#596946', '#405339'],
    trim: ['#566845', '#3e513b', '#2c3e2e'],
    metal: ['#d5d39b', '#a5aa72', '#777e53'],
    upholstery: ['#83a990', '#51806b', '#3c6354'],
    lamp: ['#e9edba', '#c6d494', '#909e63'],
    floor: ['#31463b', '#364e40', '#3b5444', '#34493d'],
    rearWall: ['#546b59', '#3d5448', '#2d433a'],
    sideWall: ['#5a7563', '#415e50', '#314b41'],
    entryWall: ['#506759', '#3d5046', '#2c4138'],
    bottles: ['#9dbb9a', '#6d9179', '#4b6e5b'],
  }),
];

export function themeForBar(room) {
  if (!room?.region || !room?.number) return barThemes[0];
  // Mix the whole room identity so nearby branches and regions do not form blocks of one theme.
  let hash = 2166136261;
  for (const char of `${room.region}:${room.number}`) {
    hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return barThemes[(hash >>> 0) % barThemes.length];
}
