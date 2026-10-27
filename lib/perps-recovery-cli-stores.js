// Pure argument validation. No file reads, keys, database changes or signing.
import {resolve} from 'node:path';
export function parseRecoveryArchiveStores(args){
 const extra={},paths=[2,4,6,8,10,12,14].map(index=>resolve(args[index]));
 for(let i=15;i<args.length;i+=2){
  const key=args[i],value=args[i+1];
  if(!['--swaps','--fees','--payments'].includes(key)||extra[key]||!value)throw Error('INVALID_RECOVERY_STORES');
  const path=resolve(value);if(paths.includes(path)||!path.endsWith('.sqlite'))throw Error('INVALID_RECOVERY_STORES');
  paths.push(path);extra[key]=value;
 }
 if(Boolean(extra['--fees'])!==Boolean(extra['--payments']))throw Error('INVALID_RECOVERY_STORES');
 return {...(extra['--swaps']?{swapsPath:extra['--swaps']} : {}),...(extra['--fees']?{feesPath:extra['--fees'],paymentsPath:extra['--payments']} : {})};
}
