'use strict';
// Uses api() and speak() from app.js; account secrets are never persisted in the browser.
let inbox = [], chosenMail = null, previewToken = null, dayText = '';
const labels = {pruefen:'Prüfen · möglicherweise wichtig',werbung:'Vermutlich Werbung',sonstige:'Sonstige'};
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
    $(provider+'-state').textContent=value.connected?'Verbunden: '+value.email:'Noch nicht verbunden';
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
}
for(const provider of ['yahoo','icloud']){
  $(provider+'-connect').onsubmit=async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;
    $(provider+'-feedback').textContent='Verbindung wird geprüft. Bitte gegebenenfalls den Schlüsselbund am Mac freigeben …';
    const value={provider,email:$(provider+'-email').value.trim(),password:$(provider+'-password').value};
    $(provider+'-password').value='';
    try{
      const data=await api('/api/connections/save',value);$(provider+'-feedback').textContent=data.message;
      await connectionStatus();if(provider==='icloud')await loadCalendars();
    }catch(error){$(provider+'-feedback').textContent=error.message;}
    finally{value.password='';button.disabled=false;}
  };
  $(provider+'-remove').onclick=async()=>{
    const button=$(provider+'-remove');button.disabled=true;
    try{
      const data=await api('/api/connections/remove',{provider});
      $(provider+'-feedback').textContent=data.message;dayText='';$('day-speak').disabled=true;
      if(provider==='yahoo'){inbox=[];chosenMail=null;$('mail-detail').hidden=true;renderMail();$('reply-draft').value='';}
      else{$('today-events').replaceChildren();$('event-calendar').replaceChildren(node('option','Zuerst iCloud verbinden'));cancelPreview();}
      await connectionStatus();
    }catch(error){$(provider+'-feedback').textContent=error.message;}
    finally{button.disabled=false;}
  };
}
function renderMail(){
  const filter=$('mail-filter').value;
  const list=inbox.filter(m=>filter==='alle'||m.category===filter);
  $('mail-list').replaceChildren();
  if(!list.length){$('mail-list').append(node('p','In dieser Ansicht keine Nachrichten.'));return;}
  for(const mail of list){
    const button=document.createElement('button');button.type='button';button.className='mail-row';
    button.append(node('small',labels[mail.category]),node('strong',mail.subject),node('span',mail.sender));
    button.onclick=()=>{
      chosenMail=mail;$('mail-detail').hidden=false;
      $('mail-subject').textContent=mail.subject;$('mail-sender').textContent=mail.sender+' · '+mail.date;
      $('mail-snippet').textContent=mail.snippet||'Kein lesbarer Textauszug vorhanden.';
      $('mail-partial').textContent='Textauszug, keine Anhänge. '+(mail.partial?'Nachricht wurde nur teilweise geladen. ':'')+'Einordnung: '+mail.reason+'. Absenderangaben können gefälscht sein.';
      $('reply-draft').value='';$('reply-instruction').value='';$('draft-status').textContent='';
    };
    $('mail-list').append(button);
  }
}
$('mail-filter').onchange=renderMail;
async function refreshDay(){
  const button=$('day-refresh');button.disabled=true;$('day-speak').disabled=true;dayText='';
  $('organizer-status').textContent='Termine und Mails werden geladen …';
  $('calendar-status').textContent='Lädt …';$('mail-status').textContent='Lädt …';
  $('today-events').replaceChildren();inbox=[];chosenMail=null;$('mail-list').replaceChildren();$('mail-detail').hidden=true;$('reply-draft').value='';
  const results=await Promise.allSettled([api('/api/calendar/today',{}),api('/api/mail/inbox',{})]);
  const parts=['Deine Tagesübersicht für '+new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'full'}).format(new Date())+'.'];
  if(results[0].status==='fulfilled'){
    const data=results[0].value;
    $('calendar-status').textContent=data.warnings.length?'Unvollständige Übersicht: '+data.warnings.join(' '):'Alle abgefragten Termine für heute geladen.';
    if(!data.events.length)$('today-events').append(node('p',data.warnings.length?'Keine Termine geladen; die Übersicht ist unvollständig.':'Heute sind keine Termine eingetragen.'));
    for(const item of data.events){
      const card=document.createElement('article');card.className='event-row';
      const time=eventTime(item);
      card.append(node('strong',time+' · '+item.title),node('small',item.calendar+(item.location?' · '+item.location:'')));
      $('today-events').append(card);parts.push(time+': '+item.title+(item.location?', '+item.location:'')+'.');
    }
    if(!data.events.length)parts.push(data.warnings.length?'Die Kalenderübersicht ist unvollständig.':'Heute sind keine Termine eingetragen.');
    if(data.warnings.length&&data.events.length)parts.push('Achtung: Die Kalenderübersicht ist unvollständig.');
  }else{$('calendar-status').textContent=results[0].reason.message;parts.push('Kalender konnte nicht geladen werden.');}
  if(results[1].status==='fulfilled'){
    const data=results[1].value;inbox=data.messages;$('mail-status').textContent=data.note;renderMail();
    parts.push('Von den '+inbox.length+' neuesten Mails sind '+inbox.filter(m=>m.category==='pruefen').length+' zum Prüfen und '+inbox.filter(m=>m.category==='werbung').length+' vermutlich Werbung.');
  }else{$('mail-status').textContent=results[1].reason.message;parts.push('Mails konnten nicht geladen werden.');}
  dayText=parts.join(' ');$('day-speak').disabled=false;
  $('organizer-status').textContent='Übersicht aktualisiert. Mail-Einordnung ist eine Hilfestellung. Einzelheiten stehen darunter.';
  button.disabled=false;
}
$('day-refresh').onclick=refreshDay;
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
function cancelPreview(){previewToken=null;$('event-preview').hidden=true;$('event-confirm').disabled=false;}
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
    $('event-preview-text').textContent=item.title+' · '+berlinDate(item.start)+' bis '+berlinDate(item.end)+
      ' (Berliner Zeit) · Kalender: '+item.calendar+(item.location?' · Ort: '+item.location:'')+
      ' · '+(item.reminder?'Erinnerung '+item.reminder+' Minuten vorher.':'Keine Erinnerung.');
    $('event-preview').hidden=false;$('event-status').textContent='Noch nicht gespeichert. Bitte Vorschau bestätigen.';
  }catch(error){$('event-status').textContent=error.message;}
  finally{button.disabled=false;}
};
$('event-confirm').onclick=async()=>{
  if(!previewToken)return;const confirmation=previewToken;previewToken=null;
  $('event-confirm').disabled=true;$('event-status').textContent='Termin wird in iCloud gespeichert …';
  try{const data=await api('/api/calendar/create',{confirmation});$('event-status').textContent=data.message;cancelPreview();$('event-form').reset();}
  catch(error){$('event-status').textContent=error.message;cancelPreview();}
};
$('new-event').ontoggle=()=>{if($('new-event').open)loadCalendars().catch(error=>$('event-status').textContent=error.message);};
connectionStatus().then(status=>{if(status.icloud.connected)return loadCalendars();})
  .catch(error=>$('organizer-status').textContent=error.message);

async function organizerAnswer(text){
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
