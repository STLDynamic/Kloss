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

Repozytorium ma gałęzie `main` i `gh-pages`; aplikacja jest statyczna, bez etapu
budowania, z adresem https://stldynamic.github.io/Kloss/. Przy wydaniu sprawdź
aktualne źródło w Settings → Pages i wykonaj aktualizację fast-forward gałęzi
publikacyjnej. Nie zmieniaj źródła Pages ani nie nadpisuj historii gałęzi.

## Kalendarz tygodniowy

Główny widok przedstawia **produkty/palety**, nie numery klocków. Kolumny to
poniedziałek–niedziela według ISO (rok ISO może różnić się od roku daty).
Zmiany liczby palet zapisują się po zatwierdzeniu pola / opuszczeniu go.
Puste pole usuwa plan, `0` zapisuje świadomy brak produkcji. Strzałki przesuwają
widok o sześć tygodni; „Denna vecka” wraca do bieżącego tygodnia.

Zapotrzebowanie rozkłada się równomiernie na dni tygodnia. Każdego dnia produkty
korzystają ze wspólnego magazynu w kolejności numeru/nazwy, z porównaniem
numerycznym (Artikel 2 przed Artikel 5). Kolejność jest taka sama jak wiersze
kalendarza. Dostawy są dostępne od początku swojego dnia; przeterminowane,
nieprzyjęte dostawy są pomijane. Każde zapotrzebowanie rezerwuje materiał,
także gdy tworzy niedobór. Późniejsza dostawa spłaca ten niedobór, ale nie
zwiększa pokrycia produkcji, której termin już minął. Pokrycie sumuje możliwą
produkcję w poszczególnych dniach, ograniczoną każdym składnikiem receptury;
liczba pełnych palet jest zaokrąglana w dół. To szacunek planistyczny, nie zapis
wykonanej produkcji. Dla trwającego tygodnia oceniany jest **pozostały** popyt od
dzisiaj; minione tygodnie pokazują zapisany plan bez deklarowania historycznego
pokrycia. Bieżący stan wynika z ostatniej inwentaryzacji i rzeczywistych operacji.

Plan tygodniowy choćby jednego produktu zastępuje plan miesięczny/szacunkowy
**dla używanych przez niego klocków przez cały tydzień**, również gdy ma wartość
0. Wypełnij wszystkie produkty, które mają korzystać z tych klocków: puste
produkty nie są automatycznie dopisywane. Na dniach bez planu tygodniowego
obowiązuje starszy plan miesięczny (proporcjonalna część miesiąca) lub średnia.
Miesięczne kwoty pozostają niezmienione i dostępne w starszych widokach; nie
są dodawane do tygodniowego zapotrzebowania. Rzeczywiste zużycie w danym okresie
zastępuje szacunki; pozostałe zapotrzebowanie tygodnia rozkłada się na dni bez
zapisanego zużycia. Operacje przed ostatnią inwentaryzacją nie są odejmowane
ponownie. Kalendarz i prognoza zakupów używają tego samego zapotrzebowania.

Format danych Kloss v1 został rozszerzony o opcjonalne `weeklyPlans` produktu
(np. `{"2026-W42": 2000}`). Starsze dane i kopie bez tego pola działają bez
migracji; eksport zawiera oba rodzaje planów wraz z całym magazynem i historią.
Nowych kopii nie należy edytować w starszej wersji aplikacji, która nie zna
planów tygodniowych. Receptury dotyczą aktualnej wersji produktu — ich zmiana
przelicza również zapisane plany tygodniowe, zachowując ich liczby.

`npm test` obejmuje obliczenia miesięczne i tygodniowe, wspólny zapas, daty
dostaw, inwentaryzacje, granice lat ISO oraz zgodność kopii. `npm run test:browser`
sprawdza oba interfejsy, zapis, import/eksport i telefon z nieruchomą kolumną.

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
