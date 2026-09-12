const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async()=>{
  try {
    const script=process.argv[2];
    if(!['sync.mjs','check-updates.mjs'].includes(script))throw new Error('无效更新操作');
    await import(pathToFileURL(path.join(__dirname,'..','scripts',script)).href);
  } catch(error) {console.error(error.message);process.exitCode=1;}
  const code=process.exitCode||0;
  process.stdout.write('',()=>process.exit(code));
})();
