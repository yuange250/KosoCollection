import fs from 'node:fs';

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';
let text = fs.readFileSync(DATA_PATH, 'utf8');

const ids = [
  'badalgachhi-upazila',
  'ancient-city-of-tauric-chersonese-and-its-chora-sevastopol',
  'aqueduct-of-padre-tembleque-zempoala-municipality',
  'arab-norman-palermo-and-the-cathedral-churches-of-cefalu-and-monreale-province-of-palermo',
  'badain-jaran-desert-gansu',
  'banks-of-the-seine-paris',
  'basilica-and-expiatory-church-of-the-holy-family-sagrada-familia',
  'changdeokgung-seoul',
  'chavin-de-huantar-huari-province',
  'capital-cities-and-tombs-of-the-ancient-koguryo-kingdom-jilin',
  'cape-floristic-kingdom-south-africa',
];

for (const id of ids) {
  const pattern = new RegExp(`(id:\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?description:\\s*\\n\\s*"[^"]*",\\n)(\\s*description:\\s*\\n\\s*"[^"]*",\\n)`, 'm');
  text = text.replace(pattern, '$1');
}

fs.writeFileSync(DATA_PATH, text, 'utf8');
console.log(JSON.stringify({ cleaned: ids.length }, null, 2));
