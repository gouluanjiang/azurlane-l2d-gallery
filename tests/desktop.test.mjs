import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getPublicRemoteCatalog, getPublicSnapshot, sha256 } from '../scripts/lib/transport.mjs';
import policy from '../desktop/policy.cjs';

test('public desktop sync pins catalog requests to the returned commit without a CLI', async()=>{
  const sha='a'.repeat(40),calls=[],catalog={version:'verified',skins:[]};
  const result=await getPublicRemoteCatalog({repository:'gouluanjiang/azurlane-l2d-gallery',branch:'main'},{fetchImpl:async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);
    return Response.json(calls.length===1?{sha}:{encoding:'base64',content:Buffer.from(JSON.stringify(catalog)).toString('base64')});
  }});
  assert.equal(result.commit,sha);assert.deepEqual(result.catalog,catalog);assert.ok(calls[1].endsWith(`?ref=${sha}`));
});
test('desktop cloud transport rejects bad commits and HTTP failures before applying data',async()=>{
  let count=0;
  await assert.rejects(getPublicRemoteCatalog({repository:'a/b',branch:'main'},{fetchImpl:async()=>{count++;return Response.json({sha:'main'});}}),/有效版本/);
  assert.equal(count,1);
  await assert.rejects(getPublicRemoteCatalog({repository:'a/b',branch:'main'},{fetchImpl:async()=>new Response('limited',{status:403})}),/暂时受限/);
  await assert.rejects(getPublicRemoteCatalog({repository:'https://evil.test',branch:'main'}),/配置格式/);
});
test('desktop protocol serves only gallery code, mirror and local image paths',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'l2d-desktop-'));
  try{
    fs.mkdirSync(path.join(root,'assets/skins'),{recursive:true});fs.writeFileSync(path.join(root,'assets/skins/example.jpg'),'image');
    fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data/skins-data.js'),'catalog');
    assert.equal(policy.localResource('l2d://gallery/assets/skins/example.jpg',root,root),path.join(root,'assets/skins/example.jpg'));
    for(const url of ['l2d://gallery/local-config.json','l2d://gallery/.git/config','l2d://gallery/assets/%2e%2e%5csecret.jpg','l2d://other/data/skins-data.js','https://gallery/data/skins-data.js','l2d://gallery/assets/code.js'])assert.throws(()=>policy.localResource(url,root,root));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('external navigation cannot launch executable protocols or unrelated sites',()=>{
  assert.equal(policy.externalUrl('https://search.bilibili.com/all?keyword=L2D'),'https://search.bilibili.com/all?keyword=L2D');
  for(const url of ['file:///C:/Windows/system32/cmd.exe','javascript:alert(1)','https://example.com/','https://github.com/other/repo','https://user:password@search.bilibili.com/'])assert.throws(()=>policy.externalUrl(url));
});

test('public snapshot avoids API quotas and records the actual response digest',async()=>{
  const body=JSON.stringify({version:'snapshot',skins:[]});let calls=0;
  const result=await getPublicSnapshot({repository:'a/b',branch:'main'},{fetchImpl:async url=>{calls++;assert.equal(url,'https://raw.githubusercontent.com/a/b/main/data/catalog.json');return new Response(body);}});
  assert.equal(calls,1);assert.equal(result.commit,null);assert.equal(result.snapshotSha256,sha256(Buffer.from(body)));assert.equal(result.catalog.version,'snapshot');
});
test('public snapshot falls back to a pinned API response if the CDN fails',async()=>{
  let count=0;const sha='b'.repeat(40);
  const result=await getPublicSnapshot({repository:'a/b',branch:'main'},{fetchImpl:async()=>{count++;if(count===1)throw new Error('CDN unavailable');return Response.json(count===2?{sha}:{encoding:'base64',content:Buffer.from('{"version":"fallback"}').toString('base64')});}});
  assert.equal(count,3);assert.equal(result.commit,sha);assert.equal(result.catalog.version,'fallback');
});
