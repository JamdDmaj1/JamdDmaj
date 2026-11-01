function normalized(text){return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
export function knowledgeLookupPlan(text,history=[],now=new Date()){
 const input=String(text||'').trim().slice(0,500),q=normalized(input);
 const self=/\b(tu|tus|puedes|pod(es|rias)|you|your|can you)\b/.test(q)&&/\b(aprender|aprendes|aprendizaje|actualizacion|actualizas|entrenamiento|training|learn|learning|update|knowledge cutoff|memoria|memory)\b/.test(q);
 if(self)return {kind:'capabilities',query:'',needsLookup:false};
 const currentOffice=/\b(presidente|president|primer ministro|prime minister|gobernador|governor|alcalde|mayor|ceo)\b/.test(q);
 const historical=/\b(en|in)\s+(19\d{2}|20[0-2]\d)\b/.test(q)&&!/\b(actual|current|ahora|now|hoy|today)\b/.test(q);
 const temporal=/\b(ultimo|ultima|latest|last|reciente|recent|hoy|today|ayer|yesterday|manana|tomorrow|noticia|news|actual|current|ahora|now|precio|price|busca|buscar|search|investiga|research|fuente|fuentes|source|sources|recomienda|recommend|youtube|video|canal|channel)\b/.test(q);
 if(!temporal&&(!currentOffice||historical))return {kind:'general',query:'',needsLookup:false};
 // Resolve only a short public-topic follow-up, never upload the conversation.
 let query=input;
 if(currentOffice&&!/estados unidos|united states|ee\.?\s?uu|usa|mexico|argentina|colombia|espana|spain|chile|brasil|brazil|francia|france|salvador|honduras|peru|venezuela|ecuador|guatemala|costa rica|panama/i.test(q)){
  const country=history.filter(m=>m?.role==='user'&&typeof m.content==='string').slice(-4).reverse().map(m=>m.content.match(/Estados Unidos|United States|México|Mexico|Argentina|Colombia|España|Chile|Brasil|Francia|El Salvador|Honduras|Perú|Venezuela|Ecuador|Guatemala|Costa Rica|Panamá/i)?.[0]).find(Boolean);
  if(country)query+=' '+country;
  else if(/\b(presidente|president|primer ministro|prime minister|gobernador|governor|alcalde|mayor)\b/.test(q))return {kind:'clarify-country',query:'',needsLookup:false};
 }
 if(/\b(seed|mnemonic|private key|clave privada|frase semilla|password|contrasena)\b/.test(normalized(query))||/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(query))return {kind:'private-query',query:'',needsLookup:false};
 return {kind:'current',needsLookup:true,query:(query+(currentOffice&&!historical?' actual '+now.toISOString().slice(0,10):'')).slice(0,500)};
}
export function knowledgeCapabilityReply(locale='es'){
 return locale==='es'
 ? 'Puedo consultar fuentes recientes cuando tu pregunta lo necesita y usar esa información en la respuesta, mostrando la fuente y cuándo se consultó. Eso actualiza el contexto de la consulta, no reentrena mi modelo. Si la consulta falla o la fuente no confirma un dato, debo decírtelo.\n\nLa memoria personal es distinta: solo debo afirmar que algo quedó guardado cuando la app lo confirme, y no convertiré tus conversaciones en conocimiento público. La versión de JamdDmaj y la fecha de entrenamiento del proveedor tampoco son lo mismo; no inventaré una fecha de entrenamiento.'
 : 'I can look up recent sources when a question needs them and use that information with its source and retrieval time. This updates the response context, not the underlying model. If lookup fails or a source does not establish a fact, I must say so.\n\nPersonal memory is separate: I should claim a memory was saved only when the app confirms it, and never turn private chats into public knowledge. The JamdDmaj app version is not the provider model training date; I will not invent a training cutoff.';
}
