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

## Alltag 1: persönliche Bedienung

Oben stehen nächster beziehungsweise laufender Termin, Anzahl der geladenen Mails zum Prüfen und offene Aufgaben. Der Chat ist wieder vor den ausführlichen Kalender-/Mailkarten angeordnet. Konten und persönliche Einstellungen bleiben einklappbar. Mails und die neuen Karten umbrechen lange Texte; die Mailfelder scrollen weiterhin nur vertikal.

Unter „Verbindungen und Jarvis-Version“ stehen die tatsächlich gestartete Code-Version, die Git-Kennung beim Serverstart und das letzte Signal des Update-Diensts. „Kontoverbindungen prüfen“ testet die gespeicherte Yahoo-Anmeldung und die iCloud-Kalenderliste. Zeitstempel zeigen, wie aktuell das jeweilige Ergebnis ist; eine gespeicherte Anmeldung allein wird nicht als aktuelle Verbindungsprüfung ausgegeben.

### Kalender im Gespräch und aus Mails

Beispiele:

- „Trag morgen um 15 Uhr einen Werkstatttermin ein.“
- „Trag morgen um 15 Uhr bis 18 Uhr Kino in Kalender Privat ein.“
- „Notiere als Aufgabe: morgen Werkstatt anrufen.“
- „Merke dir: Ich bevorzuge kurze Antworten.“
- „Welche Aufgaben sind offen?“
- „Fasse meine wichtigen Mails zusammen.“

Einfache Datums-/Uhrzeitangaben werden lokal ausgewertet; für komplexere Terminvorschläge kann das lokale Modell helfen. Ohne genannte Dauer werden 15 Minuten vorgeschlagen. Datum, Uhrzeit, Titel, Ort und Kalender bleiben im Formular prüf- und änderbar. Ein bevorzugter Kalender kann eingestellt werden; ein im Auftrag genannter Kalendername hat Vorrang. Unklare Daten sowie mehrdeutige/nicht existierende Uhrzeiten bei Zeitumstellungen werden zurückgewiesen.

Eine neue Terminprüfung liest vorhandene Termine einschließlich des eingestellten Puffers vor und nach dem Termin. Transparente Ereignisse werden nicht als Belegung gewertet. Überschneidungen und unvollständige Abfragen werden sichtbar gemeldet; zum Übergehen muss das zusätzliche Kästchen ausdrücklich bestätigt werden. Vor dem tatsächlichen Speichern wird die Kalenderlage erneut geprüft. Hat sie sich verändert, ist eine neue Vorschau nötig. Ein Puffer ist eine feste Minutenangabe, keine berechnete Fahrzeit.

In der ausgewählten Mail bereiten „Termin aus Mail vorschlagen“ und „Aufgabe aus Mail vorschlagen“ nur einen KI-Vorschlag aus dem vorhandenen Auszug vor. Mit der ursprünglichen Mail vergleichen; fehlende Informationen ergänzen. Keine automatische Speicherung und keine Einladungen. Aufgaben-/Gedächtnisvorschläge aus dem Chat benötigen ebenfalls eine ausdrückliche Bestätigung.

### Persönliche Mailregeln und Entwürfe

Die Einstellungen erlauben bis zu 30 genaue Absender beziehungsweise Domains (zum Beispiel `@beispiel.de`) und 30 Themenbegriffe. Diese Regeln heben passende Mails als „Deine Priorität“ hervor; sie verifizieren keine Absender und ersetzen keine Spam-/Phishingprüfung. Nach einer Änderung die Tagesübersicht erneut laden.

