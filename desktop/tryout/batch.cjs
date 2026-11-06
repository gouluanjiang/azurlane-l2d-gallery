const {definitions:accepted}=require('./samples.cjs');
const manifest=require('./online-mapping.json');
const {availabilityFrom}=require('./matching.cjs');
const newIds=Object.freeze([
  'azl-b36bfb850e2cff6f', // 埃吉尔 · 私密闲暇时
  'azl-7f76cef9141cdab6', // 信浓 · 白沙幽梦
  'azl-789bced6e0969a71', // 狮 · 沙滩的慵懒主宰
  'azl-de5397ce8eaa4a7b', // 武藏 · 只为你献上的应援
  'azl-604a37a57691b511', // 腓特烈·卡尔 · 午夜频道
  'azl-857e0640665c51ac'  // 光辉 · 幽影徘徊之夜
]);
const enabledIds=Object.freeze([...accepted.map(s=>s.id),...newIds]);
const secondIds=Object.freeze([
  'azl-7647820b8626d38e', // 本宁顿 · 全速！盛夏逐光企划
  'azl-f5598fefde5c7120', // 不挠 · 慵懒的领航员小姐
  'azl-ab74a8ca829addf2', // 冈依沙瓦号 · 真我的显影
  'azl-5d7abeacea987e5e', // 普利茅斯 · 纯白天使的全身检查
  'azl-fd30a92007884f70', // 奥古斯特 · 与“魔女”的星夜之约
  'azl-9ff6cc392143131e', // 路易九世 · 微醺的静谧时光
  'azl-e72cfcf29902989a', // 雅努斯 · 云端的水光
  'azl-184d984f41827c47', // U-2501 · 水幕后的珍宝
  'azl-8ebb87cd4fba134f', // 葛兹 · 赤红之月的幻想
  'azl-cadc35b2951097ee', // 天城 · 碧波绮尾
  'azl-210f21bfb93a2e27', // 百眼巨人 · 特训中的威严之人
  'azl-7c4b0d221b1a4f97'  // 名寄 · Electric Affection
]);
const thirdIds=Object.freeze([
  'azl-416e2fe83ed87cfd', // 怨仇 · 杯盏盈芳华
  'azl-749968b229cc3029', // 兴登堡 · 深阁舞戏
  'azl-406b71d0160fadb4', // 信浓 · 相融一梦
  'azl-8d725fe96de2792a', // 彰武 · 一枝春欲放
  'azl-692973ce96d7325e', // 高雄 · 武者的“内在”修养
  'azl-8af3c2737bbd0d73', // 欧根亲王 · 微醺与试探的距离
  'azl-2ad4ddd66b35df22', // 梅克伦堡 · 作茧自缚
  'azl-87f08799adbabb12', // 金狮 · 朦胧的宠溺时刻
  'azl-d335532af9249609', // 列克星敦II · 轻飘飘的拂拭时光
  'azl-2dbcbc32bc1051e1', // 科本斯 · 心动营养灌输中
  'azl-05232b9d2b09e4f3', // 新泽西 · 漆黑的超极速前奏
  'azl-3cfc009681f68109'  // 珍珠号 · 魔堡中的堕天使
]);
const fourthIds=Object.freeze([
  'azl-7e15b2e8441d49ae', // 安妮女王复仇号 · 隐秘之拥的呼唤
  'azl-cd105e96cd063c05', // 阿尔萨斯 · 圣宵之鬼的微醺
  'azl-1a4e89150098bbc6', // 关岛 · 女忍者的危险综艺秀
  'azl-4655f806ce385d28', // 云仙 · 万船集怀
  'azl-b6a043888b8e3e62', // 近江 · 逃脱失败……？
  'azl-1932ba423d357740', // 浅间 · 绽放于至深之夜
  'azl-c7227ff3e079db17', // 安克雷奇 · 香甜牛奶味之夜
  'azl-297ec8e17f819eb4', // 贝劳森林 · 水色疗愈
  'azl-a8cd090091c8ec64', // 马塞纳 · 醉甜之泉
  'azl-d544f5986c9e95bf', // 企业 · 雨霁于心晴之时
  'azl-4f5f4bc7e9d0a3d5', // 吾妻 · 心向何方的指导课
  'azl-9b55443b7f67aba2'  // 腓特烈·卡尔 · 夏日防晒计划
]);
const releases=Object.freeze([
  {label:'第一批',version:'1.3.0-batch.1',newIds},
  {label:'第二批',version:'1.4.0-batch.2',newIds:secondIds},
  {label:'第三批',version:'1.5.0-batch.3',newIds:thirdIds},
  {label:'第四批',version:'1.6.1-batch.4',newIds:fourthIds} // 1.6.1: follows the l2d.su /azurlane/ page move
]);
function releaseFrom(number=1) {
  if(!Number.isInteger(number)||!releases[number-1])throw new Error('未知试玩批次');
  const definition=releases[number-1];
  return {...definition,number,scope:`batch-${number}`,enabledIds:[...accepted.map(s=>s.id),...releases.slice(0,number).flatMap(r=>r.newIds)],previousNotes:number===1?'tryout-notes':`batch-${number-1}/tryout-notes`};
}
function batchFrom(catalog,number=1) {
  const release=releaseFrom(number);
  const availability=availabilityFrom(catalog,manifest,release.enabledIds);
  const samples=release.enabledIds.map(id=> {
    const row=availability.find(s=>s.id===id);
    if (!row || row.status!=='playable' || row.candidates.length!==1) throw new Error('本批试玩资料不匹配，请恢复图鉴或核对映射：'+id);
    return {...row,onlineId:row.candidates[0].onlineId,label:release.newIds.includes(id)?'本批新增':'已验收皮肤',verifiedAt:manifest.auditedAt.slice(0,10)};
  });
  return {samples,availability,auditedAt:manifest.auditedAt,release};
}
module.exports={newIds,enabledIds,secondIds,thirdIds,fourthIds,batchFrom,releaseFrom};
