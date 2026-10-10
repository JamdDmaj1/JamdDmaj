const KEY='jamdFinanceAppearance';
export function readAppearance(storage){
  try{const value=JSON.parse(storage?.getItem(KEY)||'{}');return {theme:['dark','light','system'].includes(value.theme)?value.theme:'dark',compact:value.compact===true,motion:value.motion!==false};}catch{return {theme:'dark',compact:false,motion:true};}
}
export function setupFinancePreferences(parent,language,doc=document,storage=globalThis.localStorage){
  const t=(es,en)=>language==='es'?es:en;
  const panel=doc.createElement('section');panel.className='card';
  const title=doc.createElement('h2');title.textContent=t('Apariencia y configuración','Appearance and settings');panel.append(title);
  const value=readAppearance(storage);
  const theme=doc.createElement('select');theme.id='finance-theme';
  const label=doc.createElement('label');label.htmlFor=theme.id;label.textContent=t('Tema','Theme');
  for(const [id,name]of [['dark',t('Oscuro','Dark')],['light',t('Claro','Light')],['system',t('Sistema','System')]]){const option=doc.createElement('option');option.value=id;option.textContent=name;theme.append(option);}theme.value=value.theme;panel.append(label,theme);
  function toggle(key,text){const row=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.checked=value[key];row.append(input);const caption=doc.createElement('span');caption.textContent=text;row.append(caption);row.className='finance-setting';panel.append(row);input.addEventListener('change',()=>{value[key]=input.checked;apply();});}
  toggle('compact',t('Filas compactas en mercados','Compact market rows'));toggle('motion',t('Animaciones suaves','Smooth animations'));
  const status=doc.createElement('p');status.setAttribute('role','status');panel.append(status);
  const media=doc.defaultView?.matchMedia?.('(prefers-color-scheme: light)');
  function paint(){const root=doc.documentElement;if(!root)return;root.setAttribute('data-finance-theme',value.theme==='system'?(media?.matches?'light':'dark'):value.theme);root.setAttribute('data-finance-compact',String(value.compact));root.setAttribute('data-finance-motion',String(value.motion));}
  function apply(){paint();try{storage?.setItem(KEY,JSON.stringify(value));status.textContent=t('Preferencias guardadas en este dispositivo.','Preferences saved on this device.');}catch{status.textContent=t('Cambio aplicado; no se pudo guardar.','Applied; could not save.');}}
  theme.addEventListener('change',()=>{value.theme=theme.value;apply();});media?.addEventListener?.('change',paint);paint();parent.append(panel);
  return ()=>media?.removeEventListener?.('change',paint);
}
