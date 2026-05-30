// ==========================================
// EL-NET v2 — jedna strona / panel firmowy
// ==========================================

const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";
const APP_VERSION = "2026.05.29-47";

let accessToken = localStorage.getItem("elnet_token") || null;
let zalogowanyUser = null;
let rolaUsera = "guest";
let authErrorHandled = false;

let uslugi = [];
let kosztorysy = [];
let inwestycje = [];
let inwestycjeZaliczki = [];
let inwestycjeKoszty = [];
let inwestycjePraceDodatkowe = [];
let logi = [];
let aktywnaInwestycjaId = null;

let magazyn = [];
let terminarz = [];
let calendarDate = new Date();
let edytowanyTerminId = null;

let wycenaPozycje = [];
let edytowanaUslugaId = null;
let edytowanaInwestycjaId = null;
let trybEdycjiKosztorysu = false;
let edytowanyKosztorysId = null;
let aktualnyDrukowanyKosztorysId = null;

function headers() {
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };
}

async function zapiszLog(modul, akcja, opis = "", szczegoly = {}) {
    try {
        const payload = {
            user_id: zalogowanyUser?.id || null,
            email: zalogowanyUser?.email || "",
            rola: rolaUsera || "guest",
            modul,
            akcja,
            opis,
            szczegoly
        };

        const res = await fetch(`${SUPABASE_URL}/rest/v1/logi`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const warningText = await res.text();
            console.warn("Nie udało się zapisać logu:", warningText);
            return;
        }
    } catch (err) {
        console.warn("Nie udało się zapisać logu:", err);
    }
}

async function pobierzLogi() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/logi?select=*&order=created_at.desc&limit=50`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        logi = await res.json();
    } catch (err) {
        console.error("Błąd logów:", err);
        logi = [];
    }
}

function obsluzBladAutoryzacji(errorText) {
    // Zabezpieczenie: jeśli błąd autoryzacji już został obsłużony, wyjść
    if (authErrorHandled === true) return;
    
    if (!errorText || typeof errorText !== 'string') return;

    const lower = errorText.toLowerCase();

    const expired = lower.includes('jwt expired') || lower.includes('pgrst301') || lower.includes('401');
    if (!expired) return;

    // Sprawdzić czy jesteśmy na ekranie logowania
    const login = document.getElementById('login-screen');
    const app = document.getElementById('app-screen');
    const isOnLoginScreen = login && !login.classList.contains('hidden');

    if (isOnLoginScreen) {
        // Jeśli już na ekranie logowania, tylko wyczyść storage
        try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ }
        accessToken = null;
        zalogowanyUser = null;
        rolaUsera = 'guest';
        authErrorHandled = true;
        return;
    }

    // Ustaw flagę aby uniknąć wielu alertów
    authErrorHandled = true;

    // Clear session and reset state
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ }
    accessToken = null;
    zalogowanyUser = null;
    rolaUsera = 'guest';

    // Pokaż alert maksymalnie raz
    alert('Sesja wygasła. Zaloguj się ponownie.');

    // Show login screen (or reload as fallback)
    try {
        if (login && app) {
            app.classList.add('hidden');
            login.classList.remove('hidden');
        } else {
            location.reload();
        }
    } catch (e) {
        location.reload();
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    podepnijZdarzenia();

    const zapisanaSesja = localStorage.getItem("elnet_user");

    if (accessToken && zapisanaSesja) {
        try {
            const session = JSON.parse(zapisanaSesja);
            zalogowanyUser = session.user;
            rolaUsera = session.rola || "user";
            pokazAplikacje();
            await odswiezDane();
        } catch {
            wyloguj();
        }
    } else {
        pokazLogowanie();
    }
});

// ==========================================
// ZDARZENIA
// ==========================================

function podepnijZdarzenia() {
    const btnLogin = document.getElementById("btn-login");
    const btnLogout = document.getElementById("btn-logout");

    if (btnLogin) btnLogin.addEventListener("click", zaloguj);
    if (btnLogout) btnLogout.addEventListener("click", wyloguj);

    const password = document.getElementById("login-password");
    if (password) {
        password.addEventListener("keydown", (e) => {
            if (e.key === "Enter") zaloguj();
        });
    }

    document.querySelectorAll(".nav-link").forEach(btn => {
        btn.addEventListener("click", () => pokazSekcje(btn.dataset.section));
    });

    document.querySelectorAll("[data-go]").forEach(btn => {
        btn.addEventListener("click", () => pokazSekcje(btn.dataset.go));
    });

    const wycenaUsluga = document.getElementById("wycena-usluga");
    if (wycenaUsluga) wycenaUsluga.addEventListener("change", ustawCeneWybranejUslugi);

    const wycenaUsluguSearch = document.getElementById("wycena-usluga-search");
    if (wycenaUsluguSearch) {
        wycenaUsluguSearch.addEventListener("input", renderujPodpowiedziUslug);
        wycenaUsluguSearch.addEventListener("focus", renderujPodpowiedziUslug);
    }

    document.addEventListener("click", (e) => {
        const searchInput = document.getElementById("wycena-usluga-search");
        const suggestionsBox = document.getElementById("wycena-usluga-suggestions");
        if (!suggestionsBox) return;
        
        if (e.target !== searchInput && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.remove("visible");
        }
    });

    const btnDodajPozycje = document.getElementById("btn-dodaj-pozycje");
    if (btnDodajPozycje) btnDodajPozycje.addEventListener("click", dodajPozycjeDoWyceny);

    const btnWyczyscWycene = document.getElementById("btn-wyczysc-wycene");
    if (btnWyczyscWycene) btnWyczyscWycene.addEventListener("click", wyczyscWycene);

    const btnAnulujEdycjiKosztorysu = document.getElementById("btn-anuluj-edycje-kosztorysu");
    if (btnAnulujEdycjiKosztorysu) btnAnulujEdycjiKosztorysu.addEventListener("click", anulujTrybEdycjiKosztorysu);

    const btnPodgladDrukujKosztorys = document.getElementById("btn-podglad-drukuj-kosztorys");
    if (btnPodgladDrukujKosztorys) btnPodgladDrukujKosztorys.addEventListener("click", () => {
        const options = pobierzOpcjeDrukuKosztorysu();
        if (!options) return;
        if (aktualnyDrukowanyKosztorysId) {
            drukujKosztorysDoOkna(aktualnyDrukowanyKosztorysId, options);
        }
    });

    const btnZamknijDrukujKosztorys = document.getElementById("btn-zamknij-drukuj-kosztorys");
    if (btnZamknijDrukujKosztorys) btnZamknijDrukujKosztorys.addEventListener("click", zamknijModalDrukuKosztorysu);

    const korekta = document.getElementById("wycena-korekta");
    if (korekta) korekta.addEventListener("input", przeliczWycene);

    const btnZapiszKosztorys = document.getElementById("btn-zapisz-kosztorys");
    if (btnZapiszKosztorys) btnZapiszKosztorys.addEventListener("click", zapiszKosztorys);

    const btnZapiszUsluge = document.getElementById("btn-zapisz-usluge");
    if (btnZapiszUsluge) btnZapiszUsluge.addEventListener("click", zapiszUsluge);

    const btnAnulujUsluge = document.getElementById("btn-anuluj-usluge");
    if (btnAnulujUsluge) btnAnulujUsluge.addEventListener("click", anulujEdycjeUslugi);

    const szukajUslugi = document.getElementById("szukaj-uslugi");
    if (szukajUslugi) szukajUslugi.addEventListener("input", renderujUslugi);

    const sortujUslugi = document.getElementById("sortuj-uslugi");
    if (sortujUslugi) sortujUslugi.addEventListener("change", renderujUslugi);

    const szukajKosztorys = document.getElementById("szukaj-kosztorys");
    if (szukajKosztorys) szukajKosztorys.addEventListener("input", renderujKosztorysy);

    const sortujKosztorys = document.getElementById("sortuj-kosztorys");
    if (sortujKosztorys) sortujKosztorys.addEventListener("change", renderujKosztorysy);

    const inwestycjeSearch = document.getElementById("inwestycje-search");
    if (inwestycjeSearch) inwestycjeSearch.addEventListener("input", renderujInwestycje);

    const inwestycjeSort = document.getElementById("inwestycje-sort");
    if (inwestycjeSort) inwestycjeSort.addEventListener("change", renderujInwestycje);

    const btnDodajInwestycje = document.getElementById("btn-dodaj-inwestycje");
    if (btnDodajInwestycje) btnDodajInwestycje.addEventListener("click", dodajInwestycje);

    const btnZamknijInwestycje = document.getElementById("btn-zamknij-inwestycje");
    if (btnZamknijInwestycje) btnZamknijInwestycje.addEventListener("click", zamknijPanelInwestycji);

    const btnDrukujInwestycje = document.getElementById("btn-drukuj-inwestycje");
    if (btnDrukujInwestycje) btnDrukujInwestycje.addEventListener("click", pokazModalDrukuInwestycji);

    const btnDodajZaliczke = document.getElementById("btn-dodaj-zaliczke");
    if (btnDodajZaliczke) btnDodajZaliczke.addEventListener("click", dodajZaliczke);

    const btnDodajKoszt = document.getElementById("btn-dodaj-koszt");
    if (btnDodajKoszt) btnDodajKoszt.addEventListener("click", dodajKoszt);

    const btnDodajPracaDodatkowa = document.getElementById("btn-dodaj-praca-dodatkowa");
    if (btnDodajPracaDodatkowa) btnDodajPracaDodatkowa.addEventListener("click", dodajPraceDodatkowa);

    const pracaUslugaSelect = document.getElementById("praca-usluga");
    if (pracaUslugaSelect) pracaUslugaSelect.addEventListener("change", ustawPraceDodatkoweZUslugi);

    const btnAnulujInwestycje = document.getElementById("btn-anuluj-inwestycje");
    if (btnAnulujInwestycje) btnAnulujInwestycje.addEventListener("click", anulujEdycjeInwestycji);

    const btnAdminRefresh = document.getElementById("btn-admin-refresh");
    if (btnAdminRefresh) btnAdminRefresh.addEventListener("click", odswiezDane);

    const btnAdminClear = document.getElementById("btn-admin-clear");
    if (btnAdminClear) btnAdminClear.addEventListener("click", () => {
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
    });

    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => pokazAdminTab(btn.dataset.adminTab));
    });

    const adminLogSearch = document.getElementById("admin-log-search");
    if (adminLogSearch) adminLogSearch.addEventListener("input", renderujLogi);

    const adminLogSort = document.getElementById("admin-log-sort");
    if (adminLogSort) adminLogSort.addEventListener("change", renderujLogi);

    const dzisiaj = formatDateLocal(new Date());

    const zaliczkaData = document.getElementById("zaliczka-data");
    if (zaliczkaData) zaliczkaData.value = dzisiaj;

    const kosztData = document.getElementById("koszt-data");
    if (kosztData) kosztData.value = dzisiaj;

    const btnZapiszMagazyn = document.getElementById("btn-zapisz-magazyn");
    if (btnZapiszMagazyn) btnZapiszMagazyn.addEventListener("click", zapiszMagazyn);

    const btnRefreshMagazyn = document.getElementById("btn-refresh-magazyn");
    if (btnRefreshMagazyn) btnRefreshMagazyn.addEventListener("click", async () => {
        await pobierzMagazyn();
        renderujMagazyn();
    });

    const magSearch = document.getElementById('magazyn-search');
    if (magSearch) magSearch.addEventListener('input', renderujMagazyn);

    const magSort = document.getElementById('magazyn-sort');
    if (magSort) magSort.addEventListener('change', renderujMagazyn);

    const btnDodajTermin = document.getElementById('btn-dodaj-termin');
    if (btnDodajTermin) btnDodajTermin.addEventListener('click', dodajTermin);

    const btnAnulujTermin = document.getElementById('btn-anuluj-termin');
    if (btnAnulujTermin) btnAnulujTermin.addEventListener('click', anulujEdycjeTerminu);

    const terminSearch = document.getElementById('terminarz-search');
    if (terminSearch) terminSearch.addEventListener('input', renderujTerminarz);

    const terminDateFilter = document.getElementById('terminarz-date-filter');
    if (terminDateFilter) terminDateFilter.addEventListener('change', renderujTerminarz);

    const terminSort = document.getElementById('terminarz-sort');
    if (terminSort) terminSort.addEventListener('change', renderujTerminarz);

    const btnCalendarPrev = document.getElementById('calendar-prev');
    if (btnCalendarPrev) btnCalendarPrev.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderujKalendarzTerminarza();
    });

    const btnCalendarNext = document.getElementById('calendar-next');
    if (btnCalendarNext) btnCalendarNext.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderujKalendarzTerminarza();
    });
}

// ==========================================
// LOGOWANIE
// ==========================================

async function zaloguj() {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const error = document.getElementById("login-error");

    if (error) error.style.display = "none";

    if (!email || !password) {
        alert("Wpisz e-mail i hasło.");
        return;
    }

    try {
        const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        if (!authResponse.ok) throw new Error("Błędne dane logowania.");

        const authData = await authResponse.json();
        accessToken = authData.access_token;
        zalogowanyUser = authData.user;

        const profileResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/profile?id=eq.${zalogowanyUser.id}&select=rola`,
            {
                headers: {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );

        const profileData = await profileResponse.json();
        rolaUsera = profileData[0]?.rola || "user";

        localStorage.setItem("elnet_token", accessToken);
        localStorage.setItem("elnet_user", JSON.stringify({
            user: zalogowanyUser,
            rola: rolaUsera
        }));

        // Zresetuj flagę błędu autoryzacji po poprawnym logowaniu
        authErrorHandled = false;

        pokazAplikacje();
        await odswiezDane();
        zapiszLog("Logowanie", "Zalogowano");
    } catch (err) {
        console.error(err);
        if (error) error.style.display = "block";
    }
}

function wyloguj() {
    zapiszLog("Logowanie", "Wylogowano");
    localStorage.removeItem("elnet_token");
    localStorage.removeItem("elnet_user");
    accessToken = null;
    zalogowanyUser = null;
    rolaUsera = "guest";
    pokazLogowanie();
}

function pokazLogowanie() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-screen").classList.add("hidden");
}

