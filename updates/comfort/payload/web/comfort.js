'use strict';
const openedMailRequests = new Set();
async function markOpenedMail(mail) {
  if (!mail.unread || openedMailRequests.has(mail.id)) return;
  openedMailRequests.add(mail.id);
  try {
    await api('/api/mail/read', {id:mail.id});
    mail.unread = false;
    renderMail();
    if (typeof updateMailMetric === 'function') updateMailMetric();
    if (chosenMail?.id === mail.id) $('mail-action-status').textContent = 'Bei Yahoo als gelesen markiert.';
  } catch (error) {
    if (chosenMail?.id === mail.id) $('mail-action-status').textContent = 'Lesestatus nicht synchronisiert: ' + error.message;
  } finally {
    openedMailRequests.delete(mail.id);
  }
}
(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'quick-appointment';
  dialog.setAttribute('aria-labelledby','quick-appointment-title');
  dialog.innerHTML = `<form id="quick-appointment-form">
    <div class="quick-heading"><h2 id="quick-appointment-title">Termin eintragen</h2><button id="quick-appointment-close" type="button" aria-label="Terminfenster schließen">✕</button></div>
    <p>Kalender Arbeit · 15 Minuten · Zeitzone Berlin</p>
    <label for="quick-date">Wann</label><input id="quick-date" type="date" required>
    <label for="quick-time">Uhrzeit</label><input id="quick-time" type="time" required>
    <label for="quick-subject">Betreff</label><input id="quick-subject" maxlength="200" required autocomplete="off">
    <p id="quick-appointment-status" role="status"></p>
    <button id="quick-appointment-submit" type="submit">Eintragen</button></form>`;
  document.body.append(dialog);
  let running = false, requestId = '', payloadKey = '';
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'quick-appointment-open';
  button.textContent = '＋ Termin'; button.setAttribute('aria-haspopup','dialog');
  document.querySelector('.topbar-right').prepend(button);
  button.onclick = () => {
    const today = berlinDay(new Date());
    $('quick-date').min = today;
    if (!$('quick-date').value) $('quick-date').value = today;
    dialog.showModal();
    $('quick-subject').focus();
  };
  $('quick-appointment-close').onclick = () => { if (!running) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (running) event.preventDefault(); });
  $('quick-appointment-form').onsubmit = async event => {
    event.preventDefault();
    if (running) return;
    const data = {date:$('quick-date').value,time:$('quick-time').value,title:$('quick-subject').value.trim()};
    if (!data.title) { $('quick-subject').focus(); return; }
    const key = JSON.stringify(data);
    if (payloadKey !== key) {
      requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
      payloadKey = key;
    }
    running = true;
    const submit = $('quick-appointment-submit');
    submit.disabled = true; $('quick-appointment-close').disabled = true;
    $('quick-appointment-status').textContent = 'Wird in Arbeit eingetragen …';
    try {
      const value = await api('/api/calendar/quick', {...data,request_id:requestId});
      $('quick-appointment-status').textContent = value.message;
      if (value.kind === 'calendar_saved') {
        $('quick-subject').value = '';
        // Retain the last request identity for a duplicate retry after a lost response.
        if (typeof refreshCalendar === 'function') refreshCalendar().catch(()=>{});
      }
    } catch (error) {
      $('quick-appointment-status').textContent = error.message;
    } finally {
      running = false; submit.disabled = false; $('quick-appointment-close').disabled = false;
    }
  };
})();
