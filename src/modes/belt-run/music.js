import sidewinding from './assets/audio/sidewinding.mp3';

// Media elements stream the selected song; the rest of the playlist need not load on launch.
const base = import.meta.env?.BASE_URL ?? '/';
export const MUSIC = [
  sidewinding,
  `${base}audio/music/peshawar.mp3`,
  `${base}audio/music/shankill.mp3`,
  `${base}audio/music/somnum-europa.mp3`,
];
