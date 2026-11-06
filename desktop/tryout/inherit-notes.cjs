const fs=require('node:fs');
const path=require('node:path');
const {NotesStore}=require('./notes.cjs');
// Keep each release's notes independent. Copy once, never overwrite either file.
function inheritNotes(sourceFolder,targetFolder,ids) {
  const source=new NotesStore(sourceFolder,ids),target=new NotesStore(targetFolder,ids);
  if (fs.existsSync(target.file)) return 'existing';
  fs.mkdirSync(targetFolder,{recursive:true});
  if (fs.existsSync(source.file)) {
    for (const id of ids) source.get(id);
    try { fs.copyFileSync(source.file,target.file,fs.constants.COPYFILE_EXCL); } catch(error) { if(error.code!=='EEXIST')throw error; }
    return 'inherited';
  }
  fs.writeFileSync(target.file,JSON.stringify({schemaVersion:1,skins:{}})+'\n',{flag:'wx'});
  return 'empty';
}
module.exports={inheritNotes};
