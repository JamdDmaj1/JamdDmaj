import {setupFirstVisitAccess} from './lib/first-visit-access.js';
const language=document.documentElement.lang?.split('-')[0]||'es';
const access=setupFirstVisitAccess(language,document,window);
window.addEventListener('pagehide',()=>access.dispose(),{once:true});