Mailentwürfe berücksichtigen den gewählten Stil (freundlich, kurz, förmlich, locker) und optional eine ausdrücklich gespeicherte Signatur. Die Einzelmail- und Sammelzusammenfassungen werden lokal erzeugt und sind als KI-Zusammenfassungen erkennbar. Die Sammelzusammenfassung nutzt höchstens acht relevante, kürzlich geladene Auszüge aus den neuesten 20 Mails. Bei „heute“ wird zusätzlich das Datumsfeld der Mail in Berliner Zeit geprüft. Das ist keine Volltextsuche in der ganzen Mailbox. Lange Mails bekommen beim Öffnen zunächst eine Zusammenfassung; der verfügbare ursprüngliche Auszug bleibt aufklappbar. Es gibt weiterhin keinen automatischen Mailversand oder Lösch-/Verschiebevorgang.

### Aufgaben, Gedächtnis und Stimme

Aufgaben können mit Datum gespeichert, bearbeitet, erledigt und entfernt werden. Überfällige Aufgaben sind markiert. Diese Liste versendet noch keine automatischen Benachrichtigungen; Kalendererinnerungen sind davon unabhängig.

Das Gedächtnis enthält ausschließlich ausdrücklich gespeicherte Informationen. Jeder Eintrag ist einsehbar, bearbeitbar und löschbar. Die letzten acht Einträge (zusammen begrenzt auf rund 2.100 Zeichen) können normalen lokalen Chatantworten als Hintergrund dienen. Es gibt kein unbemerktes Lernen aus der Mailbox.

Aufgaben, Vorlieben und Erinnerungen liegen in `~/Library/Application Support/Jarvis/personal.json`, außerhalb des Git-Projekts und mit Dateirechten 0600. Zugangsdaten bleiben separat im Schlüsselbund. Diese neuen Funktionen benötigen keine weiteren Python-Pakete.

Die beiden Sprachoptionen sind freiwillig und standardmäßig aus:
- „Gesprochenen Text direkt senden“ sendet erst endgültig erkannten Text. Kalender-/Speichervorschläge bleiben bestätigungspflichtig.
- „Antworten kürzer vorlesen“ begrenzt lange Sprachausgaben und verweist auf den vollständigen sichtbaren Text. Anna und die bisherige Stimmeinstellung bleiben erhalten.

Längere Lese-, Kalenderprüf- und Modellanfragen zeigen ihren Zustand und sind abbrechbar. Der Browser beendet die Anfrage; der Server prüft das Abbruchsignal zwischen Netzwerkoperationen beziehungsweise Modell-Streamabschnitten. Eine bereits laufende einzelne Netzwerkanfrage kann bis zu ihrem Timeout weiterlaufen. Die eigentlichen Speicher-/Bestätigungsvorgänge sind bewusst nicht über den allgemeinen Abbrechen-Button abbrechbar.

Der Update-Dienst schreibt nun bei jeder Prüfung ein aktuelles Statussignal und wartet auf laufende Jarvis-Anfragen. Beim Start der neuen Version kann er sich einmal selbst neu starten.

### Prüfung

```sh
python3 -m unittest -v test_integrations.py test_integration_http.py test_auto_update.py test_daily.py
node test_organizer.js
node test_daily_ui.js
```

Die Tests verwenden temporäre Daten und nachgebildete Provider-/DOM-Antworten. Sie verändern keine echten Konten, Termine oder Mac-Apps. Ein echter visueller Safari-/iPhone-Durchlauf und echte Anbieteraktionen sind damit nicht bestätigt.




### Marin · Professional (optionale Online-Stimme)

Unter „Marin · Professional einrichten“ einen eigenen OpenAI-API-Schlüssel hinterlegen und die kostenpflichtige Übertragung vorgelesener Texte ausdrücklich freigeben. Der Schlüssel bleibt im macOS-Schlüsselbund, wird nie an den Browser zurückgegeben und gehört weder in Git noch in den Chat. API-Abrechnung/Guthaben separat im OpenAI-Konto einrichten; ChatGPT Plus deckt sie nicht ab. Speichern ruft noch keine kostenpflichtige Sprachgenerierung auf. Anschließend „Stimme testen“ antippen. Auf weiteren Geräten Marin im Stimmenmenü auswählen. Anna bleibt verfügbar.

