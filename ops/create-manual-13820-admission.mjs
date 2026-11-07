// Root-only coordinator evidence. Does not stop services or perform migration.
import {execFileSync} from 'node:child_process';
import {constants,lstatSync,realpathSync,openSync,writeFileSync,fsyncSync,fchmodSync,closeSync} from 'node:fs';
import {dirname} from 'node:path';
import {ADMISSION_PATH,SOURCE_SCHEMA,OLD_WORKER_HASH,UNITS,readStoppedServiceAdmission} from './manual-13820-admission.js';
function fail(){throw Error('STOPPED_SERVICE_ADMISSION_REFUSED');}
if(process.platform!=='linux'||process.getuid()!==0||process.argv.slice(2).join(' ')!=='--after-stopping-services')fail();
const parent=lstatSync(dirname(ADMISSION_PATH));
if(parent.uid!==0||!parent.isDirectory()||(parent.mode&0o022)!==0||realpathSync(dirname(ADMISSION_PATH))!==dirname(ADMISSION_PATH))fail();
const units=UNITS.map(name=>{
 let state;try{state=execFileSync('systemctl',['is-active',name],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch(error){state=error.stdout?.toString().trim();}
 const mainPid=Number(execFileSync('systemctl',['show',name,'--property=MainPID','--value'],{encoding:'utf8'}).trim());
 if(state!=='inactive'||mainPid!==0)fail();return {name,state,mainPid};
});
const fd=openSync(ADMISSION_PATH,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o444);
try{writeFileSync(fd,JSON.stringify({stage:'MANUAL_13820_STOPPED_SERVICES',createdAt:Date.now(),journalSchema:SOURCE_SCHEMA,workerHash:OLD_WORKER_HASH,units}));fsyncSync(fd);fchmodSync(fd,0o444);fsyncSync(fd);}finally{closeSync(fd);}
readStoppedServiceAdmission();console.log('ROOT_STOPPED_SERVICE_ADMISSION_CREATED');
