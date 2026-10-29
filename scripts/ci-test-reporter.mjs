// Expose bounded test failure diagnostics as GitHub annotations. Exit status is
// still controlled by node --test; no failed or skipped tests are reclassified.
function escape(value){return String(value).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');}
export default async function* report(source){
 for await(const event of source){
  const data=event.data||{};
  if(event.type==='test:fail'){
   const error=data.details?.error,cause=error?.cause||error;
   const message=[data.name,cause?.message||error?.message||'Test failed',cause?.stack||''].join('\n').slice(0,2500);
   yield `::error::${escape(message)}\n`;
  }else if(event.type==='test:summary'){
   yield `Test summary: ${JSON.stringify(data.counts||{})}; success=${data.success}\n`;
  }
 }
}