Das Backend verwendet gpt-4o-mini-tts mit Marin und einer professionellen, ruhigen Sprech-Anweisung. Das ist eine Stilvorgabe, keine Garantie für identische Betonung wie in der Demo. Audio kommt als PCM-Stream (24 kHz, 16 Bit, mono) und wird im Browser während des Empfangs abgespielt. Ton am iPhone gegebenenfalls zuerst mit „Ton aktivieren“ freigeben. Stoppen bricht den Abruf ab; bereits erzeugtes Audio kann trotzdem abgerechnet werden. Die zuletzt vollständig erzeugte Aufnahme bleibt nur im Arbeitsspeicher der Seite und kann ohne neue API-Anfrage erneut abgespielt werden. Es gibt keine automatischen kostenpflichtigen Wiederholungsversuche. Schlüssel entfernen deaktiviert neue Online-Generierung; der Schlüssel kann zusätzlich im OpenAI-Konto widerrufen werden.

Offline geprüft: Schlüssel-/Fehlerbehandlung, Token-Schutz, PCM-Übertragung und Wiedergabe mit ungeraden Netzwerkpaketen, Abbruch aller eingeplanten Audioquellen und Wiederverwendung der letzten Aufnahme. Echte Sprachgenerierung und Safari-/iPhone-Audiowiedergabe müssen nach Einrichtung mit dem eigenen API-Konto getestet werden.


## Workspace: Oberfläche und Mail-Zuverlässigkeit

Die Startseite ist jetzt ein persönlicher Arbeitsplatz statt einer Begrüßungsseite: Navigation für Übersicht, Posteingang, Kalender, Aufgaben, Assistent und Einstellungen. Der Posteingang lädt automatisch beim Öffnen, unabhängig von der Kalenderansicht. Kalender kann separat geladen werden. Die Übersicht zeigt echte Lade-/Fehlerzustände statt Platzhalterzahlen. Einstellungen und Konten sind aus der täglichen Arbeit ausgelagert. Die Geräte-/Online-Stimmen und alle Bestätigungen für Kalender und Gedächtnis bleiben erhalten.

Yahoo nutzt einen gebündelten, schreibgeschützten IMAP-Fetch der neuesten 20 Nachrichten mit BODY.PEEK; Flag „ungelesen“ wird angezeigt, nicht verändert. Nach Absender, Betreff und Auszug suchen oder nach Kategorie/ungelesen filtern. Die Suche umfasst ausschließlich geladene Nachrichten. Aktualisieren bewahrt vorherige Nachrichten bei Fehlern. Yahoo- und iCloud-Arbeit verwenden getrennte Sperren, damit ein wartender Kalender den Posteingang nicht blockiert. Bereits ausgewählte Mailauszüge anderer Tabs/Geräte bleiben bis zum Ablauf des 15-Minuten-Caches nutzbar. Zugang gespeichert bedeutet nicht automatisch, dass ein aktueller Abruf erfolgreich ist; Fehler werden im Mailbereich angezeigt.

Eine sichtbare Seite aktualisiert den Posteingang frühestens nach fünf Minuten automatisch, sofern keine Mail ausgewählt ist. Ein geöffneter Entwurf wird dadurch nicht ersetzt. Es werden weiterhin keine Mails versendet, gelöscht oder verschoben. Suchergebnisse und Kategorien sind keine vollständige Spamprüfung. Zugangsdaten bleiben im Mac-Schlüsselbund.

Prüfung: 59 Offline-Python-Tests, beide funktionalen UI-Suiten einschließlich Startabruf, getrenntem Laden, Such-/Ansichtswechsel und Erhalt der Liste nach Fehlern. Regression für blockierende iCloud-Abfrage, IMAP-Bündelung/Reihenfolge/Seen-Flags und Auszüge in mehreren Sitzungen. Zusätzlich Browserprüfung mit eindeutig gekennzeichneten Testdaten: Desktop-Posteingang und Lesebereich sowie Ansichten in einer 390-Pixel-Umgebung ohne horizontale Überbreite. Ein Live-Yahoo-Abruf und Safari auf dem eigenen iPhone bleiben Geräteprüfungen.