function pokazAplikacje() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");

    const userInfo = document.getElementById("user-info");
    if (userInfo && zalogowanyUser) {
        userInfo.textContent = `${zalogowanyUser.email} (${rolaUsera.toUpperCase()})`;
    }

    const versionInfo = document.getElementById("app-version");
    if (versionInfo) {
        versionInfo.textContent = `v${APP_VERSION}`;
    }

    const adminNav = document.getElementById("nav-administrator");
    if (adminNav) {
        adminNav.classList.toggle("hidden", rolaUsera !== "admin");
    }

    aktualizujWidokPoRoli();
    pokazSekcje("pulpit");
}

function aktualizujWidokPoRoli() {
    const cardUslugiForm = document.getElementById("card-uslugi-form");
    const cardWycenaForm = document.getElementById("card-wycena-form");
    const cardKosztorysSave = document.getElementById("card-kosztorys-save");
    const cardInwestycjeForm = document.getElementById("card-inwestycje-form");
    const cardZaliczkaForm = document.getElementById("card-zaliczka-form");
    const cardKosztForm = document.getElementById("card-koszt-form");
    const btnWyczyscWycene = document.getElementById("btn-wyczysc-wycene");

    // Formularz usług widoczny dla zalogowanych ról (admin, staff, user)
    // oraz dla konkretnego konta n.norbud@gmail.com niezależnie od roli
    const allowUslugiForm = (rolaUsera && rolaUsera !== 'guest') || (zalogowanyUser && String(zalogowanyUser.email || '').toLowerCase() === 'n.norbud@gmail.com');
    if (cardUslugiForm) cardUslugiForm.classList.toggle("hidden", !allowUslugiForm);
    if (cardWycenaForm) cardWycenaForm.classList.toggle("hidden", rolaUsera === "guest");
    if (cardKosztorysSave) cardKosztorysSave.classList.toggle("hidden", rolaUsera === "guest");
    if (cardInwestycjeForm) cardInwestycjeForm.classList.toggle("hidden", rolaUsera === "guest");
    if (cardZaliczkaForm) cardZaliczkaForm.classList.toggle("hidden", rolaUsera === "guest");
    if (cardKosztForm) cardKosztForm.classList.toggle("hidden", rolaUsera === "guest");
    if (btnWyczyscWycene) btnWyczyscWycene.classList.toggle("hidden", rolaUsera === "guest");
}

// ==========================================
// NAWIGACJA
// ==========================================

function pokazSekcje(nazwa) {
    const previousSection = document.querySelector('.app-section.active-section')?.id;

    document.querySelectorAll(".app-section").forEach(sec => {
        sec.classList.remove("active-section");
    });

    const section = document.getElementById(`section-${nazwa}`);
    if (section) section.classList.add("active-section");

    document.querySelectorAll(".nav-link").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.section === nazwa);
    });

    if (previousSection === "section-wycena" && nazwa !== "wycena") {
        wyczyscWycene();
    }

    if (nazwa === "wycena" && !trybEdycjiKosztorysu) {
        wyczyscWycene();
    }

    if (nazwa === "administrator") {
        pokazAdminTab("podsumowanie");
    }
}

// ==========================================
// SUPABASE — POBIERANIE
// ==========================================

async function odswiezDane() {
    await Promise.all([
        pobierzUslugi(),
        pobierzKosztorysy(),
        pobierzInwestycje(),
        pobierzInwestycjeZaliczki(),
        pobierzInwestycjeKoszty(),
        pobierzInwestycjePraceDodatkowe(),
        pobierzLogi(),
        pobierzMagazyn(),
        pobierzTerminarz()
    ]);

    renderujWszystko();
}

async function pobierzUslugi() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?select=*&order=nazwa.asc`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        uslugi = await res.json();
    } catch (err) {
        console.error("Błąd usług:", err);
        uslugi = [];
    }
}

async function pobierzKosztorysy() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?select=*`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        kosztorysy = await res.json();
    } catch (err) {
        console.error("Błąd kosztorysów:", err);
        kosztorysy = [];
    }
}

async function pobierzInwestycje() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?select=*&order=created_at.desc`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        inwestycje = await res.json();
    } catch (err) {
        console.error("Błąd inwestycji:", err);
        inwestycje = [];
    }
}

async function pobierzInwestycjeZaliczki() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_zaliczki?select=*&order=data.desc`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        inwestycjeZaliczki = await res.json();
    } catch (err) {
        console.error("Błąd zaliczek:", err);
        inwestycjeZaliczki = [];
    }
}

async function pobierzInwestycjeKoszty() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_koszty?select=*&order=data.desc`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        inwestycjeKoszty = await res.json();
    } catch (err) {
        console.error("Błąd kosztów:", err);
        inwestycjeKoszty = [];
    }
}

async function pobierzInwestycjePraceDodatkowe() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_prace_dodatkowe?select=*&order=created_at.desc`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        inwestycjePraceDodatkowe = await res.json();
    } catch (err) {
        console.error("Błąd prac dodatkowych:", err);
        inwestycjePraceDodatkowe = [];
    }
}

// MAGAZYN
async function pobierzMagazyn() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/magazyn?select=*&order=data_zakupu.desc`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        magazyn = await res.json();
    } catch (err) {
        console.error("Błąd pobierania magazynu:", err);
        magazyn = [];
    }
}

async function pobierzTerminarz() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?select=*&order=data_start.asc`, {
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        terminarz = await res.json();
    } catch (err) {
        console.error("Błąd pobierania terminarza:", err);
        terminarz = [];
    }
}

async function dodajTermin() {
    if (rolaUsera === 'guest') {
        alert('Musisz być zalogowany, aby dodać termin.');
        return;
    }

    const dataStart = document.getElementById('terminarz-data-start')?.value;
    const dataKoniec = document.getElementById('terminarz-data-koniec')?.value;
    const klient = document.getElementById('terminarz-klient')?.value.trim();
    const adres = document.getElementById('terminarz-adres')?.value.trim();
    const telefon = document.getElementById('terminarz-telefon')?.value.trim();
    const opis = document.getElementById('terminarz-opis')?.value.trim();
    const status = document.getElementById('terminarz-status')?.value || 'zaplanowane';

    if (!dataStart || !dataKoniec) {
        alert('Podaj datę rozpoczęcia i zakończenia.');
        return;
    }

    const nowyStart = new Date(dataStart);
    const nowyKoniec = new Date(dataKoniec);

    if (nowyKoniec < nowyStart) {
        alert('Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.');
        return;
    }

    // Allow overlapping terms without blocking confirmation.
    // We still compute overlaps for informational purposes elsewhere, but do not block saving here.

    const payload = {
        data_start: dataStart,
        data_koniec: dataKoniec,
        klient: klient,
        adres: adres,
        telefon: telefon,
        opis: opis,
        status: status,
        user_id: zalogowanyUser?.id || null
    };

    try {
        let res;
        let logAkcja = 'Dodano termin';
        if (edytowanyTerminId) {
            res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${encodeURIComponent(edytowanyTerminId)}`, {
                method: 'PATCH',
                headers: headers(),
                body: JSON.stringify(payload)
            });
            logAkcja = 'Edytowano termin';
        } else {
            res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            throw new Error(await res.text());
        }

        await pobierzTerminarz();
        renderujTerminarz();
        renderujKalendarzTerminarza();
        zapiszLog('Terminarz', logAkcja, `${klient} ${dataStart}–${dataKoniec}`);

        edytowanyTerminId = null;
        const btnDodajTermin = document.getElementById('btn-dodaj-termin');
        if (btnDodajTermin) btnDodajTermin.textContent = 'Dodaj termin';
        const btnAnulujTermin = document.getElementById('btn-anuluj-termin');
        if (btnAnulujTermin) btnAnulujTermin.classList.add('hidden');

        document.getElementById('terminarz-data-start').value = '';
        document.getElementById('terminarz-data-koniec').value = '';
        document.getElementById('terminarz-klient').value = '';
        document.getElementById('terminarz-adres').value = '';
        document.getElementById('terminarz-telefon').value = '';
        document.getElementById('terminarz-opis').value = '';
        document.getElementById('terminarz-status').value = 'zaplanowane';
    } catch (err) {
        console.error('Błąd zapisu terminarza:', err);
        const msg = err?.message || String(err);
        alert('Nie udało się zapisać terminu:\n\n' + msg);
    }
}

window.edytujTermin = function(id) {
    if (rolaUsera === 'guest') {
        alert('Tylko zalogowany użytkownik może edytować termin.');
        return;
    }

    const termin = terminarz.find(item => String(item.id) === String(id));
    if (!termin) return;

    edytowanyTerminId = String(id);
    document.getElementById('terminarz-data-start').value = termin.data_start || '';
    document.getElementById('terminarz-data-koniec').value = termin.data_koniec || '';
    document.getElementById('terminarz-klient').value = termin.klient || '';
    document.getElementById('terminarz-adres').value = termin.adres || '';
    document.getElementById('terminarz-telefon').value = termin.telefon || '';
    document.getElementById('terminarz-opis').value = termin.opis || '';
    document.getElementById('terminarz-status').value = termin.status || 'zaplanowane';

    const btnDodajTermin = document.getElementById('btn-dodaj-termin');
    if (btnDodajTermin) btnDodajTermin.textContent = 'Zapisz zmiany';
    const btnAnulujTermin = document.getElementById('btn-anuluj-termin');
    if (btnAnulujTermin) btnAnulujTermin.classList.remove('hidden');
};

function anulujEdycjeTerminu() {
    edytowanyTerminId = null;
    document.getElementById('terminarz-data-start').value = '';
    document.getElementById('terminarz-data-koniec').value = '';
    document.getElementById('terminarz-klient').value = '';
    document.getElementById('terminarz-adres').value = '';
    document.getElementById('terminarz-telefon').value = '';
    document.getElementById('terminarz-opis').value = '';
    document.getElementById('terminarz-status').value = 'zaplanowane';

    const btnDodajTermin = document.getElementById('btn-dodaj-termin');
    if (btnDodajTermin) btnDodajTermin.textContent = 'Dodaj termin';
    const btnAnulujTermin = document.getElementById('btn-anuluj-termin');
    if (btnAnulujTermin) btnAnulujTermin.classList.add('hidden');
}

window.usunTermin = async function(id) {
    if (rolaUsera !== 'admin') {
        alert('Tylko administrator może usuwać terminy.');
        return;
    }

    if (!confirm('Usunąć termin?')) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${id}`, {
            method: 'DELETE',
            headers: headers()
        });

        if (!res.ok) {
            throw new Error(await res.text());
        }

        await pobierzTerminarz();
        renderujTerminarz();
        renderujKalendarzTerminarza();
        zapiszLog('Terminarz', 'Usunięto termin', id);
    } catch (err) {
        console.error('Błąd usuwania terminarza:', err);
        alert('Nie udało się usunąć terminu.');
    }
};

