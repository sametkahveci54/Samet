'use strict';
const studioIconPaths={"overview": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z", "mail": "M3 5h18v14H3z M3 6l9 7 9-7", "calendar": "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2", "tasks": "M9 6h11 M9 12h11 M9 18h11 M3 6l1 1 2-3 M3 12l1 1 2-3 M3 18l1 1 2-3", "assistant": "M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z", "settings": "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6", "search": "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5", "sun": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M19 5l-1.5 1.5 M6.5 17.5L5 19", "arrow": "M4 12h16 M14 6l6 6-6 6", "plus": "M12 4v16 M4 12h16", "close": "M6 6l12 12 M18 6L6 18", "brief": "M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h3"};
function workspaceIcon(name,className=''){
  const span=document.createElement('span');span.className=className;span.setAttribute('aria-hidden','true');
  span.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(studioIconPaths[name]||studioIconPaths.assistant)+'"/></svg>';
  return span;
}
function setStudioTheme(theme){
  document.documentElement.dataset.theme=theme;settings.set('theme',theme);
  $('theme-toggle').setAttribute('aria-label',theme==='dark'?'Zum hellen Design wechseln':'Zum dunklen Design wechseln');
  $('theme-toggle').title=theme==='dark'?'Helles Design':'Dunkles Design';
}
$('theme-toggle').onclick=()=>setStudioTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
// appearance.js applies this early, while tests can initialize directly here.
setStudioTheme(document.documentElement.dataset.theme||settings.get('theme','dark'));
const berlinHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'numeric',hourCycle:'h23'}).format(new Date()));
$('overview-title').replaceChildren(document.createTextNode((berlinHour<11?'Guten Morgen':berlinHour<18?'Guten Tag':'Guten Abend')+', Samet'),node('span','.','greeting-dot'));
$('greeting-detail').textContent='Ein klarer Blick auf alles, was für dich zählt.';
function showStudioToast(text){
  $('workspace-toast').textContent=text;$('workspace-toast').hidden=false;
}
function syncStudioView(name){
  $('workspace-toast').hidden=true;
  if(name==='assistant')$('assistant-starters').hidden=history.length>0;
}
let briefingLoading=false;
function sendToJarvis(text){
  text=String(text||'').trim();if(!text)return false;
  if(busy||briefingLoading){showStudioToast('Jarvis bearbeitet gerade deine letzte Anfrage. Du kannst sie oben abbrechen oder kurz warten.');return false;}
  activateView('assistant');$('prompt').value=text;$('chat-form').requestSubmit();return true;
}
$('workspace-command').onsubmit=event=>{
  event.preventDefault();if(sendToJarvis($('workspace-prompt').value))$('workspace-prompt').value='';
};
$('workspace-prompt').onkeydown=event=>{
  if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();$('workspace-command').requestSubmit();}
};
$('quick-today').onclick=()=>sendToJarvis('Was steht heute noch in meinem Kalender an?');
$('quick-priority').onclick=()=>sendToJarvis('Zeige mir die wichtigen Mails.');
$('quick-task').onclick=()=>{activateView('tasks');$('task-title').focus();};
$('starter-today').onclick=()=>sendToJarvis('Was steht heute noch in meinem Kalender an?');
$('starter-mail').onclick=()=>sendToJarvis('Zeige mir die wichtigen Mails.');
$('open-connections').onclick=()=>{activateView('settings');$('connections').open=true;};
$('quick-briefing').onclick=async()=>{
  const button=$('quick-briefing');if(button.disabled||busy)return;button.disabled=true;briefingLoading=true;
  $('workspace-feedback').textContent='Dein Tagesbriefing wird zusammengestellt …';
  try{
    await refreshDay();
    const tasks=personalState?.tasks.filter(t=>!t.done)||[];
    const text=dayText+(personalState?' '+(tasks.length?tasks.length+' offene Aufgaben. Als Nächstes: '+tasks.slice().sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'))[0].title+'.':'Deine Aufgaben sind erledigt.'):'');
    activateView('assistant');add('assistant',text);history.push({role:'assistant',content:text});
    if($('auto-speak').checked)speak(text);
    $('workspace-feedback').textContent='Dein Briefing steht im Assistenten.';
  }catch(error){$('workspace-feedback').textContent=error.message;}
  finally{button.disabled=false;briefingLoading=false;}
};
function updateStudioBadges(){
  const values={mail:mailLoaded?inbox.filter(m=>m.unread).length:null,tasks:personalState?personalState.tasks.filter(t=>!t.done).length:null,calendar:lastCalendarData?lastCalendarData.events.filter(e=>e.all_day||new Date(e.end).getTime()>Date.now()).length:null};
  for(const [name,count]of Object.entries(values)){
    const badge=$('badge-'+name);badge.hidden=!count;badge.textContent=count>99?'99+':String(count||'');badge.setAttribute('aria-hidden','true');
    $('nav-'+name).title=count===null?'Noch nicht geladen':name==='mail'?count+' ungelesene Nachrichten unter den geladenen Mails':name==='calendar'?count+' verbleibende Termine heute':count+' offene Aufgaben';
  }
  if(mailLoaded)$('connection-mail-label').textContent=mailFailure?'Letzte Aktualisierung fehlgeschlagen':'Posteingang aktualisiert · '+mailUpdated?.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  if(mailLoaded){$('connection-mail-dot').dataset.state=mailFailure?'warning':'success';}
}
function updateStudioConnections(value){
  for(const [provider,name]of [['yahoo','mail'],['icloud','calendar']]){
    const connection=value[provider];$('connection-'+name+'-label').textContent=connection.error|| (connection.connected?'Zugang gespeichert':'Noch nicht verbunden');
    $('connection-'+name+'-dot').dataset.state=connection.connected?'configured':'warning';
  }
  updateStudioBadges();
}
let paletteItems=[],paletteIndex=0,paletteFocus=null;
const normalizeSearch=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de');
function closeCommandPalette(){
  $('command-dialog').close();$('command-open').setAttribute('aria-expanded','false');paletteFocus?.focus?.();
}
function openCommandPalette(){
  paletteFocus=document.activeElement;$('command-search').value='';renderCommandResults();
  $('command-dialog').showModal();$('command-open').setAttribute('aria-expanded','true');$('command-search').focus();
}
function commandCatalog(){
  const items=Object.entries(workspaceViews).map(([key,title])=>({title,detail:'Bereich öffnen',icon:key,run:()=>activateView(key)}));
  items.push({title:'Neue Aufgabe',detail:'Aufgabe und Fälligkeit festhalten',icon:'plus',run:()=>{activateView('tasks');$('task-title').focus();}},
    {title:'Neuer Termin',detail:'Termin vorbereiten und zuerst prüfen',icon:'calendar',run:()=>{activateView('calendar');$('new-event').open=true;$('event-title').focus();}},
    {title:'Tagesbriefing',detail:'Kalender, Mails und Aufgaben zusammenfassen',icon:'brief',run:()=>$('quick-briefing').onclick()},
    {title:'Mails aktualisieren',detail:'Yahoo-Posteingang neu laden',icon:'mail',run:()=>{activateView('mail');refreshMail().catch(()=>{});}});
  for(const mail of inbox)items.push({title:mail.subject,detail:'Mail · '+mail.sender,icon:'mail',run:()=>{activateView('mail');selectMail(mail);}});
  for(const task of personalState?.tasks||[])items.push({title:task.title,detail:task.done?'Aufgabe · Erledigt':'Aufgabe'+(task.due?' · '+task.due:' · Offen'),icon:'tasks',run:()=>{activateView('tasks');$('tasks-panel').scrollIntoView({behavior:'smooth',block:'start'});}});
  return items;
}
function markCommandResult(){
  for(let i=0;i<paletteItems.length;i++){
    const button=$('command-option-'+i);button.setAttribute('aria-selected',String(i===paletteIndex));button.className='command-option'+(i===paletteIndex?' is-selected':'');
  }
  $('command-search').setAttribute('aria-activedescendant','command-option-'+paletteIndex);
}
function executeCommand(index){const item=paletteItems[index];if(!item)return;closeCommandPalette();item.run();}
function renderCommandResults(){
  const raw=$('command-search').value.trim(),query=normalizeSearch(raw);const list=$('command-results');list.replaceChildren();
  paletteItems=commandCatalog().filter(item=>!query||normalizeSearch(item.title+' '+item.detail).includes(query)).slice(0,10);
  if(raw)paletteItems.push({title:'Jarvis fragen: '+raw,detail:'Dein Anliegen im Assistenten bearbeiten',icon:'assistant',run:()=>sendToJarvis(raw)});
  paletteIndex=0;
  for(const [index,item]of paletteItems.entries()){
    const button=document.createElement('button');button.type='button';button.id='command-option-'+index;button.setAttribute('role','option');button.tabIndex=-1;
    const text=node('div','');text.append(node('strong',item.title),node('small',item.detail));
    button.append(workspaceIcon(item.icon,'command-option-icon'),text,node('span','↵','command-enter'));button.onclick=()=>executeCommand(index);list.append(button);
  }
  if(!paletteItems.length)list.append(node('p','Tippe einen Begriff oder dein Anliegen ein.','empty-state'));else markCommandResult();
}
$('command-open').setAttribute('aria-haspopup','dialog');$('command-open').setAttribute('aria-expanded','false');
$('command-open').onclick=openCommandPalette;$('command-close').onclick=closeCommandPalette;
$('command-search').oninput=renderCommandResults;
$('command-search').onkeydown=event=>{
  if(['ArrowDown','ArrowUp'].includes(event.key)&&paletteItems.length){event.preventDefault();paletteIndex=(paletteIndex+(event.key==='ArrowDown'?1:-1)+paletteItems.length)%paletteItems.length;markCommandResult();$('command-option-'+paletteIndex).scrollIntoView({block:'nearest'});}
  else if(event.key==='Enter'){event.preventDefault();executeCommand(paletteIndex);}
  else if(event.key==='Escape'){event.preventDefault();closeCommandPalette();}
};
$('command-dialog').addEventListener('click',event=>{if(event.target===$('command-dialog'))closeCommandPalette();});
$('command-dialog').addEventListener('cancel',()=>{$('command-open').setAttribute('aria-expanded','false');});
$('command-dialog').addEventListener('close',()=>{$('command-open').setAttribute('aria-expanded','false');});
document.addEventListener?.('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if($('command-dialog').open)closeCommandPalette();else openCommandPalette();}
});
updateStudioBadges();

if(latestConnections)updateStudioConnections(latestConnections);

updateMailMetric();if(lastCalendarData)updateCalendarMetric(lastCalendarData);if(personalState)renderTasks();

refreshMailOverview();refreshTaskOverview();
