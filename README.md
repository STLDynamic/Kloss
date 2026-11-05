# Kloss — plastikowe klocki do produkcji palet

Samodzielna aplikacja ze szwedzkim interfejsem. Układ i algorytmy datowanych
stanów, planów i dostaw dostosowano z STLDynamic/Spik-R-knare. Repozytorium
źródłowe nie jest modyfikowane. Wszystkie ilości magazynowe są w sztukach.

## Uruchamianie i testy

Node.js 22 lub nowszy. Aplikacja nie ma zależności produkcyjnych ani etapu budowania.

```
npm start
npm test
```

Serwer: port 3000 (zmienna PORT pozwala go zmienić). Testy przeglądarkowe:
`npm ci`, uruchom serwer w drugim terminalu, następnie `npm run test:browser`.
Test używa Chromium z `/usr/bin/chromium`; własną ścieżkę ustaw przez CHROMIUM_PATH.
Testy korzystają z osobnego, tymczasowego profilu i nie dotykają danych użytkownika.

## GitHub Pages

Po wysłaniu plików do repozytorium Kloss wybierz Settings → Pages → Deploy from
branch, gałąź z kodem, katalog `/ (root)`. Pliki są statyczne i używają względnych
ścieżek. Publikacja nie została wykonana podczas tworzenia wersji lokalnej.

## Dane i obsługa

- Plastklossar: numer artykułu, nazwa, wymiary, dostawca, grupa, opakowanie,
  stan początkowy z datą, średnie zużycie i parametry zamawiania.
- Lager & historik: inwentaryzacje na **początek dnia**, zużycie za okres
  obejmujący obie daty, przyjęcia oraz dodatnie/ujemne korekty. Najnowsza
  inwentaryzacja zastępuje poprzedni punkt odniesienia. Przy tej samej dacie
  wygrywa ostatnio zapisana. Operacje z tego dnia następują po inwentaryzacji.
- Zużycie rozkłada się równomiernie na zapisany okres. Część przed ostatnią
  inwentaryzacją nie jest odejmowana ponownie. Nakładające się okresy są blokowane.
  Ångra zachowuje anulowany wpis i przywraca plan dostawy, jeżeli cofnięto jej przyjęcie.
- Produkter / Produktionsplan: dowolna lista klocków w recepturze, następnie
  miesięczna liczba produktów. 2000 × 9 = 18 000 sztuk. Usunięcie używanego
  klocka jest blokowane. Zmiana receptury przelicza wszystkie miesiące; dla
  innej wersji receptury utwórz osobny produkt.
- Plan förbrukning: produkcja zastępuje ręczny plan, zachowując go jako rezerwę;
  bez obu planów obowiązuje średnia. Puste pole to brak planu, zero to świadomy
  brak produkcji. Niepełny plan jest oznaczany liczbą zaplanowanych produktów.
- Rzeczywiste zużycie zastępuje szacunek. Pozostały plan miesiąca rozkłada się
  na dni bez zapisów. Po przekroczeniu planu pojawia się ostrzeżenie i używana
  jest średnia. Prognozy mogą zawierać ułamki sztuki z równomiernego podziału;
  zapisane operacje oraz opakowania wymagają całych sztuk.
- Zakupy uwzględniają czas dostawy, bufor i dodatkowy okres. Ilość zaokrągla
  się do opakowań. Późna dostawa nie usuwa wcześniejszego braku; propozycja może
  wynosić zero, gdy trzeba przyspieszyć już zaplanowaną dostawę.

Dane zapisują się wyłącznie w localStorage pod `kloss.inventory.v1`, a termin
kopii pod `kloss.backupAt`. Spik nie jest odczytywany ani migrowany. Kopia JSON
z oznaczeniem `app: kloss` zawiera magazyn, historię, dostawy, receptury i plany.
Import zastępuje całość po potwierdzeniu i walidacji. Przypomnienie o kopii
pojawia się co 7 dni. Eksport wymaga zapisania lub odrzucenia edytowanych planów.

Nie ma kont, synchronizacji ani wspólnej bazy. Dane przeglądarki nie są kopią
zapasową. Wersja USB/offline pozostaje poza zakresem tej wersji.
