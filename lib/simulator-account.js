import {openPosition,pnl,liquidationPrice,exitReason} from './private-simulator.js?v=5';
export class SimulatorAccount {
 constructor(){this.cash=10000;this.positions=[];this.orders=[];this.marks={};this.nextId=1;}
 mark(symbol,price){if(!Number.isFinite(price)||price<=0)throw new Error('Precio inválido');this.marks[symbol]=price;}
 price(p,value){return typeof value==='number'?value:(this.marks[p.symbol]??p.entry);}
 profit(value){return this.positions.reduce((s,p)=>s+pnl(p,this.price(p,value)),0);}
 equity(value){return Math.max(0,this.cash+this.positions.reduce((s,p)=>s+(p.mode==='isolated'?Math.max(-p.margin,pnl(p,this.price(p,value))):pnl(p,this.price(p,value))),0));}
 available(value){const base=this.positions[0]?.mode==='cross'?Math.min(this.cash,this.equity(value)):this.cash;return Math.max(0,base-[...this.positions,...this.orders].reduce((s,p)=>s+p.margin,0));}
 validateMode(mode){const active=this.positions[0]||this.orders[0];if(active&&active.mode!==mode)throw new Error('Cierra posiciones y cancela órdenes antes de cambiar el modo de margen.');}
 open(args){this.validateMode(args.mode);const symbol=args.symbol||'default';const p=openPosition({...args,balance:this.available()});this.mark(symbol,args.price);p.collateral=p.margin;p.id=this.nextId++;p.symbol=symbol;p.name=args.name||symbol;this.positions.push(p);return p;}
 submit(args){if(args.type!=='limit')return this.open(args);this.validateMode(args.mode);if(!Number.isFinite(args.limit)||args.limit<=0)throw new Error('Precio limit inválido');openPosition({...args,price:args.limit,balance:this.available()});this.mark(args.symbol||'default',args.price);const o={...args,symbol:args.symbol||'default',name:args.name||args.symbol||'default',id:this.nextId++};this.orders.push(o);return o;}
 cancel(id){this.orders=this.orders.filter(o=>o.id!==id);}
 liquidation(p){if(p.mode==='isolated')return liquidationPrice(p);const same=this.positions.filter(q=>q.symbol===p.symbol),other=this.positions.filter(q=>q.symbol!==p.symbol).reduce((s,q)=>s+pnl(q,this.price(q)),0),slope=same.reduce((s,q)=>s+q.quantity*(q.side==='long'?1:-1),0),basis=same.reduce((s,q)=>s+q.entry*q.quantity*(q.side==='long'?1:-1),0),maintenance=this.positions.reduce((s,q)=>s+q.margin*.05,0);if(Math.abs(slope)<1e-12)return null;const value=(maintenance-this.cash-other+basis)/slope;return value>0?value:null;}
 close(id,value,reason='Cierre manual'){const p=this.positions.find(p=>p.id===id);if(!p)return null;const price=this.price(p,value),result=p.mode==='isolated'?Math.max(-p.margin,pnl(p,price)):pnl(p,price);this.cash+=result;this.positions=this.positions.filter(q=>q.id!==id);if(!this.positions.length)this.cash=Math.max(0,this.cash);return {...p,result,reason};}
 closeAll(value,reason='Cerrar todas'){const records=this.positions.map(p=>({...p,result:p.mode==='isolated'?Math.max(-p.margin,pnl(p,this.price(p,value))):pnl(p,this.price(p,value)),reason}));const total=records.reduce((s,r)=>s+r.result,0);if(this.cash+total<0&&records.length)records[0].result+=-(this.cash+total);this.cash=Math.max(0,this.cash+total);this.positions=[];return records;}
 tick(value){
  if(typeof value==='number')for(const p of this.positions)this.mark(p.symbol,value);
  const records=[];
  if(this.positions[0]?.mode==='cross'&&this.cash+this.profit()<=this.positions.reduce((s,p)=>s+p.margin*.05,0)){this.orders=[];return this.closeAll(undefined,'Liquidación cross simulada');}
  for(const p of [...this.positions]){const price=this.price(p),reason=p.mode==='isolated'?exitReason(p,price):(p.stop!==null&&(p.side==='long'?price<=p.stop:price>=p.stop)?'Stop loss':p.take!==null&&(p.side==='long'?price>=p.take:price<=p.take)?'Take profit':null);if(reason)records.push(this.close(p.id,undefined,reason));}
  for(const o of [...this.orders]){const price=this.marks[o.symbol];if(!(o.side==='long'?price<=o.limit:price>=o.limit))continue;this.cancel(o.id);try{this.open({...o,price});}catch{records.push({...o,result:0,reason:'Limit cancelada: saldo o protección inválidos al ejecutar'});}}
  return records;
 }
}