## Workspace 2: zentrale Anliegen und Schnellsuche

Neue Startansicht mit persönlicher Begrüßung, einer zentralen Eingabe, direkten Einstiegen in Tagesplan, wichtige Mails und Aufgaben sowie einem Tagesbriefing aus Kalender-, Mail- und Aufgabendaten. Ein eingegebenes Anliegen verwendet den vorhandenen Assistenten; Bestätigungen für gespeicherte Informationen und Kalender bleiben erforderlich. Neue Aufgaben aus dem Schnellzugriff öffnen zuerst das Aufgabenformular.

Die Schnellsuche öffnet per ⌘K / Strg+K oder Suchsymbol. Sie durchsucht die geladenen Mailbetreff-/Absenderangaben, Aufgaben und Bereiche lokal im Browser. Sie ist keine Suche in der vollständigen Yahoo-Mailbox. Treffer lassen sich mit Pfeiltasten und Enter öffnen; Escape schließt den Dialog. Freier Text kann ausdrücklich an Jarvis übergeben werden. Ein laufender Chat wird dabei nicht durch eine neue Anfrage ersetzt.

Hell-/Dunkelmodus über das Sonnensymbol. Standard ist Dunkel; die Auswahl wird je Gerät unter jarvis.theme gespeichert und vor dem ersten Seitenaufbau angewendet. Navigation, Eingaben, Mailansicht, Dialoge und Einstellungen verwenden dieselben Oberflächenfarben. Navigationszähler zeigen nur tatsächlich geladene ungelesene Mails, offene Aufgaben beziehungsweise verbleibende geladene Termine an. Gespeicherte Kontozugänge werden von erfolgreichen Mailabrufen unterschieden.

Validierung: bestehende 59 Python-Prüfungen und beide funktionalen UI-Suiten, erweitert um Designwechsel, Suchtreffer für Mails/Aufgaben, Dialogbedienung und zentrale Anliegen. Zusätzlich Browserprüfung mit ausschließlich gekennzeichneten Testdaten für Suche → Mail, Designwechsel, Desktop und 390-/320-Pixel-Layouts. Diese Daten werden nicht mit ausgeliefert. Echte Konten und native Safari-/iPhone-Bedienung bleiben Geräteprüfungen.


## Presence: eigenständige visuelle Startansicht

Die Startansicht unter #assistant verwendet eine eigene, prozedurale Lichtskulptur: toroidale Lichtbahnen um einen Partikelkern, türkisfarbene und warme Akzente, ruhiger Hintergrund und schmale Navigation. Es werden keine Grafiken oder Quelltexte der Videoreferenz übernommen. Übersicht, Mails, Kalender, Aufgaben und Einstellungen bleiben als Bereiche erhalten. Ein expliziter vorhandener Link wie #overview öffnet weiterhin diesen Bereich.

Der Gesprächsverlauf öffnet nach einer Nachricht, Bestätigungen werden weiterhin vor dem Speichern angezeigt. Spracheingabe und Senden befinden sich direkt unter dem Visual; Stimme, Tempo und Bedienung sind aufklappbar, Sprachfehler bleiben neben der Eingabe sichtbar. Die Stopptaste beendet Vorlesen beziehungsweise bricht laufende Chat-Anfragen ab. Mikrofonzugriff startet ausschließlich nach Benutzeraktion.

Canvas 2D stellt eine 3D-Projektion ohne neue Bibliotheken dar. Zustände ready/listening/thinking/speaking verändern Text und Bewegung anhand der bestehenden Benutzeroberfläche; es handelt sich nicht um eine aus Mikrofonsamples errechnete Visualisierung. Framerate ist auf 30 Desktop / 24 bei kleiner Fläche begrenzt, Auflösung auf DPR 1,5. In anderen Ansichten und bei unsichtbarem Tab stoppt die Animationsschleife. Pause ist pro Gerät speicherbar; die Systemeinstellung für reduzierte Bewegung hat Vorrang. Ohne Canvas bleibt ein statischer visueller Fallback erhalten.

