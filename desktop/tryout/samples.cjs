const definitions = Object.freeze([
  {
    id: 'azl-e6548902747dbc36',
    character: '瑟堡',
    name: '布偶熊里面的是……？',
    onlineId: '818011',
    label: '图解陪玩',
    verifiedAt: '2026-09-12'
  },
  {
    id: 'azl-24a8b69272bcc3f0',
    character: '狮',
    name: '夜巷中的诱引者',
    onlineId: '205162',
    label: '新装探索',
    verifiedAt: '2026-09-12'
  }
]);
// l2d.su moved Azur Lane skin pages from /cn/skins/<id>/ to /azurlane/skins/<id>/
// (seen 2026-11-06). The old path still loads but rewrites itself to the new one,
// so both paths of the same skin are accepted; any other skin is still rejected.
const modelPaths = onlineId => [`/azurlane/skins/${onlineId}/`, `/cn/skins/${onlineId}/`];
const modelUrl = onlineId => `https://l2d.su${modelPaths(onlineId)[0]}`;
function samplesFrom(catalog) {
  return definitions.map(definition => {
    const skin = catalog.skins.find(skin => skin.id === definition.id);
    if (!skin || skin.character !== definition.character || skin.name !== definition.name)
      throw new Error(`样例资料不匹配：${definition.character}`);
    return { ...skin, ...definition, url: modelUrl(definition.onlineId) };
  });
}
function allowedModelUrl(value, sample) {
  try {
    const u = new URL(value);
    return (
      u.origin === 'https://l2d.su' &&
      !u.username &&
      !u.password &&
      modelPaths(String(sample.onlineId)).includes(u.pathname) &&
      !u.search
    );
  } catch {
    return false;
  }
}
// The other accepted address of the same skin. During a site deploy the CDN can keep a stale
// copy of one page that points at removed scripts; the other path is cached separately.
function alternateModelUrl(currentUrl, sample) {
  let current = '';
  try {
    current = new URL(currentUrl).pathname;
  } catch {
    /* use the first path */
  }
  const path = modelPaths(String(sample.onlineId)).find(p => p !== current) || modelPaths(String(sample.onlineId))[1];
  return `https://l2d.su${path}`;
}
module.exports = { definitions, samplesFrom, allowedModelUrl, modelUrl, alternateModelUrl };
