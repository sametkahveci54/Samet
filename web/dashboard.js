'use strict';
const workspaceViews={overview:'Übersicht',mail:'Posteingang',calendar:'Kalender',tasks:'Aufgaben',assistant:'Assistent',settings:'Einstellungen'};
let lastCalendarData=null;
function activateView(name,remember=true){
  if(!workspaceViews[name])name='overview';
  for(const key of Object.keys(workspaceViews)){
    $('view-'+key).hidden=key!==name;
    if(key===name)$('nav-'+key).setAttribute('aria-current','page');else $('nav-'+key).removeAttribute('aria-current');
  }
  document.body.dataset.view=name;
  $('page-title').textContent=workspaceViews[name];
  if(typeof syncStudioView==='function')syncStudioView(name);
  if(remember)window.history?.replaceState(null,'','#'+name);
  if(name==='calendar'&&!lastCalendarData&&!calendarFailure)refreshCalendar().catch(()=>{});
}
function revealTarget(id){
  const target=$(id),view=target.closest?.('.view');if(view)activateView(view.id.replace('view-',''));
  for(let parent=target.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}
}
for(const key of Object.keys(workspaceViews))$('nav-'+key).onclick=()=>activateView(key);
window.addEventListener?.('hashchange',()=>{const name=window.location.hash.slice(1);if(workspaceViews[name])activateView(name,false);});
$('today-label').textContent=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
$('open-mail').onclick=()=>activateView('mail');
$('open-tasks').onclick=()=>activateView('tasks');
$('open-assistant').onclick=()=>{activateView('assistant');$('prompt').focus();};
$('mail-connect-shortcut').onclick=()=>{activateView('settings');$('connections').open=true;$('yahoo-email').focus();};
$('open-overview').onclick=()=>{activateView('calendar');if(lastCalendarData)refreshCalendar().catch(()=>{});};
function updateMailMetric(){
  metric('priority-count','Mails zum Prüfen',mailLoaded?inbox.filter(m=>['prioritaet','pruefen'].includes(m.category)).length+' von '+inbox.length+' geladenen Mails'+(mailFailure?' · Aktualisierung fehlgeschlagen':''):mailFailure?'Yahoo-Verbindung prüfen':'Posteingang wird geladen …');
}
function updateCalendarMetric(data){
  const next=data.events.find(e=>!e.all_day&&new Date(e.end).getTime()>Date.now())||data.events.find(e=>e.all_day);
  metric('next-appointment','Nächster Termin',next?(next.all_day?'Ganztägig':berlinTime(next.start)+' Uhr')+' · '+next.title:data.warnings.length?'Kalender unvollständig':'Heute nichts Weiteres');
}
function refreshMailOverview(){
  if(typeof updateStudioBadges==='function')updateStudioBadges();
  const list=$('overview-mails');list.replaceChildren();
  if(!mailLoaded){list.append(node('p',mailFailure||'Posteingang wird geladen …','empty-state'));return;}
  if(mailFailure)list.append(node('p','Aktualisierung fehlgeschlagen. Zuletzt geladene Mails:','connection-alert'));
  if(!inbox.length){list.append(node('p','Dein Yahoo-Posteingang ist leer.','empty-state'));return;}
  for(const mail of inbox.slice(0,4)){
    const row=node('div','','compact-item'),button=document.createElement('button');button.type='button';
    const text=node('div','');text.append(node('strong',mail.subject),node('small',mail.sender));
    button.append(text);button.onclick=()=>{activateView('mail');selectMail(mail);};
    row.append(typeof workspaceIcon==='function'?workspaceIcon('mail','mail-avatar'):node('span','✉','mail-avatar'),button);list.append(row);
  }
}
function refreshCalendarOverview(data){
  lastCalendarData=data;if(typeof updateStudioBadges==='function')updateStudioBadges();const list=$('overview-events');list.replaceChildren();
  if(data.warnings.length)list.append(node('p','Übersicht unvollständig. Hinweise unter Kalender beachten.','connection-alert'));
  const events=data.events.filter(e=>e.all_day||new Date(e.end).getTime()>Date.now());
  if(!events.length)list.append(node('p',data.warnings.length?'Keine verbleibenden Termine geladen.':'Heute stehen keine weiteren Termine an.','empty-state'));
  for(const event of events.slice(0,4)){
    const row=node('div','','compact-item'),text=node('div','');text.append(node('strong',event.title),node('small',event.calendar+(event.location?' · '+event.location:'')));
    row.append(node('span',event.all_day?'GANZ­TAGS':berlinTime(event.start),'date-mark'),text);list.append(row);
  }
}
function calendarOverviewError(error){
  const list=$('overview-events');
  if(!lastCalendarData){list.replaceChildren(node('p',error.message,'empty-state'));metric('next-appointment','Nächster Termin','Kalender-Verbindung prüfen');}
  else{list.replaceChildren(node('p','Aktualisierung fehlgeschlagen. '+error.message,'connection-alert'));}
}
function refreshTaskOverview(){
  if(typeof updateStudioBadges==='function')updateStudioBadges();
  const list=$('overview-tasks');list.replaceChildren();if(!personalState)return;
  const tasks=personalState.tasks.filter(t=>!t.done).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  if(!tasks.length){list.append(node('p','Alles erledigt. Neue Aufgaben kannst du direkt unter Aufgaben hinzufügen.','empty-state'));return;}
  for(const task of tasks.slice(0,4)){
    const row=node('div','','compact-item'),button=document.createElement('button');button.type='button';button.onclick=()=>activateView('tasks');
    button.append(node('strong',task.title),node('small',task.due?'Fällig: '+new Date(task.due+'T12:00:00').toLocaleDateString('de-DE'):'Ohne Fälligkeitsdatum'));
    row.append(typeof workspaceIcon==='function'?workspaceIcon('tasks','mail-avatar'):node('span','✓','mail-avatar'),button);list.append(row);
  }
}
activateView(window.location?.hash?.slice(1)||'assistant',false);
refreshMailOverview();refreshTaskOverview();
// Mail is the default read-only startup action. Calendar loads independently
// when its view/overview is requested; failures never hide the inbox.
refreshMail().catch(()=>{});

function refreshVisibleInbox(){
  if(document.visibilityState==='visible'&&!chosenMail&&mailUpdated&&Date.now()-mailUpdated.getTime()>300000)refreshMail().catch(()=>{});
}
document.addEventListener?.('visibilitychange',refreshVisibleInbox);
setInterval(refreshVisibleInbox,60000);
