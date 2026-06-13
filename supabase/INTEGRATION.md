# Integracja publicznej szybkiej wyceny z cennikiem EL-Net

## Przegląd
Publiczna szybka wycena (`szybka-wycena.html`) teraz pobiera ceny usług bezpośrednio z tabeli `uslugi` w bazie Supabase zamiast używać sztywnych cen.

## Struktura bazy danych

### Tabela: `uslugi`
Pola używane przez publiczną szybką wycenę:
- `id` — UUID, klucz główny
- `nazwa` — TEXT, nazwa usługi (np. "Malowanie sufitów")
- `cena` — NUMERIC, cena jednostkowa usługi
- `cena_netto` — NUMERIC, cena netto (opcjonalnie)
- `jednostka` — TEXT (domyślnie "szt.")
- **`widoczna_publicznie`** — BOOLEAN DEFAULT true, nowe pole (kontrola widoczności w publicznej wycenie)

## Instalacja

### 1. Uruchom SQL w Supabase
Wykonaj plik SQL w SQL Editor Supabase:
```bash
supabase/public-services-policy.sql
```

**Co robi SQL:**
- Dodaje kolumnę `widoczna_publicznie boolean default true` do tabeli `uslugi` (jeśli jej nie ma)
- Włącza Row Level Security (RLS) na tabeli `uslugi`
- Dodaje politykę `SELECT` dla roli `anon` (pobieranie tylko usług z `widoczna_publicznie = true`)
- Dodaje politykę `SELECT` dla roli `authenticated` (pracownicy widzą wszystkie usługi)
- Blokuje `INSERT/UPDATE/DELETE` dla `anon` (bez możliwości zapisu)

### 2. Zaktualizuj usługi w panelu
1. Otwórz panel: `http://localhost:XXXX/panel/`
2. Zaloguj się
3. Przejdź do sekcji "Usługi"
4. Dodaj/edytuj usługi które mają być widoczne w publicznej wycenie
5. Pole `widoczna_publicznie` będzie domyślnie `true` dla nowych usług

## Pliki zmienione

### `public.js`
- Dodane stałe: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Dodane: `fallbackUslugi` — sztywne ceny dla fallback
- Nowa funkcja: `pobierzUslugiZBazy()` — pobiera usługi z Supabase REST API
- Nowa funkcja: `getCenaUslugi(nazwa)` — pobiera cenę z bazy lub fallback
- Zmodyfikowana: `estimateQuote()` — używa `getCenaUslugi()` zamiast sztywnych cen
- Zmodyfikowane: `DOMContentLoaded` event — pobiera cennik na starcie, pokazuje status

### `szybka-wycena.html`
- Dodano element `<p id="cennik-status">` w header sekcji
- Status wyświetla:
  - `Cennik: aktualny` — jeśli usługi pobrano z bazy
  - `Cennik: tryb orientacyjny` — jeśli używa fallback

### `styles.css`
- Dodany `.quote-message-warning` — styl dla komunikatu ostrzeżenia
- Dodany `.cennik-status` — styl dla statusu cennika
- Dodany `.cennik-status-live` — zielony (cennik z bazy)
- Dodany `.cennik-status-fallback` — pomarańczowy (fallback)

### `supabase/public-services-policy.sql`
- Nowy plik — SQL do tworzenia polityki RLS i kolumny `widoczna_publicznie`

## Bezpieczeństwo

### Publiczny klucz (anon/publishable)
- `SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy"`
- Jest to publiczny klucz — bezpieczny do użycia w frontendu
- Już widnieje w `panel/script.js`, teraz też w `public.js`

### RLS Policy
```sql
CREATE POLICY "Anon read public services" ON uslugi
FOR SELECT TO anon
USING (widoczna_publicznie = true);
```
- `anon` może TYLKO czytać (`SELECT`) usługi
- Tylko usługi z `widoczna_publicznie = true` są widoczne
- Brak dostępu do `INSERT/UPDATE/DELETE`
- Brak dostępu do kosztorysów, inwestycji, klientów, logów itp.

### Dane bezpieczne
Panel (`panel/`) pozostaje NIEZMIENIONY:
- ✅ Pobieranie usług dla panelu — bez zmian
- ✅ Wyświetlanie kosztorysów — bez zmian
- ✅ Zarządzanie inwestycjami — bez zmian
- ✅ Terminy, magazyn, administratorzy — bez zmian
- ✅ Service role (jeśli używany) — bez zmian

## Działanie aplikacji

