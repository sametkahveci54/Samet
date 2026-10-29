# JARVIS

Deutscher lokaler Assistent für macOS und iPhone: Ollama-Chat, Geräte-Sprachausgabe, lokale optionale KI-Stimmen und feste Mac-Aktionen.

## Lokal starten

Ollama mit `qwen3:1.7b` muss unter `127.0.0.1:11434` laufen. Der Webserver selbst benötigt nur Python 3.9 oder neuer:

```sh
python3 server.py
```

Danach http://127.0.0.1:8765 öffnen. Standardstimme ist Anna, sofern auf dem jeweiligen Gerät verfügbar. Spracheingabe erfolgt per Browser; dabei kann der Browseranbieter Audio verarbeiten. Chatverlauf bleibt im Browser-Arbeitsspeicher. Notizen werden lokal in `Notizen/` gespeichert.

## Privates HTTPS mit Tailscale

Den eigenen Tailscale-DNS-Namen in der lokalen, nicht versionierten Datei `config.local.json` hinterlegen:

```json
{"tailscale_host": "mein-mac.mein-tailnet.ts.net"}
```

Alternativ die Umgebungsvariable `JARVIS_TAILSCALE_HOST` setzen. Anschließend den Server neu starten und `tailscale serve --bg http://127.0.0.1:8765` ausführen. Nur Serve verwenden, kein öffentliches Funnel. Der Mac muss eingeschaltet und erreichbar sein.

## Optionale lokale Stimmen

Anna benötigt keine Server-Sprachengine. Victoria verwendet `speech.py` und separat heruntergeladene Kokoro-ONNX-Dateien unter `voices/victoria/`. Python-Pakete: `requirements-lock.txt`. Die eigene Stimme verwendet `clone_runtime.py`, `clone_client.py`, `clone_speak.py` sowie eine separate Python-3.11-Umgebung `.voice-venv/`; Paketversionen: `requirements-voice-lock.txt`. Alle Sprachmodelle und Stimmvorlagen müssen separat auf dem eigenen Mac eingerichtet werden; sie gehören nicht zu diesem Repository. Ohne diese Dateien funktionieren die jeweiligen optionalen Stimmen nicht.

NeuTTS: https://github.com/neuphonic/neutts ; Victoria-Modell: https://huggingface.co/Benjamin-Wegener/kokoro-german-victoria-onnx-int8 . Modellzugang und Lizenzen separat beachten. Die eigene Stimme ist ein synthetischer KI-Klon.

## Sicherheit und Datenschutz

Ausschließlich feste Aktionen: Safari öffnen, Rechner öffnen und Textnotizen speichern. Keine vom Modell erzeugten Shell-Befehle. Server bindet nur an Loopback und prüft Host, Ursprung und Sitzungstoken für Schreibanfragen. Token werden beim Start zufällig im Arbeitsspeicher erzeugt.

Nicht versioniert: Zugangsdaten, `.env`-Dateien, lokale Konfiguration, Notizen, Chat-/Laufzeitlogs, Aufnahmen, Referenztexte, Modelle, Screenshots, Speicherberichte, virtuelle Umgebungen und Caches.

`Start.command` verwendet eine vorhandene `.venv/`. `test_jarvis.py` ist ein manueller Integrationstest, der Apps öffnet und eine Testnotiz erstellt. HTTPS wird nur geprüft, wenn eine eigene lokale Konfiguration oder `JARVIS_TEST_HTTPS` gesetzt ist.

## Automatische Updates auf dem Mac

Einmalig im lokalen Git-Arbeitsordner auf Branch `main`:

```sh
python3 install_auto_update.py
```

Vorher muss der bisher manuell gestartete Jarvis-Server beendet sein. Der Installer beendet keine fremden Prozesse und benötigt kein sudo. Er richtet den Benutzer-LaunchAgent `de.samet.jarvis` ein, der Jarvis beim Anmelden startet und alle 60 Sekunden `origin/main` des freigegebenen Repositorys prüft. Ein vorhandenes `.venv/bin/python` wird weiterverwendet. Der Mac muss wach, online und der Benutzer angemeldet sein. Ollama und Tailscale werden weiterhin separat betrieben.

Der Dienst übernimmt nur Fast-Forward-Updates bei sauberem Arbeitsordner. Uncommittete Änderungen, zusätzliche nicht ignorierte Dateien und abweichende Branches pausieren die Aktualisierung. Es gibt kein automatisches Stash, Überschreiben lokaler Arbeit oder Installieren neuer Pakete. Änderungen an Abhängigkeitsdateien erfordern einmaliges lokales Prüfen. Lokale Konfiguration, Notizen, Sprachmodelle und Umgebungen bleiben durch die vorhandene .gitignore getrennt.

Python-Dateien werden vor der Übernahme auf Syntax geprüft. Nach dem Neustart wird die HTTP-Sitzungsantwort geprüft; schlägt das fehl, kehrt der Dienst zur vorherigen Git-Version zurück, sofern inzwischen niemand lokale Änderungen vorgenommen hat. Das ist ein Starttest, keine vollständige Funktionsprüfung von KI, Oberfläche oder Mac-Aktionen. Updates starten den Server kurz neu und können laufende Anfragen unterbrechen. Nach einem Neustart die Seite bei einer Sitzungsfehlermeldung neu laden; der Chatverlauf im Browser wird nicht dauerhaft gespeichert.

Status: `~/Library/Application Support/Jarvis/update-status.json`  
Log: `~/Library/Logs/Jarvis/jarvis.log`

