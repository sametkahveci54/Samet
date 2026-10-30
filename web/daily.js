'use strict';
let personalState=null, calendarOptions=[], proposal=null;
function metric(id,title,detail){const icon=typeof workspaceIcon==='function'?workspaceIcon(id==='next-appointment'?'calendar':id==='priority-count'?'mail':'tasks','stat-icon'):node('span',id==='next-appointment'?'▦':id==='priority-count'?'✉':'✓','stat-icon');icon.setAttribute('aria-hidden','true');const copy=node('span',title);copy.append(node('small',detail));$(id).replaceChildren(icon,copy);}
function localInput(iso){const date=new Date(iso);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function go(id){if(typeof revealTarget==='function')revealTarget(id);$(id).scrollIntoView({behavior:'smooth',block:'start'});}
function dayMetrics(results){
  if(results[0].status==='fulfilled'){
    const data=results[0].value;
    const next=data.events.find(e=>!e.all_day&&new Date(e.end).getTime()>Date.now())||data.events.find(e=>e.all_day);
    metric('next-appointment','Nächster Termin',next?(next.all_day?'Ganztägig':new Date(next.start).getTime()<=Date.now()?'Läuft gerade':berlinTime(next.start)+' Uhr')+' · '+next.title:data.warnings.length?'Übersicht unvollständig':'Heute nichts Weiteres');
  }else metric('next-appointment','Nächster Termin','Kalender konnte nicht geladen werden');
  if(results[1].status==='fulfilled')metric('priority-count','Mails zum Prüfen',inbox.filter(m=>['prioritaet','pruefen'].includes(m.category)).length+' von '+inbox.length+' geladenen Mails');
  else metric('priority-count','Mails zum Prüfen','Mails konnten nicht geladen werden');
}
$('open-overview').onclick=()=>refreshDay();
$('next-appointment').onclick=()=>go('organizer-title');
$('priority-count').onclick=()=>go('mail-filter');
$('task-count').onclick=()=>go('tasks-panel');
function calendarChoices(values){
  calendarOptions=values.filter(c=>c.writable);
  const select=$('default-calendar'),previous=personalState?.preferences.default_calendar||'';
  select.replaceChildren(node('option','Bei mehreren Kalendern nachfragen'));select.firstChild.value='';
  for(const calendar of calendarOptions){const option=node('option',calendar.name);option.value=calendar.id;select.append(option);}
  if(calendarOptions.some(c=>c.id===previous)){
    select.value=previous;
    if(!$('event-calendar').value)$('event-calendar').value=previous;
  }
}
function renderTasks(){
  const tasks=personalState.tasks;
  const open=tasks.filter(t=>!t.done),today=berlinDay(new Date());
  metric('task-count','Offene Aufgaben',open.length+' offen · '+open.filter(t=>t.due&&t.due<today).length+' überfällig');
  $('task-list').replaceChildren();
  for(const task of [...tasks].sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||'9999').localeCompare(b.due||'9999'))){
    const form=document.createElement('form');form.className='task-row';
    const done=document.createElement('input');done.type='checkbox';done.checked=task.done;done.setAttribute('aria-label','Erledigt: '+task.title);
    const title=document.createElement('input');title.value=task.title;title.maxLength=200;title.required=true;title.setAttribute('aria-label','Aufgabe bearbeiten');
    const due=document.createElement('input');due.type='date';due.value=task.due;due.setAttribute('aria-label','Fälligkeitsdatum bearbeiten');
    const save=node('button','Änderungen speichern');save.type='submit';
    const remove=node('button','Entfernen','quiet');remove.type='button';
    form.append(done,title,due,save,remove);
    if(task.due&&task.due<today&&!task.done)form.append(node('small','Überfällig'));
    const update=async()=>{await personalRequest('/api/personal/task/update',{id:task.id,title:title.value,due:due.value,done:done.checked},'task-status');};
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await update();}finally{save.disabled=false;}};
    done.onchange=async()=>{done.disabled=true;try{await update();}finally{done.disabled=false;}};
    remove.onclick=()=>personalRequest('/api/personal/task/delete',{id:task.id},'task-status');
    $('task-list').append(form);
  }
  if(!tasks.length)$('task-list').append(node('p','Noch keine Aufgaben gespeichert.'));
}
function renderMemories(){
  $('memory-list').replaceChildren();
  for(const memory of personalState.memories){
    const form=document.createElement('form');form.className='memory-row';
    const input=document.createElement('textarea');input.value=memory.text;input.maxLength=250;input.required=true;input.rows=3;input.setAttribute('aria-label','Gespeicherte Information bearbeiten');
    const save=node('button','Änderung speichern');save.type='submit';const remove=node('button','Löschen','quiet');remove.type='button';
    form.append(input,save,remove);
    form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await personalRequest('/api/personal/memory/save',{id:memory.id,text:input.value},'memory-status');}finally{save.disabled=false;}};
    remove.onclick=()=>personalRequest('/api/personal/memory/delete',{id:memory.id},'memory-status');
    $('memory-list').append(form);
  }
  if(!personalState.memories.length)$('memory-list').append(node('p','Jarvis hat noch keine ausdrücklich gespeicherten Informationen.'));
}
function applyPersonal(value,fill=false){
  personalState=value;renderTasks();renderMemories();if(typeof refreshTaskOverview==='function')refreshTaskOverview();
  if(fill){const p=value.preferences;$('reply-tone').value=p.tone;$('reply-signature').value=p.signature;
    $('priority-senders').value=p.priority_senders.join('\n');$('priority-keywords').value=p.priority_keywords.join('\n');$('calendar-buffer').value=p.buffer_minutes;calendarChoices(calendarOptions);}
}
async function personalRequest(path,data,feedback){
  try{const result=await api(path,data);applyPersonal(result.state);$(feedback).textContent=result.message;return true;}
  catch(error){$(feedback).textContent=error.message;return false;}
}
$('task-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{if(await personalRequest('/api/personal/task/add',{title:$('task-title').value,due:$('task-due').value},'task-status'))$('task-form').reset();}finally{button.disabled=false;}};
$('memory-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{if(await personalRequest('/api/personal/memory/add',{text:$('memory-text').value},'memory-status'))$('memory-form').reset();}finally{button.disabled=false;}};
$('preferences-form').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{
    const lines=id=>$(id).value.split('\n').map(s=>s.trim()).filter(Boolean);
    const value=await api('/api/personal/preferences',{tone:$('reply-tone').value,signature:$('reply-signature').value,
      priority_senders:lines('priority-senders'),priority_keywords:lines('priority-keywords'),buffer_minutes:Number($('calendar-buffer').value),default_calendar:$('default-calendar').value});
    applyPersonal(value.state);$('preferences-status').textContent='Gespeichert. Für die neue Mail-Sortierung die Tagesübersicht erneut laden.';
  }catch(error){$('preferences-status').textContent=error.message;}
  finally{button.disabled=false;}
};
function conflictPreview(event){
  const conflicts=event.conflicts||[],warnings=event.conflict_warnings||[];
  const lines=conflicts.map(item=>eventTime(item)+' · '+item.title+' ('+item.calendar+')');
  $('event-conflicts').textContent=(conflicts.length?'Überschneidungen einschließlich '+(event.buffer_minutes||0)+' Minuten Puffer:\n'+lines.join('\n'):'Keine Überschneidung im geprüften Zeitraum.')+(warnings.length?'\nPrüfung unvollständig: '+warnings.join(' '):'');
  $('conflict-ack-label').hidden=!(conflicts.length||warnings.length);$('conflict-ack').checked=false;
}
async function presentProposal(value){
  if(value.kind==='event'){
    $('new-event').open=true;await loadCalendars();
    const fields=value.fields;$('event-title').value=fields.title;$('event-location').value=fields.location;
    $('event-start').value=localInput(fields.start);$('event-end').value=localInput(fields.end);$('event-reminder').value=String(fields.reminder);
    const selected=personalState?.preferences.default_calendar;
    const hinted=calendarOptions.find(c=>c.name.toLocaleLowerCase('de-DE')===(value.calendar_hint||'').toLocaleLowerCase('de-DE'));
    if(value.calendar_hint)$('event-calendar').value=hinted?hinted.id:'';
    else if(calendarOptions.some(c=>c.id===selected))$('event-calendar').value=selected;
    else if(calendarOptions.length===1)$('event-calendar').value=calendarOptions[0].id;
    cancelPreview();$('event-status').textContent=(value.source||'')+' '+value.message;go('new-event');
    if($('event-calendar').value)$('event-form').requestSubmit();
    return value.message;
  }
  if(['task','memory'].includes(value.kind)){
    proposal=value;$('action-proposal').hidden=false;$('proposal-confirm').disabled=false;
    $('proposal-title').textContent=value.kind==='task'?'Aufgabe prüfen':'Information zum Merken prüfen';
    $('proposal-text').textContent=value.kind==='task'?value.payload.title+(value.payload.due?' · Fällig: '+value.payload.due:' · Ohne Fälligkeitsdatum'):value.payload.text;
    $('proposal-status').textContent='Noch nicht gespeichert. Du kannst bestätigen oder verwerfen.';go('action-proposal');
    return value.message;
  }
  return null;
}
$('proposal-cancel').onclick=()=>{proposal=null;$('action-proposal').hidden=true;};
$('proposal-confirm').onclick=async()=>{
  if(!proposal)return;const confirmation=proposal.confirmation;proposal=null;$('proposal-confirm').disabled=true;
  try{const result=await api('/api/assistant/confirm',{confirmation});applyPersonal(result.state);$('proposal-status').textContent=result.message;}
  catch(error){$('proposal-status').textContent=error.message;}
};
function selectMailExtras(mail){
  $('mail-excerpt').open=false;$('mail-action-status').textContent='';
  $('mail-summary').textContent=mail.snippet.length>800?'Lange Mail: Kurzzusammenfassung wird vorbereitet …':mail.snippet||'Kein lesbarer Textauszug.';
  if(mail.snippet.length>800)summarySelected(mail.id);
}
async function summarySelected(id){
  $('mail-summarize').disabled=true;
  try{const data=await api('/api/mail/summary',{id});if(chosenMail?.id===id)$('mail-summary').textContent='KI-Kurzzusammenfassung: '+data.summary+(data.partial?' Die Mail wurde nur teilweise geladen.':'');}
  catch(error){if(chosenMail?.id===id)$('mail-summary').textContent=error.message+' Den verfügbaren Auszug kannst du unten öffnen.';}
  finally{$('mail-summarize').disabled=false;}
}
$('mail-summarize').onclick=()=>{if(chosenMail)return summarySelected(chosenMail.id);};
async function mailProposal(kind){
  if(!chosenMail){$('mail-action-status').textContent='Bitte zuerst eine Mail auswählen.';return;}
  const id=chosenMail.id;$('mail-action-status').textContent='Vorschlag wird aus dem Mailauszug vorbereitet …';
  try{const value=await api('/api/assistant/mail-'+kind,{id});if(chosenMail?.id!==id)return;$('mail-action-status').textContent=value.message;await presentProposal(value);}
  catch(error){$('mail-action-status').textContent=error.message;}
}
$('mail-event').onclick=()=>mailProposal('event');$('mail-task').onclick=()=>mailProposal('task');
$('important-summary').onclick=async()=>{
  const button=$('important-summary');button.disabled=true;$('important-result').textContent='Geladene Mails werden zusammengefasst …';
  try{const data=await api('/api/mail/important-summary',{});$('important-result').textContent='Aus '+data.count+' kürzlich geladenen Mailauszügen'+(data.limited?' (Auswahl auf acht begrenzt)':'')+': '+data.summary;}
  catch(error){$('important-result').textContent=error.message;}
  finally{button.disabled=false;}
};
function renderRuntimeStatus(value){
  $('system-version').textContent='Laufende Version: '+(value.version||'unbekannt')+(value.revision?' · '+value.revision:'');
  const updater=value.updater;
  $('system-updater').textContent=updater?(updater.fresh?'Update-Dienst meldet sich: ':'Kein aktuelles Signal vom Update-Dienst. ')+updater.message:'Update-Status noch nicht verfügbar.';
  for(const provider of ['yahoo','icloud']){
    const entry=value.connections?.[provider];
    $('system-'+provider).textContent=(provider==='yahoo'?'Yahoo':'iCloud')+': '+(entry?(entry.ok?'Zuletzt erfolgreich geprüft. ':'Prüfung fehlgeschlagen. ')+entry.message+' '+new Date(entry.checked_at*1000).toLocaleTimeString('de-DE'):'Noch nicht in dieser Sitzung geprüft.');
  }
}
$('test-connections').onclick=async()=>{
  const button=$('test-connections');button.disabled=true;$('system-feedback').textContent='Yahoo und iCloud werden geprüft …';
  try{await api('/api/connections/test',{});await status();$('system-feedback').textContent='Prüfung abgeschlossen. Ergebnisse stehen darüber.';}
  catch(error){$('system-feedback').textContent=error.message;}
  finally{button.disabled=false;}
};
const calendarRequestIds=new Map();
let calendarOrderRunning=false;
async function executeCalendarOrder(text){
  const key=berlinDay(new Date())+'|'+text.trim();
  if(!calendarRequestIds.has(key)){
    if(calendarRequestIds.size>=50)calendarRequestIds.delete(calendarRequestIds.keys().next().value);
    calendarRequestIds.set(key,Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''));
  }
  calendarOrderRunning=true;
  let value;
  try{value=await api('/api/assistant/calendar',{text,request_id:calendarRequestIds.get(key)});}
  finally{calendarOrderRunning=false;}
  if(value.kind==='event')return await presentProposal(value);
  if(value.kind==='calendar_setup'){
    $('icloud-feedback').textContent=value.message;go('icloud-connect');$('icloud-email').focus();
  }
  if(value.kind==='calendar_saved'){
    if(typeof refreshCalendar==='function')refreshCalendar().catch(()=>{});
  }
  return value.message;
}
async function dailyAnswer(text){
  if(/^(bitte\s+)?termin\b/i.test(text))return await executeCalendarOrder(text);
  if(/^(bitte\s+)?(trag[e]?|erstelle?|plane|leg[e]?)\b/i.test(text)&&/termin|kalender|\bein\b/i.test(text)&&! /\baufgabe\b/i.test(text))return await executeCalendarOrder(text);
  if(/^(bitte\s+)?(trag[e]?|erstelle|plane|leg[e]?|merke?|notiere|speichere)\b/i.test(text)){
    const value=await api('/api/assistant/plan',{text});
    if(value.kind!=='none')return await presentProposal(value);
  }
  if(/aufgaben|fristen/i.test(text)&&/welche|zeige|offen|überfällig/i.test(text)){
    const value=await api('/api/personal/state',{});applyPersonal(value);const tasks=value.tasks.filter(t=>!t.done);
    return tasks.length?'Deine offenen Aufgaben:\n'+tasks.map(t=>t.title+(t.due?' · fällig '+t.due:'')).join('\n'):'Du hast keine offenen Aufgaben gespeichert.';
  }
  if(/\b(mails?|e-mails?)\b/i.test(text)&&/wichtig|priorität|zusammenfass/i.test(text)&&/^(bitte\s+)?(fasse?|zeige|lies|welche|kannst du|gib)\b/i.test(text)){
    const data=await api('/api/mail/inbox',{});inbox=data.messages;renderMail();$('mail-status').textContent=data.note;
    const todayOnly=/\bheute\b/i.test(text);
    const important=inbox.filter(m=>['prioritaet','pruefen'].includes(m.category)&&(!todayOnly||m.received_day===berlinDay(new Date())));
    if(!important.length)return 'Unter den neuesten '+inbox.length+' Mails wurde nach deinen Regeln keine zum Prüfen hervorgehoben. Das ist keine vollständige Prüfung deiner Mailbox.';
    if(/zusammenfass/i.test(text)){const summary=await api('/api/mail/important-summary',{today_only:todayOnly});return 'Zusammenfassung von '+summary.count+' Mailauszügen aus den neuesten 20 Nachrichten'+(todayOnly?' mit heutigem Datum':'')+':\n'+summary.summary;}
    return 'Zum Prüfen hervorgehoben, aus den neuesten '+inbox.length+' Mails:\n'+important.slice(0,8).map(m=>m.subject+' · '+m.sender).join('\n');
  }
  if(chosenMail&&/^(bitte\s+)?(antworte\b|(formuliere|erstelle|schreibe)\s+(mir\s+)?(eine[nm]?\s+)?(antwort|antwortentwurf)\b)/i.test(text)){
    const data=await api('/api/mail/draft',{id:chosenMail.id,instruction:text});$('reply-draft').value=data.draft;
    return 'Antwortentwurf für die ausgewählte Mail (nicht versendet):\n'+data.draft;
  }
  return null;
}
api('/api/personal/state',{}).then(value=>applyPersonal(value,true)).catch(error=>{$('task-status').textContent=error.message;metric('task-count','Offene Aufgaben','Aufgaben konnten nicht geladen werden');if($('overview-tasks'))$('overview-tasks').replaceChildren(node('p',error.message,'empty-state'));});
