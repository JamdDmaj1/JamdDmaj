import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../ops/jamddmaj-perps-worker.service',import.meta.url),'utf8');
const https=readFileSync(new URL('../ops/jamddmaj-perps-https.service',import.meta.url),'utf8');
const value=(text,key)=>text.split(/\r?\n/).filter(line=>line.startsWith(key+'=')).map(line=>line.slice(key.length+1));

test('HTTPS depends on the shared controls worker, never the retired competing port listener',()=>{
 assert.ok(value(https,'Requires').join(' ').split(/\s+/).includes('jamddmaj-perps-worker.service'));
 assert.ok(value(https,'After').join(' ').split(/\s+/).includes('jamddmaj-perps-worker.service'));
 assert.equal(https.includes('jamddmaj-perps-controls.service'),false);
 assert.match(value(worker,'ExecStart')[0],/ --controls$/);
});

test('installed service composition shares the original private controls without enabling custody or trading',()=>{
 assert.deepEqual(value(worker,'User'),['jamddmaj-perps-controls']);
 assert.deepEqual(value(worker,'StateDirectory')[0].split(/\s+/),['jamddmaj-perps-runtime','jamddmaj-perps-controls']);
 for(const entry of ['JAMDDMAJ_PERPS_RUNTIME_DIRECTORY=/var/lib/private/jamddmaj-perps-runtime',
  'JAMDDMAJ_PERPS_CONTROLS_DIRECTORY=/var/lib/private/jamddmaj-perps-controls',
  'JAMDDMAJ_PERPS_WORKER_MODE=maintenance','JAMDDMAJ_PERPS_EXECUTION_APPROVED=false'])assert.ok(value(worker,'Environment').includes(entry));
 assert.equal(worker.includes('--custody-setup'),false);assert.equal(worker.includes('JAMDDMAJ_PERPS_EXECUTION_APPROVED=true'),false);
 assert.deepEqual(value(worker,'TimeoutStopSec'),['infinity']);
});