function renderujTerminarz() {
    const tbody = document.getElementById('tabela-terminarz');
    if (!tbody) return;

    const search = document.getElementById('terminarz-search')?.value.toLowerCase().trim() || '';
    const dateFilter = document.getElementById('terminarz-date-filter')?.value;
    const sort = document.getElementById('terminarz-sort')?.value || 'start-asc';

    let lista = [...terminarz];

    if (search) {
        lista = lista.filter(item => {
            const text = [item.klient, item.adres, item.opis].map(v => String(v || '').toLowerCase()).join(' ');
            return text.includes(search);
        });
    }

    if (dateFilter) {
        const filtrowanaData = parseDateLocal(dateFilter);
        lista = lista.filter(item => {
            const start = item.data_start ? parseDateLocal(item.data_start) : null;
            const end = item.data_koniec ? parseDateLocal(item.data_koniec) : null;
            if (!start || !end || !filtrowanaData) return false;
            return filtrowanaData >= start && filtrowanaData <= end;
        });
    }

    function statusOrder(item) {
        const order = ['zaplanowane', 'w trakcie', 'zakończone', 'przesunięte', 'odwołane'];
        return order.indexOf((item.status || '').toLowerCase());
    }

    lista.sort((a, b) => {
        if (sort === 'start-asc') {
            return (parseDateLocal(a.data_start) || 0) - (parseDateLocal(b.data_start) || 0);
        }
        if (sort === 'start-desc') {
            return (parseDateLocal(b.data_start) || 0) - (parseDateLocal(a.data_start) || 0);
        }
        if (sort === 'end-asc') {
            return (parseDateLocal(a.data_koniec) || 0) - (parseDateLocal(b.data_koniec) || 0);
        }
        if (sort === 'client-az') {
            return String(a.klient || '').localeCompare(String(b.klient || ''), 'pl');
        }
        if (sort === 'status') {
            return statusOrder(a) - statusOrder(b);
        }
        return 0;
    });

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Brak terminów w terminarzu.</td></tr>`;
        return;
    }

    const today = new Date();
    tbody.innerHTML = lista.map(item => {
        const start = item.data_start ? parseDateLocal(item.data_start) : null;
        const end = item.data_koniec ? parseDateLocal(item.data_koniec) : null;
        const startStr = start ? start.toLocaleDateString('pl-PL') : '-';
        const endStr = end ? end.toLocaleDateString('pl-PL') : '-';
        const days = start && end ? Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1) : '-';
        const status = String(item.status || '').toLowerCase();
        const statusLabel = `<span class="status-tag status-${status.replace(/\s/g, '-')}">${esc(status || '-')}</span>`;
        const canEdit = rolaUsera !== 'guest';
        const editButton = canEdit
            ? `<button class="btn btn-secondary small-btn" onclick="edytujTermin('${esc(item.id)}')">Edytuj</button>`
            : '';
        const deleteButton = rolaUsera === 'admin'
            ? `<button class="btn btn-danger small-btn" onclick="usunTermin('${esc(item.id)}')">Usuń</button>`
            : '';
        const akcje = [editButton, deleteButton].filter(Boolean).join(' ');

        return `
            <tr>
                <td>${esc(startStr)} – ${esc(endStr)}</td>
                <td>${esc(item.klient || '')}</td>
                <td>${esc(item.adres || '')}</td>
                <td>${esc(item.telefon || '')}</td>
                <td>${statusLabel}</td>
                <td>${esc(item.opis || '')}</td>
                <td>${esc(days)}</td>
                <td>${akcje}</td>
            </tr>
        `;
    }).join('');
}

function renderujKalendarzTerminarza() {
    const container = document.getElementById('terminarz-calendar');
    const title = document.getElementById('calendar-title');
    if (!container || !title) return;

    const month = calendarDate.getMonth();
    const year = calendarDate.getFullYear();
    const monthLabel = calendarDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    title.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weekdays = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

    const cells = weekdays.map(d => `<div class="calendar-weekday">${d}</div>`);

    for (let i = 0; i < startOffset; i++) {
        cells.push('<div class="calendar-day empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const localDate = formatDateLocal(currentDate);
        const isToday = isSameDay(currentDate, new Date());
        const count = getTerminyCountForDay(currentDate);
        const status = getKalendarzStatus(currentDate, count);
        const className = `calendar-day ${status} ${isToday ? 'today' : ''}`.trim();
        const badge = count >= 2 ? `<span class="calendar-badge">${count}</span>` : '';
        cells.push(`
            <div class="${className}" data-date="${localDate}">
                <span>${day}</span>
                ${badge}
            </div>
        `);
    }

    container.innerHTML = cells.join('');

    container.querySelectorAll('.calendar-day[data-date]').forEach(dayEl => {
        dayEl.addEventListener('click', () => {
            const selected = dayEl.dataset.date;
            const dateFilter = document.getElementById('terminarz-date-filter');
            if (dateFilter) {
                dateFilter.value = selected;
            }
            renderujTerminarz();
        });
    });
}

function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseDateLocal(value) {
    if (!value) return null;
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function getKalendarzStatus(date, precomputedCount) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    const count = typeof precomputedCount === 'number' ? precomputedCount : getTerminyCountForDay(normalized);

    if (count >= 2) return 'multiple';

    let foundReserved = false;
    let foundBusy = false;

    (terminarz || []).forEach(item => {
        const start = item.data_start ? parseDateLocal(item.data_start) : null;
        const end = item.data_koniec ? parseDateLocal(item.data_koniec) : null;
        if (!start || !end) return;
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (normalized >= start && normalized <= end) {
            const status = String(item.status || '').toLowerCase();
            if (status === 'rezerwacja') {
                foundReserved = true;
            } else if (['zaplanowane', 'w trakcie', 'zakończone', 'przesunięte'].includes(status)) {
                foundBusy = true;
            }
        }
    });

    if (foundBusy) return 'busy';
    if (foundReserved) return 'reserved';
    return 'free';
}

function getTerminyCountForDay(date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    let count = 0;
    (terminarz || []).forEach(item => {
        const start = item.data_start ? parseDateLocal(item.data_start) : null;
        const end = item.data_koniec ? parseDateLocal(item.data_koniec) : null;
        if (!start || !end) return;
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (normalized >= start && normalized <= end) {
            // Ignore canceled entries
            const status = String(item.status || '').toLowerCase();
            if (status === 'odwołane' || status === 'odwolane') return;
            count++;
        }
    });
    return count;
}

function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function nazwaStatusu(status) {
    return String(status || '').toLowerCase();
}

function statusClass(status) {
    return `status-${String(status || '').toLowerCase().replace(/\s/g, '-')}`;
}

function formatDateOnly(data) {
    return data ? new Date(data).toLocaleDateString('pl-PL') : '-';
}

function renderujMagazyn() {
    const tbody = document.getElementById("tabela-magazyn");
    if (!tbody) return;
    const search = document.getElementById('magazyn-search')?.value.toLowerCase().trim() || '';
    const sort = document.getElementById('magazyn-sort')?.value || 'newest';

    let lista = [...magazyn];

    // filter by search (name or uwagi)
    if (search) {
        lista = lista.filter(item => {
            const text = ((item.nazwa || '') + ' ' + (item.uwagi || '')).toLowerCase();
            return text.includes(search);
        });
    }

    const teraz = new Date();

    function remainingDays(item) {
        const dataZakupu = item.data_zakupu ? new Date(item.data_zakupu) : null;
        const gwar = Number(item.okres_gwarancji_miesiace || item.gwarancja_miesiace || 0);
        if (!dataZakupu || !gwar) return Infinity;
        const koniec = new Date(dataZakupu);
        koniec.setMonth(koniec.getMonth() + gwar);
        return Math.ceil((koniec - new Date()) / (1000 * 60 * 60 * 24));
    }

    // sort
    lista.sort((a, b) => {
        if (sort === 'newest') {
            return new Date(b.created_at || b.data_zakupu || 0) - new Date(a.created_at || a.data_zakupu || 0);
        }
        if (sort === 'oldest') {
            return new Date(a.created_at || a.data_zakupu || 0) - new Date(b.created_at || b.data_zakupu || 0);
        }
        if (sort === 'name-az') return String(a.nazwa || '').localeCompare(String(b.nazwa || ''), 'pl');
        if (sort === 'name-za') return String(b.nazwa || '').localeCompare(String(a.nazwa || ''), 'pl');
        if (sort === 'price-desc') return Number(b.kwota || 0) - Number(a.kwota || 0);
        if (sort === 'price-asc') return Number(a.kwota || 0) - Number(b.kwota || 0);
        if (sort === 'warranty-soon') return remainingDays(a) - remainingDays(b);
        return 0;
    });

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Brak pasujących wpisów.</td></tr>`;
        return;
    }

    lista = lista.slice(0, 10);

    tbody.innerHTML = lista.map(item => {
        const dataZakupu = item.data_zakupu ? new Date(item.data_zakupu) : null;
        const dataZakupuStr = dataZakupu ? dataZakupu.toLocaleDateString('pl-PL') : '-';
        const kwota = Number(item.kwota || 0).toFixed(2);
        const gwar = Number(item.okres_gwarancji_miesiace || item.gwarancja_miesiace || 0);

        let warn = false;
        if (dataZakupu && gwar > 0) {
            const koniec = new Date(dataZakupu);
            koniec.setMonth(koniec.getMonth() + gwar);
            const diffDays = Math.ceil((koniec - teraz) / (1000 * 60 * 60 * 24));
            if (diffDays <= 30) warn = true;
        }

        const akcje = rolaUsera === 'admin'
            ? `<button class="btn btn-danger small-btn" onclick="usunMagazyn('${esc(item.id)}')">Usuń</button>`
            : '';

        return `
            <tr ${warn ? 'class="warning-row"' : ''}>
                <td>${esc(item.nazwa || '')}</td>
                <td>${esc(dataZakupuStr)}</td>
                <td>${kwota} PLN</td>
                <td>${gwar}</td>
                <td>${esc(item.uwagi || '')}</td>
                <td>${akcje}</td>
            </tr>
        `;
    }).join('');
}

async function zapiszMagazyn() {
    if (rolaUsera !== 'admin') {
        alert('Tylko administrator może dodawać sprzęt do magazynu.');
        return;
    }

    const nazwa = document.getElementById('magazyn-nazwa')?.value.trim();
    const dataVal = document.getElementById('magazyn-data')?.value;
    const data = dataVal && dataVal.trim() ? dataVal : null;
    const kwotaVal = document.getElementById('magazyn-kwota')?.value;
    const kwota = kwotaVal && kwotaVal.trim() ? Number(kwotaVal) : 0;
    const gwarVal = document.getElementById('magazyn-gwarancja')?.value;
    const gwarancja = (gwarVal === undefined || gwarVal === null || String(gwarVal).trim() === '') ? 24 : Number(gwarVal);
    const uwagi = document.getElementById('magazyn-uwagi')?.value.trim() || '';

    if (!nazwa) {
        alert('Wpisz nazwę sprzętu.');
        return;
    }

    const payload = {
        nazwa: nazwa,
        data_zakupu: data,
        kwota: kwota,
        okres_gwarancji_miesiace: gwarancja,
        uwagi: uwagi,
        user_id: zalogowanyUser?.id || null
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/magazyn`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        alert('Sprzęt dodany do magazynu.');
        zapiszLog('Magazyn', 'Dodano wpis', nazwa);
        await pobierzMagazyn();
        renderujMagazyn();

        // Clear form
        document.getElementById('magazyn-nazwa').value = '';
        document.getElementById('magazyn-data').value = '';
        document.getElementById('magazyn-kwota').value = '';
        document.getElementById('magazyn-gwarancja').value = '';
        document.getElementById('magazyn-uwagi').value = '';
    } catch (err) {
        console.error("Błąd zapisu magazynu:", err);
        const msg = err && err.message ? err.message : String(err);
        alert("Nie udało się zapisać wpisu w magazynie:\n\n" + msg);
    }
}

window.usunMagazyn = async function(id) {
    if (rolaUsera !== 'admin') {
        alert('Tylko administrator może usuwać wpisy magazynu.');
        return;
    }

    if (!confirm('Usunąć wpis z magazynu?')) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/magazyn?id=eq.${id}`, {
            method: 'DELETE',
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzMagazyn();
        renderujMagazyn();
        zapiszLog('Magazyn', 'Usunięto wpis', id);
    } catch (err) {
        console.error(err);
        alert('Nie udało się usunąć wpisu z magazynu.');
    }
};

// ==========================================
// RENDER
// ==========================================

function renderujWszystko() {
    renderujPulpit();
    renderujSelectUslug();
    renderujWycene();
    renderujKosztorysy();
    renderujUslugi();
    renderujInwestycje();
    renderujKalendarzTerminarza();
    renderujTerminarz();
    renderujAdministrator();
    renderujMagazyn();
}

function renderujAdministrator() {
    const elVersion = document.getElementById("admin-version");
    const elEmail = document.getElementById("admin-email");
    const elRola = document.getElementById("admin-role");
    const elUslugi = document.getElementById("admin-uslugi-count");
    const elKosztorysy = document.getElementById("admin-kosztorysy-count");
    const elInwestycje = document.getElementById("admin-inwestycje-count");
    const elDiagnosticsVersion = document.getElementById("admin-diagnostics-version");

    if (elVersion) elVersion.textContent = APP_VERSION;
    if (elDiagnosticsVersion) elDiagnosticsVersion.textContent = APP_VERSION;
    if (elEmail) elEmail.textContent = zalogowanyUser?.email || "-";
    if (elRola) elRola.textContent = rolaUsera || "-";
    if (elUslugi) elUslugi.textContent = uslugi.length;
    if (elKosztorysy) elKosztorysy.textContent = kosztorysy.length;
    if (elInwestycje) elInwestycje.textContent = inwestycje.length;
    // render alerts for admin panel and update admin nav with count (only for admin)
    renderujOstrzezenia();
    renderujLogi();
}

function pokazAdminTab(nazwa) {
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.adminTab === nazwa);
    });

    document.querySelectorAll(".admin-tab-content").forEach(content => {
        content.classList.toggle("active", content.id === `admin-tab-${nazwa}`);
    });
}

// ==========================================
// OSTRZEŻENIA (ALERTS)
// ==========================================

function generujOstrzezenia() {
    const alerts = [];

    // Usługi z ceną 0 lub brak ceny
    (uslugi || []).forEach(u => {
        if (cenaUslugi(u) === 0) {
            alerts.push({ type: 'warning', msg: `Usługa "${u.nazwa || u.id}" ma cenę 0 lub brak ceny.` });
        }
    });

    // Kosztorysy z brutto 0
    (kosztorysy || []).forEach(k => {
        if (Number(k.brutto || 0) === 0) {
            alerts.push({ type: 'warning', msg: `Kosztorys "${k.nazwa || k.id}" ma wartość brutto 0.` });
        }
    });

    // Inwestycje - różne warunki
    (inwestycje || []).forEach(i => {
        const zal = sumaZaliczekDlaInwestycji(i.id);
        const kos = sumaKosztowDlaInwestycji(i.id);

        if (kos > zal && zal > 0) {
            alerts.push({ type: 'danger', msg: `Inwestycja "${i.nazwa || i.id}" - koszty (${kos.toFixed(2)}) większe niż zaliczki (${zal.toFixed(2)}).` });
        }

        if (kos > 0 && zal === 0) {
            alerts.push({ type: 'danger', msg: `Inwestycja "${i.nazwa || i.id}" ma koszty (${kos.toFixed(2)}) ale brak zaliczek.` });
        }

        if (!i.klient) {
            alerts.push({ type: 'warning', msg: `Inwestycja "${i.nazwa || i.id}" nie ma przypisanego klienta.` });
        }

        if (!i.adres) {
            alerts.push({ type: 'warning', msg: `Inwestycja "${i.nazwa || i.id}" nie ma adresu.` });
        }
    });

    (terminarz || []).forEach(t => {
        if (!t.klient) {
            alerts.push({ type: 'warning', msg: `Termin "${t.opis || t.id}" nie ma przypisanego klienta.` });
        }
        if (!t.adres) {
            alerts.push({ type: 'warning', msg: `Termin "${t.opis || t.id}" nie ma przypisanego adresu.` });
        }
    });

    for (let i = 0; i < (terminarz || []).length; i++) {
        const a = terminarz[i];
        const aStart = a.data_start ? new Date(a.data_start) : null;
        const aEnd = a.data_koniec ? new Date(a.data_koniec) : null;
        if (!aStart || !aEnd) continue;

        for (let j = i + 1; j < (terminarz || []).length; j++) {
            const b = terminarz[j];
            const bStart = b.data_start ? new Date(b.data_start) : null;
            const bEnd = b.data_koniec ? new Date(b.data_koniec) : null;
            if (!bStart || !bEnd) continue;

            if (aStart <= bEnd && aEnd >= bStart) {
                alerts.push({ type: 'warning', msg: `Terminy "${a.klient || a.id}" i "${b.klient || b.id}" się nakładają.` });
            }
        }
    }

    return alerts;
}

function renderujOstrzezenia() {
    const el = document.getElementById('admin-alerts-list');
    if (!el) return;

    const alerts = generujOstrzezenia();

    if (!alerts.length) {
        el.innerHTML = `<div class="admin-alert success">Brak ostrzeżeń. Wszystko wygląda dobrze.</div>`;
    } else {
        el.innerHTML = alerts.map(a => {
            const cls = a.type === 'danger' ? 'danger' : 'warning';
            return `<div class="admin-alert ${cls}">${esc(a.msg)}</div>`;
        }).join('');
    }

    // Aktualizuj etykietę w menu (tylko dla admina pokazuj liczbę)
    const navAdmin = document.getElementById('nav-administrator');
    if (navAdmin) {
        if (rolaUsera === 'admin') {
            navAdmin.textContent = `Administrator (${alerts.length})`;
        } else {
            navAdmin.textContent = 'Administrator';
        }
    }
}

