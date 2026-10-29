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
