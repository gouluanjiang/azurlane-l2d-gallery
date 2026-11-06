const definitions = Object.freeze([
  { id: 'azl-e6548902747dbc36', character: '瑟堡', name: '布偶熊里面的是……？', onlineId: '818011', label: '图解陪玩', verifiedAt: '2026-09-12' },
  { id: 'azl-24a8b69272bcc3f0', character: '狮', name: '夜巷中的诱引者', onlineId: '205162', label: '新装探索', verifiedAt: '2026-09-12' }
]);
function samplesFrom(catalog) {
  return definitions.map(definition => {
    const skin = catalog.skins.find(skin => skin.id === definition.id);
    if (!skin || skin.character !== definition.character || skin.name !== definition.name) throw new Error(`样例资料不匹配：${definition.character}`);
    return { ...skin, ...definition, url: `https://l2d.su/cn/skins/${definition.onlineId}/` };
  });
}
function allowedModelUrl(value, sample) {
  try { const u = new URL(value); return u.origin === 'https://l2d.su' && !u.username && !u.password && u.pathname === `/cn/skins/${sample.onlineId}/` && !u.search; }
  catch { return false; }
}
module.exports = { definitions, samplesFrom, allowedModelUrl };
