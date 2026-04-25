import fs from 'node:fs';

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';

const countryById = new Map([
  ['badain-jaran-desert-gansu', '中国'],
  ['capital-cities-and-tombs-of-the-ancient-koguryo-kingdom-jilin', '中国'],
  ['classical-gardens-of-suzhou-suzhou', '中国'],
  ['cultural-landscape-of-old-tea-forests-of-the-jingmai-mountain-in-pu-er-lancang-lahu-autonomous-county', '中国'],
  ['fortaleza-do-monte-macau', '中国'],
  ['historical-complex-of-split-with-the-palace-of-diocletian-split', '克罗地亚'],
  ['humble-administrator-s-garden-suzhou', '中国'],
  ['igreja-da-se-macau', '中国'],
  ['kaiping-diaolou-and-villages-kaiping', '中国'],
  ['kinabalu-park-sabah', '马来西亚'],
  ['lake-malawi-national-park-malawi', '马拉维'],
  ['landmarks-of-the-ancient-kingdom-of-saba-yemen', '也门'],
  ['megalithic-temples-of-malta-mgarr', '马耳他'],
  ['mir-castle-complex-mir', '白俄罗斯'],
  ['mogao-caves-dunhuang-2', '中国'],
  ['morne-trois-pitons-national-park-dominica', '多米尼克'],
  ['mount-kumgang-north-korea', '朝鲜'],
  ['mount-nimba-strict-nature-reserve-ivory-coast', '几内亚'],
  ['mount-sanqing-jiangxi', '中国'],
  ['natural-and-culturo-historical-region-of-kotor-kotor', '黑山'],
  ['old-city-of-jerusalem-and-its-walls-jerusalem', '以色列'],
  ['montenegro', '黑山'],
  ['bahia-portete-kaurrele-national-natural-park-la-guajira-department', '哥伦比亚'],
  ['bako-national-park-sarawak', '马来西亚'],
  ['cerro-azul-meambar-national-park-dei-g-comayagua-department', '洪都拉斯'],
  ['conkouati-douli-national-park-kouilou-department', '刚果（布）'],
  ['day-forest-national-park-djibouti', '吉布提'],
  ['deux-mamelles-national-park-haiti', '海地'],
  ['dinira-national-park-venezuela', '委内瑞拉'],
  ['el-imposible-national-park-ahuachapan-department', '萨尔瓦多'],
  ['endau-rompin-national-park-malaysia', '马来西亚'],
  ['galapagos-national-park-galapagos-province', '厄瓜多尔'],
  ['general-juan-pablo-penaloza-national-park-venezuela', '委内瑞拉'],
  ['gorkhi-terelj-national-park-ulaanbaatar', '蒙古国'],
  ['grand-bois-national-park-sud', '海地'],
  ['grande-colline-national-park-haiti', '海地'],
  ['guaramacal-national-park-portuguesa', '委内瑞拉'],
  ['gunung-gading-national-park-kuching', '马来西亚'],
  ['hlane-royal-national-park-manzini', '斯威士兰'],
  ['irazu-volcano-national-park-cartago-province', '哥斯达黎加'],
  ['javakheti-national-park-samtskhe-javakheti', '格鲁吉亚'],
  ['juan-crisostomo-falcon-national-park-venezuela', '委内瑞拉'],
  ['kabore-tambi-national-park-zoundweogo-province', '布基纳法索'],
  ['kaieteur-national-park-potaro-siparuni', '圭亚那'],
  ['kazbegi-national-park-mtskheta-mtianeti', '格鲁吉亚'],
  ['kenting-national-park-pingtung-county', '中国台湾'],
  ['kep-national-park-kep-province', '柬埔寨'],
  ['khan-khokhi-khyargas-mountain-national-park-mongolia', '蒙古国'],
  ['khangai-nuruu-national-park-mongolia', '蒙古国'],
  ['la-campana-national-park-quillota-province', '智利'],
  ['la-visite-national-park-haiti', '海地'],
  ['lake-arpi-national-park-shirak-province', '亚美尼亚'],
  ['llanganates-national-park-tungurahua-province', '厄瓜多尔'],
  ['longshan-national-forest-park-yangshi', '中国'],
]);

const nameById = new Map([
  ['igreja-da-se-macau', '圣母圣诞主教座堂'],
  ['megalithic-temples-of-malta-mgarr', '马耳他巨石神庙群'],
  ['mount-kumgang-north-korea', '金刚山'],
  ['general-juan-pablo-penaloza-national-park-venezuela', '胡安帕布洛佩尼亚洛萨将军国家公园'],
  ['gorkhi-terelj-national-park-ulaanbaatar', '特列尔吉国家公园'],
  ['deux-mamelles-national-park-haiti', '双峰岭国家公园'],
  ['el-imposible-national-park-ahuachapan-department', '不可思议国家公园'],
  ['guaramacal-national-park-portuguesa', '瓜拉马卡尔国家公园'],
  ['kaieteur-national-park-potaro-siparuni', '凯厄图尔国家公园'],
  ['kenting-national-park-pingtung-county', '垦丁国家公园'],
  ['kep-national-park-kep-province', '白马市国家公园'],
  ['khangai-nuruu-national-park-mongolia', '杭爱山脉国家公园'],
  ['la-campana-national-park-quillota-province', '拉坎帕纳国家公园'],
  ['llanganates-national-park-tungurahua-province', '良加纳特斯国家公园'],
]);

const raw = fs.readFileSync(DATA_PATH, 'utf8');
const objectPattern = /  \{[\s\S]*?\n  \},/g;

const readQuotedField = (block, field) => {
  const match = block.match(new RegExp(`${field}:\\s*(?:"([^"]*)"|'([^']*)')`));
  return match ? match[1] ?? match[2] ?? '' : '';
};

const replaceQuotedField = (block, field, value) =>
  block.replace(
    new RegExp(`(${field}:\\s*)(?:"[^"]*"|'[^']*')`),
    (_, prefix) => `${prefix}${JSON.stringify(value)}`,
  );

let repairedCountries = 0;
let repairedNames = 0;

const next = raw.replace(objectPattern, (block) => {
  const id = readQuotedField(block, 'id');
  if (!id) return block;

  let updated = block;
  const nextCountry = countryById.get(id);
  const nextName = nameById.get(id);

  if (nextCountry) {
    updated = replaceQuotedField(updated, 'country', nextCountry);
    repairedCountries += 1;
  }

  if (nextName) {
    updated = replaceQuotedField(updated, 'name', nextName);
    repairedNames += 1;
  }

  return updated;
});

fs.writeFileSync(DATA_PATH, next, 'utf8');

console.log(
  JSON.stringify(
    {
      repairedCountries,
      repairedNames,
    },
    null,
    2,
  ),
);
