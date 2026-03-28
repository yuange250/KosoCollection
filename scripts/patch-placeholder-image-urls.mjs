import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '../public/data/nodes.json');
const raw = fs.readFileSync(p, 'utf8');
const nodes = JSON.parse(raw);

const map = {
  'atari-shock': '/images/nodes/atari-et-burial-wikimedia.jpg',
  'n64-launch': '/images/nodes/n64-console-wikimedia.png',
  'mario64': '/images/nodes/super-mario-64-logo-wikimedia.png',
  'pokemon-rg': '/images/nodes/pokemon-intl-logo-wikimedia.svg',
  'ms-pac-man': '/images/nodes/pac-man-logo-wikimedia.png',
  'metroid-nes': '/images/nodes/metroid-logo-wikimedia.png',
  'donkey-kong': '/images/nodes/donkey-kong-1981-title-wikimedia.png',
  'contra': '/images/nodes/contra-logo-wikimedia.svg',
  'civilization-1991': '/images/nodes/civilization-logo-wikimedia.svg',
  'warcraft-1994': '/images/nodes/warcraft-logo-wikimedia.jpeg',
  'gt-1997': '/images/nodes/gran-turismo-logo-wikimedia.svg',
  'goldeneye-007': '/images/nodes/goldeneye-007-logo-wikimedia.svg',
  'starcraft-98': '/images/nodes/starcraft-logo-wikimedia.svg',
  'metal-gear-solid-98': '/images/nodes/mgs-logo-wikimedia.svg',
  'war3-2002': '/images/nodes/warcraft3-wcg-2006-wikimedia.jpg',
  'halo-2': '/images/nodes/halo-2-logo-wikimedia.jpg',
  'oblivion-2006': '/images/nodes/oblivion-logo-wikimedia.png',
  'cod4-2007': '/images/nodes/cod4-mw-logo-wikimedia.jpg',
  'portal-2007': '/images/nodes/portal-logo-wikimedia.svg',
  'skyrim-2011': '/images/nodes/skyrim-logo-wikimedia.png',
  'journey-2012': '/images/nodes/journey-logo-wikimedia.svg',
  'tf2-2007': '/images/nodes/tf2-logo-wikimedia.png',
  'fortnite-br': '/images/nodes/fortnite-logo-wikimedia.svg',
  'battlefield-1942': '/images/nodes/battlefield-logo-wikimedia.svg',
  'computer-space': '/images/nodes/computer-space-cabinet-wikimedia.jpg',
  'ds-2004': '/images/nodes/nintendo-ds-lite-wikimedia.jpg',
  'xbox360': '/images/nodes/xbox-360-wikimedia.jpg',
  'ps3-launch': '/images/nodes/ps3-console-wikimedia.jpg',
  'ps5-launch': '/images/nodes/ps5-console-wikimedia.jpg',
  'mega-drive-jp': '/images/nodes/sega-mega-drive-jp-wikimedia.jpg',
  'saturn-jp': '/images/nodes/sega-saturn-wikimedia.jpg',
  'dreamcast-jp': '/images/nodes/dreamcast-console-wikimedia.jpg',
  'ps2-jp': '/images/nodes/ps2-versions-wikimedia.jpg',
  'xbox-na': '/images/nodes/xbox-original-wikimedia.jpg',
  'psp-jp': '/images/nodes/psp-1000-wikimedia.jpg',
  'cn-xiaobawang': '/images/nodes/famiclone-genius-wikimedia.jpg',
  'cn-netbar': '/images/nodes/internet-cafe-china-wikimedia.jpg',
  'cn-mobile-2010s': '/images/nodes/smartphone-game-icons-wikimedia.svg',
  'indie-renaissance': '/images/nodes/igf-expo-2013-wikimedia.jpg',
  'vr-waves': '/images/nodes/oculus-rift-cv1-wikimedia.jpg',
  'e3-1995': '/images/nodes/e3-2022-logo-wikimedia.svg',
  'steam-launch-2003': '/images/nodes/steam-2016-logo-wikimedia.svg',
  'sega-hardware-exit-2001': '/images/nodes/sega-dreamcast-fl-wikimedia.jpg',
  'igf-1998': '/images/nodes/igf-logo-wikimedia.svg',
  'kojima-prod-2015': '/images/nodes/kojima-productions-wikimedia.png',
  'carmack-oculus-2013': '/images/nodes/john-carmack-gdc-wikimedia.jpg',
  'miyamoto-bafta-2010': '/images/nodes/miyamoto-2015-wikimedia.jpg',
};

let n = 0;
for (const node of nodes) {
  const url = map[node.id];
  if (!url) continue;
  if (!node.content?.imageUrl?.includes('placeholders')) {
    console.warn('skip (not placeholder):', node.id, node.content?.imageUrl);
    continue;
  }
  node.content.imageUrl = url;
  n++;
}
fs.writeFileSync(p, JSON.stringify(nodes, null, 2) + '\n', 'utf8');
console.log('updated', n, 'nodes');
