// Private operator recovery filesystem only. Never a browser or HTTP module.
import {constants,mkdirSync,lstatSync,realpathSync,openSync,closeSync,fstatSync,readFileSync,writeFileSync,fsyncSync} from 'node:fs';
import {isAbsolute,resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
let windowsSid;
function fail(){throw Error('PERPS_PRIVATE_RECOVERY_FILES_UNAVAILABLE');}
function canonical(path){if(typeof path!=='string'||!isAbsolute(path))fail();return resolve(path);}
function same(a,b){return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;}
function powershell(script,env={}){return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,...env},timeout:10000});}
function sid(){if(!windowsSid){windowsSid=powershell('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value').trim();if(!/^S-[0-9-]+$/.test(windowsSid))fail();}return windowsSid;}
function windowsPrivate(path,create,directory){
 if(create){
  const owner=sid(),flags=directory?':(OI)(CI)F':':F';
  execFileSync('icacls.exe',[path,'/setowner','*'+owner],{windowsHide:true,stdio:'ignore',timeout:10000});
  execFileSync('icacls.exe',[path,'/inheritance:r','/grant:r','*'+owner+flags,'*S-1-5-18'+flags],{windowsHide:true,stdio:'ignore',timeout:10000});
 }
 powershell(`$ErrorActionPreference='Stop'
 $path=$env:JAMDDMAJ_RECOVERY_ACL_PATH
 if([IO.Directory]::Exists($path)){$acl=[IO.Directory]::GetAccessControl($path)}else{$acl=[IO.File]::GetAccessControl($path)}
 $me=$env:JAMDDMAJ_RECOVERY_ACL_OWNER
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $me){exit 1}
 $found=$false
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.AccessControlType -eq 'Allow'){
   if($rule.IdentityReference.Value -notin @($me,'S-1-5-18')){exit 1}
   if($rule.IdentityReference.Value -eq $me -and (([int]$rule.FileSystemRights -band [int][Security.AccessControl.FileSystemRights]::FullControl) -eq [int][Security.AccessControl.FileSystemRights]::FullControl)){$found=$true}
  }
 }
 if(-not $found){exit 1}`,{JAMDDMAJ_RECOVERY_ACL_PATH:path,JAMDDMAJ_RECOVERY_ACL_OWNER:sid()});
}
export function checkPrivateRecoveryPath(path,directory,tests=false){
 path=canonical(path);const stat=lstatSync(path);
 if(stat.isSymbolicLink()||!same(realpathSync(path),path)||(directory?!stat.isDirectory():!stat.isFile())||!directory&&stat.nlink!==1)fail();
 if(process.platform==='win32'){if(!tests)windowsPrivate(path,false,directory);}
 else if(stat.uid!==process.getuid()||(stat.mode&0o077)!==0)fail();
 return {path,stat};
}
export function readPrivateRecoveryFile(path,max,tests=false){
 const before=checkPrivateRecoveryPath(path,false,tests),fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const stat=fstatSync(fd);if(stat.ino!==before.stat.ino||stat.dev!==before.stat.dev||stat.nlink!==1||!stat.isFile()||stat.size<1||stat.size>max)fail();return readFileSync(fd);}finally{closeSync(fd);}
}
export function syncPrivateRecoveryDirectory(path){if(process.platform==='win32')return;const fd=openSync(path,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
export function writePrivateRecoveryFile(path,data,tests=false){
 checkPrivateRecoveryPath(dirname(path),true,tests);let fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 // ACL tools require an unopened file; the empty file already has a verified
 // private parent and no secret is written until ACL and identity checks pass.
 if(process.platform==='win32'&&!tests){
  const initial=fstatSync(fd);closeSync(fd);windowsPrivate(path,true,false);checkPrivateRecoveryPath(path,false,tests);
  fd=openSync(path,constants.O_WRONLY|(constants.O_NOFOLLOW??0));const actual=fstatSync(fd);
  if(actual.ino!==initial.ino||actual.dev!==initial.dev||actual.size!==0){closeSync(fd);fail();}
 }
 try{checkPrivateRecoveryPath(path,false,tests);writeFileSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);}syncPrivateRecoveryDirectory(dirname(path));
}
export function makePrivateRecoveryDirectory(path,tests=false){
 path=canonical(path);mkdirSync(path,{mode:0o700});if(process.platform==='win32'&&!tests)windowsPrivate(path,true,true);checkPrivateRecoveryPath(path,true,tests);syncPrivateRecoveryDirectory(dirname(path));return path;
}
