'use strict';
// Uses api() and speak() from app.js; account secrets are never persisted in the browser.
let inbox = [], chosenMail = null, previewToken = null, dayText = '', previewNeedsAcknowledgement=false;
const labels = {prioritaet:'Deine Priorität',pruefen:'Prüfen · möglicherweise wichtig',werbung:'Vermutlich Werbung',sonstige:'Sonstige'};
const berlinDate = value => new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const berlinTime = value => new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const berlinDay = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
function eventTime(item){
  if(item.all_day)return 'Ganztägig';
  const today=berlinDay(new Date());
  const start=berlinDay(item.start)===today?berlinTime(item.start):berlinDate(item.start);
  const end=berlinDay(item.end)===today?berlinTime(item.end):berlinDate(item.end);
  return start+'–'+end+' Uhr';
}
function node(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
async function connectionStatus(){
  const status=await api('/api/connections/status',{});
  for(const provider of ['yahoo','icloud']){
    const value=status[provider];
    $(provider+'-state').textContent=value.error|| (value.connected?'Zugang gespeichert: '+value.email:'Noch nicht verbunden');
    if(value.email)$(provider+'-email').value=value.email;
  }
  if(!status.yahoo.connected||!status.icloud.connected)$('connections').open=true;
  return status;
}
async function loadCalendars(){
  const data=await api('/api/calendar/list',{});
  const select=$('event-calendar');select.replaceChildren(node('option','Kalender auswählen'));
  select.firstChild.value='';
  for(const calendar of data.calendars.filter(c=>c.writable)){
    const option=node('option',calendar.name);option.value=calendar.id;select.append(option);
  }
  if(select.options.length===1)$('event-status').textContent='Kein beschreibbarer Kalender gefunden. Bitte iCloud-Freigaben prüfen.';
  if(typeof calendarChoices==='function')calendarChoices(data.calendars);
}
for(const provider of ['yahoo','icloud']){
  $(provider+'-connect').onsubmit=async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;
    $(provider+'-feedback').textContent='Verbindung wird geprüft. Bitte gegebenenfalls den Schlüsselbund am Mac freigeben …';
    const value={provider,email:$(provider+'-email').value.trim(),password:$(provider+'-password').value};
    $(provider+'-password').value='';
    try{
      const data=await api('/api/connections/save',value);$(provider+'-feedback').textContent=data.message;
      await connectionStatus();if(provider==='icloud')await loadCalendars();else await refreshMail();
    }catch(error){$(provider+'-feedback').textContent=error.message;}
    finally{value.password='';button.disabled=false;}
  };
  $(provider+'-remove').onclick=async()=>{
    const button=$(provider+'-remove');button.disabled=true;
    try{
      const data=await api('/api/connections/remove',{provider});
      $(provider+'-feedback').textContent=data.message;dayText='';$('day-speak').disabled=true;
      if(provider==='yahoo'){mailLoaded=false;mailFailure='Yahoo ist nicht verbunden.';inbox=[];chosenMail=null;if($('mail-placeholder'))$('mail-placeholder').hidden=false;$('mail-detail').hidden=true;mailUpdated=null;$('mail-status').textContent='Yahoo ist nicht verbunden. Bitte in den Einstellungen verbinden.';if($('mail-updated'))$('mail-updated').textContent='';renderMail();if(typeof updateMailMetric==='function')updateMailMetric();$('reply-draft').value='';}
      else{$('today-events').replaceChildren();$('event-calendar').replaceChildren(node('option','Zuerst iCloud verbinden'));cancelPreview();}
      await connectionStatus();
    }catch(error){$(provider+'-feedback').textContent=error.message;}
    finally{button.disabled=false;}
  };
}
let mailLoaded=false,mailLoading=null,calendarLoading=null,mailFailure='',calendarFailure='',mailUpdated=null;
function selectMail(mail){
  chosenMail=mail;$('mail-detail').hidden=false;
  if($('mail-placeholder'))$('mail-placeholder').hidden=true;
  $('mail-subject').textContent=mail.subject;const received=new Date(mail.date);$('mail-sender').textContent=mail.sender+' · '+(Number.isNaN(received.getTime())?mail.date:berlinDate(received));
  $('mail-snippet').textContent=mail.snippet||'Kein lesbarer Textauszug vorhanden.';
  $('mail-partial').textContent='Textauszug ohne Anhänge. '+(mail.partial?'Nur teilweise geladen. ':'')+'Einordnung: '+mail.reason+'.';
  $('reply-draft').value='';$('reply-instruction').value='';$('draft-status').textContent='';
  if(typeof selectMailExtras==='function')selectMailExtras(mail);
  renderMail();
  if(typeof matchMedia==='function'&&matchMedia('(max-width: 800px)').matches)$('mail-detail').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderMail(){
  const filter=$('mail-filter').value||'alle',query=($('mail-search')?.value||'').trim().toLocaleLowerCase('de');
  const list=inbox.filter(m=>(filter==='alle'||(filter==='ungelesen'&&m.unread)||m.category===filter)&&(!query||(m.subject+' '+m.sender+' '+(m.snippet||'')).toLocaleLowerCase('de').includes(query)));
  $('mail-list').replaceChildren();
  if($('mail-count'))$('mail-count').textContent=mailLoaded?list.length+' von '+inbox.length+' Nachrichten':'Noch nicht geladen';
  if(!list.length){
    const empty=!mailLoaded?(mailFailure?'Posteingang konnte nicht geladen werden. Details stehen oben.':'Posteingang wird geladen …'):inbox.length?'Keine Treffer. Suche oder Filter ändern.':'Im Yahoo-Posteingang wurden keine Nachrichten gefunden.';
    $('mail-list').append(node('p',empty,'empty-state'));
  }
  for(const mail of list){
    const button=document.createElement('button');button.type='button';button.className='mail-row';
    button.setAttribute('aria-pressed',String(chosenMail?.id===mail.id));
    const avatar=node('span',(mail.sender.replace(/[^A-Za-zÄÖÜäöü]/g,'').slice(0,2)||'M').toUpperCase(),'mail-avatar');avatar.setAttribute('aria-hidden','true');
    const copy=node('div','','mail-row-copy'),top=node('div','','mail-row-top');
    const sender=node('span',mail.sender,'sender');
    top.append(sender);
    const date=new Date(mail.date);if(!Number.isNaN(date.getTime()))top.append(node('time',new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(date)));
    const subject=node('strong',mail.subject);if(mail.unread){const dot=node('span','','unread-dot');dot.setAttribute('aria-label','Ungelesen');subject.append(dot);}
    const tag=node('small',labels[mail.category]||'Sonstige','category-tag');tag.dataset.category=mail.category;
    copy.append(top,subject,node('span',mail.snippet||'Kein Textauszug','preview'),tag);
    button.append(avatar,copy);button.onclick=()=>selectMail(mail);$('mail-list').append(button);
  }
  if(typeof refreshMailOverview==='function')refreshMailOverview();
}
$('mail-filter').onchange=renderMail;
if($('mail-search'))$('mail-search').oninput=renderMail;
async function refreshMail(){
  if(mailLoading)return mailLoading;
  mailLoading=(async()=>{
    if($('mail-refresh'))$('mail-refresh').disabled=true;
    $('mail-list').setAttribute('aria-busy','true');$('mail-status').textContent=mailLoaded?'Mails werden aktualisiert. Bisherige Nachrichten bleiben sichtbar …':'Yahoo-Posteingang wird geladen …';
    $('mail-status').className='subtle';
    try{
      const data=await api('/api/mail/inbox',{});inbox=data.messages;mailLoaded=true;mailFailure='';mailUpdated=new Date();
      chosenMail=null;$('mail-detail').hidden=true;if($('mail-placeholder'))$('mail-placeholder').hidden=false;
      $('reply-draft').value='';$('mail-status').textContent=data.note;
      if($('mail-updated'))$('mail-updated').textContent='Stand '+mailUpdated.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
      if($('mail-connect-shortcut'))$('mail-connect-shortcut').hidden=true;
      renderMail();if(typeof updateMailMetric==='function')updateMailMetric();return data;
    }catch(error){
      mailFailure=error.message;$('mail-status').textContent=error.message+(mailLoaded?' Zuletzt geladene Nachrichten bleiben sichtbar.':' Du kannst erneut laden oder die Yahoo-Verbindung prüfen.');
      $('mail-status').className='subtle connection-alert';if($('mail-connect-shortcut'))$('mail-connect-shortcut').hidden=false;
      renderMail();if(typeof updateMailMetric==='function')updateMailMetric();throw error;
    }finally{
      mailLoading=null;$('mail-list').setAttribute('aria-busy','false');if($('mail-refresh'))$('mail-refresh').disabled=false;
    }
  })();return mailLoading;
}
function renderEvents(data){
  $('today-events').replaceChildren();
  $('calendar-status').textContent=data.warnings.length?'Übersicht unvollständig: '+data.warnings.join(' '):'Heutige Termine aktualisiert.';
  if(!data.events.length)$('today-events').append(node('p',data.warnings.length?'Keine Termine geladen; Hinweise oben beachten.':'Heute sind keine Termine eingetragen.','empty-state'));
  for(const item of data.events){const card=document.createElement('article');card.className='event-row';card.append(node('strong',eventTime(item)+' · '+item.title),node('small',item.calendar+(item.location?' · '+item.location:'')));$('today-events').append(card);}
}
async function refreshCalendar(){
  if(calendarLoading)return calendarLoading;
  calendarLoading=(async()=>{
    if($('calendar-refresh'))$('calendar-refresh').disabled=true;$('calendar-status').textContent='iCloud-Kalender wird geladen …';
    try{
      const data=await api('/api/calendar/today',{});calendarFailure='';renderEvents(data);
      if(typeof refreshCalendarOverview==='function')refreshCalendarOverview(data);
      if(typeof updateCalendarMetric==='function')updateCalendarMetric(data);return data;
    }catch(error){calendarFailure=error.message;$('calendar-status').textContent=error.message;if(typeof calendarOverviewError==='function')calendarOverviewError(error);throw error;}
    finally{calendarLoading=null;if($('calendar-refresh'))$('calendar-refresh').disabled=false;}
  })();return calendarLoading;
}
async function refreshDay(){
  const button=$('day-refresh');if(button.disabled)return;button.disabled=true;$('day-speak').disabled=true;dayText='';
  $('organizer-status').textContent='Posteingang und Kalender werden unabhängig voneinander aktualisiert …';
  const results=await Promise.allSettled([refreshCalendar(),refreshMail()]);
  const parts=['Deine Tagesübersicht für '+new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'full'}).format(new Date())+'.'];
  if(results[0].status==='fulfilled'){
    const data=results[0].value;parts.push(...data.events.map(item=>eventTime(item)+': '+item.title+'.'));
    if(!data.events.length)parts.push(data.warnings.length?'Die Kalenderübersicht ist unvollständig.':'Heute sind keine Termine eingetragen.');
    if(data.warnings.length&&data.events.length)parts.push('Die Kalenderübersicht ist unvollständig.');
  }else parts.push('Kalender konnte nicht geladen werden.');
  if(results[1].status==='fulfilled')parts.push('Von den '+inbox.length+' neuesten Mails sind '+inbox.filter(m=>['prioritaet','pruefen'].includes(m.category)).length+' zum Prüfen hervorgehoben.');
  else parts.push('Mails konnten nicht geladen werden.');
  dayText=parts.join(' ');$('day-speak').disabled=results.every(r=>r.status==='rejected');
  $('organizer-status').textContent=results.every(r=>r.status==='fulfilled')?'Übersicht aktualisiert.':'Teilweise geladen. Fehlermeldungen stehen im jeweiligen Bereich.';
  button.disabled=false;if(typeof dayMetrics==='function')dayMetrics(results);
}
$('day-refresh').onclick=refreshDay;
if($('mail-refresh'))$('mail-refresh').onclick=()=>refreshMail().catch(()=>{});
if($('calendar-refresh'))$('calendar-refresh').onclick=()=>refreshCalendar().catch(()=>{});
$('day-speak').onclick=()=>speak(dayText);
$('draft-create').onclick=async()=>{
  if(!chosenMail){$('draft-status').textContent='Bitte eine Mail auswählen.';return;}
  const button=$('draft-create'),id=chosenMail.id;button.disabled=true;
  $('draft-status').textContent='Entwurf wird auf deinem Mac formuliert …';
  try{
    const data=await api('/api/mail/draft',{id,instruction:$('reply-instruction').value});
    if(chosenMail?.id!==id)return;
    $('reply-draft').value=data.draft;$('draft-status').textContent='Entwurf bereit. Bitte prüfen. Es wurde nichts versendet.';
  }catch(error){$('draft-status').textContent=error.message;}
  finally{button.disabled=false;}
};
$('draft-copy').onclick=async()=>{
  try{await navigator.clipboard.writeText($('reply-draft').value);$('draft-status').textContent='Entwurf kopiert. In deiner Mail-App in die Antwort einfügen.';}
  catch{$('reply-draft').focus();$('reply-draft').select();$('draft-status').textContent='Bitte den markierten Entwurf manuell kopieren.';}
};
function cancelPreview(){previewToken=null;previewNeedsAcknowledgement=false;$('event-preview').hidden=true;$('event-confirm').disabled=false;if($('conflict-ack'))$('conflict-ack').checked=false;}
$('event-form').oninput=cancelPreview;
$('event-cancel').onclick=cancelPreview;
$('event-form').onsubmit=async event=>{
  event.preventDefault();cancelPreview();const button=event.submitter;button.disabled=true;
  $('event-status').textContent='Angaben werden geprüft …';
  try{
    const data=await api('/api/calendar/preview',{calendar_id:$('event-calendar').value,title:$('event-title').value,
      location:$('event-location').value,start:new Date($('event-start').value).toISOString(),
      end:new Date($('event-end').value).toISOString(),reminder:Number($('event-reminder').value)});
    previewToken=data.confirmation;const item=data.event;
    previewNeedsAcknowledgement=Boolean(item.conflicts?.length||item.conflict_warnings?.length);
    if(typeof conflictPreview==='function')conflictPreview(item);
    $('event-preview-text').textContent=item.title+' · '+berlinDate(item.start)+' bis '+berlinDate(item.end)+
      ' (Berliner Zeit) · Kalender: '+item.calendar+(item.location?' · Ort: '+item.location:'')+
      ' · '+(item.reminder?'Erinnerung '+item.reminder+' Minuten vorher.':'Keine Erinnerung.');
    $('event-preview').hidden=false;$('event-status').textContent='Noch nicht gespeichert. Bitte Vorschau bestätigen.';
  }catch(error){$('event-status').textContent=error.message;}
  finally{button.disabled=false;}
};
$('event-confirm').onclick=async()=>{
  if(!previewToken)return;
  if(previewNeedsAcknowledgement&&!$('conflict-ack').checked){$('event-status').textContent='Bitte die Überschneidungen ausdrücklich bestätigen.';return;}
  const confirmation=previewToken;previewToken=null;
  $('event-confirm').disabled=true;$('event-status').textContent='Termin wird in iCloud gespeichert …';
  try{const data=await api('/api/calendar/create',{confirmation,ack_conflicts:$('conflict-ack')?.checked===true});$('event-status').textContent=data.message;cancelPreview();$('event-form').reset();}
  catch(error){$('event-status').textContent=error.message;cancelPreview();}
};
$('new-event').ontoggle=()=>{if($('new-event').open)loadCalendars().catch(error=>$('event-status').textContent=error.message);};
if($('personal-settings'))$('personal-settings').ontoggle=()=>{if($('personal-settings').open)loadCalendars().catch(error=>$('preferences-status').textContent=error.message);};
connectionStatus()
  .catch(error=>$('organizer-status').textContent=error.message);

async function organizerAnswer(text){
  if(typeof dailyAnswer==='function'){const answer=await dailyAnswer(text);if(answer!==null)return answer;}
  if(!/\bheute\b/i.test(text)||!/(termine?|kalender|steht.*an|ansteht|tagesübersicht|tagesplan)/i.test(text))return null;
  const data=await api('/api/calendar/today',{});
  const now=Date.now();
  const remaining=/\bnoch\b/i.test(text);
  const events=remaining?data.events.filter(item=>item.all_day||new Date(item.end).getTime()>now):data.events;
  const lines=[remaining?'Deine verbleibenden Termine heute (Berliner Zeit):':'Deine Termine heute (Berliner Zeit):'];
  if(!events.length)lines.push(data.warnings.length?'Keine Termine geladen; die Übersicht ist unvollständig.':remaining?'Heute stehen keine weiteren Termine im Kalender.':'Heute sind keine Termine eingetragen.');
  for(const item of events)lines.push(eventTime(item)+': '+item.title+(item.location?' · '+item.location:'')+' ('+item.calendar+').');
  if(data.warnings.length)lines.push('Achtung: '+data.warnings.join(' '));
  return lines.join('\n');
}

