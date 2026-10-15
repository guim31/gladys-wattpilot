# Fronius Wattpilot

Verfolge und steuere deine **Fronius Wattpilot** Wallbox (Wattpilot Home und
Go, 11 und 22 kW; Wattpilot Flex im Test) aus Gladys, **in deinem lokalen
Netzwerk**: Gladys spricht mit dem WebSocket der Ladestation, so wie die
Fronius Solar.wattpilot App zu Hause. Keine Cloud, kein Fronius-Konto.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Diese Integration
> wurde nach dem Protokoll geschrieben, wie es andere Open-Source-Projekte
> dokumentieren und umsetzen (die `wattpilot`-Bibliothek von joscha82, die Home
> Assistant Integration von mk-maddin), und gegen eine simulierte Ladestation
> getestet, ohne einen Wattpilot zur Hand. Wenn etwas falsch aussieht, eröffne
> ein Issue im GitHub-Repository mit den Protokollen der Integration.

Diese Integration steht in keiner Verbindung zur Fronius International GmbH.

## Voraussetzungen

- Ein Fronius Wattpilot (Home oder Go, 11 oder 22 kW), mit deinem WLAN
  verbunden. Der Wattpilot Flex wird theoretisch unterstützt (seine
  Passwortprüfung ist anders), ist aber ungetestet.
- Das **Passwort der Ladestation**: das, das du bei der Einrichtung in der
  Solar.wattpilot App gewählt hast (die App fragt es zum Verbinden ab).
- Eine **feste IP-Adresse** für die Ladestation, in deinem Router eingestellt
  (DHCP-Reservierung): Die Integration erreicht sie über ihre Adresse.
- Gladys und die Ladestation im selben Netzwerk (Port 80 der Ladestation von
  Gladys aus erreichbar).
- Gladys 5.2.0 oder neuer.

## Konfiguration

1. Installiere die Integration über **Integrationen → Von GitHub installieren**
   (oder den Store) und öffne den Reiter **Konfiguration**.
2. **IP-Adresse der Ladestation**: zum Beispiel `192.0.2.10`.
3. **Passwort der Ladestation**: das Passwort der Solar.wattpilot App. Es
   bleibt in Gladys (geheimes Feld) und geht nur als Hash an die Ladestation.
4. **Aktualisierungsintervall**: wie oft die Messwerte (Leistung, Strom,
   Energie) an Gladys gehen, standardmäßig 15 Sekunden.
5. **Sprache der Funktionsnamen**: Namen der Funktionen neuer Geräte und
   Sprache der Fehlertexte (standardmäßig Französisch).
6. Speichere: Die Ladestation erscheint im Reiter **Erkennung**. Füge sie
   hinzu.
7. Die Schaltfläche **Verbindung testen** sagt, ob die Ladestation verbunden
   ist (Name, Seriennummer, Firmware) oder warum nicht.

## Aktualisierung und Netzwerknutzung

Die Integration hält **eine WebSocket-Verbindung** zur Ladestation offen, die
ihre Änderungen von selbst sendet: Nichts wird abgefragt. Die Ladestation
sendet ihre Messwerte beim Laden mehrmals pro Sekunde; die Integration gibt
sie im gewählten Intervall an Gladys weiter, und **sofort**, wenn sich etwas
ändert, worauf du einwirkst (Autozustand, Modus, Strom, Erzwingen, Fehler).
Nur geänderte Werte werden gesendet, dazu alle 6 Stunden alle Werte, damit ein
stabiler Wert nie „Kein aktueller Wert“ zeigt. Gladys fragt das Gerät
zusätzlich als Rückfallebene ab; die Integration überspringt dann ein Senden,
das sie gerade erledigt hat.

Bricht die Verbindung ab, verbindet die Integration nach 5 s, 10 s, 30 s und
dann jede Minute neu. Ein abgelehntes Passwort wird nur alle 10 Minuten erneut
versucht. Eine Ladestation, die eine Minute lang schweigt, bekommt einen Ping,
und die Verbindung wird neu aufgebaut, wenn sie nicht antwortet.

## Das Gerät Ladestation

| Funktion               | Was sie zeigt                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Anschluss              | Verfügbar (kein Auto), Belegt (Auto angesteckt), Nicht verfügbar (offline), Fehler                                        |
| Ladezustand            | Lädt, Fahrzeug verbunden (wartet), Angehalten (Fahrzeug): Laden beendet, Angehalten (Ladestation): nicht erlaubt, Inaktiv |
| Auto angesteckt        | 1, wenn ein Auto angesteckt ist                                                                                           |
| Ladeleistung           | Gesamtleistung, W                                                                                                         |
| Leistung L1, L2, L3    | Leistung pro Phase, W                                                                                                     |
| Stromstärke L1, L2, L3 | Strom pro Phase, A                                                                                                        |
| Energie der Sitzung    | Energie seit dem Anstecken des Autos, kWh                                                                                 |
| Gesamtenergie          | Der Zähler der Ladestation, kWh: Die Energieüberwachung von Gladys berechnet daraus Verbrauch und Kosten                  |
| Ladestrom              | **Befehl**: der dem Auto angebotene Strom, von 6 A bis 16 A (11 kW) oder 32 A (22 kW)                                     |
| Lademodus              | **Befehl**: Standard, Eco, Next Trip — die Modi der Solar.wattpilot App                                                   |
| Laden erzwingen        | **Befehl**: Nach Modus, Erzwungenes Laden, Erzwungener Stopp                                                              |
| Temperatur             | Der heißeste Sensor der Ladestation, °C                                                                                   |
| Fehler                 | Der Fehler des Wattpilot in Worten („Keiner“, wenn alles gut ist)                                                         |
| Online                 | 1, solange die Ladestation verbunden ist                                                                                  |

