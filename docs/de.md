# Grocy

Bring [Grocy](https://grocy.info), das selbst gehostete „ERP für deinen
Kühlschrank“, über dein lokales Netzwerk in Gladys: was zuerst gegessen werden
muss, die Hausarbeiten des Tages, den Einkaufszettel und die zu ladenden
Batterien, auf dem Dashboard und in deinen Szenen. Ein Taster, eine Anwesenheit
oder der Saugroboter können Grocy dann mitteilen, was passiert ist: ein Produkt
verbraucht, ein Artikel zu kaufen, eine Hausarbeit erledigt, eine Batterie
geladen.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Diese
> Integration wurde gegen die von Grocy dokumentierten Antworten (seine
> OpenAPI-Spezifikation) und gegen echte, von der Bibliothek pygrocy
> aufgezeichnete Antworten eines Grocy gebaut und getestet, nicht gegen ein
> laufendes Grocy. Wenn etwas nicht wie beschrieben funktioniert, melde es im
> [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-grocy/issues).

## Was du brauchst

- Gladys Assistant 5.2.0 oder neuer.
- **Grocy** 3.3 oder neuer (Grocy 4 empfohlen), von Gladys aus erreichbar: auf
  einem NAS, einem Raspberry Pi, unter Docker, Unraid, Proxmox oder als
  Home-Assistant-Add-on, wenn sein Port veröffentlicht ist.
- Einen **API-Schlüssel** von Grocy. Öffne Grocy, klicke auf deinen
  Benutzernamen (oben rechts) → **API-Schlüssel verwalten** → **Hinzufügen**
  und kopiere den Schlüssel. Die Integration handelt als der Benutzer, dem der
  Schlüssel gehört: Hausarbeiten, die sie als erledigt markiert, hat dieser
  Benutzer erledigt.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Adresse von Grocy** ein, mit der du Grocy
   öffnest, zum Beispiel `http://192.168.1.10:9283`. Läuft Grocy in einem
   Unterverzeichnis (`https://nas.example.com/grocy`), behalte es bei. Füge den
   **API-Schlüssel** ein.
3. HTTPS mit eigenem Zertifikat (NAS, Reverse-Proxy)? Aktiviere
   **Selbstsignierte Zertifikate akzeptieren**.
4. Passe bei Bedarf **Bald fällig: innerhalb von (Tagen)** (5 wie in Grocy),
   die **Nummer des Einkaufszettels** (1 ist der Standard-Einkaufszettel von
   Grocy), das **Aktualisierungsintervall** und die **Sprache der
   Funktionsnamen** an.
5. Speichere und klicke auf **Verbindung testen**: Die Meldung unter der Taste
   nennt die Version von Grocy und was fällig ist.
6. Öffne den Reiter **Entdecken**: Dort steht das Gerät **Grocy**. Klicke auf
   **Hinzufügen**.

## Das Grocy-Gerät

Ein Gerät für dein Grocy, mit Zählern (Zahlen mit Verlauf), jeder entspricht
dem, was Grocy rot oder orange anzeigt:

| Funktion                       | Was gezählt wird                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Bald fällige Produkte          | Produkte, deren Datum im Fenster „bald fällig“ liegt, heute eingeschlossen       |
| Überfällige Produkte           | Produkte nach ihrem Mindesthaltbarkeitsdatum (MHD: oft noch gut)                 |
| Abgelaufene Produkte           | Produkte nach ihrem Verbrauchsdatum (zu verbrauchen bis: wegwerfen)              |
| Produkte unter Mindestbestand  | Produkte unter dem in Grocy festgelegten Mindestbestand                          |
| Artikel auf dem Einkaufszettel | Noch nicht gekaufte Artikel des gewählten Einkaufszettels                        |
| Hausarbeiten heute fällig      | Hausarbeiten, die später am Tag geplant sind                                     |
| Überfällige Hausarbeiten       | Hausarbeiten, deren geplanter Zeitpunkt verstrichen ist                          |
| Zu ladende Batterien           | Batterien, die heute zu laden oder schon überfällig sind (nur mit Ladeintervall) |
| Aufgaben heute fällig          | Offene Aufgaben, die heute fällig sind                                           |
| Überfällige Aufgaben           | Offene Aufgaben, deren Fälligkeitsdatum verstrichen ist                          |

Die Funktionsnamen werden beim Hinzufügen des Geräts festgelegt, in der Sprache
der Konfiguration. Nutze sie in Szenen mit dem üblichen Gladys-Auslöser „ein
Gerätewert ändert sich“ (zum Beispiel _Überfällige Hausarbeiten_ größer als 0
um 20 Uhr).

## Dashboard-Widgets

Füge sie im Dashboard-Editor unter der Integration hinzu:

- **Zuerst verbrauchen**: die abgelaufenen Produkte, dann die über dem MHD,
  dann die bald fälligen, mit Menge und Datum.
- **Heute zu tun**: überfällige und heutige Hausarbeiten und Aufgaben sowie die
  zu ladenden Batterien, die überfälligen zuerst. Die ersten vier haben eine
  Taste mit ihrem Namen: Ein Tippen markiert in Grocy die Hausarbeit als
  erledigt, die Aufgabe als abgeschlossen oder die Batterie als geladen.
- **Einkaufszettel**: die zu kaufenden Artikel und zwei Tasten. **Fehlendes
  hinzufügen** setzt die Produkte unter Mindestbestand auf die Liste.
  **Hinzufügen…** öffnet ein kleines Formular: ein Produkt oder beliebiger Text
  und eine Menge.

## Szenen

### Auslöser

- **Ein Produkt läuft bald ab**: einmal pro Produkt und Datum, wenn das Produkt
  bald fällig wird, und noch einmal, wenn sein Datum vorbei ist. Filter: der
  genaue Name des Produkts in Grocy (leer: alle) und wann (_Bald fällig_,
  _Mindesthaltbarkeitsdatum überschritten_, _Abgelaufen
  (Verbrauchsdatum überschritten)_). An die Szene übergebene Informationen:
  Produkt, Datum, verbleibende Tage (negativ, wenn vorbei), Menge auf Lager.
- **Eine Hausarbeit ist überfällig**: wenn der geplante Zeitpunkt einer
  Hausarbeit verstreicht, ohne dass sie erledigt ist. Filter: der genaue Name
  der Hausarbeit in Grocy und der Grocy-Benutzer, dem sie zugewiesen ist (leer:
  alle). An die Szene übergebene Informationen: Hausarbeit, zugewiesen an,
  geplanter Zeitpunkt.

Was beim allerersten Start der Integration schon fällig ist, gilt als bekannt:
Nur was danach fällig wird, löst die Szenen aus. Was gemeldet wurde, bleibt in
den Daten der Integration gespeichert: Ein Neustart meldet es nicht noch einmal.

### Aktionen

- **Grocy-Produkt verbrauchen**: nimmt eine Menge aus dem Bestand. Das Produkt
  wird über seinen Namen gefunden (Groß- und Kleinschreibung und Akzente
  egal; ein Teil des Namens reicht, wenn nur ein Produkt ihn enthält) oder über
  seinen Barcode. Aktiviere _Weggeworfen (verdorben)_, um es als verschwendet
  zu erfassen. Gibt das Produkt, die verbrauchte Menge und die Restmenge auf
  Lager zurück.
- **Zum Grocy-Einkaufszettel hinzufügen**: das Produkt mit genau diesem Namen,
  sonst eine Freitextzeile (nie ein anderes Produkt). Optionale Notiz. Gibt den
  Artikel zurück, ob es ein bekanntes Produkt ist, und die Anzahl der Artikel
  auf der Liste.
- **Grocy-Hausarbeit als erledigt markieren**: erfasst jetzt eine Ausführung
  der Hausarbeit. Gibt die Hausarbeit und ihren nächsten geplanten Zeitpunkt
  zurück.
- **Grocy-Batterie als geladen markieren**: erfasst jetzt einen Ladezyklus.
  Gibt die Batterie und ihre nächste Ladung zurück.

Jede Aktion lässt sich in Grocy selbst rückgängig machen (Bestandsjournal,
Journale der Hausarbeiten und Batterien, Einkaufszettel). Es wird nie etwas
gelöscht.

### Szenen-Ideen

- Der Saugroboter fährt in seine Station zurück → **Grocy-Hausarbeit als
  erledigt markieren** „Wohnzimmer saugen“.
- **Ein Produkt läuft bald ab**, bei _Abgelaufen (Verbrauchsdatum
  überschritten)_ → „Wirf {{product}} weg“ an die Familie senden.
- Jeden Abend um 20 Uhr, wenn _Überfällige Hausarbeiten_ größer als 0 ist →
  eine Nachricht, und die Liste _Heute zu tun_ auf dem Tablet in der Küche.
- Ein Taster am Kühlschrank → **Zum Grocy-Einkaufszettel hinzufügen** „Milch“.

## Wie oft Grocy gelesen wird

Bei jeder Aktualisierung (standardmäßig jede Minute) stellt die Integration
Grocy nur eine kleine Frage: Hat sich die Datenbank geändert? Alles wird nur
dann neu gelesen, beim Tageswechsel und alle 15 Minuten; dazwischen wird das
Fällige aus dem letzten Auslesen und der Uhr von Grocy neu berechnet. Ein
Befehl (Aktion, Taste) liest Grocy direkt danach. Grocy setzt kein
Anfragekontingent; die Last für ein NAS bleibt vernachlässigbar. Die Zähler
werden nur bei Änderungen an Gladys gesendet, sonst alle 6 Stunden einmal.

## Fehlerbehebung

- **„API-Schlüssel abgelehnt“**: Der Schlüssel wurde gelöscht oder falsch
  abgeschrieben. Erstelle einen neuen in Grocy (**API-Schlüssel verwalten**)
  und füge ihn erneut ein.
- **„Grocy antwortet nicht“**: Prüfe Adresse und Port in einem Browser im
  selben Netzwerk wie Gladys. Unter Docker ist `localhost` der Container der
  Integration, nicht dein Server: Verwende die IP-Adresse des Servers.
- **„Keine Grocy-API unter dieser Adresse“**: Die Adresse öffnet etwas anderes
  als Grocy (eine NAS-Seite, einen Reverse-Proxy), oder das Unterverzeichnis
  von Grocy fehlt.
- **„Zertifikat abgelehnt“**: Aktiviere **Selbstsignierte Zertifikate
  akzeptieren**.
- **„Die Adresse leitet um“**: Gib direkt die `https://`-Adresse ein.
- **Ein Name wird nicht gefunden** in einer Aktion: Tippe den Namen so, wie
  Grocy ihn anzeigt, oder einen eindeutigen Teil davon; für Produkte geht auch
  ein Barcode.
- **Der Tag wechselt zur falschen Zeit**: Die Integration folgt der Uhr von
  Grocy (`/api/system/time`). Prüfe die Zeitzone des Servers, auf dem Grocy
  läuft.
- Ausführliche Protokolle: Setze die Variable `LOG_LEVEL` des Containers auf
  `debug`. Der API-Schlüssel erscheint nie in den Protokollen.

## Grenzen

- Ohne laufendes Grocy entwickelt: gebaut auf der Spezifikation von Grocy und
  auf aufgezeichneten Antworten eines echten Grocy.
- Ein Grocy pro Gladys. Ein Einkaufszettel (in der Konfiguration gewählt).
- Die Namen von Produkten und Hausarbeiten werden in den Szenen getippt:
  Gladys kann sie nicht in einem Menü anbieten.
- Die Widget-Tasten und die Zähler handeln für den Benutzer, dem der
  API-Schlüssel gehört.
- Mengen in Aktionen sind ganze Zahlen, in der Bestandseinheit des Produkts.
- Rezepte, Essenspläne und Ausstattung werden nicht unterstützt.

Grocy ist eine Marke seiner Autoren. Diese Integration ist nicht mit dem
Grocy-Projekt verbunden.
