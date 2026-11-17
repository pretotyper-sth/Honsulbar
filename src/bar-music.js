export const barMusic = [
  { title: 'Bossa Antigua', file: 'bossa-antigua', isrc: 'USUAN1700069' },
  { title: 'Lobby Time', file: 'lobby-time', isrc: 'USUAN1600054' },
  { title: 'Casa Bossa Nova', file: 'casa-bossa-nova', isrc: 'USUAN1600012' },
  { title: 'BossaBossa', file: 'bossabossa', isrc: 'USUAN1600055' },
  { title: 'Local Forecast', file: 'local-forecast', isrc: 'USUAN1300010' },
  { title: 'George Street Shuffle', file: 'george-street-shuffle', isrc: 'USUAN1300035' },
  { title: 'Smooth Lovin', file: 'smooth-lovin', isrc: 'USUAN1700077' },
  { title: 'Backbay Lounge', file: 'backbay-lounge', isrc: 'USUAN1700068' },
  { title: 'Airport Lounge', file: 'airport-lounge', isrc: 'USUAN1100806' },
  { title: 'Backed Vibes (clean)', file: 'backed-vibes-clean', isrc: 'USUAN1100479' },
];

export function shuffleBarMusic(previousTrack, tracks) {
  const queue = tracks ? barMusic.filter(track => tracks.includes(track.file)) : [...barMusic];
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  if (queue.length > 1 && queue[0] === previousTrack) [queue[0], queue[1]] = [queue[1], queue[0]];
  return queue;
}