Der **Lademodus** wechselt nur zwischen den Modi; ihre Einstellungen
(Solarüberschuss und Preisgrenze von Eco, Abfahrtszeit und Energie von Next
Trip) bleiben in der Solar.wattpilot App und in Solar.web: Diese Integration
dupliziert das Solarladen nicht. **Erzwungenes Laden** lädt, egal was der
Modus entscheidet; **Nach Modus** gibt ihm die Entscheidung zurück.

Der Strom kann nicht über der in der App eingestellten Grenze („maximaler
Strom“) liegen: Die Integration lehnt ihn mit einer Meldung ab, statt ihn zu
senden.

## Widget

Füge das Widget **Fronius Wattpilot** einem Dashboard hinzu und wähle die
Ladestation. Es zeigt die Leistung live, die Energie der Sitzung und den
Ladestrom, den Zustand (Bereit, Lädt, Wartet, Laden beendet, Fehler), den
Modus, ein aktives Erzwingen und gegebenenfalls den Fehler. Vier Tasten:
**Laden** (erzwungenes Laden), **Stoppen** (erzwungener Stopp), **Auto** (nach
Modus) und **Einstellungen…**, das ein Formular für Strom und Lademodus öffnet.
Das aktive Erzwingen trägt ein Häkchen-Symbol.

## Szenen-Auslöser

**Wattpilot Laden beendet**: Das Auto zieht nach dem Laden keinen Strom mehr
(es ist voll oder hat das im Auto oder in der App eingestellte Limit
erreicht). Wähle optional die Ladestation. Die folgenden Aktionen können
`energy_kwh` (Energie der Sitzung) und `charger` (ihren Namen) verwenden. Er
löst einmal pro Ladevorgang aus, nie beim Start.

„Auto angesteckt“ braucht keinen Auslöser: Verwende die Funktion **Auto
angesteckt** (wechselt auf 1) in einem Auslöser „Gerätewert“.

## Szenen-Aktionen

- **Wattpilot Lademodus einstellen**: Standard, Eco oder Next Trip.
- **Wattpilot Laden erzwingen oder stoppen**: erzwungenes Laden, erzwungener
  Stopp oder nach Modus.

Der Ladestrom braucht keine eigene Aktion: Er ist eine Funktion und wird mit
der üblichen Aktion „Gerät steuern“ von Gladys eingestellt.

## Szenen-Beispiele

- **Tagsüber Sonne, nachts voll**: um 8:00 „Wattpilot Lademodus einstellen“
  auf Eco; um 22:00 auf Standard.
- **Sag mir, wenn das Auto voll ist**: Auslöser „Wattpilot Laden beendet“,
  dann eine Nachricht „Laden beendet: {{triggerEvent.data.energy_kwh}} kWh“.
- **Die Hauptsicherung schützen**: Wenn die Leistung des Hauses einen
  Schwellwert überschreitet, den Ladestrom auf 6 A stellen; wenn sie sinkt,
  zurück auf 16 A.
- **Morgen früh los**: über eine Taste im Dashboard „Wattpilot Laden erzwingen
  oder stoppen“ auf Erzwungenes Laden; um 7:00 zurück auf Nach Modus.

## Fehlerbehebung

- **„Keine Antwort“**: Prüfe die Adresse, ob die Ladestation im WLAN ist und
  ob Gladys und die Ladestation im selben Netzwerk sind.
- **„Es antwortet etwas, aber kein Wattpilot“**: Die Adresse gehört einem
  anderen Gerät (Router, Wechselrichter…).
- **„Die Ladestation lehnt das Passwort ab“**: Gib das Passwort der
  Solar.wattpilot App erneut ein (auf Groß- und Kleinschreibung achten). Nach
  einer Ablehnung versucht es die Integration nur alle 10 Minuten erneut:
  Drücke **Verbindung testen**, um es sofort zu versuchen.
- **„Verbunden, aber die Ladestation hat ihren Status nicht rechtzeitig
  gesendet“**: Starte die Ladestation neu und drücke dann **Verbindung
  testen**.
- **Ein Befehl scheitert mit „Die Ladestation hat die Anfrage abgelehnt“**:
  Der Wert liegt außerhalb dessen, was die Ladestation gerade annimmt.
- Die Protokolle der Integration sagen den Rest: Setze `LOG_LEVEL=debug` für
  die Details jeder Änderung.

## Grenzen

- Eine Ladestation pro Gladys. Zwei Wattpilots: Eröffne ein Issue.
- Die Funktionsnamen und der maximale Strom werden beim Hinzufügen des Geräts
  festgelegt (eine Regel von Gladys): Um die Sprache zu ändern, lösche das
  Gerät und füge es erneut hinzu.
- Kein Zugriff auf RFID-Karten, Zeitpläne, Solar- und Preiseinstellungen,
  Phasenumschaltung oder Kabelverriegelung: Das alles bleibt in der
  Solar.wattpilot App. Die Kabelverriegelung wird absichtlich nicht
  angeboten.
- Gladys hält eine Verbindung zur Ladestation offen, neben der App und
  vielleicht einer anderen Hausautomations-Box. Wie viele Verbindungen
  gleichzeitig angenommen werden, ist nicht dokumentiert: Wenn sich die App
  nicht mehr verbinden kann, während Gladys verbunden ist, melde es in einem
  Issue.
- Wattpilot Flex: Seine Passwortprüfung (bcrypt) folgt der Home Assistant
  Integration, ohne Test an einem echten Flex.
- Nur gegen eine simulierte Ladestation und veröffentlichte
  Protokollbeschreibungen getestet (siehe Hinweis oben).
