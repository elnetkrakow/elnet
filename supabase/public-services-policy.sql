-- ==========================================
-- EL-Net Public Services Policy
-- Bezpieczne pobieranie cennika do publicznej szybkiej wyceny
-- ==========================================

-- 1. Dodaj kolumnę widoczna_publicznie jeśli jej nie ma
-- (dla PostgreSQL - sprawdzenie czy kolumna istnieje)
ALTER TABLE IF EXISTS uslugi
ADD COLUMN IF NOT EXISTS widoczna_publicznie BOOLEAN DEFAULT true;

-- Opcjonalnie: Zaktualizuj istniejące usługi aby były widoczne publicznie
-- (odkomentuj jeśli chcesz aby wszystkie obecne usługi były widoczne)
-- UPDATE uslugi SET widoczna_publicznie = true WHERE widoczna_publicznie IS NULL;

-- 2. Włącz Row Level Security na tabeli uslugi
-- (jeśli RLS już jest włączony, polecenie będzie bezpieczne)
ALTER TABLE uslugi ENABLE ROW LEVEL SECURITY;

-- 3. USUŃ STARE POLITYKI JEŚLI ISTNIEJĄ (bezpieczeństwo)
DROP POLICY IF EXISTS "Anon read public services" ON uslugi;
DROP POLICY IF EXISTS "anon_read_public_services" ON uslugi;

-- 4. Dodaj nową politykę SELECT dla anon role
-- Anon może czytać TYLKO usługi z widoczna_publicznie = true
CREATE POLICY "Anon read public services" ON uslugi
FOR SELECT
TO anon
USING (widoczna_publicznie = true);

-- 5. Dodaj politykę dla authenticated users (pracownicy)
-- Pracownicy widzą wszystkie usługi (z RLS per role)
CREATE POLICY "Authenticated view all services" ON uslugi
FOR SELECT
TO authenticated
USING (true);

-- 6. Blokuj INSERT/UPDATE/DELETE dla anon na uslugi
-- (anon może TYLKO czytać publiczne usługi)
-- Polityki INSERT/UPDATE/DELETE dla anon nie są potrzebne (domyślnie blokowane)

-- 7. Informacja do admina:
-- - Panel będzie dalej używać authenticated lub service_role (bez zmian)
-- - Publiczna szybka-wycena.html będzie używać anon key
-- - Anon będzie widział tylko usługi z widoczna_publicznie = true
-- - Brak dostępu do kosztorysów, inwestycji, klientów, logów itp.

COMMENT ON COLUMN uslugi.widoczna_publicznie IS 'Czy usługa jest widoczna w publicznej szybkiej wycenie. true = widoczna dla anon, false = ukryta';
