export interface WorldScenePoiOverride {
  searchTerms?: readonly string[];
  requiredTerms?: readonly string[];
  excludedTerms?: readonly string[];
  preferredMonths?: readonly number[];
  preferredSeasons?: readonly ('spring' | 'summer' | 'autumn' | 'winter' | 'all')[];
}

/**
 * 人工强化词表：
 * 1. 提升重点景点的检索命中率
 * 2. 为高风险混淆词补充必要限制
 * 3. 给季节性明显的景点提供优先月份
 */
export const WORLDSCENE_POI_OVERRIDES: Record<string, WorldScenePoiOverride> = {
  'forbidden-city': {
    searchTerms: ['Forbidden City', 'Palace Museum Beijing', '故宫', '北京故宫'],
    requiredTerms: ['forbidden city', 'palace museum', '故宫', '紫禁城'],
    excludedTerms: ['map', 'ticket', 'logo'],
  },
  'great-wall': {
    searchTerms: ['Great Wall of China', 'Mutianyu Great Wall', '长城', '慕田峪长城'],
    requiredTerms: ['great wall', '长城'],
  },
  'mount-fuji': {
    searchTerms: ['Mount Fuji', '富士山', 'Lake Kawaguchi Mount Fuji'],
    requiredTerms: ['fuji', '富士'],
    preferredMonths: [11, 12, 1, 2, 3, 4],
  },
  kyoto: {
    searchTerms: ['Kyoto', '京都', 'Kyoto temple'],
    requiredTerms: ['kyoto', '京都'],
    preferredMonths: [3, 4, 5, 10, 11],
  },
  'eiffel-tower': {
    searchTerms: ['Eiffel Tower', 'Tour Eiffel', '埃菲尔铁塔', '巴黎铁塔'],
    requiredTerms: ['eiffel', 'tour eiffel', '铁塔'],
  },
  santorini: {
    searchTerms: ['Santorini', 'Oia Santorini', '圣托里尼', '伊亚'],
    requiredTerms: ['santorini', 'oia', '圣托里尼'],
    preferredMonths: [5, 6, 7, 8, 9],
  },
  reykjavik: {
    searchTerms: ['Reykjavik aurora', 'Reykjavik', '雷克雅未克 极光'],
    requiredTerms: ['reykjavik', '雷克雅未克'],
    preferredMonths: [9, 10, 11, 12, 1, 2, 3],
  },
  'west-lake-hangzhou': {
    searchTerms: ['West Lake Hangzhou', '杭州西湖', 'Hangzhou West Lake'],
    requiredTerms: ['west lake', 'hangzhou', '西湖'],
    preferredMonths: [3, 4, 5, 9, 10, 11],
  },
  'jiuzhaigou-valley': {
    searchTerms: ['Jiuzhaigou Valley', '九寨沟', 'Jiuzhaigou National Park'],
    requiredTerms: ['jiuzhaigou', '九寨沟'],
    preferredMonths: [9, 10, 11],
  },
  'huangshan-yellow-mountain': {
    searchTerms: ['Huangshan', 'Yellow Mountain China', '黄山'],
    requiredTerms: ['huangshan', 'yellow mountain', '黄山'],
    preferredMonths: [4, 5, 9, 10, 11],
  },
  'potala-palace-lhasa': {
    searchTerms: ['Potala Palace', '布达拉宫', 'Potala Palace Lhasa'],
    requiredTerms: ['potala', '布达拉宫'],
    preferredMonths: [5, 6, 7, 8, 9, 10],
  },
  'kanas-lake-scenic': {
    searchTerms: ['Kanas Lake', '喀纳斯湖', 'Kanas Xinjiang'],
    requiredTerms: ['kanas', '喀纳斯'],
    preferredMonths: [9, 10],
  },
  'heaven-lake-changbai': {
    searchTerms: ['Changbai Mountain Tianchi', 'Heaven Lake Changbai', '长白山天池'],
    requiredTerms: ['changbai', 'heaven lake', '天池', '长白山'],
    preferredMonths: [6, 7, 8, 9],
  },
  'yading-nature-reserve': {
    searchTerms: ['Yading Nature Reserve', 'Daocheng Yading', '稻城亚丁'],
    requiredTerms: ['yading', 'daocheng', '亚丁', '稻城'],
    preferredMonths: [9, 10],
  },
};