### Publiczna szybka wycena
1. Użytkownik otwiera `szybka-wycena.html`
2. JavaScript (`public.js`) na `DOMContentLoaded`:
   - Pobiera usługi z Supabase: `GET /rest/v1/uslugi?select=id,nazwa,cena,jednostka&widoczna_publicznie=eq.true`
   - Wyświetla status cennika:
     - ✅ Zielony `Cennik: aktualny` — jeśli pobranie OK
     - ⚠️ Pomarańczowy `Cennik: tryb orientacyjny` — jeśli pobranie się nie uda
   - Pokazuje komunikat: `Cennik online chwilowo niedostępny. Pokazano orientacyjne ceny przykładowe.`
3. Użytkownik wpisuje opis prac i metraż
4. Klikuje `Generuj orientacyjną wycenę`
5. Aplikacja używa cen z bazy (jeśli dostępne) lub fallback
6. Wyświetla tabelę z pozycjami kosztorysowania

### Fallback (brak dostępu do bazy)
Jeśli pobieranie usług z Supabase się nie uda:
- Aplikacja automatycznie używa `fallbackUslugi` (sztywne ceny)
- Wyświetla komunikat ostrzeżenia
- Wycena nadal działa, ale z przykładowymi cenami

## Testowanie

### 1. Test publicznej szybkiej wyceny (online)
```
1. Otwórz: http://localhost:XXXX/szybka-wycena.html
2. Obserwuj status cennika w header
3. Wpisz: "Chciałbym pomalować mieszkanie 50 m², ściany i sufity"
4. Klikni: "Generuj orientacyjną wycenę"
5. Oczekiwane: Wycena wyświetla ceny z bazy (jeśli live) lub fallback (jeśli offline)
```

### 2. Test fallback (offline)
```
1. Otwórz DevTools → Network
2. Otwórz: http://localhost:XXXX/szybka-wycena.html
3. Wyłącz Internet lub blokuj żądania do Supabase
4. Obserwuj status: "Cennik: tryb orientacyjny"
5. Sprawdź: Wycena używa fallback cen
6. Komunikat: "Cennik online chwilowo niedostępny..."
```

### 3. Test visibilityy w panelu
```
1. Otwórz: http://localhost:XXXX/panel/
2. Zaloguj się
3. Przejdź do "Usługi"
4. Dodaj nową usługę:
   - Nazwa: "Test Usługa"
   - Jednostka: "szt."
   - Cena: "100"
5. Zapisz (pole `widoczna_publicznie` będzie domyślnie `true`)
6. Otwórz: http://localhost:XXXX/szybka-wycena.html
7. Upewnij się, że nowa usługa jest dostępna w ceniku
```

### 4. Test ukrywania usługi
```
1. W panelu edytuj usługę
2. Zmień `widoczna_publicznie` na `false` (w SQL lub bezpośrednio w Supabase)
3. Otwórz ponownie szybka-wycena.html
4. Usługa już nie powinna być dostępna w wycenie
```

## Komunikaty użytkownika

### Zielony status (live)
```
Cennik: aktualny
```
Ceny pobrane z bazy EL-Net.

### Pomarańczowy status (fallback)
```
Cennik: tryb orientacyjny
```
Oraz komunikat:
```
Cennik online chwilowo niedostępny. Pokazano orientacyjne ceny przykładowe.
```

## Integracja z systemem istniejącym

### Panel (`panel/`)
- ✅ Bez zmian
- Nadal używa pełnej tabeli `uslugi`
- Pracownicy widzą wszystkie usługi (z RLS dla authenticated)
- Mogą edytować `widoczna_publicznie` aby kontrolować co wyświetla się w publicznej wycenie

### Szybka wycena (`szybka-wycena.html`)
- ✅ Zmieniona — teraz pobiera z bazy
- Widzi TYLKO usługi z `widoczna_publicznie = true`
- Automatyczny fallback jeśli pobranie się nie uda
- Informuje użytkownika o stanie cennika

### Service role
- Jeśli używasz `service_role` w panelu — bez zmian
- Publiczna strona używa `anon` — bezpieczny dla frontend
- Brak konfliktów

## Przyszłe ulepszenia (opcjonalnie)

1. **Caching cennika** — localStorage aby zmniejszyć ilość zapytań
2. **Kategorie usług** — jeśli dodasz kolumnę `kategoria` w tabeli `uslugi`
3. **Ceny geograficzne** — jeśli dodasz kolumnę `lokalizacja` 
4. **Promotions** — jeśli dodasz kolumnę `rabat` lub `promocja`
5. **Wersjonowanie cen** — historyczne ceny dla audytu

## Wsparcie

Jeśli coś się nie ładuje:
1. Sprawdź DevTools → Console — szukaj błędów
2. Sprawdź URL Supabase i anon key
3. Upewnij się, że SQL zostały wykonane
4. Sprawdź RLS policy w Supabase Dashboard
5. Upewnij się, że co najmniej jedna usługa ma `widoczna_publicznie = true`

---
Integracja gotowa! 🎉