Geprüft: HTML-Struktur/eindeutige IDs, bestehende Offline-Backendprüfungen, funktionale UI-Suiten erweitert um neue Startansicht, Statusbeschriftung, Stoppen, Verlauf und gespeicherte Animationspause. Browserprüfung mit gekennzeichneten Testdaten umfasst Desktop, 390-/320-Pixel-Ansichten, sichtbares Canvas-Rendering, Pause, Stimmeinstellungen und Nachricht → Verlauf. Native Safari-/iPhone-Prüfung und M1-Leistungsmessung sind weiterhin Geräteprüfungen.


## Direkte, eindeutig formulierte Kalenderaufträge

„Erstelle mir ein Termin für morgen 15 Uhr beim Zahnarzt“ wird als ausdrücklich gewünschte Kalenderaktion behandelt. Der lokale Parser versteht Uhrzeit mit oder ohne „um“, Minuten und ausdrücklich genannte Dauer/Endzeit. Ohne Dauer werden 15 Minuten verwendet und im Ergebnis genannt. Das Modell wird für diesen Ablauf nicht aufgerufen. Das Datum wird auf dem Mac in Europe/Berlin bestimmt. Mehrdeutige/fehlende Angaben, Verneinungen und Serientermine werden nicht stillschweigend als Einzeltermin gespeichert.

Der authentifizierte Kalenderaktions-Endpunkt verwendet den bereits verbundenen iCloud-CalDAV-Zugang. Nach Samets ausdrücklicher Vorgabe gehen Sprach- und Chat-Aufträge immer in den eindeutig beschreibbaren Kalender „Arbeit“, unabhängig von älteren Standardkalender-Einstellungen. Auch kurze Angaben wie „Termin 15 Uhr morgen mit Samet“ werden ohne zweite Bestätigung gespeichert. Fehlt „Arbeit“ oder gibt es mehrere gleichnamige beschreibbare Kalender, wird nichts in einen anderen Kalender geschrieben. Überschneidungen und unvollständige Konfliktprüfungen werden nach dem Speichern als Hinweis gemeldet, ohne erneute Bestätigung. Eine fehlende Verbindung öffnet die iCloud-Einrichtung. Ein Kalender nur unter „Auf meinem iPhone“ ist kein iCloud-CalDAV-Kalender.

Bei vollständigen, eindeutigen Termindaten wird direkt geschrieben. Erfolg wird erst nach erfolgreicher CalDAV-Antwort gemeldet, mit Datum, Beginn, Ende und Kalender. Die iPhone-Anzeige hängt von der Synchronisierung desselben iCloud-Accounts/Kalenders ab; das wird vom Server hier nicht überprüft. API-Passwörter bleiben im Schlüsselbund. Es werden keine Einladungen verschickt.

Ein lokales Protokoll außerhalb des Repositorys hält bis zu 100 Auftragsnachweise unter ~/Library/Application Support/Jarvis/calendar-actions.json, nur für den Benutzer lesbar. Request-ID und Ereignisfingerabdruck verhindern automatische doppelte Schreibversuche. Ein unklarer Ausgang bleibt unklar und wird zur manuellen Kalenderprüfung gemeldet. Die Stopptaste behauptet während eines laufenden Kalenderauftrags keinen erfolgreichen Abbruch.

Offline-Tests umfassen den exakten Beispielsatz, Zeitzone, Titel, Minuten, Dauer, fehlende Anmeldung, mehrere/benannte/Standardkalender, Konflikte, fehlende Daten, Verneinung/Mehrdeutigkeit, Netzwerkfehler und wiederholte Aufträge. Live-iCloud und iPhone-Synchronisation müssen nach Einrichtung am eigenen Gerät bestätigt werden. Dieses Update legt selbst keinen Termin im echten Nutzerkonto an.