function formatujDatePL(data) {
    return new Date(data).toLocaleString("pl-PL", {
        timeZone: "Europe/Warsaw",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function renderujLogi() {
    const el = document.getElementById('admin-logs-list');
    if (!el) return;

    let lista = [...(logi || [])];
    const search = document.getElementById('admin-log-search')?.value.toLowerCase().trim() || "";
    const sort = document.getElementById('admin-log-sort')?.value || 'newest';

    if (search) {
        lista = lista.filter(log => {
            const value = [log.email, log.rola, log.modul, log.akcja, log.opis]
                .map(v => String(v || '').toLowerCase())
                .join(' ');
            return value.includes(search);
        });
    }

    if (sort === 'newest') {
        lista.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === 'oldest') {
        lista.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sort === 'module') {
        lista.sort((a, b) => String(a.modul || '').localeCompare(String(b.modul || ''), 'pl'));
    } else if (sort === 'user') {
        lista.sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''), 'pl'));
    }

    if (!lista.length) {
        el.innerHTML = `<div class="admin-alert success">Brak logów.</div>`;
        return;
    }

    el.innerHTML = `
        <div class="admin-logs-scroll">
            <div class="admin-log-list">
                ${lista.map(log => `
                    <div class="admin-log-row">
                        <div class="admin-log-date">${esc(formatujDatePL(log.created_at) || '-')}</div>
                        <div class="admin-log-meta">${esc(log.email || '-')}, ${esc(log.rola || '-')}, ${esc(log.modul || '')}, ${esc(log.akcja || '-')}</div>
                        <div>${esc(log.opis || '')}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function cenaUslugi(u) {
    return Number(u.cena_netto ?? u.cena ?? 0);
}

function jednostkaUslugi(u) {
    return u.jednostka || "szt.";
}

function esc(v) {
    return String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ==========================================
// PULPIT
// ==========================================

function renderujPulpit() {
    const aktywne = inwestycje.filter(i => i.status === "aktywna").length;
    const sumaZaliczek = inwestycjeZaliczki.reduce((s, z) => s + Number(z.kwota || 0), 0);
    const sumaKosztow = inwestycjeKoszty.reduce((s, k) => s + Number(k.kwota || 0), 0);

    // Zaplanowane terminy - liczenie przyszłych terminów
    const dzisiaj = new Date();
    dzisiaj.setHours(0, 0, 0, 0);
    const planowaneTerminy = (terminarz || []).filter(t => {
        const dataStart = t.data_start ? parseDateLocal(t.data_start) : null;
        return dataStart && dataStart >= dzisiaj;
    }).length;

    const ostatnieKosztorysy = [...kosztorysy]
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .slice(0, 5);

    const ostatnieInwestycje = [...inwestycje]
        .slice(-5)
        .reverse();

    document.getElementById("stat-inwestycje").textContent = aktywne;
    document.getElementById("stat-zaliczek").textContent = `${sumaZaliczek.toFixed(2)} PLN`;
    document.getElementById("stat-kosztow").textContent = `${sumaKosztow.toFixed(2)} PLN`;
    document.getElementById("stat-terminy").textContent = planowaneTerminy;

    const ostatnieKosztorysyEl = document.getElementById("ostatnie-kosztorysy");
    if (ostatnieKosztorysyEl) {
        if (!ostatnieKosztorysy.length) {
            ostatnieKosztorysyEl.innerHTML = `<p>Brak danych.</p>`;
        } else {
            ostatnieKosztorysyEl.innerHTML = `
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Nazwa</th>
                                <th>Brutto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ostatnieKosztorysy.map(k => `
                                <tr>
                                    <td>${esc(k.data || "-")}</td>
                                    <td>${esc(k.nazwa || "-")}</td>
                                    <td>${Number(k.brutto || 0).toFixed(2)} PLN</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        }
    }

    const ostatnieInwestycjeEl = document.getElementById("ostatnie-inwestycje");
    if (ostatnieInwestycjeEl) {
        if (!ostatnieInwestycje.length) {
            ostatnieInwestycjeEl.innerHTML = `<p>Brak danych.</p>`;
        } else {
            ostatnieInwestycjeEl.innerHTML = `
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Nazwa</th>
                                <th>Klient</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ostatnieInwestycje.map(i => `
                                <tr>
                                    <td>${esc(i.nazwa || "-")}</td>
                                    <td>${esc(i.klient || "-")}</td>
                                    <td>${esc(i.status || "-")}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        }
    }

    renderCalendarWidget();
}

// Render mini calendar widget for dashboard
function renderCalendarWidget() {
    const container = document.getElementById("pulpit-calendar-widget");
    if (!container) return;

    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();
    const monthLabel = today.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weekdays = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

    let html = `
        <div class="pulpit-calendar-header">
            <div class="pulpit-calendar-title">${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</div>
        </div>
        <div class="pulpit-calendar-grid">
    `;

    // Weekday headers
    weekdays.forEach(day => {
        html += `<div class="pulpit-calendar-weekday">${day}</div>`;
    });

    // Empty days before month starts
    for (let i = 0; i < startOffset; i++) {
        html += `<div class="pulpit-calendar-day empty"></div>`;
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const isToday = isSameDay(currentDate, today);
        const dateStr = formatDateLocal(currentDate);
        const count = getTerminyCountForDay(currentDate);
        const status = getKalendarzStatus(currentDate, count);
        const classNames = `pulpit-calendar-day ${status} ${isToday ? 'today' : ''}`.trim();
        const badge = count >= 2 ? `<span class="calendar-badge">${count}</span>` : '';

        html += `
            <div class="${classNames}" onclick="switchToPulpitTerminarz('${dateStr}')" title="Kliknij aby filtrować terminy">
                ${day}${badge}
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

window.switchToPulpitTerminarz = function(dateStr) {
    // Switch to Terminarz tab
    pokazSekcje('terminarz');

    // Set date filter
    const dateFilter = document.getElementById('terminarz-date-filter');
    if (dateFilter) {
        dateFilter.value = dateStr;
        renderujTerminarz();
    }
};

// ==========================================
// USŁUGI
// ==========================================

function renderujSelectUslug() {
    const select = document.getElementById("wycena-usluga");
    if (!select) return;

    if (!uslugi.length) {
        select.innerHTML = `<option value="">Brak usług w bazie</option>`;
        return;
    }

    select.innerHTML = uslugi.map(u => `
        <option value="${esc(u.id)}">${esc(u.nazwa)} (${cenaUslugi(u).toFixed(2)} PLN)</option>
    `).join("");

    ustawCeneWybranejUslugi();
}

function renderujUslugi() {
    const tbody = document.getElementById("tabela-uslug");
    if (!tbody) return;

    let lista = [...uslugi];

    const szukaj = document.getElementById("szukaj-uslugi")?.value.toLowerCase().trim() || "";
    const sort = document.getElementById("sortuj-uslugi")?.value || "nazwa-az";

    if (szukaj) {
        lista = lista.filter(u => String(u.nazwa || "").toLowerCase().includes(szukaj));
    }

    if (sort === "nazwa-az") lista.sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), "pl"));
    if (sort === "nazwa-za") lista.sort((a, b) => String(b.nazwa).localeCompare(String(a.nazwa), "pl"));
    if (sort === "cena-rosnaco") lista.sort((a, b) => cenaUslugi(a) - cenaUslugi(b));
    if (sort === "cena-malejaco") lista.sort((a, b) => cenaUslugi(b) - cenaUslugi(a));

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Brak usług w bazie.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(u => {
        const canEdit = (rolaUsera && rolaUsera !== 'guest') || (zalogowanyUser && String(zalogowanyUser.email || '').toLowerCase() === 'n.norbud@gmail.com');
        const canDelete = rolaUsera === 'admin';

        const editButton = canEdit ? `<button class="btn btn-secondary" onclick="edytujUsluge('${esc(u.id)}')">Edytuj</button>` : '';
        const deleteButton = canDelete ? `<button class="btn btn-danger" onclick="usunUsluge('${esc(u.id)}')">Usuń</button>` : '';

        const akcje = (editButton || deleteButton)
            ? `<div class="table-actions">${editButton} ${deleteButton}</div>`
            : '';

        return `
            <tr>
                <td>${esc(u.nazwa)}</td>
                <td>${esc(jednostkaUslugi(u))}</td>
                <td><strong>${cenaUslugi(u).toFixed(2)} PLN</strong></td>
                <td>${akcje}</td>
            </tr>
        `;
    }).join("");
}

async function zapiszUsluge() {
    // Allow saving service for roles admin, staff, user and for specific email
    const allowSave = (rolaUsera && rolaUsera !== 'guest') || (zalogowanyUser && String(zalogowanyUser.email || '').toLowerCase() === 'n.norbud@gmail.com');
    if (!allowSave) {
        alert("Brak uprawnień do zapisu usługi.");
        return;
    }

    const nazwa = document.getElementById("usluga-nazwa").value.trim();
    const jednostka = document.getElementById("usluga-jednostka").value;
    const cena = Number(document.getElementById("usluga-cena").value);

    if (!nazwa || isNaN(cena)) {
        alert("Wpisz nazwę i poprawną cenę.");
        return;
    }

    const payload = {
        nazwa,
        jednostka,
        cena_netto: cena,
        cena: cena
    };

    try {
        let res;

        if (edytowanaUslugaId) {
            res = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?id=eq.${edytowanaUslugaId}`, {
                method: "PATCH",
                headers: headers(),
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${SUPABASE_URL}/rest/v1/uslugi`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) throw new Error(await res.text());

        anulujEdycjeUslugi();
        await pobierzUslugi();
        renderujSelectUslug();
        renderujUslugi();
        renderujPulpit();
        zapiszLog("Usługi", "Zapisano usługę", nazwa);
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać usługi. Sprawdź kolumny tabeli uslugi i RLS.");
    }
}

window.edytujUsluge = function(id) {
    // Allow editing for non-guest roles and specific account
    const allowEdit = (rolaUsera && rolaUsera !== 'guest') || (zalogowanyUser && String(zalogowanyUser.email || '').toLowerCase() === 'n.norbud@gmail.com');
    if (!allowEdit) {
        alert("Brak uprawnień do edycji usługi.");
        return;
    }

    const u = uslugi.find(x => String(x.id) === String(id));
    if (!u) return;

    edytowanaUslugaId = u.id;
    document.getElementById("usluga-nazwa").value = u.nazwa || "";
    document.getElementById("usluga-jednostka").value = jednostkaUslugi(u);
    document.getElementById("usluga-cena").value = cenaUslugi(u);

    document.getElementById("uslugi-form-title").textContent = "Edytuj usługę";
    document.getElementById("btn-zapisz-usluge").textContent = "Zapisz zmiany";
    document.getElementById("btn-anuluj-usluge").classList.remove("hidden");
};

function anulujEdycjeUslugi() {
    edytowanaUslugaId = null;
    document.getElementById("usluga-nazwa").value = "";
    document.getElementById("usluga-cena").value = "";
    document.getElementById("usluga-jednostka").value = "szt.";

    document.getElementById("uslugi-form-title").textContent = "Dodaj usługę";
    document.getElementById("btn-zapisz-usluge").textContent = "Zapisz usługę";
    document.getElementById("btn-anuluj-usluge").classList.add("hidden");
}

window.usunUsluge = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może usuwać usługi.");
        return;
    }

    if (!confirm("Usunąć usługę?")) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?id=eq.${id}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzUslugi();
        renderujSelectUslug();
        renderujUslugi();
        renderujPulpit();
        zapiszLog("Usługi", "Usunięto usługę", id);
    } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć usługi.");
    }
};

// ==========================================
// WYCENA
// ==========================================

function ustawCeneWybranejUslugi() {
    const select = document.getElementById("wycena-usluga");
    if (!select) return;

    const u = uslugi.find(x => String(x.id) === String(select.value));
    if (!u) return;

    document.getElementById("wycena-cena").value = cenaUslugi(u);
    document.getElementById("wycena-jednostka").value = jednostkaUslugi(u);
}

function renderujPodpowiedziUslug() {
    const searchInput = document.getElementById("wycena-usluga-search");
    const suggestionsBox = document.getElementById("wycena-usluga-suggestions");
    if (!searchInput || !suggestionsBox) return;

    const query = searchInput.value.toLowerCase().trim();

    const wszystkieUslugi = [...uslugi].sort((a, b) => String(a.nazwa || "").localeCompare(String(b.nazwa || ""), "pl"));
    let filtered = [];

    if (!query) {
        filtered = wszystkieUslugi.slice(0, 10);
    } else {
        const startsWith = [];
        const wordStartsWith = [];
        const contains = [];

        wszystkieUslugi.forEach(u => {
            const nazwa = String(u.nazwa || "").toLowerCase();
            if (nazwa.startsWith(query)) {
                startsWith.push(u);
                return;
            }

            const words = nazwa.split(/\s+/).filter(Boolean);
            const wordMatch = words.some(word => word.startsWith(query));
            if (wordMatch) {
                wordStartsWith.push(u);
                return;
            }

            if (query.length > 1 && nazwa.includes(query)) {
                contains.push(u);
            }
        });

        filtered = startsWith.concat(wordStartsWith);
        if (query.length > 1) {
            filtered = filtered.concat(contains);
        }
        filtered = filtered.slice(0, 10);
    }

    if (!filtered.length) {
        suggestionsBox.innerHTML = `<div class="autocomplete-empty">Brak pasujących usług</div>`;
        suggestionsBox.classList.add("visible");
        return;
    }

    suggestionsBox.innerHTML = filtered.map(u => `
        <div class="autocomplete-item" onclick="wybierzUslugeZWyszukiwarki('${esc(u.id)}')">
            <span class="autocomplete-title">${esc(u.nazwa)}</span>
            <div class="autocomplete-meta">
                <span>${esc(jednostkaUslugi(u))}</span>
                <span>${cenaUslugi(u).toFixed(2)} PLN</span>
            </div>
        </div>
    `).join("");

    suggestionsBox.classList.add("visible");
}

function wybierzUslugeZWyszukiwarki(id) {
    const select = document.getElementById("wycena-usluga");
    const searchInput = document.getElementById("wycena-usluga-search");
    const suggestionsBox = document.getElementById("wycena-usluga-suggestions");
    
    if (!select || !searchInput || !suggestionsBox) return;

    const u = uslugi.find(x => String(x.id) === String(id));
    if (!u) return;

    select.value = id;
    searchInput.value = u.nazwa;
    suggestionsBox.classList.remove("visible");
    
    ustawCeneWybranejUslugi();
}

function dodajPozycjeDoWyceny() {
    if (rolaUsera === "guest") {
        alert("Gość nie może modyfikować wyceny.");
        return;
    }

    const id = document.getElementById("wycena-usluga").value;
    const u = uslugi.find(x => String(x.id) === String(id));

    if (!u) {
        alert("Wybierz usługę z bazy.");
        return;
    }

    const ilosc = Number(document.getElementById("wycena-ilosc").value);
    const cena = Number(document.getElementById("wycena-cena").value);
    const jednostka = document.getElementById("wycena-jednostka").value;
    const vatProcent = Number(document.getElementById("wycena-vat").value);

    if (isNaN(ilosc) || ilosc <= 0) {
        alert("Wpisz poprawną ilość.");
        return;
    }

    if (isNaN(cena) || cena < 0) {
        alert("Wpisz poprawną cenę.");
        return;
    }

    wycenaPozycje.push({
        id: Date.now().toString(),
        nazwa: u.nazwa,
        jednostka,
        ilosc,
        cenaNetto: cena,
        vatProcent
    });

    document.getElementById("wycena-ilosc").value = "";
    renderujWycene();
}

function renderujWycene() {
    const tbody = document.getElementById("tabela-wyceny");
    if (!tbody) return;

    if (!wycenaPozycje.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Brak pozycji w wycenie.</td></tr>`;
        przeliczWycene();
        return;
    }

    tbody.innerHTML = wycenaPozycje.map(p => {
        const netto = p.ilosc * p.cenaNetto;
        const vatProcent = Number(p.vatProcent || 23);
        const vat = netto * (vatProcent / 100);
        const brutto = netto + vat;
        const akcja = rolaUsera !== "guest"
            ? `<button class="btn btn-danger small-btn" onclick="usunPozycjeWyceny('${p.id}')">Usuń</button>`
            : "";

        return `
            <tr>
                <td>${esc(p.nazwa)}</td>
                <td>${esc(p.jednostka)}</td>
                <td>${p.ilosc}</td>
                <td>${p.cenaNetto.toFixed(2)} PLN</td>
                <td>${netto.toFixed(2)} PLN</td>
                <td>${vatProcent}%</td>
                <td>${brutto.toFixed(2)} PLN</td>
                <td>${akcja}</td>
            </tr>
        `;
    }).join("");

    przeliczWycene();
}

window.usunPozycjeWyceny = function(id) {
    if (rolaUsera === "guest") {
        alert("Gość nie może modyfikować wyceny.");
        return;
    }

    wycenaPozycje = wycenaPozycje.filter(p => p.id !== id);
    renderujWycene();
};

function przeliczWycene() {
    const korekta = Number(document.getElementById("wycena-korekta")?.value || 0);
    const mnoznikKorekty = 1 + korekta / 100;

    let sumaNettoPoKorekcie = 0;
    let sumaVAT = 0;

    wycenaPozycje.forEach(p => {
        const rawVat = p.vatProcent;
        const vatProcent = rawVat == null || rawVat === "" ? 23 : Number(rawVat);
        const vatStawka = Number.isFinite(vatProcent) ? vatProcent : 23;
        const nettoPoKorekcie = p.ilosc * p.cenaNetto * mnoznikKorekty;
        const vat = nettoPoKorekcie * (vatStawka / 100);

        sumaNettoPoKorekcie += nettoPoKorekcie;
        sumaVAT += vat;
    });

    const brutto = sumaNettoPoKorekcie + sumaVAT;

    const elNetto = document.getElementById("suma-netto");
    const elVat = document.getElementById("suma-vat");
    const elBrutto = document.getElementById("suma-brutto");

    if (!elNetto || !elVat || !elBrutto) {
        console.error("Brak wymaganych elementów podsumowania wyceny.");
        return {
            netto: sumaNettoPoKorekcie,
            vat: sumaVAT,
            brutto
        };
    }

    elNetto.textContent = `${sumaNettoPoKorekcie.toFixed(2)} PLN`;
    elVat.textContent = `${sumaVAT.toFixed(2)} PLN`;
    elBrutto.textContent = `${brutto.toFixed(2)} PLN`;

    return {
        netto: sumaNettoPoKorekcie,
        vat: sumaVAT,
        brutto
    };
}

function wyczyscWycene() {
    wycenaPozycje = [];
    edytowanyKosztorysId = null;
    trybEdycjiKosztorysu = false;
    document.getElementById("kosztorys-nazwa").value = "";
    document.getElementById("wycena-korekta").value = 0;
    aktualizujTrybEdycjiKosztorysuWidok();
    renderujWycene();
}

function anulujTrybEdycjiKosztorysu() {
    edytowanyKosztorysId = null;
    trybEdycjiKosztorysu = false;
    document.getElementById("kosztorys-nazwa").value = "";
    document.getElementById("wycena-korekta").value = 0;
    wycenaPozycje = [];
    aktualizujTrybEdycjiKosztorysuWidok();
    renderujWycene();
}

function aktualizujTrybEdycjiKosztorysuWidok() {
    const editPanel = document.getElementById("wycena-edit-panel");
    const editName = document.getElementById("wycena-edytowany-nazwa");

    if (!editPanel || !editName) return;

    editPanel.classList.toggle("hidden", !trybEdycjiKosztorysu);
    if (trybEdycjiKosztorysu) {
        editName.textContent = document.getElementById("kosztorys-nazwa").value || "-";
    } else {
        editName.textContent = "";
    }
}

async function zapiszKosztorys() {
    if (rolaUsera === "guest") {
        alert("Gość nie może zapisywać kosztorysów.");
        return;
    }

    const nazwa = document.getElementById("kosztorys-nazwa").value.trim();

    if (!nazwa) {
        alert("Wpisz nazwę kosztorysu lub dane klienta.");
        return;
    }

    if (!wycenaPozycje.length) {
        alert("Dodaj przynajmniej jedną pozycję.");
        return;
    }

    const korekta = Number(document.getElementById("wycena-korekta").value || 0);
    const mnoznikKorekty = 1 + korekta / 100;

    let netto = 0;
    let sumaVAT = 0;

    wycenaPozycje.forEach(p => {
        const vatProcent = Number(p.vatProcent || 23);
        const nettoPoKorekcie = p.ilosc * p.cenaNetto * mnoznikKorekty;
        const vat = nettoPoKorekcie * (vatProcent / 100);

        netto += nettoPoKorekcie;
        sumaVAT += vat;
    });

    const brutto = netto + sumaVAT;

    const payload = {
        nazwa,
        pozycje: wycenaPozycje,
        korekta,
        netto,
        brutto,
        data: new Date().toLocaleDateString("pl-PL"),
        user_id: zalogowanyUser?.id
    };

    // If creating new kosztorys, set default status to 'do_akceptacji'. When editing (PATCH), do not overwrite existing status.
    if (!edytowanyKosztorysId) {
        payload.status = 'do_akceptacji';
    }

    const endpoint = edytowanyKosztorysId
        ? `${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${edytowanyKosztorysId}`
        : `${SUPABASE_URL}/rest/v1/kosztorysy`;

    try {
        const res = await fetch(endpoint, {
            method: edytowanyKosztorysId ? "PATCH" : "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        alert(edytowanyKosztorysId ? "Kosztorys zaktualizowany." : "Kosztorys zapisany.");
        const nazwaLogu = edytowanyKosztorysId ? "Zaktualizowano kosztorys" : "Zapisano kosztorys";
        await pobierzKosztorysy();
        renderujKosztorysy();
        renderujPulpit();
        anulujTrybEdycjiKosztorysu();
        pokazSekcje("kosztorysy");
        zapiszLog("Kosztorysy", nazwaLogu, nazwa);
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać kosztorysu. Sprawdź tabelę kosztorysy i RLS.");
    }
}

// ==========================================
// KOSZTORYSY
// ==========================================

function renderujKosztorysy() {
    const tbody = document.getElementById("tabela-kosztorysow");
    if (!tbody) return;

    let lista = [...kosztorysy];

    const szukaj = document.getElementById("szukaj-kosztorys")?.value.toLowerCase().trim() || "";
    const sort = document.getElementById("sortuj-kosztorys")?.value || "najnowsze";

    if (szukaj) {
        lista = lista.filter(k =>
            String(k.nazwa || "").toLowerCase().includes(szukaj) ||
            String(k.data || "").toLowerCase().includes(szukaj)
        );
    }

    if (sort === "nazwa-az") lista.sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), "pl"));
    if (sort === "brutto-malejaco") lista.sort((a, b) => Number(b.brutto || 0) - Number(a.brutto || 0));
    if (sort === "brutto-rosnaco") lista.sort((a, b) => Number(a.brutto || 0) - Number(b.brutto || 0));

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Brak zapisanych kosztorysów.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(k => {
        const edytuj = rolaUsera !== "guest"
            ? `<button class="btn btn-secondary" onclick="wczytajKosztorys('${esc(k.id)}')">Edytuj</button>`
            : "";
        const usun = rolaUsera === "admin"
            ? `<button class="btn btn-danger" onclick="usunKosztorys('${esc(k.id)}')">Usuń</button>`
            : "";

        // Status display
        const status = String(k.status || 'do_akceptacji').toLowerCase();
        let statusButton = '';
        if (status === 'do_akceptacji' || status === 'do-akceptacji') {
            statusButton = `<button class="btn btn-status btn-status-pending" onclick="akcjaKosztorysu('${esc(k.id)}')">Do akceptacji</button>`;
        } else if (status === 'zaakceptowany' || status === 'akceptacja' || status === 'zaakceptowana') {
            statusButton = `<button class="btn btn-status btn-status-accepted" onclick="akcjaKosztorysu('${esc(k.id)}')">Akceptacja</button>`;
        } else {
            statusButton = `<button class="btn btn-status" onclick="akcjaKosztorysu('${esc(k.id)}')">${esc(status)}</button>`;
        }

        return `
            <tr>
                <td>${esc(k.data)}</td>
                <td><strong>${esc(k.nazwa)}</strong></td>
                <td>${Number(k.netto || 0).toFixed(2)} PLN</td>
                <td>${Number(k.brutto || 0).toFixed(2)} PLN</td>
                <td>${statusButton}</td>
                <td>
                    <div class="table-actions">
                        ${edytuj}
                        <button class="btn btn-secondary" onclick="drukujKosztorys('${esc(k.id)}')">Drukuj</button>
                        ${usun}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

window.drukujKosztorys = function(id) {
    const kosztorys = kosztorysy.find(x => String(x.id) === String(id));
    if (!kosztorys) {
        console.error("Nie znaleziono kosztorysu do druku.");
        return;
    }

    aktualnyDrukowanyKosztorysId = id;
    const modal = document.getElementById("drukuj-kosztorys-modal");
    if (!modal) {
        console.error("Brak panelu wyboru kolumn do druku.");
        return;
    }

    modal.querySelectorAll("input[type=checkbox]").forEach(checkbox => {
        checkbox.checked = true;
    });
    modal.classList.remove("hidden");
};

// Accept kosztorys (mark as zaakceptowany)
window.zaakceptujKosztorys = async function(id, extraData = {}) {
    // Ensure we have latest kosztorys to check zaakceptowany_at
    let existing = kosztorysy.find(x => String(x.id) === String(id));
    if (!existing) {
        await pobierzKosztorysy();
        existing = kosztorysy.find(x => String(x.id) === String(id));
    }

    const payload = { status: 'zaakceptowany', ...extraData };

    // Set zaakceptowany_at only if not already present
    if ((!existing || !existing.zaakceptowany_at) && extraData.zaakceptowany_at === undefined) {
        payload.zaakceptowany_at = formatDateTimeLocal(new Date());
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzKosztorysy();
        renderujKosztorysy();
        zapiszLog('Kosztorysy', 'Oznaczono jako zaakceptowany', id);
    } catch (err) {
        console.error('Błąd aktualizacji statusu kosztorysu:', err);
        alert('Nie udało się zaktualizować statusu kosztorysu.');
    }
};

window.akcjaKosztorysu = async function(id) {
    const kosztorys = kosztorysy.find(x => String(x.id) === String(id));
    if (!kosztorys) return;

    const wybor = prompt(
        'Wybierz opcję dla kosztorysu:\n1 - Tylko oznacz jako zaakceptowany\n2 - Utwórz nową inwestycję z kosztorysu\n3 - Połącz z istniejącą inwestycją',
        '1'
    );
    if (!wybor) return;

    const opcja = wybor.trim();
    if (!['1', '2', '3'].includes(opcja)) {
        alert('Wybierz 1, 2 lub 3.');
        return;
    }

    if (opcja === '1') {
        await zaakceptujKosztorys(id);
        return;
    }

    if (opcja === '2') {
        const inwestycja = await utworzNowaInwestycjaZKosztorysu(kosztorys);
        if (inwestycja && inwestycja.id) {
            await zaakceptujKosztorys(id, { inwestycja_id: inwestycja.id });
            zapiszLog('Kosztorysy', 'Połączono kosztorys z nową inwestycją', id);
        }
        return;
    }

    if (opcja === '3') {
        await polaczZIstniejacaInwestycja(kosztorys);
        return;
    }
};

function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function utworzNowaInwestycjaZKosztorysu(kosztorys) {
    await pobierzInwestycje();

    const payload = {
        nazwa: kosztorys.nazwa || 'Inwestycja z kosztorysu',
        klient: kosztorys.klient || '',
        adres: kosztorys.adres || '',
        status: 'aktywna',
        opis: `Utworzono z kosztorysu ${kosztorys.id}`,
        user_id: zalogowanyUser?.id || null
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        await pobierzInwestycje();
        renderujInwestycje();
        if (Array.isArray(data) && data.length) {
            return data[0];
        }
        return data;
    } catch (err) {
        console.error('Błąd tworzenia inwestycji z kosztorysu:', err);
        alert('Nie udało się utworzyć inwestycji z kosztorysu.');
        return null;
    }
}

async function polaczZIstniejacaInwestycja(kosztorys) {
    await pobierzInwestycje();

    if (!inwestycje.length) {
        alert('Brak dostępnych inwestycji do połączenia.');
        return;
    }
    // Show a numbered list to the user (number - nazwa - klient). User inputs number (1-based).
    const lines = inwestycje.map((i, idx) => `${idx + 1} - ${i.nazwa || '-'} - ${i.klient || '-'}`);
    const promptText = `Wybierz numer inwestycji, z którą chcesz połączyć kosztorys:\n${lines.join('\n')}`;
    const wybor = prompt(promptText, '1');
    if (!wybor) return;

    const num = Number(wybor.trim());
    if (!Number.isInteger(num) || num < 1 || num > inwestycje.length) {
        alert('Nieprawidłowy wybór inwestycji.');
        return;
    }

    const chosen = inwestycje[num - 1];
    if (!chosen) {
        alert('Nieprawidłowy wybór inwestycji.');
        return;
    }

    // Prepare extra data: set inwestycja_id and ensure zaakceptowany_at if missing
    const extra = { inwestycja_id: chosen.id };
    if (!kosztorys.zaakceptowany_at) extra.zaakceptowany_at = formatDateTimeLocal(new Date());

    await zaakceptujKosztorys(kosztorys.id, extra);
    alert('Kosztorys połączony z inwestycją.');
    zapiszLog('Kosztorysy', 'Połączono kosztorys z istniejącą inwestycją', kosztorys.id);
}

function pobierzOpcjeDrukuKosztorysu() {
    const options = {
        jednostka: document.getElementById("drukuj-kolumna-jednostka")?.checked,
        ilosc: document.getElementById("drukuj-kolumna-ilosc")?.checked,
        cenaNetto: document.getElementById("drukuj-kolumna-cenaNetto")?.checked,
        wartoscNetto: document.getElementById("drukuj-kolumna-wartoscNetto")?.checked,
        vat: document.getElementById("drukuj-kolumna-vat")?.checked,
        brutto: document.getElementById("drukuj-kolumna-brutto")?.checked
    };

    if (!Object.values(options).some(Boolean)) {
        alert("Wybierz przynajmniej jedną kolumnę.");
        return null;
    }

    return options;
}

function zamknijModalDrukuKosztorysu() {
    const modal = document.getElementById("drukuj-kosztorys-modal");
    if (modal) modal.classList.add("hidden");
    aktualnyDrukowanyKosztorysId = null;
}

function pokazModalDrukuInwestycji() {
    const modal = document.getElementById("drukuj-inwestycje-modal");
    if (!modal) return;
    // default all checked
    modal.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = true);
    modal.classList.remove("hidden");

    const btnPreview = document.getElementById("btn-podglad-drukuj-inwestycje");
    if (btnPreview) btnPreview.onclick = () => {
        const options = pobierzOpcjeDrukuInwestycji();
        if (!options) return;
        drukujInwestycjeDoOkna(options);
    };

    const btnClose = document.getElementById("btn-zamknij-drukuj-inwestycje");
    if (btnClose) btnClose.onclick = zamknijModalDrukuInwestycji;
}

function zamknijModalDrukuInwestycji() {
    const modal = document.getElementById("drukuj-inwestycje-modal");
    if (modal) modal.classList.add("hidden");
}

function pobierzOpcjeDrukuInwestycji() {
    const options = {
        dane: document.getElementById("drukuj-inw-dane")?.checked,
        kosztorys: document.getElementById("drukuj-inw-kosztorys")?.checked,
        prace: document.getElementById("drukuj-inw-prace")?.checked,
        zaliczki: document.getElementById("drukuj-inw-zaliczki")?.checked,
        koszty: document.getElementById("drukuj-inw-koszty")?.checked,
        podsumowanie: document.getElementById("drukuj-inw-podsumowanie")?.checked,
        uwagi: document.getElementById("drukuj-inw-uwagi")?.checked
    };

    if (!Object.values(options).some(Boolean)) {
        alert("Wybierz przynajmniej jedną pozycję do wydruku.");
        return null;
    }

    return options;
}

function drukujInwestycjeDoOkna(options) {
    zamknijModalDrukuInwestycji();
    if (!aktywnaInwestycjaId) {
        alert("Brak otwartej inwestycji do wydruku.");
        return;
    }

    const inwestycja = inwestycje.find(i => String(i.id) === String(aktywnaInwestycjaId));
    if (!inwestycja) {
        alert("Nie znaleziono inwestycji do wydruku.");
        return;
    }

    // collect data
    const zaliczki = inwestycjeZaliczki.filter(z => String(z.inwestycja_id) === String(aktywnaInwestycjaId));
    const koszty = inwestycjeKoszty.filter(k => String(k.inwestycja_id) === String(aktywnaInwestycjaId));
    const prace = inwestycjePraceDodatkowe.filter(p => String(p.inwestycja_id) === String(aktywnaInwestycjaId));
    const kosztorys = kosztorysy.find(k => String(k.inwestycja_id) === String(aktywnaInwestycjaId));

    const sumaZaliczek = zaliczki.reduce((sum, z) => sum + Number(z.kwota || 0), 0);
    const sumaKosztow = koszty.reduce((sum, k) => sum + Number(k.kwota || 0), 0);
    const sumaPraceBrutto = prace.reduce((s, p) => s + Number(p.brutto || 0), 0);
    // kosztorys is a single object (or undefined). Use its brutto directly.
    const robociznaBrutto = kosztorys ? Number(kosztorys.brutto || 0) : 0;

    const razemDoRozliczenia = robociznaBrutto + sumaPraceBrutto + sumaKosztow;
    const pozostaloDoZaplaty = razemDoRozliczenia - sumaZaliczek;
    const bilansGotowki = sumaZaliczek - sumaKosztow;

    // Build HTML parts based on options
    let kosztorysHtml = "";
    if (options.kosztorys) {
        if (!kosztorys) {
            kosztorysHtml = `<p>Brak powiązanego kosztorysu robocizny.</p>`;
        } else {
            kosztorysHtml = `
                <table>
                    <thead><tr><th>Nazwa</th><th>Netto</th><th>Brutto</th><th>Status</th></tr></thead>
                    <tbody>
                        <tr>
                            <td>${esc(kosztorys.nazwa || "")}</td>
                            <td>${Number(kosztorys.netto || 0).toFixed(2)} PLN</td>
                            <td>${Number(kosztorys.brutto || 0).toFixed(2)} PLN</td>
                            <td>${esc(kosztorys.status || "-")}</td>
                        </tr>
                    </tbody>
                </table>
            `;
        }
    }

    let praceHtml = "";
    if (options.prace) {
        if (!prace.length) {
            praceHtml = `<p>Brak prac dodatkowych.</p>`;
        } else {
            const rows = prace.map(p => `
                <tr>
                    <td>${esc(p.nazwa || "")}</td>
                    <td>${Number(p.ilosc || 0)}</td>
                    <td>${Number(p.cena_netto || 0).toFixed(2)} PLN</td>
                    <td>${Number(p.vat || 0)}%</td>
                    <td>${Number(p.netto || 0).toFixed(2)} PLN</td>
                    <td>${Number(p.brutto || 0).toFixed(2)} PLN</td>
                    <td>${esc(p.opis || "")}</td>
                </tr>
            `).join("");

            praceHtml = `
                <table>
                    <thead><tr><th>Nazwa</th><th>Ilość</th><th>Cena netto</th><th>VAT</th><th>Netto</th><th>Brutto</th><th>Opis</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        }
    }

    let zaliczkiHtml = "";
    if (options.zaliczki) {
        if (!zaliczki.length) zaliczkiHtml = `<p>Brak zaliczek.</p>`;
        else {
            const rows = zaliczki.map(z => `
                <tr>
                    <td>${esc(z.data)}</td>
                    <td>${Number(z.kwota || 0).toFixed(2)} PLN</td>
                    <td>${esc(z.sposob_platnosci || "-")}</td>
                    <td>${esc(z.opis || "")}</td>
                </tr>
            `).join("");
            zaliczkiHtml = `<table><thead><tr><th>Data</th><th>Kwota</th><th>Płatność</th><th>Opis</th></tr></thead><tbody>${rows}</tbody></table>`;
        }
    }

    let kosztyHtml = "";
    if (options.koszty) {
        if (!koszty.length) kosztyHtml = `<p>Brak kosztów.</p>`;
        else {
            const rows = koszty.map(k => `
                <tr>
                    <td>${esc(k.data)}</td>
                    <td>${Number(k.kwota || 0).toFixed(2)} PLN</td>
                    <td>${esc(k.kategoria || "-")}</td>
                    <td>${esc(k.opis || "")}</td>
                </tr>
            `).join("");
            kosztyHtml = `<table><thead><tr><th>Data</th><th>Kwota</th><th>Kategoria</th><th>Opis</th></tr></thead><tbody>${rows}</tbody></table>`;
        }
    }

    let podsumowanieHtml = "";
    if (options.podsumowanie) {
        podsumowanieHtml = `
            <table class="summary">
                <tr><td>Robocizna (kosztorys) brutto</td><td style="text-align:right">${Number(kosztorys?.brutto || 0).toFixed(2)} PLN</td></tr>
                <tr><td>Prace dodatkowe brutto</td><td style="text-align:right">${sumaPraceBrutto.toFixed(2)} PLN</td></tr>
                <tr><td>Koszty materiałowe</td><td style="text-align:right">${sumaKosztow.toFixed(2)} PLN</td></tr>
                <tr><td><strong>Razem do rozliczenia</strong></td><td style="text-align:right"><strong>${razemDoRozliczenia.toFixed(2)} PLN</strong></td></tr>
                <tr><td>Zaliczki</td><td style="text-align:right">${sumaZaliczek.toFixed(2)} PLN</td></tr>
                <tr><td><strong>Pozostało do zapłaty</strong></td><td style="text-align:right"><strong>${pozostaloDoZaplaty.toFixed(2)} PLN</strong></td></tr>
                <tr><td>Bilans gotówki (zaliczki - koszty materiałowe)</td><td style="text-align:right">${bilansGotowki.toFixed(2)} PLN</td></tr>
            </table>
        `;
    }

    // Prepare printed notes: remove technical creation IDs and replace with friendly sentence when appropriate
    let printOpis = inwestycja.opis || "";
    if (printOpis) {
        // match pattern like: Utworzono z kosztorysu <id>
        const match = printOpis.match(/Utworzono z kosztorysu\s+([A-Za-z0-9-]+)/);
        if (match) {
            // remove the technical phrase
            printOpis = printOpis.replace(match[0], '').trim();
            // only show friendly sentence if there is actually a linked kosztorys for this investment
            if (kosztorys) {
                const friendly = 'Rozliczenie utworzone na podstawie zaakceptowanego kosztorysu robocizny.';
                // if other notes exist, append sentence; otherwise use only the sentence
                printOpis = printOpis ? (printOpis + '\n' + friendly) : friendly;
            }
        }
    }

    const uwagiHtml = options.uwagi && printOpis ? `<div class="section"><h2>Uwagi</h2><p>${esc(printOpis)}</p></div>` : "";

    const html = `
        <!DOCTYPE html>
        <html lang="pl">
        <head>
            <meta charset="UTF-8">
            <title>Rozliczenie inwestycji</title>
            <style>
                @page { margin: 10mm; }
                body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 0; color: #111; }
                h1 { font-size: 22px; margin: 0 0 8px 0; }
                h2 { font-size: 16px; margin: 6px 0 4px 0; }
                p { margin: 2px 0; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 4px; }
                thead { display: table-header-group; }
                tbody { display: table-row-group; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; font-size: 11px; }
                th { background: #f2f2f2; font-weight: bold; }
                .section { margin-bottom: 6px; }
                .summary { width: 100%; break-inside: avoid; page-break-inside: avoid; }
                .summary td { border: none; padding: 3px 6px; font-size: 11px; }
                .summary tr { break-inside: avoid; page-break-inside: avoid; }
            </style>
        </head>
        <body>
            <h1>EL-Net — Rozliczenie inwestycji</h1>
            ${options.dane ? `
            <div class="section">
                <h2>Inwestycja</h2>
                <p><strong>Nazwa:</strong> ${esc(inwestycja.nazwa || "-")}</p>
                <p><strong>Klient:</strong> ${esc(inwestycja.klient || "-")}</p>
                <p><strong>Adres:</strong> ${esc(inwestycja.adres || "-")}</p>
                <p><strong>Status:</strong> ${esc(inwestycja.status || "-")}</p>
            </div>
            ` : ``}

            ${options.kosztorys ? `<div class="section"><h2>Kosztorys robocizny</h2>${kosztorysHtml}</div>` : ''}
            ${options.prace ? `<div class="section"><h2>Prace dodatkowe</h2>${praceHtml}</div>` : ''}
            ${options.zaliczki ? `<div class="section"><h2>Zaliczki</h2>${zaliczkiHtml}</div>` : ''}
            ${options.koszty ? `<div class="section"><h2>Koszty materiałowe</h2>${kosztyHtml}</div>` : ''}
            ${options.podsumowanie ? `<div class="section"><h2>Podsumowanie końcowe</h2>${podsumowanieHtml}</div>` : ''}
            ${uwagiHtml}
        </body>
        </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) { alert("Nie udało się otworzyć okna drukowania."); return; }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    zapiszLog("Inwestycje", "Druk rozliczenia (wybrane elementy)", inwestycja.nazwa);
}

function drukujKosztorysDoOkna(id, options) {
    zamknijModalDrukuKosztorysu();

    const kosztorys = kosztorysy.find(x => String(x.id) === String(id));
    if (!kosztorys) {
        console.error("Nie znaleziono kosztorysu do druku.");
        return;
    }

    let pozycje = kosztorys.pozycje;
    if (typeof pozycje === "string") {
        try {
            pozycje = JSON.parse(pozycje);
        } catch (err) {
            console.error("Błąd parsowania pozycji kosztorysu:", err);
            return;
        }
    }

    if (!Array.isArray(pozycje)) {
        console.error("Niepoprawny format pozycji kosztorysu.");
        return;
    }

    const columns = [
        { key: "nazwa", label: "Nazwa", visible: true },
        { key: "jednostka", label: "Jednostka", visible: options.jednostka },
        { key: "ilosc", label: "Ilość", visible: options.ilosc },
        { key: "cenaNetto", label: "Cena netto", visible: options.cenaNetto },
        { key: "wartoscNetto", label: "Wartość netto", visible: options.wartoscNetto },
        { key: "vat", label: "VAT", visible: options.vat },
        { key: "brutto", label: "Brutto", visible: options.brutto }
    ];

    const headers = columns.filter(c => c.visible).map(c => `<th>${c.label}</th>`).join("");

    let sumaNetto = 0;
    let sumaVAT = 0;
    let sumaBrutto = 0;

    const rows = pozycje.map(p => {
        const vatProcent = p.vatProcent == null || p.vatProcent === "" ? 23 : Number(p.vatProcent);
        const vatPerc = Number.isFinite(vatProcent) ? vatProcent : 23;
        const netto = Number(p.ilosc || 0) * Number(p.cenaNetto || 0);
        const vat = netto * (vatPerc / 100);
        const brutto = netto + vat;

        sumaNetto += netto;
        sumaVAT += vat;
        sumaBrutto += brutto;

        const rowCells = [
            `<td>${esc(p.nazwa || "")}</td>`,
            options.jednostka ? `<td>${esc(p.jednostka || "")}</td>` : "",
            options.ilosc ? `<td>${Number(p.ilosc || 0).toFixed(2)}</td>` : "",
            options.cenaNetto ? `<td>${Number(p.cenaNetto || 0).toFixed(2)} PLN</td>` : "",
            options.wartoscNetto ? `<td>${netto.toFixed(2)} PLN</td>` : "",
            options.vat ? `<td>${vatPerc}%</td>` : "",
            options.brutto ? `<td>${brutto.toFixed(2)} PLN</td>` : ""
        ];

        return `<tr>${rowCells.join("")}</tr>`;
    }).join("");

    const vatPodsumowanie = Number.isFinite(Number(kosztorys.vat)) ? Number(kosztorys.vat) : sumaVAT;
    const bruttoPodsumowanie = Number.isFinite(Number(kosztorys.brutto)) ? Number(kosztorys.brutto) : sumaNetto + vatPodsumowanie;
    const nettoPodsumowanie = Number.isFinite(Number(kosztorys.netto)) ? Number(kosztorys.netto) : sumaNetto;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        console.error("Nie udało się otworzyć okna do druku.");
        return;
    }

    const html = `
        <!DOCTYPE html>
        <html lang="pl">
        <head>
            <meta charset="UTF-8">
            <title>Kosztorys</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1, h2, h3 { margin: 0 0 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
                th { background: #f0f0f0; }
                .summary { margin-top: 20px; width: 100%; }
                .summary td { border: none; padding: 4px 8px; }
                .summary .label { width: 80%; }
                .summary .value { text-align: right; }
            </style>
        </head>
        <body>
            <h1>Kosztorys</h1>
            <h2>${esc(kosztorys.nazwa || "")}</h2>
            <p>Data: ${esc(kosztorys.data || "-")}</p>
            <table>
                <thead>
                    <tr>${headers}</tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            <table class="summary">
                <tr>
                    <td class="label"><strong>Netto</strong></td>
                    <td class="value">${nettoPodsumowanie.toFixed(2)} PLN</td>
                </tr>
                <tr>
                    <td class="label"><strong>VAT</strong></td>
                    <td class="value">${vatPodsumowanie.toFixed(2)} PLN</td>
                </tr>
                <tr>
                    <td class="label"><strong>Brutto</strong></td>
                    <td class="value">${bruttoPodsumowanie.toFixed(2)} PLN</td>
                </tr>
            </table>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    zapiszLog("Kosztorysy", "Druk kosztorysu", kosztorys.nazwa);
};

window.drukujInwestycje = function() {
    if (!aktywnaInwestycjaId) {
        alert("Brak otwartej inwestycji do wydruku.");
        return;
    }

    const inwestycja = inwestycje.find(i => String(i.id) === String(aktywnaInwestycjaId));
    if (!inwestycja) {
        alert("Nie znaleziono inwestycji do wydruku.");
        return;
    }

    const zaliczki = inwestycjeZaliczki.filter(z => String(z.inwestycja_id) === String(aktywnaInwestycjaId));
    const koszty = inwestycjeKoszty.filter(k => String(k.inwestycja_id) === String(aktywnaInwestycjaId));
    const sumaZaliczek = zaliczki.reduce((sum, z) => sum + Number(z.kwota || 0), 0);
    const sumaKosztow = koszty.reduce((sum, k) => sum + Number(k.kwota || 0), 0);
    const roznica = sumaZaliczek - sumaKosztow;
    const dataWydruku = new Date().toLocaleDateString("pl-PL");

    const zaliczkiHtml = zaliczki.length
        ? zaliczki.map(z => `
                <tr>
                    <td>${esc(z.data)}</td>
                    <td>${Number(z.kwota || 0).toFixed(2)} PLN</td>
                    <td>${esc(z.sposob_platnosci || "-")}</td>
                    <td>${esc(z.opis || "")}</td>
                </tr>
            `).join("")
        : `<tr><td colspan="4">Brak zaliczek</td></tr>`;

    const kosztyHtml = koszty.length
        ? koszty.map(k => `
                <tr>
                    <td>${esc(k.data)}</td>
                    <td>${Number(k.kwota || 0).toFixed(2)} PLN</td>
                    <td>${esc(k.kategoria || "-")}</td>
                    <td>${esc(k.opis || "")}</td>
                </tr>
            `).join("")
        : `<tr><td colspan="4">Brak kosztów</td></tr>`;

    const html = `
        <html>
        <head>
            <meta charset="UTF-8">
            <title>EL-Net — Rozliczenie inwestycji</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
                h1, h2 { margin: 0 0 12px; }
                p { margin: 4px 0; }
                .section { margin-top: 18px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #333; padding: 8px 10px; text-align: left; }
                th { background: #f2f2f2; }
                .summary-box { margin: 6px 0; }
                .summary-box strong { display: inline-block; min-width: 120px; }
            </style>
        </head>
        <body>
            <h1>EL-Net — Rozliczenie inwestycji</h1>
            <div class="section">
                <h2>Inwestycja</h2>
                <p><strong>Nazwa:</strong> ${esc(inwestycja.nazwa || "-")}</p>
                <p><strong>Klient:</strong> ${esc(inwestycja.klient || "-")}</p>
                <p><strong>Adres:</strong> ${esc(inwestycja.adres || "-")}</p>
                <p><strong>Status:</strong> ${esc(inwestycja.status || "-")}</p>
                <p><strong>Data wydruku:</strong> ${esc(dataWydruku)}</p>
            </div>

            <div class="section">
                <h2>Podsumowanie</h2>
                <p class="summary-box"><strong>Suma zaliczek:</strong> ${sumaZaliczek.toFixed(2)} PLN</p>
                <p class="summary-box"><strong>Suma kosztów:</strong> ${sumaKosztow.toFixed(2)} PLN</p>
                <p class="summary-box"><strong>Różnica:</strong> ${roznica.toFixed(2)} PLN</p>
            </div>

            <div class="section">
                <h2>Zaliczki</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Kwota</th>
                            <th>Sposób płatności</th>
                            <th>Opis</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${zaliczkiHtml}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>Koszty</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Kwota</th>
                            <th>Kategoria</th>
                            <th>Opis</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${kosztyHtml}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("Nie udało się otworzyć okna drukowania.");
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    zapiszLog("Inwestycje", "Druk rozliczenia", inwestycja.nazwa);
};

window.wczytajKosztorys = function(id) {
    if (rolaUsera === "guest") {
        alert("Gość nie może edytować kosztorysów.");
        return;
    }

    const k = kosztorysy.find(x => String(x.id) === String(id));
    if (!k) return;

    try {
        wycenaPozycje = typeof k.pozycje === "string" ? JSON.parse(k.pozycje) : k.pozycje || [];
    } catch {
        wycenaPozycje = [];
    }

    document.getElementById("kosztorys-nazwa").value = k.nazwa || "";
    document.getElementById("wycena-korekta").value = k.korekta || 0;
    edytowanyKosztorysId = k.id;
    trybEdycjiKosztorysu = true;
    aktualizujTrybEdycjiKosztorysuWidok();

    renderujWycene();
    pokazSekcje("wycena");
};

window.usunKosztorys = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może usuwać kosztorysy.");
        return;
    }

    if (!confirm("Usunąć kosztorys?")) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${id}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzKosztorysy();
        renderujKosztorysy();
        renderujPulpit();
        zapiszLog("Kosztorysy", "Usunięto kosztorys", id);
    } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć kosztorysu.");
    }
};

// ==========================================
// INWESTYCJE
// ==========================================

function sumaZaliczekDlaInwestycji(inwestycjaId) {
    return inwestycjeZaliczki
        .filter(z => String(z.inwestycja_id) === String(inwestycjaId))
        .reduce((s, z) => s + Number(z.kwota || 0), 0);
}

function sumaKosztowDlaInwestycji(inwestycjaId) {
    return inwestycjeKoszty
        .filter(k => String(k.inwestycja_id) === String(inwestycjaId))
        .reduce((s, k) => s + Number(k.kwota || 0), 0);
}

function renderujInwestycje() {
    const tbody = document.getElementById("tabela-inwestycji");
    if (!tbody) return;

    let lista = [...(inwestycje || [])];
    const searchValue = document.getElementById("inwestycje-search")?.value.toLowerCase().trim() || "";
    const sortValue = document.getElementById("inwestycje-sort")?.value || "newest";

    if (searchValue) {
        lista = lista.filter(i => {
            const combined = [i.nazwa, i.klient, i.adres, i.status]
                .map(v => String(v || "").toLowerCase())
                .join(" ");
            return combined.includes(searchValue);
        });
    }

    if (sortValue === "newest") {
        lista.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (sortValue === "oldest") {
        lista.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } else if (sortValue === "name-az") {
        lista.sort((a, b) => String(a.nazwa || "").localeCompare(String(b.nazwa || ""), 'pl'));
    } else if (sortValue === "name-za") {
        lista.sort((a, b) => String(b.nazwa || "").localeCompare(String(a.nazwa || ""), 'pl'));
    } else if (sortValue === "client-az") {
        lista.sort((a, b) => String(a.klient || "").localeCompare(String(b.klient || ""), 'pl'));
    } else if (sortValue === "balance-desc") {
        lista.sort((a, b) => {
            const aBalance = sumaZaliczekDlaInwestycji(a.id) - sumaKosztowDlaInwestycji(a.id);
            const bBalance = sumaZaliczekDlaInwestycji(b.id) - sumaKosztowDlaInwestycji(b.id);
            return bBalance - aBalance;
        });
    } else if (sortValue === "balance-asc") {
        lista.sort((a, b) => {
            const aBalance = sumaZaliczekDlaInwestycji(a.id) - sumaKosztowDlaInwestycji(a.id);
            const bBalance = sumaZaliczekDlaInwestycji(b.id) - sumaKosztowDlaInwestycji(b.id);
            return aBalance - bBalance;
        });
    }

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Brak inwestycji w bazie.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(i => {
        const statusClass = `status-${String(i.status || "aktywna").toLowerCase()}`;
        const zaliczki = sumaZaliczekDlaInwestycji(i.id);
        const koszty = sumaKosztowDlaInwestycji(i.id);
        const roznica = zaliczki - koszty;

        const akcje = rolaUsera === "admin"
            ? `<button class="btn btn-secondary small-btn" onclick="edytujInwestycje('${esc(i.id)}')">Edytuj</button><button class="btn btn-danger small-btn" onclick="usunInwestycje('${esc(i.id)}')">Usuń</button>`
            : "";

        return `
            <tr>
                <td><strong>${esc(i.nazwa)}</strong><br><small>${esc(i.adres || "")}</small></td>
                <td>${esc(i.klient || "-")}</td>
                <td class="nowrap-cell">${zaliczki.toFixed(2)} PLN</td>
                <td class="nowrap-cell">${koszty.toFixed(2)} PLN</td>
                <td class="nowrap-cell"><strong>${roznica.toFixed(2)} PLN</strong></td>
                <td><div class="table-actions investycje-actions"><button class="btn btn-secondary small-btn" onclick="otworzInwestycje('${esc(i.id)}')">Otwórz</button>${akcje}</div></td>
            </tr>
        `;
    }).join("");

    if (aktywnaInwestycjaId) {
        renderujPanelInwestycji();
    }
}

async function dodajInwestycje() {
    if (rolaUsera === "guest") {
        alert("Gość nie może dodawać inwestycji.");
        return;
    }

    const nazwa = document.getElementById("inwestycja-nazwa").value.trim();
    const klient = document.getElementById("inwestycja-klient").value.trim();
    const adres = document.getElementById("inwestycja-adres").value.trim();
    const status = document.getElementById("inwestycja-status").value;

    if (!nazwa) {
        alert("Wpisz nazwę inwestycji.");
        return;
    }

    const payload = {
        nazwa,
        klient,
        adres,
        status,
        opis: "",
        user_id: zalogowanyUser?.id
    };

    const akcjaInwestycji = edytowanaInwestycjaId ? "Edytowano inwestycję" : "Dodano inwestycję";

    try {
        let res;

        if (edytowanaInwestycjaId) {
            res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${edytowanaInwestycjaId}`, {
                method: "PATCH",
                headers: headers(),
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) throw new Error(await res.text());

        document.getElementById("inwestycja-nazwa").value = "";
        document.getElementById("inwestycja-klient").value = "";
        document.getElementById("inwestycja-adres").value = "";
        document.getElementById("inwestycja-status").value = "aktywna";
        edytowanaInwestycjaId = null;

        const btnDodaj = document.getElementById("btn-dodaj-inwestycje");
        if (btnDodaj) btnDodaj.textContent = "Dodaj inwestycję";

        const btnAnuluj = document.getElementById("btn-anuluj-inwestycje");
        if (btnAnuluj) btnAnuluj.classList.add("hidden");

        await pobierzInwestycje();
        renderujInwestycje();
        renderujPulpit();
        zapiszLog("Inwestycje", akcjaInwestycji, nazwa);
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać inwestycji. Sprawdź tabelę inwestycje i RLS.");
    }
}

window.otworzInwestycje = function(id) {
    aktywnaInwestycjaId = id;
    renderujPanelInwestycji();

    const panel = document.getElementById("panel-inwestycji");
    if (panel) {
        panel.classList.remove("hidden");
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
};

window.edytujInwestycje = function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może edytować inwestycje.");
        return;
    }

    const inwestycja = inwestycje.find(i => String(i.id) === String(id));
    if (!inwestycja) return;

    edytowanaInwestycjaId = inwestycja.id;
    document.getElementById("inwestycja-nazwa").value = inwestycja.nazwa || "";
    document.getElementById("inwestycja-klient").value = inwestycja.klient || "";
    document.getElementById("inwestycja-adres").value = inwestycja.adres || "";
    document.getElementById("inwestycja-status").value = inwestycja.status || "aktywna";

    const btnDodaj = document.getElementById("btn-dodaj-inwestycje");
    if (btnDodaj) btnDodaj.textContent = "Zapisz zmiany";

    const btnAnuluj = document.getElementById("btn-anuluj-inwestycje");
    if (btnAnuluj) btnAnuluj.classList.remove("hidden");
};

function anulujEdycjeInwestycji() {
    edytowanaInwestycjaId = null;
    document.getElementById("inwestycja-nazwa").value = "";
    document.getElementById("inwestycja-klient").value = "";
    document.getElementById("inwestycja-adres").value = "";
    document.getElementById("inwestycja-status").value = "aktywna";

    const btnDodaj = document.getElementById("btn-dodaj-inwestycje");
    if (btnDodaj) btnDodaj.textContent = "Dodaj inwestycję";

    const btnAnuluj = document.getElementById("btn-anuluj-inwestycje");
    if (btnAnuluj) btnAnuluj.classList.add("hidden");
}

function zamknijPanelInwestycji() {
    aktywnaInwestycjaId = null;

    const panel = document.getElementById("panel-inwestycji");
    if (panel) {
        panel.classList.add("hidden");
    }
}

window.usunInwestycje = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może usuwać inwestycje.");
        return;
    }

    if (!confirm("Usunąć inwestycję razem z jej zaliczkami i kosztami?")) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${id}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzInwestycje();
        await pobierzInwestycjeZaliczki();
        await pobierzInwestycjeKoszty();
        renderujInwestycje();
        renderujPulpit();
        zapiszLog("Inwestycje", "Usunięto inwestycję", id);

        if (String(aktywnaInwestycjaId) === String(id)) {
            zamknijPanelInwestycji();
        }
    } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć inwestycji.");
    }
}

