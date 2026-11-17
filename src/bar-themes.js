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
  createTheme('izakaya', ['#302721', '#37221c'], '#ffcb88', {
    wood: ['#b98b56', '#835631', '#634329'],
    trim: ['#79573b', '#513725', '#3c291e'],
    metal: ['#e7b675', '#ac7640', '#82532d'],
    upholstery: ['#af5f4c', '#8d4639', '#633228'],
    lamp: ['#ffe4b2', '#ebad75', '#c77e52'],
    floor: ['#49352c', '#51392d', '#563d30', '#4d362b'],
    rearWall: ['#76654e', '#655441', '#493d32'],
    sideWall: ['#75624d', '#544638', '#432d26'],
    entryWall: ['#765e49', '#584235', '#453229'],
    bottles: ['#b9a481', '#938569', '#655941'],
  }),
  createTheme('speakeasy', ['#292629', '#30211e'], '#f4bd84', {
    wood: ['#996445', '#6b4230', '#503127'],
    trim: ['#634431', '#463026', '#32231f'],
    metal: ['#e8c184', '#ac814d', '#86613c'],
    upholstery: ['#91676a', '#704b51', '#563a40'],
    lamp: ['#ffe0ac', '#cf9e69', '#a87450'],
    floor: ['#403237', '#48363a', '#4e393c', '#433338'],
    rearWall: ['#514750', '#433945', '#322c36'],
    sideWall: ['#594a50', '#483b43', '#352d35'],
    entryWall: ['#5a4647', '#4b383c', '#362b32'],
    bottles: ['#bc927b', '#98705c', '#6e4d44'],
  }),
  createTheme('holiday', ['#28302a', '#382821'], '#ffcf8c', {
    wood: ['#ab7952', '#775239', '#5e3b29'],
    trim: ['#77503c', '#50352b', '#412c24'],
    metal: ['#efc785', '#bf904f', '#936039'],
    upholstery: ['#87886a', '#676c50', '#4d573e'],
    lamp: ['#ffe1a6', '#f4bc73', '#c6824e'],
    floor: ['#47372e', '#4b3a30', '#533d30', '#49382e'],
    rearWall: ['#5a5e4e', '#484f42', '#343d33'],
    sideWall: ['#5b6252', '#484f41', '#363f34'],
    entryWall: ['#625246', '#504436', '#3e362e'],
    bottles: ['#bd8875', '#935d52', '#6b433b'],
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
