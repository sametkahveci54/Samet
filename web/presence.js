'use strict';
// Original procedural visual: a woven toroidal field around a quiet nucleus.
// It follows existing UI states, not microphone samples or a simulated meter.
function updatePresenceCaption(state){
  const text={ready:['Ein Gedanke genügt.','Ich bin hier, Samet. Was machen wir als Nächstes?'],listening:['Ich höre dir zu.','Deine Spracheingabe erscheint unten als Text.'],thinking:['Ich kümmere mich darum.','Jarvis bearbeitet gerade deine Anfrage.'],speaking:['Hier ist deine Antwort.','Du findest den Text auch im Verlauf.']}[state]||['Ein Gedanke genügt.','Ich bin hier, Samet.'];
  $('presence-caption-title').textContent=text[0];$('presence-caption-description').textContent=text[1];
}
let presencePaused=settings.get('presenceMotion','on')==='off';
let presenceRenderer=null;
function updatePresenceMotion(){
  $('presence-motion').textContent=presencePaused?'▶':'Ⅱ';
  $('presence-motion').setAttribute('aria-label',presencePaused?'Animation fortsetzen':'Animation anhalten');
  $('presence-motion').title=presencePaused?'Animation fortsetzen':'Animation anhalten';
  presenceRenderer?.update();
}
$('presence-motion').onclick=()=>{presencePaused=!presencePaused;settings.set('presenceMotion',presencePaused?'off':'on');updatePresenceMotion();};
$('presence-close-history').onclick=()=>{$('presence-conversation').open=false;};
$('presence-open-mail').onclick=()=>activateView('mail');
$('presence-open-calendar').onclick=()=>activateView('calendar');
$('presence-open-tasks').onclick=()=>activateView('tasks');
$('presence-stop').onclick=()=>{
  if(typeof calendarOrderRunning!=='undefined'&&calendarOrderRunning){$('speech-status').textContent='Der Kalenderauftrag läuft bereits. Bitte das Ergebnis abwarten; ein Speicherzugriff kann nicht zuverlässig zurückgerufen werden.';return;}
  allowAutoSend=false;if(listening)recognition?.abort();
  if(busy)$('cancel-requests').click();
  stopAudio();$('speech-status').textContent='Gestoppt.';
};
for(const id of ['presence-tools','presence-actions','presence-conversation']){
  $(id).ontoggle=()=>{if($(id).open)for(const other of ['presence-tools','presence-actions','presence-conversation'])if(other!==id)$(other).open=false;};
}
updatePresenceMotion();
(()=>{
  const canvas=$('presence-canvas'),visual=$('presence-visual');
  const context=canvas.getContext?.('2d',{alpha:true,desynchronized:true});
  if(!context)return; // CSS fallback stays visible on unsupported browsers.
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let width=500,height=500,scale=1,frame=0,lastTime=0,lastDraw=0,elapsed=0,rendering=false;
  let strands=[],nucleus=[],small=false;
  function build(){
    const bands=small?13:19,segments=small?64:86;
    strands=[];
    for(let j=0;j<bands;j++){
      const band=[];
      for(let i=0;i<=segments;i++)band.push({u:i/segments*Math.PI*2,v:j/bands*Math.PI*2,seed:Math.sin(j*19.7+i*3.1)*0.5+0.5});
      strands.push(band);
    }
    const count=small?150:260;nucleus=[];
    const golden=Math.PI*(3-Math.sqrt(5));
    for(let i=0;i<count;i++){
      const y=1-(i/(count-1))*2,r=Math.sqrt(1-y*y),angle=golden*i;
      nucleus.push({x:Math.cos(angle)*r,y,z:Math.sin(angle)*r,seed:i/count});
    }
  }
  function resize(){
    const box=visual.getBoundingClientRect();
    if(!box.width||!box.height)return;
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    width=box.width;height=box.height;scale=Math.min(width,height)*0.43;
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    context.setTransform(dpr,0,0,dpr,0,0);
    const nextSmall=width<430;if(nextSmall!==small||!strands.length){small=nextSmall;build();}
    update();
  }
  function visible(){return document.visibilityState!=='hidden'&&document.body.dataset.view==='assistant';}
  function project(x,y,z,t){
    const yaw=t*0.055+0.28,tilt=0.83+Math.sin(t*0.07)*0.12,roll=-0.35;
    const xx=x*Math.cos(yaw)+z*Math.sin(yaw),zz=-x*Math.sin(yaw)+z*Math.cos(yaw);
    const yy=y*Math.cos(tilt)-zz*Math.sin(tilt),z2=y*Math.sin(tilt)+zz*Math.cos(tilt);
    const x2=xx*Math.cos(roll)-yy*Math.sin(roll),y2=xx*Math.sin(roll)+yy*Math.cos(roll);
    const perspective=3.7/(3.7-z2);
    return {x:width/2+x2*scale*perspective,y:height/2+y2*scale*perspective,z:z2,p:perspective};
  }
  function paint(t){
    if(!strands.length)build();
    const state=document.body.dataset.state||'ready',light=document.documentElement.dataset.theme==='light';
    const energy=state==='listening'?1.7:state==='speaking'?1.3:state==='thinking'?1.1:0.35;
    const rhythm=1+Math.sin(t*1.1)*0.018;
    context.clearRect(0,0,width,height);
    const glow=context.createRadialGradient(width/2,height/2,0,width/2,height/2,scale*1.3);
    glow.addColorStop(0,light?'rgba(44,145,140,0.045)':'rgba(78,184,170,0.075)');
    glow.addColorStop(0.6,light?'rgba(48,148,156,0.02)':'rgba(39,99,117,0.04)');glow.addColorStop(1,'rgba(0,0,0,0)');
    context.fillStyle=glow;context.fillRect(0,0,width,height);
    const points=[];
    for(let j=0;j<strands.length;j++){
      const strand=strands[j],line=[];
      for(let i=0;i<strand.length;i++){
        const item=strand[i],u=item.u,v=item.v+u*1.65+t*0.10;
        const pulse=Math.sin(u*4+t*0.6+item.v)*0.032*energy;
        const tube=0.205+pulse,ring=0.69+Math.cos(v)*tube;
        const p=project(Math.cos(u)*ring*rhythm,Math.sin(u)*ring*rhythm,Math.sin(v)*tube+Math.sin(u*3+t*0.25)*0.07,t);
        p.seed=item.seed;p.warm=j%5===0;p.kind='ring';points.push(p);line.push(p);
      }
      context.beginPath();
      for(let i=0;i<line.length;i++){const p=line[i];if(i===0)context.moveTo(p.x,p.y);else context.lineTo(p.x,p.y);}
      context.lineWidth=j%5===0?0.65:0.45;
      context.strokeStyle=light?(j%5===0?'rgba(137,103,58,0.14)':'rgba(42,129,130,0.16)'):(j%5===0?'rgba(226,193,144,0.15)':'rgba(125,222,212,0.15)');context.stroke();
    }
    for(const item of nucleus){
      const r=(0.30+Math.sin(item.seed*30+t*0.45)*0.025)*rhythm;
      const p=project(item.x*r,item.y*r,item.z*r,t*0.7);p.kind='core';p.seed=item.seed;p.warm=false;points.push(p);
    }
    points.sort((a,b)=>a.z-b.z);
    for(const p of points){
      const depth=Math.max(0.1,Math.min(1,(p.z+0.95)/1.9));
      const shimmer=0.75+Math.sin(p.seed*40+t*0.8)*0.25;
      const alpha=(0.32+depth*0.65)*shimmer*(p.kind==='core'?0.7:1);
      const radius=(p.kind==='core'?0.55:0.6+p.seed*0.65)*p.p*(0.7+depth*0.5);
      context.beginPath();context.arc(p.x,p.y,radius,0,Math.PI*2);
      context.fillStyle=light?(p.warm?'rgba(139,99,48,'+alpha+')':'rgba(26,116,122,'+alpha+')'):(p.warm?'rgba(244,207,158,'+alpha+')':'rgba(166,238,225,'+alpha+')');context.fill();
      if(!light&&p.seed>0.96&&p.z>0){
        context.beginPath();context.arc(p.x,p.y,radius*2.8,0,Math.PI*2);context.fillStyle=p.warm?'rgba(245,203,144,0.055)':'rgba(164,239,222,0.055)';context.fill();
      }
    }
    visual.dataset.rendered='true';
  }
  function tick(time){
    frame=0;if(!visible()){rendering=false;lastTime=0;return;}
    const interval=1000/(small?24:30);
    if(!lastTime)lastTime=time;
    elapsed+=Math.min((time-lastTime)/1000,0.08);lastTime=time;
    if(time-lastDraw>=interval){paint(elapsed);lastDraw=time;}
    if(!presencePaused&&!reduced.matches){rendering=true;frame=requestAnimationFrame(tick);}else rendering=false;
  }
  function update(){
    if(!visible()){if(frame)cancelAnimationFrame(frame);frame=0;rendering=false;lastTime=0;return;}
    paint(elapsed);
    if(!presencePaused&&!reduced.matches&&!rendering){rendering=true;lastTime=0;frame=requestAnimationFrame(tick);}
    if((presencePaused||reduced.matches)&&frame){cancelAnimationFrame(frame);frame=0;rendering=false;}
  }
  presenceRenderer={update};
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(visual);
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',update);
  reduced.addEventListener?.('change',update);
  new MutationObserver(()=>{resize();update();}).observe(document.body,{attributes:true,attributeFilter:['data-view','data-state']});
  new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  resize();
})();

updatePresenceCaption(document.body.dataset.state||'ready');