function renderujPanelInwestycji() {
    const inwestycja = inwestycje.find(i => String(i.id) === String(aktywnaInwestycjaId));
    if (!inwestycja) return;

    const title = document.getElementById("wybrana-inwestycja-title");
    if (title) {
        title.textContent = `${inwestycja.nazwa} — ${inwestycja.klient || "bez klienta"}`;
    }

    const zaliczkiLista = inwestycjeZaliczki.filter(z => String(z.inwestycja_id) === String(aktywnaInwestycjaId));
    const kosztyLista = inwestycjeKoszty.filter(k => String(k.inwestycja_id) === String(aktywnaInwestycjaId));

    const sumaZaliczek = zaliczkiLista.reduce((s, z) => s + Number(z.kwota || 0), 0);
    const sumaKosztow = kosztyLista.reduce((s, k) => s + Number(k.kwota || 0), 0);
    const roznica = sumaZaliczek - sumaKosztow;

    document.getElementById("inwestycja-suma-zaliczki").textContent = `${sumaZaliczek.toFixed(2)} PLN`;
    document.getElementById("inwestycja-suma-koszty").textContent = `${sumaKosztow.toFixed(2)} PLN`;
    document.getElementById("inwestycja-roznica").textContent = `${roznica.toFixed(2)} PLN`;

    renderujTabeleZaliczek(zaliczkiLista);
    renderujTabeleKosztow(kosztyLista);
    renderujPowiazaneKosztorysyInwestycji();
    renderujPraceDodatkoweInwestycji();
    renderujSelectPracDodatkowych();
}

