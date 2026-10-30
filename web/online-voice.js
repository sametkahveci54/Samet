'use strict';
const onlineSources=new Set();
let marinCache=null;
function stopOnlineSpeech(){
  for(const source of onlineSources){source.onended=null;try{source.stop();}catch{}}
  onlineSources.clear();
}
function pcmWave(bytes){
  const out=new ArrayBuffer(44+bytes.length),view=new DataView(out);
  const word=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  word(0,'RIFF');view.setUint32(4,36+bytes.length,true);word(8,'WAVE');word(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  word(36,'data');view.setUint32(40,bytes.length,true);new Uint8Array(out,44).set(bytes);
  return new Blob([out],{type:'audio/wav'});
}
async function speakMarin(text){
  allowAutoSend=false;recognition?.abort();stopAudio();const id=speechID;
  const cleaned=text.replace(/\*\*|__|`|^#{1,6}\s/gm,'').replace(/https?:\/\/\S+/g,'Link');
  const rate=Number($('rate').value);
  if(!audioContext){$('speech-status').textContent='Dieser Browser unterstützt Marin nicht. Bitte Safari oder eine Systemstimme verwenden.';return;}
  try{
    await audioContext.resume();
    if(audioContext.state!=='running')throw Error('Bitte zuerst „Ton aktivieren“ antippen.');
    if(id!==speechID)return;
    if(marinCache?.text===cleaned&&marinCache.rate===rate){
      audioURL=URL.createObjectURL(marinCache.blob);player.src=audioURL;player.hidden=false;await player.play();return;
    }
    speechRequest=new AbortController();const signal=speechRequest.signal;
    $('speech-status').textContent='Marin · Professional bereitet die Sprache vor …';
    await ready;token=(await(await fetch('/api/session',{signal})).json()).token;
    if(id!==speechID)return;
    const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Token':token},
      body:JSON.stringify({voice:'marin',text:cleaned,rate}),signal});
    if(!response.ok){const value=await response.json();throw Error(value.error||'Marin ist gerade nicht verfügbar.');}
    const reader=response.body.getReader();const chunks=[];let total=0,pending=new Uint8Array(0),next=audioContext.currentTime+0.12,done=false;
    const finish=()=>{if(done&&!onlineSources.size&&id===speechID){coreState('ready');$('speech-status').textContent='Du bist dran. Aufnahme erneut abspielen: ohne neue Generierung.';}};
    while(true){
      const item=await reader.read();if(id!==speechID){await reader.cancel();return;}if(item.done)break;
      total+=item.value.length;if(total>32*1024*1024)throw Error('Sprachausgabe ist zu lang. Bitte kürzer vorlesen.');
      chunks.push(item.value);
      const bytes=new Uint8Array(pending.length+item.value.length);bytes.set(pending);bytes.set(item.value,pending.length);
      const count=Math.floor(bytes.length/2);pending=bytes.slice(count*2);if(!count)continue;
      const buffer=audioContext.createBuffer(1,count,24000),samples=buffer.getChannelData(0),view=new DataView(bytes.buffer);
      for(let i=0;i<count;i++)samples[i]=view.getInt16(i*2,true)/32768;
      const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioContext.destination);
      onlineSources.add(source);source.onended=()=>{onlineSources.delete(source);finish();};
      next=Math.max(next,audioContext.currentTime+0.06);source.start(next);next+=buffer.duration;
      coreState('speaking');$('speech-status').textContent='Marin · Professional spricht …';
    }
    if(total<2||pending.length)throw Error('Sprachübertragung wurde unvollständig beendet. Bitte erneut versuchen.');
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const blob=pcmWave(bytes);marinCache={text:cleaned,rate,blob};audioURL=URL.createObjectURL(blob);player.src=audioURL;player.hidden=false;
    done=true;finish();
  }catch(error){
    if(id!==speechID)return;
    speechRequest?.abort();stopOnlineSpeech();coreState('ready');
    if(error.name!=='AbortError')$('speech-status').textContent=error.message;
  }
}
const marinFeedback=$('marin-feedback');
$('marin-settings').ontoggle=async()=>{
  if(!$('marin-settings').open)return;
  try{const result=await api('/api/voice/config',{action:'status'});marinFeedback.textContent=result.configured?'API-Schlüssel vorhanden. Mit „Stimme testen“ kannst du Marin ausprobieren (kostenpflichtig).':'Noch kein API-Schlüssel hinterlegt.';}
  catch(error){marinFeedback.textContent=error.message;}
};
$('marin-save').onclick=async()=>{
  const button=$('marin-save');button.disabled=true;
  try{
    const result=await api('/api/voice/config',{action:'save',key:$('marin-key').value,consent:$('marin-consent').checked});
    $('voice').value='marin';settings.set('voiceAnnaV1','marin');marinFeedback.textContent=result.message+' Oben auf „Stimme testen“ tippen.';
  }catch(error){marinFeedback.textContent=error.message;}
  finally{$('marin-key').value='';button.disabled=false;}
};
$('marin-remove').onclick=async()=>{
  const button=$('marin-remove');button.disabled=true;stopAudio();
  try{
    const result=await api('/api/voice/config',{action:'delete'});marinCache=null;$('marin-key').value='';$('marin-consent').checked=false;
    if($('voice').value==='marin'){$('voice').value=voices.find(v=>/^anna(?:\s|$)/i.test(v.name))?.voiceURI||'anna';settings.set('voiceAnnaV1',$('voice').value);loadVoices();}
    marinFeedback.textContent=result.message;
  }catch(error){marinFeedback.textContent=error.message;}
  finally{button.disabled=false;}
};
