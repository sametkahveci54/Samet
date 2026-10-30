// Functional UI tests with a minimal DOM. No browser, accounts or network needed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};this.attrs={};}
  setAttribute(key,value){this.attrs[key]=value;}
  removeAttribute(key){delete this.attrs[key];}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  get firstChild(){return this.children[0];}
  get options(){return this.children;}
  focus(){} select(){} reset(){}
}
(async()=>{
const html=fs.readFileSync('web/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate HTML IDs');
const elements=new Map(ids.map(id=>[id,new Element()]));
const get=id=>{assert(elements.has(id),'Missing element '+id);return elements.get(id);};
const calls=[];
const start=new Date(Date.now()+86400000),end=new Date(start.getTime()+3600000);
const event={title:'Werkstatt',start:start.toISOString(),end:end.toISOString(),calendar:'Privat',
 calendar_id:'https://p01-caldav.icloud.com/123/test/',location:'Berlin',reminder:15,all_day:false};
const api=async(path,data)=>{
 calls.push({path,data:JSON.parse(JSON.stringify(data))});
 if(path==='/api/connections/status')return {yahoo:{connected:true,email:'test@yahoo.com'},icloud:{connected:true,email:'test@icloud.com'}};
 if(path==='/api/connections/save')return {message:'Verbunden'};
 if(path==='/api/calendar/list')return {calendars:[{id:event.calendar_id,name:'Privat',writable:true}]};
 if(path==='/api/calendar/today')return {events:[event],warnings:[]};
 if(path==='/api/mail/inbox')return {messages:[{id:'mail',subject:'Bestätigung',sender:'A',date:'Heute',snippet:'Hallo',category:'pruefen',reason:'Betreff',partial:false}],note:'Neueste 20 Mails'};
 if(path==='/api/mail/draft')return {draft:'Vielen Dank.',partial:false};
 if(path==='/api/calendar/preview')return {confirmation:'one-use-token',event};
 if(path==='/api/calendar/create')return {message:'Termin in iCloud gespeichert.'};
 throw Error('Unexpected call '+path);
};
const context=vm.createContext({$:get,api,speak:()=>{},document:{createElement:tag=>new Element(tag)},
 navigator:{clipboard:{writeText:async()=>{}}},Intl,Date,Promise,console});
vm.runInContext(fs.readFileSync('web/organizer.js','utf8'),context);
await new Promise(resolve=>setImmediate(resolve));
get('mail-filter').value='alle';
await get('day-refresh').onclick();
assert.equal(get('mail-list').children.length,1);
get('mail-list').firstChild.onclick();
get('reply-instruction').value='Bedanken';
await get('draft-create').onclick();
assert.equal(get('reply-draft').value,'Vielen Dank.');
get('event-calendar').value=event.calendar_id;get('event-title').value='Werkstatt';
get('event-start').value=start.toISOString().slice(0,16);get('event-end').value=end.toISOString().slice(0,16);
get('event-reminder').value='15';
const submit={preventDefault(){},submitter:new Element('button')};
await get('event-form').onsubmit(submit);
assert.equal(calls.filter(c=>c.path==='/api/calendar/create').length,0,'Preview must not create');
assert.equal(get('event-preview').hidden,false);
get('event-form').oninput();
await get('event-confirm').onclick();
assert.equal(calls.filter(c=>c.path==='/api/calendar/create').length,0,'Edited preview invalidates confirmation');
await get('event-form').onsubmit(submit);
await get('event-confirm').onclick();
await get('event-confirm').onclick();
assert.equal(calls.filter(c=>c.path==='/api/calendar/create').length,1,'Confirm at most once');
get('yahoo-email').value='test@yahoo.com';get('yahoo-password').value='app-test-password';
await get('yahoo-connect').onsubmit(submit);
assert.equal(get('yahoo-password').value,'','Clear password input');
assert.equal(calls.find(c=>c.path==='/api/connections/save').data.password,'app-test-password');
const before=calls.length;
assert.equal(await vm.runInContext('organizerAnswer("Erkläre mir einen Kalender")',context),null);
assert.equal(calls.length,before,'Unrelated chat must not fetch private data');
assert((await vm.runInContext('organizerAnswer("Welche Termine habe ich heute?")',context)).includes('Werkstatt'));
console.log('Organizer UI: DOM IDs, inbox/draft, explicit confirmation, invalidation, secret clearing and scoped calendar routing: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});

