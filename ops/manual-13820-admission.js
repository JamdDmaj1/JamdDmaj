// Read-only root-coordinator admission, not a transaction/signing capability.
import {constants,lstatSync,realpathSync,openSync,fstatSync,readFileSync,closeSync} from 'node:fs';
import {dirname} from 'node:path';
export const ADMISSION_PATH='/opt/jamddmaj-perps/checks/manual-13820-stopped-r2.json';
export const SOURCE_SCHEMA='505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9';
export const OLD_WORKER_HASH='17ab1fd592dadd7bc5ca7110da644dbbea3b31f9ed1ecc4226c2cc497258bda5';
export const UNITS=Object.freeze(['jamddmaj-perps-worker','jamddmaj-perps-web','jamddmaj-perps-https']);
function fail(){throw Error('ROOT_MAINTENANCE_ADMISSION_REQUIRED');}
// Public record validation alone is NOT authority; the reader below must also
// verify the root-owned immutable file at the fixed coordinator path.
export function validateStoppedServiceRecord(value,at){
 if(!value||Object.keys(value).sort().join(',')!=='createdAt,journalSchema,stage,units,workerHash'
  ||value.stage!=='MANUAL_13820_STOPPED_SERVICES'||value.journalSchema!==SOURCE_SCHEMA||value.workerHash!==OLD_WORKER_HASH
  ||!Number.isSafeInteger(value.createdAt)||!Number.isSafeInteger(at)||at<value.createdAt||at-value.createdAt>60000
  ||!Array.isArray(value.units)||value.units.length!==UNITS.length)fail();
 for(let i=0;i<UNITS.length;i++){
  const unit=value.units[i];if(!unit||Object.keys(unit).sort().join(',')!=='mainPid,name,state'||unit.name!==UNITS[i]||unit.state!=='inactive'||unit.mainPid!==0)fail();
 }
}
export function readStoppedServiceAdmission(now=Date.now){
 const parent=lstatSync(dirname(ADMISSION_PATH)),before=lstatSync(ADMISSION_PATH);
 if(process.platform!=='linux'||parent.uid!==0||!parent.isDirectory()||(parent.mode&0o022)!==0||realpathSync(dirname(ADMISSION_PATH))!==dirname(ADMISSION_PATH)
  ||before.uid!==0||!before.isFile()||before.nlink!==1||(before.mode&0o777)!==0o444||before.size<1||before.size>4096||realpathSync(ADMISSION_PATH)!==ADMISSION_PATH)fail();
 const fd=openSync(ADMISSION_PATH,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=fstatSync(fd);if(stat.ino!==before.ino||stat.dev!==before.dev||stat.uid!==0||stat.nlink!==1)fail();
  const value=JSON.parse(readFileSync(fd,'utf8')),at=now();
  validateStoppedServiceRecord(value,at);
  const after=lstatSync(ADMISSION_PATH);if(after.ino!==stat.ino||after.dev!==stat.dev||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)fail();
  return Object.freeze(value);
 }finally{closeSync(fd);}
}