function renderujPraceDodatkoweInwestycji() {
    const containerSum = document.getElementById("inwestycja-prace-dodatkowe-suma");
    const tbody = document.getElementById("tabela-prace-dodatkowe");
    if (!containerSum || !tbody) return;

    const related = inwestycjePraceDodatkowe.filter(p => String(p.inwestycja_id) === String(aktywnaInwestycjaId));
    if (!related.length) {
        containerSum.textContent = `0.00 PLN`;
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Brak prac dodatkowych.</td></tr>`;
        return;
    }

    const sumBrutto = related.reduce((s, p) => s + Number(p.brutto || 0), 0);
    containerSum.textContent = `${sumBrutto.toFixed(2)} PLN`;

    tbody.innerHTML = related.map(p => {
        const akcja = rolaUsera === "admin"
            ? `<button class="btn btn-danger small-btn" onclick="usunPraceDodatkowa('${esc(p.id)}')">Usuń</button>`
            : "";

        return `
            <tr>
                <td>${esc(p.nazwa || "")}</td>
                <td>${Number(p.ilosc || 0)}</td>
                <td>${Number(p.cena_netto || 0).toFixed(2)} PLN</td>
                <td>${Number(p.vat || 0)}%</td>
                <td>${Number(p.netto || 0).toFixed(2)} PLN</td>
                <td>${Number(p.brutto || 0).toFixed(2)} PLN</td>
                <td>${esc(p.opis || "")}</td>
                <td>${akcja}</td>
            </tr>
        `;
    }).join("");
}

function renderujPowiazaneKosztorysyInwestycji() {
    const container = document.getElementById("powiazane-kosztorysy");
    if (!container) return;

    const related = kosztorysy.filter(k => String(k.inwestycja_id) === String(aktywnaInwestycjaId));
    if (!related.length) {
        container.innerHTML = `
            <h2>Powiązany kosztorys robocizny</h2>
            <p>Brak powiązanego kosztorysu robocizny dla tej inwestycji.</p>
        `;
        return;
    }

    const itemsHtml = related.map(k => {
        const statusLabel = k.status === "zaakceptowany"
            ? `<span class="status-tag status-tag-success">zaakceptowany</span>`
            : k.status === "do_akceptacji"
                ? `<span class="status-tag status-tag-warning">do akceptacji</span>`
                : `<span class="status-tag">${esc(k.status || "nieznany")}</span>`;

        const printButton = `<button class="btn btn-secondary small-btn" onclick="drukujKosztorys('${esc(k.id)}')">Drukuj</button>`;

        return `
            <div class="linked-item">
                <h3>${esc(k.nazwa || "Kosztorys robocizny")}</h3>
                <p><strong>Netto:</strong> ${Number(k.netto || 0).toFixed(2)} PLN</p>
                <p><strong>Brutto:</strong> ${Number(k.brutto || 0).toFixed(2)} PLN</p>
                <p><strong>Klient:</strong> ${esc(k.klient || "nie podano")}</p>
                <p><strong>Status:</strong> ${statusLabel}</p>
                <p><strong>Data utworzenia:</strong> ${esc(k.data || "-")}</p>
                <div class="button-row">${printButton}</div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <h2>Powiązany kosztorys robocizny</h2>
        ${itemsHtml}
    `;
}

function renderujTabeleZaliczek(lista) {
    const tbody = document.getElementById("tabela-zaliczek");
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Brak zaliczek.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(z => {
        const akcja = rolaUsera === "admin"
            ? `<button class="btn btn-danger small-btn" onclick="usunZaliczke('${esc(z.id)}')">Usuń</button>`
            : "";

        return `
            <tr>
                <td>${esc(z.data)}</td>
                <td><strong>${Number(z.kwota || 0).toFixed(2)} PLN</strong></td>
                <td>${esc(z.sposob_platnosci || "-")}</td>
                <td>${esc(z.opis || "")}</td>
                <td>${akcja}</td>
            </tr>
        `;
    }).join("");
}

function renderujTabeleKosztow(lista) {
    const tbody = document.getElementById("tabela-kosztow");
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Brak kosztów.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(k => {
        const akcja = rolaUsera === "admin"
            ? `<button class="btn btn-danger small-btn" onclick="usunKoszt('${esc(k.id)}')">Usuń</button>`
            : "";

        return `
            <tr>
                <td>${esc(k.data)}</td>
                <td><strong>${Number(k.kwota || 0).toFixed(2)} PLN</strong></td>
                <td>${esc(k.kategoria || "-")}</td>
                <td>${esc(k.opis || "")}</td>
                <td>${akcja}</td>
            </tr>
        `;
    }).join("");
}

async function dodajZaliczke() {
    if (rolaUsera === "guest") {
        alert("Gość nie może dodawać zaliczek.");
        return;
    }
    if (rolaUsera === "guest") {
        alert("Gość nie może dodawać zaliczek.");
        return;
    }

    if (!aktywnaInwestycjaId) {
        alert("Najpierw otwórz inwestycję.");
        return;
    }

    const data = document.getElementById("zaliczka-data").value;
    const kwota = Number(document.getElementById("zaliczka-kwota").value);
    const sposob_platnosci = document.getElementById("zaliczka-platnosc").value;
    const opis = document.getElementById("zaliczka-opis").value.trim();

    if (!data) {
        alert("Wybierz datę zaliczki.");
        return;
    }

    if (isNaN(kwota) || kwota <= 0) {
        alert("Wpisz poprawną kwotę zaliczki.");
        return;
    }

    const payload = {
        inwestycja_id: aktywnaInwestycjaId,
        data,
        kwota,
        sposob_platnosci,
        opis,
        user_id: zalogowanyUser?.id
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_zaliczki`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        document.getElementById("zaliczka-kwota").value = "";
        document.getElementById("zaliczka-opis").value = "";

        await pobierzInwestycjeZaliczki();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", "Dodano zaliczkę", opis);
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać zaliczki.");
    }
}

