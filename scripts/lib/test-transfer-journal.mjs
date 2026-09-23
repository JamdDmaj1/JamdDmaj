// Local rehearsal metadata only: signatures/status, NEVER wallet keys or backups.
import {openSync,closeSync,readFileSync,writeFileSync,fsyncSync,renameSync,unlinkSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export function createTestFileJournal(path){
  const load=()=>{
    if(!existsSync(path))return null;
    const text=readFileSync(path,'utf8');if(text.length>2048)throw new Error('invalid-journal-file');return JSON.parse(text);
  };
  return Object.freeze({load,save(record){
    const allowed=['version','owner','network','signature','lastValidBlockHeight','phase'];
    if(!record||Object.keys(record).length!==allowed.length||!allowed.every(key=>Object.hasOwn(record,key)))throw new Error('invalid-journal-fields');
    const data=JSON.stringify(record);if(data.length>2048)throw new Error('journal-too-large');
    const lock=path+'.lock',temporary=path+'.'+randomUUID()+'.tmp';let lockFd=null,fileFd=null;
    try{
      // Stale lock after a process crash blocks: never blindly resend.
      lockFd=openSync(lock,'wx',0o600);
      const previous=load();
      if(previous&&previous.owner!==record.owner)throw new Error('journal-owner-mismatch');
      if(previous&&['uncertain','submitted'].includes(previous.phase)&&previous.signature!==record.signature)throw new Error('unresolved-transaction');
      fileFd=openSync(temporary,'wx',0o600);writeFileSync(fileFd,data,'utf8');fsyncSync(fileFd);closeSync(fileFd);fileFd=null;
      renameSync(temporary,path);
    }finally{
      if(fileFd!==null)closeSync(fileFd);
      if(existsSync(temporary))unlinkSync(temporary);
      if(lockFd!==null){closeSync(lockFd);unlinkSync(lock);}
    }
  }});
}
