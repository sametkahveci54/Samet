'use strict';
const $ = id => document.getElementById(id);
let token, history = [], busy = false;
const ready = fetch('/api/session').then(r => r.json()).then(d => token = d.token);
const activeRequests = new Map();
function requestProgress(){
  const panel=$('request-progress');if(!panel)return;
  panel.hidden=activeRequests.size===0;
  if(activeRequests.size)$('request-status').textContent=Array.from(activeRequests.values()).map(v=>v.label).join(' · ');
}
function requestLabel(path){
  if(path==='/api/chat')return 'Jarvis formuliert eine Antwort …';
  if(path.includes('/mail/'))return 'Mails werden gelesen oder zusammengefasst …';
  if(path.includes('/calendar/'))return 'Kalender wird geprüft …';
  if(path.includes('/assistant/'))return 'Dein Vorschlag wird vorbereitet …';
  return 'Verbindungen werden geprüft …';
}
async function api(path, data) {
  await ready; token=(await (await fetch('/api/session')).json()).token;
  const cancellable=path==='/api/chat'||path.startsWith('/api/mail/')||['/api/calendar/list','/api/calendar/today','/api/calendar/preview','/api/connections/test','/api/assistant/plan','/api/assistant/mail-event','/api/assistant/mail-task'].includes(path);
  const id=cancellable?Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''):null;
  const controller=new AbortController();
  if(id){activeRequests.set(id,{controller,label:requestLabel(path)});requestProgress();}
  try{
    const r = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json','X-Jarvis-Token':token}, body:JSON.stringify(id?{...data,_job:id}:data),signal:controller.signal});
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Anfrage fehlgeschlagen.'); return d;
  }catch(error){if(error.name==='AbortError')throw new Error('Anfrage abgebrochen.');throw error;}
  finally{if(id){activeRequests.delete(id);requestProgress();}}
}
if($('cancel-requests'))$('cancel-requests').onclick=()=>{
  for(const [id,request]of activeRequests){
    request.controller.abort();
    fetch('/api/jobs/cancel',{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':token},body:JSON.stringify({id})}).catch(()=>{});
  }
};
const settings = {get(key, fallback='') {try{return localStorage.getItem('jarvis.'+key) || fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem('jarvis.'+key,value);}catch{}}};
let voices = [], utterance, audioURL, speechRequest, speechID=0, audioContext, audioSource;
function unlockSound() {
  const Context=window.AudioContext || window.webkitAudioContext;
  if(!Context)return;
  if(!audioContext)audioContext=new Context();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
}
$('auto-speak').checked=settings.get('autoSpeak','on')==='on';
$('auto-speak').onchange=()=>{settings.set('autoSpeak',$('auto-speak').checked?'on':'off');if($('auto-speak').checked)unlockSound();else stopAudio();};
$('enable-sound').onclick=()=>{unlockSound(); $('auto-speak').checked=true;settings.set('autoSpeak','on');speak('Hallo! Ich bin da. Du kannst mir jetzt deine Frage stellen.');};

const player = document.createElement('audio'); player.controls=true; player.hidden=true; player.setAttribute('aria-label','Jarvis Sprachausgabe'); $('speech-status').after(player);
function coreState(state) {document.body.dataset.state=state; $('core-state').textContent=({ready:'BEREIT FÜR DEIN SIGNAL',thinking:'GEDANKEN WERDEN VERKNÜPFT',speaking:'SPRACHAUSGABE AKTIV',listening:'ICH HÖRE DIR ZU'})[state];}
function stopAudio(){speechID++; if(typeof stopOnlineSpeech==='function')stopOnlineSpeech(); if(audioSource){audioSource.onended=null;try{audioSource.stop();}catch{}audioSource=null;} speechRequest?.abort(); player.pause(); if(audioURL){URL.revokeObjectURL(audioURL);audioURL=null;} player.removeAttribute('src'); player.hidden=true; window.speechSynthesis?.cancel(); coreState('ready');}
player.onplay=()=>{if(typeof stopOnlineSpeech==='function')stopOnlineSpeech();if(audioSource){audioSource.onended=null;try{audioSource.stop();}catch{}audioSource=null;}coreState('speaking');}; player.onended=()=>{coreState('ready'); $('speech-status').textContent='Du bist dran.';}; player.onpause=()=>{if(!busy)coreState('ready');};

$('rate').value = settings.get('rateVictoria','1.0');
$('rate-value').value = $('rate').value;
function loadVoices() {
  voices = (window.speechSynthesis?.getVoices() || []).filter(v => /^de[-_]/i.test(v.lang));
  const score = v => (/premium|enhanced|verbessert|siri|neural/i.test(v.name)?100:0) + (/anna|markus|petra|yannick|viktor/i.test(v.name)?20:0) + (v.localService?5:0);
  voices.sort((a,b) => score(b)-score(a));
  const chosen = $('voice').value || settings.get('voiceAnnaV1','anna');
  $('voice').replaceChildren(); const own=document.createElement('option');own.value='clone';own.textContent='Eigene Stimme · KI-Klon (lokal)';$('voice').append(own); const neural=document.createElement('option'); neural.value='neural'; neural.textContent='Victoria · Weiblich / Kokoro (lokal)'; $('voice').append(neural);
  const marin=document.createElement('option');marin.value='marin';marin.textContent='Marin · Professional (OpenAI · kostenpflichtig)';$('voice').append(marin);
  for (const v of voices) {const o=document.createElement('option'); o.value=v.voiceURI; o.textContent=v.name + (v.localService?' · auf dem Gerät':' · Online-Stimme'); $('voice').append(o);}
  if(!voices.length){const o=document.createElement('option');o.value='anna';o.textContent='Anna · Systemstimme wird geladen …';$('voice').append(o);}
  if(chosen==='anna'){const anna=voices.find(v=>/^anna(?:\s|$)/i.test(v.name));$('voice').value=anna?anna.voiceURI:(!voices.length?'anna':'neural');if(voices.length&&!anna)$('speech-status').textContent='Anna ist auf diesem Gerät nicht verfügbar. Victoria ist als Alternative ausgewählt.';} else if(chosen==='marin' || chosen==='clone' || chosen==='neural' || voices.some(v=>v.voiceURI===chosen)) $('voice').value=chosen;
}
$('voice').onchange = () => settings.set('voiceAnnaV1',$('voice').value);
$('rate').oninput = () => {$('rate-value').value=$('rate').value; settings.set('rateVictoria',$('rate').value);};
loadVoices(); window.speechSynthesis?.addEventListener('voiceschanged',loadVoices);
async function speak(text) {
  if($('voice-short')?.checked&&text.length>700){const excerpt=text.slice(0,640);text=excerpt.slice(0,excerpt.lastIndexOf(' '))+'. Den vollständigen Text siehst du in Jarvis.';}
  unlockSound();
  if($('voice').value==='marin'){await speakMarin(text);return;}
  if (['neural','clone'].includes($('voice').value)) {
    allowAutoSend=false;recognition?.abort(); stopAudio(); const id=speechID; speechRequest=new AbortController();
    const selectedVoice=$('voice').value; $('speech-status').textContent=selectedVoice==='clone'?'Deine Stimme wird lokal erzeugt. Das kann etwas dauern …':'Victoria wird lokal erzeugt …';
    try {
      await ready; token=(await (await fetch('/api/session')).json()).token;
      const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':token},body:JSON.stringify({voice:selectedVoice,text:text.replace(/\*\*|__|`|^#{1,6}\s/gm,''),rate:Number($('rate').value)}),signal:speechRequest.signal});
      if(!response.ok){const error=await response.json();throw new Error(error.error || 'Sprachausgabe fehlgeschlagen.');}
      const blob=await response.blob(); if(id!==speechID)return;
      audioURL=URL.createObjectURL(blob); player.src=audioURL; player.hidden=false;
      if(audioContext?.state==='running') {
        try {
          const buffer=await audioContext.decodeAudioData(await blob.arrayBuffer());
          if(id!==speechID)return;
          audioSource=audioContext.createBufferSource();audioSource.buffer=buffer;audioSource.connect(audioContext.destination);
          audioSource.onended=()=>{coreState('ready');$('speech-status').textContent='Du bist dran. Die Aufnahme kannst du unten erneut abspielen.';audioSource=null;};
          audioSource.start();coreState('speaking');$('speech-status').textContent=selectedVoice==='clone'?'Deine KI-Stimme spricht …':'Victoria spricht …';return;
        }catch(e){if(id!==speechID)return;}
      }
      try{await player.play();}catch{$('speech-status').textContent='Audio ist bereit. Zum Anhören auf ▶ tippen.';}
    }catch(e){if(e.name!=='AbortError')$('speech-status').textContent=e.message;}
    return;
  }
  stopAudio();
  if (!window.speechSynthesis) { $('notice').textContent = 'Dieser Browser unterstützt kein Vorlesen.'; return; }
  allowAutoSend=false;recognition?.abort();
  speechSynthesis.cancel();
  utterance = new SpeechSynthesisUtterance(text.replace(/\*\*|__|`|^#{1,6}\s/gm,'').replace(/https?:\/\/\S+/g,'Link'));
  utterance.lang = 'de-DE'; utterance.rate = Number($('rate').value); utterance.pitch=1;
  const voice = voices.find(v=>v.voiceURI===$('voice').value) || ( $('voice').value==='anna' ? speechSynthesis.getVoices().find(v=>/^anna(?:\s|$)/i.test(v.name) && /^de[-_]/i.test(v.lang)) : null );
  if($('voice').value==='anna' && !voice){$('speech-status').textContent='Anna wird noch geladen. Bitte kurz warten oder eine verfügbare Stimme wählen.';return;}
  if (voice) utterance.voice = voice;
  utterance.onstart=()=>{coreState('speaking');$('speech-status').textContent='Jarvis spricht …';};
  utterance.onend=()=>{coreState('ready');$('speech-status').textContent='Du bist dran. Zum Antworten das Mikrofon antippen.';};
  utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error)) $('speech-status').textContent='Bitte „Vorlesen“ direkt an der Antwort antippen.';};
  speechSynthesis.speak(utterance);
}
$('voice-test').onclick=()=>speak('Hallo, ich bin Jarvis. Erzähl mir, was du vorhast. Wenn mir etwas unklar ist, frage ich nach.');
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null, listening = false, beforeDictation = '', dictationFinal=false, allowAutoSend=false;
for(const [id,key]of [['voice-auto-send','voiceAutoSend'],['voice-short','voiceShort']]){
  if($(id)){$(id).checked=settings.get(key,'off')==='on';$(id).onchange=()=>settings.set(key,$(id).checked?'on':'off');}
}
if (Recognition) {
  recognition = new Recognition(); recognition.lang='de-DE'; recognition.interimResults=true; recognition.continuous=false;
  recognition.onstart=()=>{coreState('listening');listening=true; $('dictate').textContent='■ Aufnahme beenden'; $('dictate').setAttribute('aria-pressed','true'); $('speech-status').textContent='Ich höre zu …';};
  recognition.onresult=e=>{let text='';for(let i=0;i<e.results.length;i++){text+=e.results[i][0].transcript+' ';if(e.results[i].isFinal)dictationFinal=true;} $('prompt').value=(beforeDictation+' '+text).trim().slice(0,8000);};
  recognition.onerror=e=>{allowAutoSend=false;$('speech-status').textContent=e.error==='not-allowed'?'Mikrofon oder Spracherkennung nicht freigegeben. Du kannst weiter tippen.':'Spracheingabe nicht verfügbar ('+e.error+'). Bitte erneut versuchen oder tippen.';};
  recognition.onend=()=>{if(!busy)coreState('ready');listening=false; $('dictate').textContent='🎙 Nachricht sprechen'; $('dictate').setAttribute('aria-pressed','false'); if($('speech-status').textContent==='Ich höre zu …')$('speech-status').textContent='Text prüfen und auf Senden tippen.';const send=allowAutoSend&&dictationFinal&&$('voice-auto-send')?.checked&&!busy&&$('prompt').value.trim();allowAutoSend=false;if(send)$('chat-form').requestSubmit();};
  $('dictate').onclick=()=>{if(listening){recognition.stop();return;} if(busy)return; stopAudio(); beforeDictation=$('prompt').value;dictationFinal=false;allowAutoSend=true; try{recognition.start();}catch{allowAutoSend=false;$('speech-status').textContent='Bitte kurz warten und erneut antippen.';}};
} else {$('dictate').disabled=true; $('speech-status').textContent='Hier ist keine Browser-Spracheingabe verfügbar. Nutze das Mikrofon deiner Tastatur oder Safari.';}
function add(role, text) {
  const el = document.createElement('article'); el.className = 'message ' + role;
  const name = document.createElement('strong'); name.textContent = role === 'user' ? 'Du' : 'Jarvis'; el.append(name, document.createTextNode(text));
  if(role === 'assistant') { const b = document.createElement('button'); b.className = 'quiet'; b.textContent = '▷ Vorlesen'; b.onclick = () => speak(text); el.append(b); }
  $('messages').append(el); el.scrollIntoView({behavior:'smooth',block:'nearest'}); return el;
}
$('chat-form').onsubmit = async e => {
  e.preventDefault(); const text = $('prompt').value.trim(); if (!text || busy) return;
  unlockSound(); allowAutoSend=false;recognition?.abort(); stopAudio(); coreState('thinking'); busy = true; $('dictate').disabled=true; $('send').disabled = true; $('clear').disabled = true; $('send').textContent = 'Denkt …';
  add('user', text); $('prompt').value = ''; history.push({role:'user',content:text});
  try { const organizerText = typeof organizerAnswer === 'function' ? await organizerAnswer(text) : null; const d = organizerText === null ? await api('/api/chat',{messages:history.slice(-16)}) : {message:organizerText}; history.push({role:'assistant',content:d.message}); add('assistant',d.message); if($('auto-speak').checked) speak(d.message); else $('speech-status').textContent='Ton ist ausgeschaltet. Aktiviere „Antworten vorlesen“ oder tippe auf „Vorlesen“.'; }
  catch(err) {add('assistant',err.message); history.pop();}
  finally {busy = false; if(document.body.dataset.state==='thinking')coreState('ready'); $('dictate').disabled=!Recognition; $('send').disabled = false; $('clear').disabled = false; $('send').textContent = 'Senden ↗';}
};
$('prompt').onkeydown = e => {if(e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {e.preventDefault(); $('chat-form').requestSubmit();}};
for(const b of document.querySelectorAll('[data-action]')) b.onclick = async () => {b.disabled = true; try{$('notice').textContent = (await api('/api/action',{action:b.dataset.action})).message;}catch(e){$('notice').textContent = e.message;}finally{b.disabled=false;}};
$('save-note').onclick = async () => {const b=$('save-note'); b.disabled=true; try{$('notice').textContent=(await api('/api/action',{action:'notiz',text:$('note').value})).message; $('note').value='';}catch(e){$('notice').textContent=e.message;}finally{b.disabled=false;}};
$('stop-speak').onclick = () => {stopAudio(); $('speech-status').textContent='Vorlesen gestoppt.';};
$('clear').onclick = () => {history=[]; $('messages').replaceChildren(); stopAudio();};
async function status(){try{const d=await fetch('/api/status').then(r=>r.json()); $('status').textContent=d.online?'● Modell bereit':'○ Ollama prüfen';if(typeof renderRuntimeStatus==='function')renderRuntimeStatus(d);}catch{$('status').textContent='○ Verbindung unterbrochen';}}
status(); setInterval(status,30000);
if(!window.speechSynthesis){for(const [value,label] of [['clone','Eigene Stimme · KI-Klon (lokal)'],['neural','Victoria · Weiblich / Kokoro (lokal)']]){const o=document.createElement('option');o.value=value;o.textContent=label;$('voice').append(o);} $('voice').value='clone';}