async function dodajKoszt() {
    if (rolaUsera === "guest") {
        alert("Gość nie może dodawać kosztów.");
        return;
    }

    if (!aktywnaInwestycjaId) {
        alert("Najpierw otwórz inwestycję.");
        return;
    }

    const data = document.getElementById("koszt-data").value;
    const kwota = Number(document.getElementById("koszt-kwota").value);
    const kategoria = document.getElementById("koszt-kategoria").value;
    const opis = document.getElementById("koszt-opis").value.trim();

    if (!data) {
        alert("Wybierz datę kosztu.");
        return;
    }

    if (isNaN(kwota) || kwota <= 0) {
        alert("Wpisz poprawną kwotę kosztu.");
        return;
    }

    const payload = {
        inwestycja_id: aktywnaInwestycjaId,
        data,
        kwota,
        kategoria,
        opis,
        user_id: zalogowanyUser?.id
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_koszty`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        document.getElementById("koszt-kwota").value = "";
        document.getElementById("koszt-opis").value = "";

        await pobierzInwestycjeKoszty();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", "Dodano koszt", opis);
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać kosztu.");
    }
}

window.usunZaliczke = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może usuwać zaliczki.");
        return;
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_zaliczki?id=eq.${id}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzInwestycjeZaliczki();
        await pobierzInwestycje();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", "Usunięto zaliczkę", id);
    } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć zaliczki.");
    }
};

window.usunKoszt = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może usuwać koszty.");
        return;
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_koszty?id=eq.${id}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzInwestycjeKoszty();
        await pobierzInwestycje();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", "Usunięto koszt", id);
    } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć koszt.");
    }
};

async function dodajPraceDodatkowa() {
    if (rolaUsera === "guest") {
        alert("Gość nie może dodawać prac dodatkowych.");
        return;
    }

    if (!aktywnaInwestycjaId) {
        alert("Najpierw otwórz inwestycję.");
        return;
    }

    const nazwa = document.getElementById("praca-nazwa").value.trim();
    const opis = document.getElementById("praca-opis").value.trim();
    const ilosc = Number(document.getElementById("praca-ilosc").value);
    const cena_netto = Number(document.getElementById("praca-cena-netto").value);
    const vat = Number(document.getElementById("praca-vat").value);

    if (!nazwa) {
        alert("Podaj nazwę pracy.");
        return;
    }
    if (isNaN(ilosc) || ilosc <= 0) {
        alert("Podaj poprawną ilość.");
        return;
    }
    if (isNaN(cena_netto) || cena_netto < 0) {
        alert("Podaj poprawną cenę netto.");
        return;
    }

    const netto = ilosc * cena_netto;
    const brutto = netto * (1 + (vat || 0) / 100);

    const payload = {
        inwestycja_id: aktywnaInwestycjaId,
        nazwa,
        opis,
        ilosc,
        cena_netto,
        vat,
        netto,
        brutto,
        user_id: zalogowanyUser?.id
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_prace_dodatkowe`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        document.getElementById("praca-nazwa").value = "";
        document.getElementById("praca-opis").value = "";
        document.getElementById("praca-ilosc").value = 1;
        document.getElementById("praca-cena-netto").value = "";
        document.getElementById("praca-vat").value = 23;

        await pobierzInwestycjePraceDodatkowe();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", "Dodano pracę dodatkową", nazwa);
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać pracy dodatkowej.");
    }
}