Einmalige Aktivierung durch lokalen Codex: Origin/Branch und lokale Änderungen prüfen, aktuellen GitHub-Stand ohne Überschreiben übernehmen, bisherigen Prozess auf Port 8765 identifizieren und gezielt beenden, Installer ausführen und danach LaunchAgent, HTTP-Zugriff und privaten Tailscale-Zugriff testen. macOS kann für den Projektordner zusätzliche Dateizugriffsrechte verlangen. Diese müssen lokal bestätigt werden. Falls der Dienst den Desktop-Ordner nicht lesen kann, anhand des Logs die macOS-Dateifreigabe prüfen.

Deaktivieren (beendet auch den vom Dienst gestarteten Jarvis):

```sh
python3 install_auto_update.py --uninstall
```

Tests ohne Öffnen von Mac-Apps oder Zugriff auf echte Notizen:

```sh
python3 -m unittest -v test_auto_update.py
```

Normale Änderungen können nach dieser Aktivierung hier über GitHub bereitgestellt werden; die lokale Übernahme benötigt keinen weiteren Download von Hand. Das ist eine automatische Code-Aktualisierung, keine Weiterleitung an einen anderen Codex-Chat. Wer Schreibzugriff auf `main` hat, kann dadurch Code auf diesem Mac aktualisieren. Der Dienst führt ihn mit den Rechten des angemeldeten Benutzers aus.

## Yahoo Mail und iCloud-Kalender

Die Oberfläche enthält jetzt „Dein Tag im Blick“ und „Konten verbinden“. Bestehendes Design und Anna-Sprachausgabe werden beibehalten. Es sind keine neuen Python-Pakete nötig; das Update kann vom eingerichteten Dienst übernommen werden.

Einmalig direkt in Jarvis eingeben (nicht in einen Chat oder eine versionierte Datei):

- Yahoo-Konto und ein eigens für Jarvis erzeugtes Yahoo-App-Passwort: https://login.yahoo.com/account/security
- Apple-Account-E-Mail und ein anwendungsspezifisches Passwort: https://account.apple.com/ → Anmeldung und Sicherheit → Anwendungsspezifische Passwörter. Apple verlangt Zwei-Faktor-Authentifizierung: https://support.apple.com/en-us/102654

Der Server prüft die Anmeldung und speichert beide Verbindungen ausschließlich im macOS-Schlüsselbund unter `de.samet.jarvis.yahoo` und `de.samet.jarvis.icloud`. Der Schlüsselbund kann eine lokale Freigabe verlangen. Zugangsdaten werden weder über Git noch in Browser-localStorage gespeichert. Die Anmeldung erfolgt auf localhost oder über den vorhandenen privaten Tailscale-HTTPS-Zugang. „Trennen“ entfernt die lokale Verbindung; zum vollständigen Entzug das jeweilige App-Passwort zusätzlich beim Anbieter widerrufen.

Funktionen:

- Tagesübersicht der iCloud-Termine in Europe/Berlin mit Ganztagsterminen und serverseitiger Auflösung von Terminserien. Nicht aufgelöste oder unlesbare Serien/Ressourcen werden ausdrücklich als unvollständige Übersicht gemeldet. Höchstens 15 Kalender und 300 Ereignisse pro Abruf.
- Im Chat: „Welche Termine habe ich heute?“ und „Was steht heute noch an?“ werden aus den Kalenderdaten beantwortet, ohne erfundene Modellantwort. Sonstige Chatfragen bekommen nicht automatisch Zugriff auf Mails oder Termine.
- Neue einzelne Termine mit Kalenderwahl, Ort und optionaler Erinnerung. Erst die serverseitige Vorschau, dann die ausdrückliche Bestätigung speichert den Termin. Keine Einladungen, Änderungen bestehender Termine oder Konfliktprüfung. Bestätigungen sind zehn Minuten gültig und nur einmal verwendbar. Bei Verbindungsabbruch den Kalender prüfen, bevor erneut angelegt wird.
- Die neuesten 20 Yahoo-Mails aus INBOX, per IMAP im Nur-Lesen-Modus und BODY.PEEK. Pro Mail maximal die ersten 32 KiB als Textauszug; keine Anhänge und keine Bilder/Tracker. Keine Mails löschen, verschieben oder als gelesen markieren.
- Vorsichtige regelbasierte Einordnung anhand von Newsletter-Kopfzeilen und Betreffwörtern. „Prüfen“ und „Vermutlich Werbung“ sind Hilfestellungen, keine zuverlässige Wichtigkeits- oder Spamprüfung. Phishing wird nicht zuverlässig erkannt.
- Antwortentwürfe aus einer ausgewählten, kürzlich geladenen Mail und einer ausdrücklichen Antwortvorgabe. Formulierung erfolgt im lokalen Ollama-Modell. Entwurf prüfen und kopieren; es gibt keinen Versand. Fremde Mailtexte sind Daten, keine Systemanweisungen. Mailauszüge und Vorschautermine bleiben nur im Server-Arbeitsspeicher und werden bei Neustart/Trennen verworfen.

Offline-Tests (ohne echte Konten, Schlüsselbund oder Kalenderänderungen):

```sh
python3 -m unittest -v test_integrations.py test_integration_http.py
```

Die echten Yahoo-/iCloud-Anmeldungen und der macOS-Schlüsselbund müssen nach der persönlichen Freigabe auf dem Mac geprüft werden. UI-Tests mit Testdaten bestätigen keine echte Anbieter-Verbindung.

