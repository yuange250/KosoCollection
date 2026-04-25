import fs from 'node:fs';

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';

let text = fs.readFileSync(DATA_PATH, 'utf8');

const templateReplacements = [
  {
    pattern:
      /"这里的自然景观尺度开阔、画面结构清晰，初看就能留下很鲜明的印象。"/g,
    replacement:
      '"这里往往不是靠单一景点取胜，而是靠地貌、光线与空间尺度一起建立起非常鲜明的现场感。"',
  },
  {
    pattern:
      /"这里的人文主题清晰，建筑与空间轮廓稳定，很容易建立鲜明而完整的第一印象。"/g,
    replacement:
      '"这里真正打动人的，不只是遗存本身，而是建筑、街区和历史气息仍然能被完整地读出来。"',
  },
  {
    pattern:
      /"([^"]+?)遗存集中、可读性强，适合作为文化遗产类目的地呈现。"/g,
    replacement:
      '"$1的遗存保存较完整，空间轮廓清楚，走在现场时很容易感受到它的历史层次。"',
  },
  {
    pattern:
      /"遗存格局与文化氛围较为集中，能够支撑独立游览体验，也适合纳入更大尺度的线路或城市群叙事。"/g,
    replacement:
      '"这里不只是零散遗迹的集合，而是一处仍能支撑完整游览体验的历史场所，适合慢慢走、慢慢看。"',
  },
  {
    pattern:
      /"([^"]+?)地貌与空间层次清晰，适合作为自然类目的地浏览与配图。"/g,
    replacement:
      '"$1最吸引人的地方，在于地貌轮廓清楚、空间层次鲜明，远看近看都很容易留下印象。"',
  },
  {
    pattern:
      /"([^"]+?)在城市尺度上形体突出，适合作为都会地标与片区锚点。"/g,
    replacement:
      '"$1在城市景观中的辨识度很高，往往一眼就能成为整片城区最先被记住的地标。"',
  },
  {
    pattern:
      /"识别度高、边界清晰的城市尺度对象，便于与街区步行、河岸或天际线等情境组合呈现。"/g,
    replacement:
      '"它真正有魅力的地方，在于与街区、河岸和城市天际线之间始终保持着很强的呼应关系。"',
  },
  {
    pattern:
      /'([^']+?)閬楀瓨闆嗕腑銆佸彲璇绘€у己锛岄€傚悎浣滀负鏂囧寲閬椾骇绫荤洰鐨勫湴鍛堢幇銆?/g,
    replacement:
      '"$1鐨勯仐瀛樹繚瀛樿緝瀹屾暣锛岀┖闂磋疆寤撴竻妤氾紝璧板湪鐜板満鏃跺緢瀹规槗鎰熷彈鍒板畠鐨勫巻鍙插眰娆°€?"',
  },
  {
    pattern:
      /'([^']+?)鍦拌矊涓庣┖闂村眰娆℃竻鏅帮紝閫傚悎浣滀负鑷劧绫荤洰鐨勫湴娴忚涓庨厤鍥俱€?/g,
    replacement:
      '"$1鏈€鍚稿紩浜虹殑鍦版柟锛屽湪浜庡湴璨岃疆寤撴竻妤氥€佺┖闂村眰娆￠矞鏄庯紝杩滅湅杩戠湅閮藉緢瀹规槗鐣欎笅鍗拌薄銆?"',
  },
  {
    pattern:
      /'([^']+?)鍦ㄥ煄甯傚昂搴︿笂褰綋绐佸嚭锛岄€傚悎浣滀负閮戒細鍦版爣涓庣墖鍖洪敋鐐广€?/g,
    replacement:
      '"$1鍦ㄥ煄甯傛櫙瑙備腑鐨勮鲸璇嗗害寰堥珮锛屽線寰€涓€鐪煎氨鑳芥垚涓烘暣鐗囧煄鍖烘渶鍏堣璁颁綇鐨勫湴鏍囥€?"',
  },
];

for (const { pattern, replacement } of templateReplacements) {
  text = text.replace(pattern, replacement);
}

fs.writeFileSync(DATA_PATH, text, 'utf8');

console.log(
  JSON.stringify(
    {
      rewritten: templateReplacements.length,
    },
    null,
    2,
  ),
);
