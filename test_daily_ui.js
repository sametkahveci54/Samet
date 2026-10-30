// Execute all three UI scripts together with an offline DOM and provider fixtures.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.checked=false;this.disabled=false;this.dataset={};this.attrs={};this._text='';}
 set textContent(text){this._text=String(text);this.children=[];}
 get textContent(){return this._text+this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this._text='';this.children=[...children];}
 get firstChild(){return this.children[0];}get options(){return this.children;}
 setAttribute(key,value){this.attrs[key]=value;}removeAttribute(key){delete this.attrs[key];}
 addEventListener(){}after(){}scrollIntoView(){}focus(){}select(){}reset(){}pause(){}play(){return Promise.resolve();}
 requestSubmit(){return this.onsubmit?.({preventDefault(){},submitter:new Element('button')});}
}
(async()=>{
 const html=fs.readFileSync('web/index.html','utf8'),elements=new Map();
 for(const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  assert(!elements.has(match[3]),'Duplicate ID '+match[3]);const el=new Element(match[1]);
  el.hidden=/\bhidden(?:\s|>|$)/.test(match[2]);el.value=match[2].match(/\bvalue="([^"]*)"/)?.[1]||'';elements.set(match[3],el);
 }
 const get=id=>{assert(elements.has(id),'Missing element '+id);return elements.get(id);};
 const calls=[],spoken=[],local=new Map([['jarvis.autoSpeak','off']]);
 const personal={preferences:{tone:'freundlich',signature:'',priority_senders:[],priority_keywords:[],buffer_minutes:0,default_calendar:''},tasks:[],memories:[]};
 const start=new Date(Date.now()+86400000),end=new Date(start.getTime()+3600000);
 const event={title:'Werkstatt',start:start.toISOString(),end:end.toISOString(),location:'Berlin',reminder:15,
  calendar:'Privat',calendar_id:'https://p01-caldav.icloud.com/123/test/',conflicts:[],conflict_warnings:[],buffer_minutes:0,all_day:false};
 let conflicts=false,holdChat=false,failMail=false,holdCalendar=false,calendarRelease=null;
 const clone=value=>JSON.parse(JSON.stringify(value));
 async function fetch(url,options={}){
  const data=options.body?JSON.parse(options.body):{};calls.push({path:url,data:clone(data)});
  let value={};
  if(url==='/api/speech'){let n=0;return {ok:true,body:{getReader:()=>({read:async()=>n++<2?{done:false,value:new Uint8Array([0,1,2])}:{done:true},cancel:async()=>{}})}};}
  if(url==='/api/session')value={token:'test-token'};
  else if(url==='/api/status')value={online:true,version:'Alltag Test',revision:'12345678',updater:{fresh:true,message:'Updates aktiv'},connections:{}};
  else if(url==='/api/connections/status')value={yahoo:{connected:true,email:'test@yahoo.com'},icloud:{connected:true,email:'test@icloud.com'}};
  else if(url==='/api/calendar/list')value={calendars:[{id:event.calendar_id,name:'Privat',writable:true}]};
  else if(url==='/api/calendar/today'){if(holdCalendar)return new Promise(resolve=>{calendarRelease=()=>resolve({ok:true,json:async()=>({events:[event],warnings:[]})});});value={events:[event],warnings:[]};}
  else if(url==='/api/calendar/preview')value={confirmation:'event-token',event:{...event,conflicts:conflicts?[{...event,title:'Anderer Termin'}]:[]}};
  else if(url==='/api/calendar/create')value={message:'Termin in iCloud gespeichert.'};
  else if(url==='/api/mail/inbox'&&failMail)throw Error('Yahoo ist gerade nicht erreichbar.');
  else if(url==='/api/mail/inbox')value={messages:[{id:'mail',sender:'A',subject:'Terminbestätigung',date:'Heute',snippet:'Ein kurzer Text.',category:'pruefen',reason:'Betreff'}],note:'Neueste 20 Mails'};
  else if(url==='/api/mail/summary'||url==='/api/mail/important-summary')value={summary:'Ein Termin wurde bestätigt.',count:1};
  else if(url==='/api/personal/state')value=personal;
  else if(url==='/api/personal/task/add'){personal.tasks.push({id:'task-id',title:data.title,due:data.due,done:false});value={message:'Gespeichert.',state:personal};}
  else if(url==='/api/assistant/plan')value=/^trag/i.test(data.text)?{kind:'event',fields:event,message:'Bitte Vorschau prüfen.'}:/^merke/i.test(data.text)?{kind:'memory',payload:{text:'Kurze Antworten'},confirmation:'memory-token',message:'Bitte bestätigen.'}:{kind:'none'};
  else if(url==='/api/assistant/confirm'){personal.memories.push({id:'memory-id',text:'Kurze Antworten'});value={message:'Gespeichert.',state:personal};}
  else if(url==='/api/chat'){
   if(holdChat)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
   value={message:'Hallo Samet!'};
  }else if(url==='/api/jobs/cancel')value={active:true};
  else throw Error('Unexpected request '+url);
  return {ok:true,json:async()=>clone(value)};
 }
 const speech={getVoices:()=>[{name:'Anna',lang:'de-DE',voiceURI:'anna-native',localService:true}],addEventListener(){},cancel(){},speak(value){spoken.push(value.text);}};
 class Recognition{start(){this.onstart?.();}stop(){this.onend?.();}abort(){}}
 const sources=[];
 class AudioContext{constructor(){this.state='running';this.currentTime=0;this.destination={};}resume(){return Promise.resolve();}createBuffer(channels,count,rate){return {duration:count/rate,getChannelData:()=>new Float32Array(count)};}createBufferSource(){const source={connect(){},start(){},stop(){this.stopped=true;}};sources.push(source);return source;}}
 const context=vm.createContext({console,crypto:webcrypto,Uint8Array,Blob,AbortController,DOMException,Intl,Date,Promise,URL,
  document:{getElementById:get,createElement:tag=>new Element(tag),createTextNode:text=>String(text),querySelectorAll:()=>[],body:new Element('body')},
  window:{AudioContext,speechSynthesis:speech,SpeechRecognition:Recognition},speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
  navigator:{clipboard:{writeText:async()=>{}}},localStorage:{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value)},
  fetch,setInterval(){},matchMedia:()=>({matches:false})});
 for(const script of ['web/app.js','web/online-voice.js','web/organizer.js','web/daily.js','web/dashboard.js'])vm.runInContext(fs.readFileSync(script,'utf8'),context,{filename:script});
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
 await flush();assert(get('system-version').textContent.includes('Alltag Test'));
 assert(calls.some(c=>c.path==='/api/mail/inbox'),'Inbox loads automatically');
 assert(!calls.some(c=>c.path==='/api/calendar/today'),'Calendar is not a startup dependency');
 get('nav-mail').onclick();assert.equal(get('view-mail').hidden,false);assert.equal(get('view-overview').hidden,true);
 get('mail-search').value='not-in-this-message';get('mail-search').oninput();assert(get('mail-list').textContent.includes('Keine Treffer'));
 get('mail-search').value='';get('mail-search').oninput();
 failMail=true;await get('mail-refresh').onclick();assert(get('mail-list').firstChild.onclick,'Failed refresh retains existing messages');assert(get('mail-status').textContent.includes('bleiben sichtbar'));failMail=false;
 holdCalendar=true;const overview=get('day-refresh').onclick();await flush();assert(get('priority-count').textContent.includes('1 von 1'),'Mail renders while calendar still waits');calendarRelease();await overview;holdCalendar=false;
 get('mail-filter').value='alle';assert(get('priority-count').textContent.includes('1 von 1'));
 get('mail-list').firstChild.onclick();await get('mail-summarize').onclick();assert(get('mail-summary').textContent.includes('Ein Termin'));
 const untouched=calls.length;
 assert.equal(await vm.runInContext('dailyAnswer("Warum sind deine Antworten manchmal langsam?")',context),null);
 assert.equal(await vm.runInContext('dailyAnswer("Erkläre mir, wie Mailzusammenfassungen funktionieren")',context),null);
 assert.equal(calls.length,untouched,'Unrelated questions must not read mail or create drafts');
 get('task-title').value='Werkstatt anrufen';get('task-due').value='2026-12-01';await get('task-form').requestSubmit();assert(get('task-count').textContent.includes('1 offen'));
 get('prompt').value='Merke dir: Kurze Antworten';await get('chat-form').requestSubmit();
 assert.equal(calls.filter(c=>c.path==='/api/assistant/confirm').length,0);
 await get('proposal-confirm').onclick();await get('proposal-confirm').onclick();assert.equal(personal.memories.length,1);
 get('prompt').value='Trag morgen um 15 Uhr einen Werkstatttermin ein';await get('chat-form').requestSubmit();await flush();
 assert.equal(calls.filter(c=>c.path==='/api/calendar/create').length,0);
 await get('event-confirm').onclick();assert.equal(calls.filter(c=>c.path==='/api/calendar/create').length,1);
 conflicts=true;await get('event-form').requestSubmit();await get('event-confirm').onclick();
 assert.equal(calls.filter(c=>c.path==='/api/calendar/create').length,1,'Conflict requires extra acknowledgment');
 get('conflict-ack').checked=true;await get('event-confirm').onclick();assert.equal(calls.filter(c=>c.path==='/api/calendar/create').length,2);
 holdChat=true;get('prompt').value='Erzähle mir etwas';const pending=get('chat-form').requestSubmit();await flush();
 assert.equal(get('request-progress').hidden,false);get('cancel-requests').onclick();await pending;
 assert(calls.some(c=>c.path==='/api/jobs/cancel'));assert.equal(get('request-progress').hidden,true);holdChat=false;
 get('voice-auto-send').checked=true;get('voice-auto-send').onchange();get('prompt').value='';get('dictate').onclick();
 const recognition=vm.runInContext('recognition',context);const result=[{transcript:'Hallo'}];result.isFinal=true;
 recognition.onresult({results:[result]});recognition.onend();await flush();
 assert(calls.some(c=>c.path==='/api/chat'&&c.data.messages.at(-1).content==='Hallo'));
 get('voice-short').checked=true;vm.runInContext('speak("Lange Antwort. ".repeat(100))',context);
 assert(spoken.at(-1).length<800);assert(spoken.at(-1).includes('vollständigen Text'));
 await vm.runInContext('speakMarin("Hallo Samet.")',context);
 assert.equal(sources.length,2,'Odd PCM chunks are joined and scheduled as they arrive');
 const billed=calls.filter(c=>c.path==='/api/speech').length;
 await vm.runInContext('speakMarin("Hallo Samet.")',context);
 assert.equal(calls.filter(c=>c.path==='/api/speech').length,billed,'Replay must not generate paid audio again');
 assert(sources.every(source=>source.stopped),'Stop/replay stops every queued audio source');
 console.log('Workspace UI: automatic inbox, independent loads, failed refresh retention, navigation/search, inbox summary, local tasks, explicit memory/event confirmation, conflict acknowledgment, cancellation and opt-in voice sending: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
