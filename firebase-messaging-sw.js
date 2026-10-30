// Navigation is fixed and same-origin. Clicking a notice never signs or submits a trade.
self.addEventListener('notificationclick',event=>{
 if(event.notification?.data?.jamdPush!==true)return;
 event.stopImmediatePropagation();event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL('/private-simulator.html',self.location.origin).href;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)if(client.url===target&&'focus'in client)return client.focus();
  return self.clients.openWindow(target);
 })());
});
// Bundled after the click handler: Firebase must not replace our safe navigation.
void import('./lib/firebase-push-worker.js');
