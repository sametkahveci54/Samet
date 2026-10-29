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
