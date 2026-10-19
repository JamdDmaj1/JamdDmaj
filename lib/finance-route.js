// Public navigation is not authentication or permission to trade. Do not read
// session/profile storage, request private state or accept readiness from URLs.
export function readFinanceRoute(hash=''){
 const route=new URLSearchParams(typeof hash==='string'?hash.replace(/^#/,''):'');
 const requested=route.get('view'),view=['home','markets','trade','futures','assets','automation'].includes(requested)?requested:'home';
 const symbol=String(route.get('symbol')||'').toUpperCase();
 return Object.freeze({view:view==='automation'?'futures':view,openAutomation:view==='automation',symbol:/^[A-Z0-9]{1,20}$/.test(symbol)?symbol:''});
}
