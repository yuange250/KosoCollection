import fs from 'node:fs';

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';

let text = fs.readFileSync(DATA_PATH, 'utf8');

const countryMap = new Map([
  ["People's Republic of China", '中国'],
  ['United States', '美国'],
  ['United Kingdom', '英国'],
  ['Czech Republic', '捷克'],
  ['South Korea', '韩国'],
  ['North Korea', '朝鲜'],
  ['South Africa', '南非'],
  ['New Zealand', '新西兰'],
  ['Bosnia and Herzegovina', '波黑'],
  ['Republic of the Congo', '刚果（布）'],
  ['Croatia', '克罗地亚'],
  ['Malaysia', '马来西亚'],
  ['Malawi', '马拉维'],
  ['Yemen', '也门'],
  ['Malta', '马耳他'],
  ['Belarus', '白俄罗斯'],
  ['Dominica', '多米尼克'],
  ['Guinea', '几内亚'],
  ['Montenegro', '黑山'],
  ['Israel', '以色列'],
  ['Colombia', '哥伦比亚'],
  ['Djibouti', '吉布提'],
  ['Haiti', '海地'],
  ['Venezuela', '委内瑞拉'],
  ['Ecuador', '厄瓜多尔'],
  ['Mongolia', '蒙古国'],
  ['Eswatini', '斯威士兰'],
  ['Costa Rica', '哥斯达黎加'],
  ['Georgia', '格鲁吉亚'],
  ['Taiwan', '中国台湾'],
  ['Cambodia', '柬埔寨'],
  ['Chile', '智利'],
  ['Armenia', '亚美尼亚'],
  ['El Salvador', '萨尔瓦多'],
  ['Guyana', '圭亚那'],
  ['Burkina Faso', '布基纳法索'],
]);

const cityMap = new Map([
  ['Gansu', '甘肃'],
  ['Macau', '澳门'],
  ['Paris', '巴黎'],
  ['Seoul', '首尔'],
  ['Suzhou', '苏州'],
  ['Bethlehem', '伯利恒'],
  ['Mohave County', '莫哈维县'],
  ['Santa Cruz de Tenerife Province', '圣克鲁斯-德特内里费省'],
  ['Okinawa Prefecture', '冲绳县'],
  ['Skardu District', '斯卡都县'],
  ['Cairo Governorate', '开罗省'],
  ['Southern Province', '南方省'],
  ['Yukon', '育空地区'],
  ['Lima', '利马'],
  ['London', '伦敦'],
  ['Kent', '肯特郡'],
  ['Tatarstan', '鞑靼斯坦'],
  ['Piedmont', '皮埃蒙特'],
  ['Kedougou Region', '凯杜古区'],
  ['Hokkaido', '北海道'],
  ['Sant Cruz de Tenerife', '圣克鲁斯-德特内里费'],
  ['Province of Caserta', '卡塞塔省'],
]);

const exactPhraseReplacements = [
  ['适合作为户外探索类节点，具备公路旅行和湖泊色彩对比。', '这里很适合户外探索，公路旅行的开阔感和湖泊色彩的反差会让人很快进入状态。'],
  ['适合作为城市艺术节点与冬季冰场季节对比浏览。', '既能看城市艺术装置本身，也能感受到冬季冰场与都市空间叠在一起的气氛。'],
  ['很适合作为欧洲广场型人文点位代表。', '很能代表欧洲广场型人文空间的魅力。'],
  ['它很适合作为温带山水风景的代表型目的地。', '它很能代表温带山水风景的气质。'],
  ['适合作为东非历史文明代表点。', '很能代表东非历史文明这一支线。'],
  ['伍德布法罗很适合作为北美北部荒野景观的补充。', '伍德布法罗很适合用来理解北美北部荒野景观的尺度与气质。'],
  ['很适合作为近代政治文明线索中的重要一站。', '也很适合放在近代政治文明这条线索里理解。'],
  ['适合作为「艺术向」古代城点，而不只是大面积的碎柱场。', '更像一座带有强烈艺术气质的古代城址，而不只是大面积的碎柱遗迹。'],
  ['滨海层次与岸线对比鲜明，适合作为海岛度假向目的地呈现。', '岸线与海水层次都很鲜明，一眼就有很强的海岛气息。'],
  ['海水层次与岛岸关系对比清晰，适合作为滨海度假样本与其它海岛或海岸目的地并列呈现。', '海水层次和岛岸关系都很清楚，和其他海岛或海岸景观放在一起看时也很有辨识度。'],
]);

for (const [from, to] of exactPhraseReplacements) {
  text = text.split(from).join(to);
}

const simplifiedNamePairs = [
  ['聖安妮海洋國家公園', '圣安妮海洋国家公园'],
  ['聖母聖誕主教座堂', '圣母圣诞主教座堂'],
  ['國', '国'],
  ['園', '园'],
  ['區', '区'],
  ['島', '岛'],
  ['宮', '宫'],
  ['廣', '广'],
  ['內', '内'],
  ['與', '与'],
  ['遺', '遗'],
  ['產', '产'],
  ['聖', '圣'],
  ['薩', '萨'],
  ['維', '维'],
  ['諾', '诺'],
  ['奧', '奥'],
  ['爾', '尔'],
  ['濱', '滨'],
  ['帶', '带'],
];

text = text.replace(/(\sname:\s*)(['"])([^'"]+)\2/g, (_, prefix, _quote, value) => {
  let next = value;
  for (const [from, to] of simplifiedNamePairs) {
    next = next.split(from).join(to);
  }
  return `${prefix}${JSON.stringify(next)}`;
});

text = text.replace(/(\scountry:\s*)(['"])([^'"]+)\2/g, (_, prefix, _quote, value) => {
  const next = countryMap.get(value) ?? value;
  return `${prefix}${JSON.stringify(next)}`;
});

text = text.replace(/(\scity:\s*)(['"])([^'"]+)\2/g, (_, prefix, _quote, value) => {
  let next = cityMap.get(value) ?? value;
  if (next === '—' || next === '-' || next === '\\u2014') next = '当地';
  if (!/[\u3400-\u9fff]/.test(next)) next = '周边地区';
  return `${prefix}${JSON.stringify(next)}`;
});

const residual = ['适合作为', '景点库', '作为独立景点'].filter((phrase) => text.includes(phrase));

fs.writeFileSync(DATA_PATH, text, 'utf8');
console.log(JSON.stringify({ residual }, null, 2));