window.usunPraceDodatkowa = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może usuwać prace dodatkowe.");
        return;
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje_prace_dodatkowe?id=eq.${id}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzInwestycjePraceDodatkowe();
        await pobierzInwestycje();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", "Usunięto pracę dodatkową", id);
    } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć pracy dodatkowej.");
    }
};

function renderujSelectPracDodatkowych() {
    const select = document.getElementById("praca-usluga");
    if (!select) return;

    if (!uslugi.length) {
        select.innerHTML = `<option value="">— Brak usług w bazie —</option>`;
        return;
    }

    select.innerHTML = `<option value="">— Brak wyboru (wpisz ręcznie) —</option>
${uslugi.map(u => `<option value="${esc(u.id)}">\r${esc(u.nazwa)} (${cenaUslugi(u).toFixed(2)} PLN)</option>`).join("\n")}`;
}

function ustawPraceDodatkoweZUslugi() {
    const select = document.getElementById("praca-usluga");
    if (!select) return;

    const uslugaId = select.value;
    if (!uslugaId) {
        // Reset to empty
        document.getElementById("praca-nazwa").value = "";
        document.getElementById("praca-cena-netto").value = "";
        return;
    }

    const usluga = uslugi.find(u => String(u.id) === String(uslugaId));
    if (!usluga) return;

    document.getElementById("praca-nazwa").value = usluga.nazwa || "";
    document.getElementById("praca-cena-netto").value = cenaUslugi(usluga).toFixed(2);
    // Keep ILość at 1 (default), opis empty unless user fills, VAT at 23%
}