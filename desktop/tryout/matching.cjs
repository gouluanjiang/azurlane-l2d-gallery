// Matching is deliberately exact. Same-name forms and type changes need review.
const { modelUrl } = require('./samples.cjs');
function auditCatalog(catalog, source) {
  if (!Array.isArray(catalog?.skins) || !Array.isArray(source?.ships) || source.locale !== 'CN') throw new Error('目录格式或语言不正确');
  const seen = new Set();
  const rows = source.ships.flatMap(ship => {
    if (typeof ship.name !== 'string' || !Array.isArray(ship.skins)) throw new Error('在线舰船资料不完整');
    return ship.skins.map(skin => {
      const onlineId = String(skin.id);
      if (!/^\d{5,8}$/.test(onlineId) || seen.has(onlineId)) throw new Error('在线皮肤编号无效或重复');
      seen.add(onlineId);
      return {character:ship.name,name:skin.name,onlineId,dynamicType:skin.dynamicType,isLive2d:skin.isLive2d,isLive2dPlus:skin.isLive2dPlus,resourceKey:skin.prefab,painting:skin.painting};
    });
  });
  const ids = new Set();
  return catalog.skins.map(skin => {
    if (ids.has(skin.id)) throw new Error('本地皮肤编号重复');
    ids.add(skin.id);
    const candidates = rows.filter(row => row.character === skin.character && row.name === skin.name);
    let status = 'review', reason = '';
    if (!candidates.length) reason = '在线目录中没有同角色、同名称的精确记录，需核对名称或资源';
    else if (candidates.length > 1) reason = '同名皮肤对应多个形态，需逐一确认';
    else if (skin.type === '双形态') reason = '本地图鉴标为双形态，需确认完整形态对应关系';
    else if (!['L2D','L2D+'].includes(skin.type)) reason = '本地模型类型需核对';
    else if (!candidates[0].isLive2d || candidates[0].dynamicType !== 'live2d') { status='no-model';reason='精确记录未提供 Live2D 模型'; }
    else if (candidates[0].isLive2dPlus !== (skin.type === 'L2D+')) reason = '本地与在线目录的 L2D / L2D+ 类型不一致';
    else { status='matched';reason='角色、换装名称和 Live2D 类型唯一一致；尚不代表已实测'; }
    return {id:skin.id,character:skin.character,name:skin.name,type:skin.type,status,reason,candidates};
  });
}
function availabilityFrom(catalog, manifest, enabledIds = []) {
  const enabled = new Set(enabledIds);
  const indexed = new Map(manifest.records.map(record => [record.id, record]));
  return catalog.skins.map(skin => {
    const record = indexed.get(skin.id);
    const identityMatches = record && ['character','name','type'].every(key => record[key] === skin[key]);
    const state = identityMatches ? record.status : 'review';
    const playable = state === 'matched' && enabled.has(skin.id);
    return {...skin,status:playable?'playable':state,reason:identityMatches?record.reason:'新记录或资料已变化，等待重新核对',candidates:identityMatches?record.candidates:[],url:state==='matched'?modelUrl(record.candidates[0].onlineId):null};
  });
}
module.exports = {auditCatalog, availabilityFrom};
