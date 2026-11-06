'use strict';
const statusText = document.getElementById('status');
let registration, subscription, publicKey;
async function request(action, data = {}) {
  const session = await fetch('/api/session').then(response => response.json());
  const response = await fetch('/api/bitcoin/' + action, {method:'POST', headers:{'Content-Type':'application/json','X-Jarvis-Token':session.token},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Jarvis konnte die Anfrage nicht ausführen.');
  return result;
}
function keyBytes(value) {
  const padded = value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
async function reload() {
  subscription = registration ? await registration.pushManager.getSubscription() : null;
  const data = await request('status', {endpoint:subscription?.endpoint || ''});
  publicKey = data.public_key;
  document.getElementById('enable').disabled = !registration || !publicKey;
  document.getElementById('test').disabled = !data.enabled;
  document.getElementById('disable').disabled = !data.enabled;
  const list = document.getElementById('reports');
  list.replaceChildren();
  for (const report of data.reports) {
    const article = document.createElement('article');
    article.textContent = new Date(report.slot).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}) + ' · Geplanter Bericht\n\n' + report.body;
    list.append(article);
  }
  if (!data.reports.length) list.textContent = 'Der erste Bericht erscheint zur nächsten Berichtszeit.';
  statusText.textContent = data.enabled ? 'Push für dieses Gerät ist eingeschaltet.' : 'Push für dieses Gerät ist ausgeschaltet.';
  if (!registration) statusText.textContent = 'Für Push bitte Jarvis vom Home-Bildschirm öffnen. Dieser Browser bietet hier keine Push-Anmeldung.';
  if (data.delivery === 'pending') statusText.textContent += ' Der letzte Versand konnte nicht sicher bestätigt werden.';
  if (data.delivery === 'retry') statusText.textContent += ' Der letzte Versand wird erneut versucht.';
}
document.getElementById('enable').onclick = async () => {
  try {
    // Subscribe directly in the click gesture, as required by Safari.
    const pending = registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:keyBytes(publicKey)});
    statusText.textContent = 'Bitte Benachrichtigungen erlauben …';
    subscription = await pending;
    await request('subscribe', {subscription:subscription.toJSON()});
    await reload();
  } catch (error) { statusText.textContent = 'Push konnte nicht aktiviert werden. ' + error.message; }
};
document.getElementById('disable').onclick = async () => {
  try {
    await request('unsubscribe',{endpoint:subscription?.endpoint || ''});
    if (subscription) await subscription.unsubscribe();
    await reload();
  } catch (error) { statusText.textContent = error.message; }
};
document.getElementById('test').onclick = async () => {
  const button = document.getElementById('test');
  button.disabled = true;
  try { statusText.textContent = (await request('test',{endpoint:subscription.endpoint})).message; }
  catch (error) { statusText.textContent = error.message; }
  finally { button.disabled = false; }
};
document.getElementById('refresh').onclick = () => reload().catch(error => statusText.textContent = error.message);
(async () => {
  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      await navigator.serviceWorker.register('/bitcoin-sw.js',{scope:'/'});
      registration = await navigator.serviceWorker.ready;
    }
    await reload();
  } catch (error) { statusText.textContent = error.message; }
})();
