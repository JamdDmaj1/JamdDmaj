import test from 'node:test';
import assert from 'node:assert/strict';
import report from '../scripts/ci-test-reporter.mjs';
test('CI reporter exposes bounded escaped failures without changing test outcomes',async()=>{
 const entries=[{type:'test:fail',data:{name:'fixture',details:{error:{cause:{message:'bad\n::notice::injection%',stack:'x'.repeat(4000)}}}}},{type:'test:summary',data:{counts:{failed:1},success:false}}];
 let output='';for await(const part of report(entries))output+=part;
 assert.match(output,/^::error::fixture%0Abad%0A::notice::injection%25/);
 assert.ok(output.length<2700);assert.match(output,/success=false/);
});
