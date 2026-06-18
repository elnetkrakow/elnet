// ==========================================
// EL-NET v2 — jedna strona / panel firmowy
// ==========================================

const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";
const APP_VERSION = "2026.06.10-29-VAT0-WYZERUJ";

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
let szybkaWycenaPropozycje = [];
let edytowanaUslugaId = null;
let edytowanaPozycjaId = null;
let edytowanaPozycjaIdPanel = null;
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

    const btnDodajPozycjeRecznie = document.getElementById("btn-dodaj-pozycje-recznie");
    if (btnDodajPozycjeRecznie) btnDodajPozycjeRecznie.addEventListener("click", dodajPozycjeRecznieDoWyceny);

    const btnSzybkaWycenaGeneruj = document.getElementById("btn-szybka-wycena-generuj");
    if (btnSzybkaWycenaGeneruj) btnSzybkaWycenaGeneruj.addEventListener("click", generujSzybkaWycene);

    const btnSzybkaWycenaDodaj = document.getElementById("btn-szybka-wycena-dodaj");
    if (btnSzybkaWycenaDodaj) btnSzybkaWycenaDodaj.addEventListener("click", dodajSzybkaWyceneDoTabeli);

    const btnSzybkaWycenaWyczysc = document.getElementById("btn-szybka-wycena-wyczysc");
    if (btnSzybkaWycenaWyczysc) btnSzybkaWycenaWyczysc.addEventListener("click", wyczyscSzybkaWycene);

    const btnSzybkaWycenaMow = document.getElementById("btn-szybka-wycena-mow");
    if (btnSzybkaWycenaMow) btnSzybkaWycenaMow.addEventListener("click", uruchomSzybkaWyceneGlos);

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

    const btnAnulujEdycjeWyceny = document.getElementById("btn-anuluj-edycje-wyceny");
    if (btnAnulujEdycjeWyceny) btnAnulujEdycjeWyceny.addEventListener("click", anulujEdycjePozycji);

    const btnZapiszEdycje = document.getElementById("btn-zapisz-edycje");
    if (btnZapiszEdycje) btnZapiszEdycje.addEventListener("click", zapiszPanelEdycjiPozycji);

    const btnAnulujEdycjePanel = document.getElementById("btn-anuluj-edycje");
    if (btnAnulujEdycjePanel) btnAnulujEdycjePanel.addEventListener("click", anulujPanelEdycjiPozycji);

    const btnZapiszUslugeZWyceny = document.getElementById("btn-zapisz-usluge-z-wyceny");
    if (btnZapiszUslugeZWyceny) btnZapiszUslugeZWyceny.addEventListener("click", zapiszUslugeZWyceny);

    const btnZapiszUsluge = document.getElementById("btn-zapisz-usluge");
    if (btnZapiszUsluge) btnZapiszUsluge.addEventListener("click", zapiszUsluge);

    const btnAnulujUsluge = document.getElementById("btn-anuluj-usluge");
    if (btnAnulujUsluge) btnAnulujUsluge.addEventListener("click", anulujEdycjeUslugi);

    const szukajUslugi = document.getElementById("szukaj-uslugi");
    if (szukajUslugi) szukajUslugi.addEventListener("input", renderujUslugi);

    const vatGlobal = document.getElementById("wycena-vat-global");
    if (vatGlobal) vatGlobal.addEventListener("change", ustawVatDlaCalejWyceny);

    const btnZastosujKorekte = document.getElementById("btn-zastosuj-korekte-cen");
    if (btnZastosujKorekte) btnZastosujKorekte.addEventListener("click", zastosujKorekteCenPozycji);

    const btnWyzerujKorekte = document.getElementById("btn-wyzeruj-korekte-cen");
    if (btnWyzerujKorekte) btnWyzerujKorekte.addEventListener("click", wyzerujKorekteCenPozycji);

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


// ==========================================
// SZYBKA / INTELIGENTNA WYCENA
// ==========================================

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[ąćęłńóśźż]/g, ch => ({
            "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
            "ó": "o", "ś": "s", "ź": "z", "ż": "z"
        }[ch] || ch));
}

function znajdzUslugeDoSzybkiejWyceny(slowka, unikaj = []) {
    const wymagane = Array.isArray(slowka) ? slowka : [slowka];
    const zakazane = Array.isArray(unikaj) ? unikaj : [unikaj];
    const lista = uslugi || [];

    let najlepsza = null;
    let najlepszyWynik = 0;

    lista.forEach(u => {
        const nazwa = normalizeText(`${u.nazwa || ""} ${u.kategoria || ""}`);
        let wynik = 0;

        zakazane.forEach(s => {
            const n = normalizeText(s);
            if (n && nazwa.includes(n)) wynik -= 8;
        });

        wymagane.forEach(s => {
            const n = normalizeText(s);
            if (n && nazwa.includes(n)) wynik += 3;
        });

        if (wymagane.length > 1 && wymagane.some(s => nazwa.includes(normalizeText(s)))) wynik += 1;

        if (wynik > najlepszyWynik) {
            najlepszyWynik = wynik;
            najlepsza = u;
        }
    });

    return najlepszyWynik > 0 ? najlepsza : null;
}

/**
 * Helper do pobierania stawki VAT z pozycji.
 * Używa operatora ?? zamiast || aby prawidłowo obsługiwać VAT 0%.
 */
function pobierzVatProcent(p) {
    return Number(p?.vatProcent ?? p?.vat ?? p?.vat_rate ?? 23);
}

function zapewnijCenyBazowePozycji() {
    wycenaPozycje.forEach((p) => {
        const aktualnaCena = Number(p.cenaNetto ?? p.cena_netto ?? p.cena ?? p.price ?? 0);
        if (p.cenaBazowa === undefined || p.cenaBazowa === null || Number.isNaN(Number(p.cenaBazowa))) {
            p.cenaBazowa = aktualnaCena;
        }
    });
}

function wyzerujKorekteCenPozycji() {
    zapewnijCenyBazowePozycji();

    wycenaPozycje = wycenaPozycje.map((p) => {
        const cenaBazowa = Number(p.cenaBazowa ?? p.cenaNetto ?? p.cena_netto ?? p.cena ?? p.price ?? 0);

        return {
            ...p,
            cenaBazowa,
            cenaNetto: cenaBazowa,
            cena_netto: cenaBazowa,
            cena: cenaBazowa,
            price: cenaBazowa
        };
    });

    const poleKorekty = document.getElementById("wycena-korekta");
    if (poleKorekty) {
        poleKorekty.value = 0;
    }

    try { renderujWycene(); } catch (e) { console.warn(e); }
    try { przeliczWycene(); } catch (e) { console.warn(e); }
}

function pobierzLiczbeZOpisu(opis, wzorce) {
    for (const wzorzec of wzorce) {
        const m = opis.match(wzorzec);
        if (m && m[1]) return Number(String(m[1]).replace(",", "."));
    }
    return null;
}

function dodajPropozycje(lista, config) {
    const usluga = znajdzUslugeDoSzybkiejWyceny(config.szukaj || config.nazwa, config.unikaj || []);
    const nazwa = usluga?.nazwa || config.nazwa;
    const jednostka = usluga ? jednostkaUslugi(usluga) : (config.jednostka || "szt.");
    const cenaNetto = usluga ? cenaUslugi(usluga) : Number(config.cena || 0);

    if (!nazwa || !config.ilosc || config.ilosc <= 0) return;

    lista.push({
        id: `szybka-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        nazwa,
        jednostka,
        ilosc: Number(config.ilosc),
        cenaNetto: Number(cenaNetto || 0),
        vatProcent: Number(config.vatProcent ?? document.getElementById("wycena-vat")?.value ?? 23),
        uwaga: usluga ? (config.uwaga || "Dopasowano z cennika") : (config.uwaga || "Cena szacunkowa — sprawdź w cenniku")
    });
}

function generujSzybkaWycene() {
    if (rolaUsera === "guest") {
        alert("Gość nie może generować wyceny.");
        return;
    }

    const pole = document.getElementById("szybka-wycena-opis");
    const opisOryginalny = pole?.value?.trim() || "";
    const opis = normalizeText(opisOryginalny);

    if (!opis) {
        alert("Opisz zlecenie, np. mieszkanie 60 m², instalacja od zera, 55 punktów, rozdzielnica.");
        return;
    }

    const metraz = pobierzLiczbeZOpisu(opis, [
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów|metry|metra|m powierzchni)\b/,
        /mieszkanie\s*(\d+(?:[.,]\d+)?)/,
        /dom\s*(\d+(?:[.,]\d+)?)/
    ]);

    const pokoje = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:pokoi|pokoje|pokojach|pokój|pokoj)\b/
    ]);

    const punktyPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktów|punkty|pkt|punkt)\b/
    ]);

    const gniazdaPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:gniazd|gniazdek|gniazda|gniazdo)\b/,
        /(?:gniazd|gniazdek|gniazda|gniazdo)[^\d]{0,20}(\d+)/
    ]);

    const lacznikiPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:lacznikow|łączników|wlacznikow|włączników|laczniki|łączniki|wlaczniki|włączniki)\b/,
        /(\d+)\s*(?:rocznikow|roczników|roczniki)\b/,
        /(?:lacznikow|łączników|wlacznikow|włączników|rocznikow|roczników)[^\d]{0,20}(\d+)/
    ]);

    const lanPodane = pobierzLiczbeZOpisu(opis, [
        /(?:internet|lan|sieci|siec|rj45)[^\d]{0,20}(\d+)/,
        /(\d+)\s*(?:punktow|punktów|punkty|pkt)\s*(?:lan|internet|sieci|siec|rj45)/
    ]);

    const kameraPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:kamer|kamery|kamera)\b/
    ]);

    const malowanieM2 = pobierzLiczbeZOpisu(opis, [
        /(?:malowania|malowanie|pomalowac|pomalować)[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:malowania|malowanie)/
    ]);

    const sciankaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:scianka|ścianka|gk|karton gips|karton-gips|regips)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:scianka|ścianka|gk|karton gips|karton-gips|regips)/
    ]);

    const wykladzinaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:wykladzina|wykładzina|podloge|podłoge|podłogę|podloga|podłoga)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:wykladzina|wykładzina|podloga|podłoga)/
    ]);

    const odZera = /od zera|nowa instalacja|kompletna instalacja|stan deweloperski|generalny/.test(opis);
    const remont = /remont|modernizacja|wymiana|przerobka|przeróbka/.test(opis);
    const zakresElektryczny = /elektry|gniazd|gniazdek|gniazdo|lacznik|łącznik|wlacznik|włącznik|rocznik|punkt|rozdzielnica|bezpiecznik|kabel|przewod|przewód|oswietlen|oświetlen/.test(opis);

    let punktyElektryczne = null;

    if (punktyPodane) {
        punktyElektryczne = punktyPodane;
    } else if (!gniazdaPodane && !lacznikiPodane && zakresElektryczny && metraz && (odZera || /instalacja|elektryka|elektryczna/.test(opis))) {
        const mnoznik = odZera ? 1.15 : remont ? 0.65 : 0.85;
        punktyElektryczne = Math.max(10, Math.round(metraz * mnoznik));
    }

    const propozycje = [];

    if (punktyElektryczne) {
        dodajPropozycje(propozycje, {
            nazwa: "Montaż punktu elektrycznego",
            szukaj: ["punkt elektryczny", "montaż punktu", "montaz punktu", "punkt"],
            unikaj: ["przemysł", "przemyslow", "siłowe", "silowe"],
            jednostka: "pkt",
            ilosc: punktyElektryczne,
            cena: 120,
            uwaga: punktyPodane ? "Ilość punktów z opisu" : "Ilość punktów elektrycznych oszacowana z metrażu"
        });
    }

    if (gniazdaPodane) {
        dodajPropozycje(propozycje, {
            nazwa: "Wymiana gniazda elektrycznego",
            szukaj: ["wymiana gniazda", "gniazdo elektryczne", "montaż gniazda", "montaz gniazda", "gniazdo"],
            unikaj: ["przemysł", "przemyslow", "siłowe", "silowe", "230v przemyslowe", "400v"],
            jednostka: "szt.",
            ilosc: gniazdaPodane,
            cena: 90,
            uwaga: "Ilość gniazd z opisu"
        });
    }

    if (lacznikiPodane) {
        dodajPropozycje(propozycje, {
            nazwa: "Wymiana łącznika / włącznika światła",
            szukaj: ["łącznik", "lacznik", "włącznik", "wlacznik", "osprzęt", "osprzet"],
            unikaj: ["przemysł", "przemyslow", "siłowe", "silowe"],
            jednostka: "szt.",
            ilosc: lacznikiPodane,
            cena: 80,
            uwaga: opis.includes("rocznik") ? "Rozpoznano z dyktowania jako „roczniki” — potraktowano jako łączniki" : "Ilość łączników z opisu"
        });
    }

    if (/rozdzielnica|bezpieczniki|skrzynka/.test(opis) || (odZera && zakresElektryczny)) {
        dodajPropozycje(propozycje, {
            nazwa: "Montaż / podłączenie rozdzielnicy",
            szukaj: ["rozdzielnica", "bezpiecznik", "skrzynka"],
            jednostka: "szt.",
            ilosc: 1,
            cena: 900,
            uwaga: "Wykryto rozdzielnicę albo instalację od zera"
        });
    }

    if (/internet|lan|rj45|sieci|sieć/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Punkt internetowy LAN / RJ45",
            szukaj: ["lan", "internet", "rj45", "sieć", "siec"],
            jednostka: "pkt",
            ilosc: lanPodane || pokoje || 4,
            cena: 130,
            uwaga: lanPodane ? "Ilość LAN z opisu" : "Ilość LAN oszacowana z liczby pokoi"
        });
    }

    if (/domofon|wideodomofon|video domofon|videodomofon/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Montaż domofonu / wideodomofonu",
            szukaj: ["domofon", "wideodomofon", "videodomofon"],
            jednostka: "szt.",
            ilosc: 1,
            cena: 450,
            uwaga: "Wykryto domofon"
        });
    }

    if (/monitoring|kamera|kamery|cctv/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Montaż kamery / punkt monitoringu",
            szukaj: ["monitoring", "kamera", "cctv"],
            jednostka: "szt.",
            ilosc: kameraPodane || 4,
            cena: 250,
            uwaga: kameraPodane ? "Ilość kamer z opisu" : "Ilość kamer oszacowana"
        });
    }

    if (/alarm|czujki|czujnik ruchu|satel/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Instalacja alarmowa / punkt alarmowy",
            szukaj: ["alarm", "czujka", "satel"],
            jednostka: "pkt",
            ilosc: pokoje ? Math.max(4, pokoje + 2) : 6,
            cena: 140,
            uwaga: "Wykryto alarm"
        });
    }

    if (/bialy montaz|biały montaż|osprzet|osprzęt/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Biały montaż osprzętu",
            szukaj: ["biały montaż", "bialy montaz", "osprzęt", "osprzet"],
            jednostka: "szt.",
            ilosc: punktyElektryczne || gniazdaPodane || lacznikiPodane || 30,
            cena: 35,
            uwaga: "Wykryto biały montaż"
        });
    }

    if (/bruzd|kucie|peszel|peszle|przewody|okablowanie/.test(opis) || (odZera && zakresElektryczny)) {
        dodajPropozycje(propozycje, {
            nazwa: "Układanie przewodów / bruzdowanie",
            szukaj: ["bruzdowanie", "przewod", "przewód", "okablowanie", "peszel"],
            jednostka: "m",
            ilosc: metraz ? Math.round(metraz * 2.2) : 120,
            cena: 18,
            uwaga: "Szacunek długości z metrażu"
        });
    }

    if (/pomiary|pomiar|protokol|protokół|odbior/.test(opis) || (odZera && zakresElektryczny)) {
        dodajPropozycje(propozycje, {
            nazwa: "Pomiary elektryczne / uruchomienie",
            szukaj: ["pomiary", "pomiar", "protokół", "protokol", "uruchomienie"],
            jednostka: "usługa",
            ilosc: 1,
            cena: 500,
            uwaga: "Wykryto pomiary albo pełną instalację"
        });
    }

    if (/malowania|malowanie|pomalowac|pomalować|farba|bialy|biały|kolor|sciany|ściany|sufit/.test(opis)) {
        let iloscMalowania = malowanieM2 || (metraz ? Math.round(metraz * 2.6) : 100);
        dodajPropozycje(propozycje, {
            nazwa: "Malowanie ścian i sufitu",
            szukaj: ["malowanie", "malowania", "farba"],
            jednostka: "m²",
            ilosc: iloscMalowania,
            cena: 28,
            uwaga: malowanieM2 ? "Metraż malowania z opisu" : "Szacunek powierzchni malowania z metrażu mieszkania"
        });
    }

    if (/scianka|ścianka|gk|karton gips|karton-gips|regips|dzialowa|działowa/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Ścianka działowa GK",
            szukaj: ["ścianka", "scianka", "gk", "karton gips", "karton-gips", "regips"],
            jednostka: "m²",
            ilosc: sciankaM2 || 10,
            cena: 180,
            uwaga: sciankaM2 ? "Metraż ścianki z opisu" : "Metraż ścianki oszacowany"
        });
    }

    if (/wykladzina|wykładzina|podloge|podłoge|podłogę|podloga|podłoga/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Ułożenie wykładziny",
            szukaj: ["wykładzina", "wykladzina", "podłoga", "podloga"],
            jednostka: "m²",
            ilosc: wykladzinaM2 || metraz || 50,
            cena: 45,
            uwaga: wykladzinaM2 ? "Metraż wykładziny z opisu" : "Przyjęto metraż mieszkania jako powierzchnię podłogi"
        });
    }

    if (!propozycje.length) {
        if (metraz) {
            dodajPropozycje(propozycje, {
                nazwa: "Robocizna — wycena szacunkowa",
                szukaj: ["robocizna", "instalacja", "prace"],
                jednostka: "m²",
                ilosc: metraz,
                cena: 110,
                uwaga: "Nie wykryto szczegółów — szacunek z metrażu"
            });
        } else {
            alert("Nie udało się rozpoznać zakresu. Dopisz metraż albo słowa: gniazda, łączniki, malowanie, wykładzina, ścianka.");
            return;
        }
    }

    szybkaWycenaPropozycje = normalizujPozycjeSzybkiejWyceny(propozycje);
    renderujSzybkaWyceneWynik({
        metraz,
        punkty: punktyElektryczne,
        pokoje,
        odZera,
        remont,
        gniazda: gniazdaPodane,
        laczniki: lacznikiPodane
    });
}


function normalizujPozycjeSzybkiejWyceny(lista) {
    if (!Array.isArray(lista)) return [];

    return lista.map((p) => {
        const cena = Number(
            p.cenaNetto ?? p.cena_netto ?? p.cena ?? p.price ?? p.netto ?? 0
        );
        const ilosc = Number(
            p.ilosc ?? p.quantity ?? p.qty ?? 1
        );
        const vat = Number(
            p.vat ?? p.vat_rate ?? 23
        );

        return {
            ...p,
            nazwa: p.nazwa || p.name || "Pozycja",
            name: p.name || p.nazwa || "Pozycja",
            jednostka: p.jednostka || p.unit || "szt.",
            unit: p.unit || p.jednostka || "szt.",
            cena_netto: Number.isFinite(cena) ? cena : 0,
            cenaNetto: Number.isFinite(cena) ? cena : 0,
            cena: Number.isFinite(cena) ? cena : 0,
            price: Number.isFinite(cena) ? cena : 0,
            ilosc: Number.isFinite(ilosc) ? ilosc : 1,
            quantity: Number.isFinite(ilosc) ? ilosc : 1,
            vat: Number.isFinite(vat) ? vat : 23,
            uwaga: p.uwaga || p.note || ""
        };
    });
}

function renderujSzybkaWyceneWynik(meta = {}) {
    const box = document.getElementById("szybka-wycena-wynik");
    if (!box) return;

    if (!szybkaWycenaPropozycje.length) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
    }

    const netto = szybkaWycenaPropozycje.reduce((sum, p) => sum + (Number(p.ilosc) * Number(p.cenaNetto)), 0);
    const vat = szybkaWycenaPropozycje.reduce((sum, p) => sum + (Number(p.ilosc) * Number(p.cenaNetto) * (pobierzVatProcent(p) / 100)), 0);
    const brutto = netto + vat;

    const metaInfo = [
        meta.metraz ? `Metraż: ${meta.metraz} m²` : "",
        meta.gniazda ? `Gniazda: ${meta.gniazda}` : "",
        meta.laczniki ? `Łączniki: ${meta.laczniki}` : "",
        meta.punkty && !meta.gniazda && !meta.laczniki ? `Punkty elektryczne: ${meta.punkty}` : "",
        meta.sanitarne ? `Punkty sanitarne: ${meta.sanitarne}` : "",
        meta.co ? `Punkty C.O.: ${meta.co}` : "",
        meta.przerobka ? "Tryb: przeróbka" : "",
        meta.wymiana ? "Tryb: wymiana" : "",
        meta.pokoje ? `Pokoje: ${meta.pokoje}` : "",
        meta.odZera ? "Zakres: od zera" : "",
        meta.remont ? "Zakres: remont / modernizacja" : ""
    ].filter(Boolean).join(" • ");

    box.classList.remove("hidden");
    box.innerHTML = `
        <div class="quick-estimate-summary">
            <strong>Propozycja kosztorysu</strong>
            <span>${esc(metaInfo || "Wycena szacunkowa")}</span>
        </div>

        <div class="quick-estimate-table">
            <table>
                <thead>
                    <tr>
                        <th>Pozycja</th>
                        <th>Ilość</th>
                        <th>Cena</th>
                        <th>Netto</th>
                        <th>Uwagi</th>
                    </tr>
                </thead>
                <tbody>
                    ${szybkaWycenaPropozycje.map(p => `
                        <tr>
                            <td>${esc(p.nazwa)}</td>
                            <td>${Number(p.ilosc).toFixed(Number.isInteger(Number(p.ilosc)) ? 0 : 2)} ${esc(p.jednostka)}</td>
                            <td>${Number(p.cenaNetto).toFixed(2)} PLN</td>
                            <td>${(Number(p.ilosc) * Number(p.cenaNetto)).toFixed(2)} PLN</td>
                            <td>${esc(p.uwaga || "")}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>

        <div class="quick-estimate-total">
            <span>Netto: <strong>${netto.toFixed(2)} PLN</strong></span>
            <span>VAT: <strong>${vat.toFixed(2)} PLN</strong></span>
            <span>Brutto: <strong>${brutto.toFixed(2)} PLN</strong></span>
        </div>
    `;
}

function dodajSzybkaWyceneDoTabeli() {
    if (rolaUsera === "guest") {
        alert("Gość nie może modyfikować wyceny.");
        return;
    }

    if (!szybkaWycenaPropozycje.length) {
        alert("Najpierw kliknij Generuj.");
        return;
    }

    const prefix = Date.now().toString();

    szybkaWycenaPropozycje.forEach((p, index) => {
        wycenaPozycje.push({
            id: `${prefix}-${index}`,
            nazwa: p.nazwa,
            jednostka: p.jednostka,
            ilosc: Number(p.ilosc),
            cenaNetto: Number(p.cenaNetto),
            vatProcent: pobierzVatProcent(p)
        });
    });

    renderujWycene();
    zapiszLog("Wycena", "Szybka wycena", `Dodano ${szybkaWycenaPropozycje.length} pozycji z szybkiej wyceny`);
}

function wyczyscSzybkaWycene() {
    szybkaWycenaPropozycje = [];
    const opis = document.getElementById("szybka-wycena-opis");
    if (opis) opis.value = "";
    renderujSzybkaWyceneWynik();
}

function uruchomSzybkaWyceneGlos() {
    const btn = document.getElementById("btn-szybka-wycena-mow");

    if (window.AndroidSpeech && typeof window.AndroidSpeech.startListening === "function") {
        if (btn) btn.textContent = "🎙 Słucham...";
        window.AndroidSpeech.startListening();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const opis = document.getElementById("szybka-wycena-opis");

    if (!SpeechRecognition) {
        alert("Ten telefon albo WebView nie obsługuje rozpoznawania mowy. Wpisz opis ręcznie.");
        return;
    }

    try {
        const recognition = new SpeechRecognition();
        recognition.lang = "pl-PL";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (btn) btn.textContent = "🎙 Słucham...";

        recognition.onresult = (event) => {
            const tekst = event.results?.[0]?.[0]?.transcript || "";
            dopiszTekstDoSzybkiejWyceny(tekst);
        };

        recognition.onerror = () => {
            if (btn) btn.textContent = "🎙 Dopowiedz";
        };

        recognition.onend = () => {
            if (btn) btn.textContent = "🎙 Dopowiedz";
        };

        recognition.start();
    } catch (err) {
        console.error(err);
        if (btn) btn.textContent = "🎙 Dopowiedz";
        alert("Mikrofon nie uruchomił się. Wpisz opis ręcznie.");
    }
}

function dopiszTekstDoSzybkiejWyceny(tekst) {
    const opis = document.getElementById("szybka-wycena-opis");
    if (!opis || !tekst) return;

    const obecny = String(opis.value || "").trim();
    const nowy = String(tekst || "").trim();

    if (!nowy) return;

    opis.value = obecny ? `${obecny} ${nowy}`.replace(/\s+/g, " ").trim() : nowy;
    opis.focus();
}

window.onAndroidSpeechResult = function(tekst) {
    const btn = document.getElementById("btn-szybka-wycena-mow");
    dopiszTekstDoSzybkiejWyceny(tekst);
    if (btn) btn.textContent = "🎙 Dopowiedz";
};

window.onAndroidSpeechError = function(komunikat) {
    const btn = document.getElementById("btn-szybka-wycena-mow");
    if (btn) btn.textContent = "🎙 Dopowiedz";
    alert(komunikat || "Nie udało się rozpoznać głosu. Wpisz opis ręcznie.");
};

window.onAndroidSpeechStatus = function(status) {
    const btn = document.getElementById("btn-szybka-wycena-mow");
    if (!btn) return;
    btn.textContent = status === "Słucham..." ? "🎙 Słucham..." : "🎙 Dopowiedz";
};

function dodajPozycjeRecznieDoWyceny() {
    if (rolaUsera === "guest") {
        alert("Gość nie może modyfikować wyceny.");
        return;
    }

    const selectedId = document.getElementById("wycena-usluga").value;
    const u = uslugi.find(x => String(x.id) === String(selectedId));
    const nazwaInput = document.getElementById("wycena-usluga-search").value.trim();

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

    const nazwa = u ? u.nazwa : (nazwaInput || "");
    if (!nazwa) {
        alert("Wybierz usługę z bazy lub wpisz nazwę usługi.");
        return;
    }

    if (edytowanaPozycjaIdPanel) {
        wycenaPozycje = wycenaPozycje.map(p => {
            if (String(p.id) !== String(edytowanaPozycjaIdPanel)) return p;
            return {
                ...p,
                nazwa,
                jednostka,
                ilosc,
                cenaNetto: cena,
                vatProcent
            };
        });

        renderujWycene();
        przeliczWycene();
        anulujPanelEdycjiPozycji();
    } else {
        wycenaPozycje.push({
            id: Date.now().toString(),
            nazwa,
            jednostka,
            ilosc,
            cenaNetto: cena,
            vatProcent
        });

        // clear only ilość by default as before
        document.getElementById("wycena-ilosc").value = "";

        renderujWycene();
        przeliczWycene();
    }
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
        const vatProcent = pobierzVatProcent(p);
        const vat = netto * (vatProcent / 100);
        const brutto = netto + vat;
        const akcja = rolaUsera !== "guest"
            ? `<div class="wycena-actions"><button class="btn btn-secondary tiny-btn" onclick="pokazPanelEdycjiPozycji('${p.id}')">Edytuj</button><button class="btn btn-danger tiny-btn" onclick="usunPozycjeWyceny('${p.id}')">Usuń</button></div>`
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

function pokazPanelEdycjiPozycji(id) {
    if (rolaUsera === "guest") {
        alert("Tylko zalogowany użytkownik może edytować pozycje.");
        return;
    }

    const pozycja = wycenaPozycje.find(x => String(x.id) === String(id));
    if (!pozycja) return;

    edytowanaPozycjaIdPanel = String(id);
    document.getElementById("edycja-nazwa").value = pozycja.nazwa || "";
    document.getElementById("edycja-jednostka").value = pozycja.jednostka || "szt.";
    document.getElementById("edycja-ilosc").value = pozycja.ilosc ?? "";
    document.getElementById("edycja-cena").value = pozycja.cenaNetto ?? "";
    document.getElementById("edycja-vat").value = pozycja.vatProcent ?? 23;
    document.getElementById("edycja-uwagi").value = pozycja.uwaga || "";

    const panel = document.getElementById("panel-edycji-pozycji");
    if (panel) panel.classList.add("visible");
}

function zapiszPanelEdycjiPozycji() {
    if (!edytowanaPozycjaIdPanel) return;

    const nazwa = document.getElementById("edycja-nazwa").value.trim();
    const jednostka = document.getElementById("edycja-jednostka").value;
    const ilosc = Number(document.getElementById("edycja-ilosc").value);
    const cena = Number(document.getElementById("edycja-cena").value);
    const vatProcent = Number(document.getElementById("edycja-vat").value);
    const uwagi = document.getElementById("edycja-uwagi").value.trim();

    if (!nazwa) {
        alert("Wpisz nazwę usługi.");
        return;
    }

    if (isNaN(ilosc) || ilosc <= 0) {
        alert("Wpisz poprawną ilość.");
        return;
    }

    if (isNaN(cena) || cena < 0) {
        alert("Wpisz poprawną cenę.");
        return;
    }

    wycenaPozycje = wycenaPozycje.map(p => {
        if (String(p.id) !== String(edytowanaPozycjaIdPanel)) return p;
        return {
            ...p,
            nazwa,
            jednostka,
            ilosc,
            cenaNetto: cena,
            vatProcent,
            uwaga: uwagi
        };
    });

    renderujWycene();
    przeliczWycene();
    anulujPanelEdycjiPozycji();
}

function anulujPanelEdycjiPozycji() {
    edytowanaPozycjaIdPanel = null;

    [
        "edycja-nazwa",
        "edycja-ilosc",
        "edycja-cena",
        "edycja-uwagi"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const jednostka = document.getElementById("edycja-jednostka");
    if (jednostka) jednostka.value = "szt.";

    const selVat = document.getElementById("edycja-vat");
    if (selVat) selVat.value = "23";

    const panel = document.getElementById("panel-edycji-pozycji");
    if (panel) panel.classList.remove("visible");
}

window.usunPozycjeWyceny = function(id) {
    if (rolaUsera === "guest") {
        alert("Gość nie może modyfikować wyceny.");
        return;
    }

    wycenaPozycje = wycenaPozycje.filter(p => p.id !== id);
    renderujWycene();
};

window.edytujPozycjeWyceny = function(id) {
    pokazPanelEdycjiPozycji(id);
};

function anulujEdycjePozycji() {
    edytowanaPozycjaId = null;

    // wyczyść pola formularza Dodaj pozycję
    const fields = ["wycena-usluga-search", "wycena-ilosc", "wycena-cena"];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const selVat = document.getElementById("wycena-vat");
    if (selVat) selVat.value = "23";
    const jednostka = document.getElementById("wycena-jednostka");
    if (jednostka) jednostka.value = "szt.";

    // przywróć tekst przycisku i ukryj Anuluj
    const btn = document.getElementById("btn-dodaj-pozycje-recznie");
    if (btn) btn.textContent = "Dodaj do wyceny";
    const btnAnuluj = document.getElementById("btn-anuluj-edycje-wyceny");
    if (btnAnuluj) btnAnuluj.classList.add("hidden");
}

async function zapiszUslugeZWyceny() {
    const nazwa = document.getElementById("wycena-nowa-usluga-nazwa").value.trim();
    const jednostka = document.getElementById("wycena-nowa-usluga-jednostka").value;
    const cenaNetto = Number(document.getElementById("wycena-nowa-usluga-cena").value);

    if (!nazwa) {
        alert("Wpisz nazwę usługi.");
        return;
    }

    if (!jednostka) {
        alert("Wybierz jednostkę.");
        return;
    }

    if (isNaN(cenaNetto) || cenaNetto < 0) {
        alert("Wpisz poprawną cenę netto (liczba >= 0).");
        return;
    }

    const payload = {
        nazwa,
        jednostka,
        cena_netto: cenaNetto,
        cena: cenaNetto,
        kategoria: "Wycena"
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/uslugi`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Błąd zapisu usługi:", errorText);
            alert("Nie udało się zapisać usługi. Sprawdź bazę usług lub uprawnienia.");
            return;
        }

        // Odśwież lokalną listę usług
        await pobierzUslugi();
        renderujSelectUslug();

        // Wyczyść formularz
        document.getElementById("wycena-nowa-usluga-nazwa").value = "";
        document.getElementById("wycena-nowa-usluga-jednostka").value = "szt.";
        document.getElementById("wycena-nowa-usluga-cena").value = "";

        // Pokaż komunikat sukcesu
        alert("Usługa zapisana w cenniku.");

        zapiszLog("Wycena", "Dodano usługę do cennika", nazwa);
    } catch (err) {
        console.error("Błąd zapisu usługi:", err);
        alert("Nie udało się zapisać usługi. Sprawdź bazę usług lub uprawnienia.");
    }
}

function przeliczWycene() {
    const korekta = Number(document.getElementById("wycena-korekta")?.value || 0);
    const mnoznikKorekty = 1 + korekta / 100;

    let sumaNettoPoKorekcie = 0;
    let sumaVAT = 0;

    wycenaPozycje.forEach(p => {
        const vatProcent = pobierzVatProcent(p);
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

function ustawVatDlaCalejWyceny() {
    const select = document.getElementById("wycena-vat-global");
    if (!select) return;

    const vat = Number(select.value);

    if (!Array.isArray(wycenaPozycje) || wycenaPozycje.length === 0) {
        return;
    }

    wycenaPozycje = wycenaPozycje.map(p => ({
        ...p,
        vatProcent: vat,
        vat: vat,
        vat_rate: vat
    }));

    try { renderujWycene(); } catch (e) { console.warn(e); }
    try { przeliczWycene(); } catch (e) { console.warn(e); }
}

function zastosujKorekteCenPozycji() {
    const input = document.getElementById("wycena-korekta");
    if (!input) return;

    const raw = String(input.value || "0").replace(',', '.');
    const procent = Number(raw);

    if (!Number.isFinite(procent) || procent === 0) {
        return;
    }

    if (!Array.isArray(wycenaPozycje) || wycenaPozycje.length === 0) {
        alert("Brak pozycji do korekty.");
        return;
    }

    zapewnijCenyBazowePozycji();
    const mnoznik = 1 + procent / 100;

    wycenaPozycje = wycenaPozycje.map(p => {
        const cenaBazowa = Number(p.cenaBazowa ?? p.cenaNetto ?? p.cena_netto ?? p.cena ?? p.price ?? 0) || 0;
        const nowaCena = Math.round(cenaBazowa * mnoznik * 100) / 100;

        return {
            ...p,
            cenaBazowa,
            cenaNetto: nowaCena,
            cena_netto: nowaCena,
            cena: nowaCena,
            price: nowaCena
        };
    });

    input.value = "0";

    try { renderujWycene(); } catch (e) { console.warn(e); }
    try { przeliczWycene(); } catch (e) { console.warn(e); }
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
        const vatProcent = pobierzVatProcent(p);
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

    const visibleColumns = columns.filter(c => c.visible);
    const headers = visibleColumns.map(c => `<th class="col-${c.key}">${c.label}</th>`).join("");
    const colgroup = visibleColumns.map(c => `<col class="col-${c.key}">`).join("");

    let sumaNetto = 0;
    let sumaVAT = 0;
    let sumaBrutto = 0;

    const rows = pozycje.map(p => {
        const vatProcent = pobierzVatProcent(p);
        const vatPerc = Number.isFinite(vatProcent) ? vatProcent : 23;
        const netto = Number(p.ilosc || 0) * Number(p.cenaNetto || 0);
        const vat = netto * (vatPerc / 100);
        const brutto = netto + vat;

        sumaNetto += netto;
        sumaVAT += vat;
        sumaBrutto += brutto;

        const rowCells = [
            `<td class="col-nazwa">${esc(p.nazwa || "")}</td>`,
            options.jednostka ? `<td class="col-jednostka">${esc(p.jednostka || "")}</td>` : "",
            options.ilosc ? `<td class="col-ilosc">${Number(p.ilosc || 0).toFixed(2)}</td>` : "",
            options.cenaNetto ? `<td class="col-cenaNetto">${Number(p.cenaNetto || 0).toFixed(2)} PLN</td>` : "",
            options.wartoscNetto ? `<td class="col-wartoscNetto">${netto.toFixed(2)} PLN</td>` : "",
            options.vat ? `<td class="col-vat">${vatPerc}%</td>` : "",
            options.brutto ? `<td class="col-brutto">${brutto.toFixed(2)} PLN</td>` : ""
        ];

        return `<tr>${rowCells.join("")}</tr>`;
    }).join("");

    const nettoPodsumowanie = Number.isFinite(Number(kosztorys.netto)) ? Number(kosztorys.netto) : sumaNetto;
    const bruttoPodsumowanie = Number.isFinite(Number(kosztorys.brutto)) ? Number(kosztorys.brutto) : sumaBrutto;
    const vatPodsumowanie = bruttoPodsumowanie - nettoPodsumowanie;
    const stawkiVat = [...new Set(pozycje.map(p => pobierzVatProcent(p)).filter(v => Number.isFinite(v)).map(v => Number(v)))];
    const vatLabel = stawkiVat.length === 1 ? `VAT ${stawkiVat[0]}%` : "VAT";
    const formatujKwote = value => new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value || 0)) + " PLN";


    const html = `
        <!DOCTYPE html>
        <html lang="pl">
        <head>
            <meta charset="UTF-8">
            <title>Kosztorys</title>
            <style>
                @page { size: A4 portrait; margin: 8mm; }
                * { box-sizing: border-box; }
                body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; color: #000; width: 100%; overflow-wrap: anywhere; }
                h1 { font-size: 18px; margin: 0 0 6px; }
                h2 { font-size: 14px; margin: 0 0 5px; }
                p { margin: 0 0 8px; }
                table { width: 100%; max-width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
                th, td { border: 1px solid #000; padding: 2px 3px; font-size: 9px; line-height: 1.2; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
                th { background: #f0f0f0; }
                thead { display: table-header-group; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                .col-nazwa { width: 38%; }
                .col-jednostka { width: 9%; }
                .col-ilosc { width: 7%; }
                .col-cenaNetto { width: 12%; }
                .col-wartoscNetto { width: 13%; }
                .col-vat { width: 7%; }
                .col-brutto { width: 14%; }
                .summary { margin-top: 10px; width: 100%; table-layout: fixed; }
                .summary td { border: none; padding: 3px 4px; font-size: 10px; }
                .summary .label { width: 80%; }
                .summary .value { text-align: right; }
            </style>
        </head>
        <body>
            <h1>Kosztorys</h1>
            <h2>${esc(kosztorys.nazwa || "")}</h2>
            <p>Data: ${esc(kosztorys.data || "-")}</p>
            <table>
                <colgroup>${colgroup}</colgroup>
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
                    <td class="value">${formatujKwote(nettoPodsumowanie)}</td>
                </tr>
                <tr>
                    <td class="label"><strong>${vatLabel}</strong></td>
                    <td class="value">${formatujKwote(vatPodsumowanie)}</td>
                </tr>
                <tr>
                    <td class="label"><strong>Brutto</strong></td>
                    <td class="value">${formatujKwote(bruttoPodsumowanie)}</td>
                </tr>
            </table>
        </body>
        </html>
    `;

    if (window.AndroidPrint && window.AndroidPrint.printHtml) { window.AndroidPrint.printHtml(html); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        console.error("Nie udalo sie otworzyc okna do druku.");
        return;
    }

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

    if (window.AndroidPrint && window.AndroidPrint.printHtml) { window.AndroidPrint.printHtml(html); return; }
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

// ==========================================
// SZYBKA WYCENA V8 — REGUŁY REMONTOWE
// ==========================================

function dodajRemontowaPropozycje(lista, config) {
    dodajPropozycje(lista, config);
}

function generujSzybkaWycene() {
    if (rolaUsera === "guest") {
        alert("Gość nie może generować wyceny.");
        return;
    }

    const pole = document.getElementById("szybka-wycena-opis");
    const opisOryginalny = pole?.value?.trim() || "";
    const opis = normalizeText(opisOryginalny);

    if (!opis) {
        alert("Opisz zlecenie, np. mieszkanie 30 m², malowanie, gładź, 10 punktów elektrycznych.");
        return;
    }

    const metraz = pobierzLiczbeZOpisu(opis, [
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów|metry|metra|m powierzchni)\b/,
        /mieszkanie\s*(\d+(?:[.,]\d+)?)/,
        /lokal\s*(\d+(?:[.,]\d+)?)/,
        /dom\s*(\d+(?:[.,]\d+)?)/
    ]);

    const pokoje = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:pokoi|pokoje|pokojach|pokój|pokoj|pomieszczenia|pomieszczeń)\b/
    ]);

    const okna = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:okien|okna|okno)\b/]) || pokoje || 1;
    const drzwi = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:drzwi|oscieznic|ościeżnic)\b/]) || pokoje || 1;

    const punktyElektryczne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktów|punkty|pkt|punkt)\s*(?:elektrycznych|elektryczne|elektryki|instalacji elektrycznej)?\b/,
        /(?:instalacj[ai] elektryczn[aej]?|elektryka)[^\d]{0,35}(\d+)\s*(?:szt|punkt|punktow|punktów|pkt)?/
    ]);

    const gniazda = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:gniazd|gniazdek|gniazda|gniazdo)\b/,
        /(?:gniazd|gniazdek|gniazda|gniazdo)[^\d]{0,20}(\d+)/
    ]);

    const laczniki = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:lacznikow|łączników|wlacznikow|włączników|laczniki|łączniki|wlaczniki|włączniki)\b/,
        /(\d+)\s*(?:rocznikow|roczników|roczniki)\b/
    ]);

    const punktySanitarne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktów|punkty|pkt|punkt)\s*(?:sanitarnych|sanitarne|wod-kan|wodkan|wodno|wody|kanalizacji|hydraulicznych)\b/,
        /(?:instalacj[ai] sanitarn[aej]?|wod-kan|wodkan|kanalizacj[ai]|hydraulik[ai]|wodno kanalizacyjn[aej]?)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktów|pkt)?/
    ]);

    const punktyCO = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktów|punkty|pkt|punkt)\s*(?:co|c\.o\.|grzejnikowych|grzejnikowe|centralnego ogrzewania)\b/,
        /(?:instalacj[ai] co|instalacj[ai] c\.o\.|centralne ogrzewanie|grzejnik|grzejnika|grzejniki)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktów|pkt)?/
    ]);

    const grzejniki = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:grzejnikow|grzejników|grzejniki|grzejnik)\b/]);

    const sciankaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:scianka|ścianka|gk|karton gips|karton-gips|regips)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:scianka|ścianka|gk|karton gips|karton-gips|regips)/
    ]);

    const podlogaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:wykladzina|wykładzina|podloge|podłoge|podłogę|podloga|podłoga|panele)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:wykladzina|wykładzina|podloga|podłoga|panele)/
    ]);

    const odZera = /od zera|nowa instalacja|nowe punkty|wykonanie|wykonac|wykonać|kompletna instalacja|stan deweloperski|deweloperski|generalny/.test(opis);
    const remont = /remont|stare|stary|modernizacja|przerobka|przeróbka|przerobienie|przerobić|przerobic/.test(opis);
    const wymiana = /wymiana|wymienic|wymienić|do wymiany/.test(opis);
    const przerobka = /przerobka|przeróbka|przerobienie|przerobić|przerobic|przeniesienie|przeniesc|przenieść/.test(opis);

    const zakresMalowanie = /malowania|malowanie|pomalowac|pomalować|farba|bialy|biały|kolor|sciany|ściany|sufit/.test(opis);
    const zakresGladz = /gladz|gładź|gladzie|gładzie|szpachlowanie|szlifowanie/.test(opis);
    const zakresZabezpieczen = /zabezpiec|folia|folie|taśmy|tasmy|oklejanie|okleic|okleić|parapet|detal|meble/.test(opis);
    const zakresSanitarny = /sanitarn|wod-kan|wodkan|wodno|kanalizac|hydraul|woda|odpływ|odplyw|podejscie|podejście|umywalk|zlew|wc|toalet|prysznic|wanna/.test(opis);
    const zakresCO = /c\.o\.|co |centralne ogrzewanie|grzejnik|grzejniki|podlogowka|podłogówka|ogrzewanie/.test(opis);

    const propozycje = [];
    const dodaj = (config) => dodajRemontowaPropozycje(propozycje, config);

    let powierzchniaMalowania = null;
    let uwagaMalowania = "";

    if (metraz && zakresMalowanie) {
        const sufit = Math.round(metraz);
        const sciany = Math.round(metraz * 3);
        powierzchniaMalowania = sufit + sciany;
        uwagaMalowania = `Szacunek: sufit ${sufit} m² + ściany ok. ${sciany} m²`;
    }

    const powierzchniaRobocza = powierzchniaMalowania || (metraz ? Math.round(metraz * 4) : 120);

    if (zakresZabezpieczen || zakresMalowanie || zakresGladz) {
        if (metraz) {
            dodaj({ nazwa: "Zabezpieczenie podłóg folią", szukaj: ["zabezpieczenie podłóg", "folia", "zabezpieczenie"], jednostka: "m²", ilosc: metraz, cena: 6, uwaga: "Doliczono automatycznie: prace wykończeniowe wymagają zabezpieczenia podłóg" });
        }
        dodaj({ nazwa: "Oklejanie taśmą malarską detali", szukaj: ["taśma", "tasma", "oklejanie", "zabezpieczenie"], jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 80, uwaga: "Doliczono automatycznie: zabezpieczenie detali, narożników, ościeżnic i krawędzi" });
        dodaj({ nazwa: "Zabezpieczenie okien i parapetów", szukaj: ["zabezpieczenie okien", "parapet", "okno"], jednostka: "kpl.", ilosc: okna, cena: 45, uwaga: "Szacunek: przyjęto orientacyjnie 1 okno/parapet na pomieszczenie" });
    }

    if (zakresGladz) {
        dodaj({ nazwa: "Przygotowanie powierzchni pod gładź", szukaj: ["przygotowanie powierzchni", "przygotowanie pod gładź", "gladz"], jednostka: "m²", ilosc: powierzchniaRobocza, cena: 8, uwaga: "Doliczono automatycznie: gładź wymaga przygotowania podłoża" });
        dodaj({ nazwa: "Gruntowanie pod gładź", szukaj: ["gruntowanie", "grunt"], jednostka: "m²", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: gładź wymaga gruntowania" });
        dodaj({ nazwa: "Montaż narożników aluminiowych", szukaj: ["narożnik", "naroznik", "aluminiowy"], jednostka: "mb", ilosc: Math.max(4, Math.round(okna * 4 + drzwi * 2)), cena: 18, uwaga: "Szacunek: narożniki przy oknach/drzwiach i detalach" });
        dodaj({ nazwa: "Wykonanie gładzi", szukaj: ["gładź", "gladz", "gladzie", "gładzie"], jednostka: "m²", ilosc: powierzchniaRobocza, cena: 32, uwaga: "Zakres z opisu: gładź" });
        dodaj({ nazwa: "Szlifowanie gładzi", szukaj: ["szlifowanie", "gladz", "gładź"], jednostka: "m²", ilosc: powierzchniaRobocza, cena: 10, uwaga: "Doliczono automatycznie: po gładzi potrzebne jest szlifowanie" });
        dodaj({ nazwa: "Gruntowanie po gładzi pod malowanie", szukaj: ["gruntowanie", "grunt"], jednostka: "m²", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: przygotowanie pod malowanie" });
    }

    if (zakresMalowanie) {
        dodaj({ nazwa: "Malowanie ścian i sufitu", szukaj: ["malowanie", "malowania", "farba"], jednostka: "m²", ilosc: powierzchniaMalowania || 100, cena: 28, uwaga: uwagaMalowania || "Szacunek powierzchni malowania" });
    }

    if (punktyElektryczne) {
        dodaj({ nazwa: "Wykonanie punktu elektrycznego", szukaj: ["punkt elektryczny", "montaż punktu", "montaz punktu", "punkt"], unikaj: ["przemysł", "przemyslow", "siłowe", "silowe"], jednostka: "pkt", ilosc: punktyElektryczne, cena: 120, uwaga: "Ilość punktów z opisu" });
        if (odZera || przerobka) {
            dodaj({ nazwa: "Kucie / bruzdowanie pod punkt elektryczny", szukaj: ["bruzdowanie", "kucie", "bruzda"], jednostka: "szt.", ilosc: punktyElektryczne, cena: 45, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt wymaga przygotowania trasy" });
            dodaj({ nazwa: "Naprawa bruzd po elektryce", szukaj: ["naprawa bruzd", "bruzdy", "zaprawienie"], jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: po wykonaniu punktu trzeba naprawić bruzdę" });
        }
        dodaj({ nazwa: "Montaż osprzętu elektrycznego", szukaj: ["osprzęt", "osprzet", "gniazdo", "łącznik", "wlacznik"], unikaj: ["przemysł", "przemyslow", "siłowe", "silowe"], jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: punkt wymaga montażu/podłączenia osprzętu" });
    }

    if (gniazda) {
        if (wymiana) dodaj({ nazwa: "Demontaż starego gniazda", szukaj: ["demontaż", "demontaz", "gniazdo"], jednostka: "szt.", ilosc: gniazda, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaż starego osprzętu" });
        dodaj({ nazwa: "Wymiana / montaż gniazda elektrycznego", szukaj: ["wymiana gniazda", "gniazdo elektryczne", "montaż gniazda", "montaz gniazda", "gniazdo"], unikaj: ["przemysł", "przemyslow", "siłowe", "silowe", "230v przemyslowe", "400v"], jednostka: "szt.", ilosc: gniazda, cena: 90, uwaga: "Ilość gniazd z opisu" });
    }

    if (laczniki) {
        if (wymiana) dodaj({ nazwa: "Demontaż starego łącznika / włącznika", szukaj: ["demontaż", "demontaz", "łącznik", "wlacznik"], jednostka: "szt.", ilosc: laczniki, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaż starego osprzętu" });
        dodaj({ nazwa: "Wymiana / montaż łącznika światła", szukaj: ["łącznik", "lacznik", "włącznik", "wlacznik", "osprzęt", "osprzet"], unikaj: ["przemysł", "przemyslow", "siłowe", "silowe"], jednostka: "szt.", ilosc: laczniki, cena: 80, uwaga: opis.includes("rocznik") ? "Rozpoznano z dyktowania jako „roczniki” — potraktowano jako łączniki" : "Ilość łączników z opisu" });
    }

    if (zakresSanitarny || punktySanitarne) {
        const ilosc = punktySanitarne || 1;
        if (przerobka || wymiana || remont) dodaj({ nazwa: "Demontaż / odkrycie starego punktu wod-kan", szukaj: ["demontaż", "demontaz", "wod-kan", "hydraulika"], jednostka: "szt.", ilosc, cena: 90, uwaga: "Doliczono automatycznie: przeróbka/wymiana punktu sanitarnego wymaga demontażu lub odkrycia starego układu" });
        if (odZera || przerobka || /wykonanie|wykonac|wykonać|nowy/.test(opis)) dodaj({ nazwa: "Kucie / przygotowanie trasy pod wod-kan", szukaj: ["kucie", "bruzdowanie", "wod-kan", "hydraulika"], jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy punkt sanitarny wymaga przygotowania trasy" });
        dodaj({ nazwa: przerobka ? "Przeróbka punktu wod-kan" : "Wykonanie punktu wod-kan", szukaj: ["wod-kan", "hydraulika", "punkt sanitarny", "kanalizacja", "woda"], jednostka: "szt.", ilosc, cena: przerobka ? 420 : 360, uwaga: przerobka ? "Zakres z opisu: przeróbka punktu sanitarnego" : "Zakres z opisu: wykonanie punktu sanitarnego" });
        dodaj({ nazwa: "Naprawa bruzd po instalacji wod-kan", szukaj: ["naprawa bruzd", "zaprawienie", "bruzdy"], jednostka: "szt.", ilosc, cena: 45, uwaga: "Doliczono automatycznie: po instalacji sanitarnej trzeba naprawić bruzdy" });
        dodaj({ nazwa: "Próba szczelności instalacji wod-kan", szukaj: ["próba szczelności", "proba szczelnosci", "szczelność", "szczelnosc"], jednostka: "usługa", ilosc: 1, cena: 180, uwaga: "Doliczono automatycznie: instalacja wod-kan wymaga sprawdzenia szczelności" });
    }

    if (zakresCO || punktyCO || grzejniki) {
        const ilosc = punktyCO || grzejniki || 1;
        if (przerobka || wymiana || remont) dodaj({ nazwa: "Demontaż grzejnika / starego podejścia C.O.", szukaj: ["demontaż", "demontaz", "grzejnik", "co"], jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: przeróbka/wymiana C.O. wymaga demontażu starego elementu" });
        if (odZera || przerobka || /wykonanie|wykonac|wykonać|nowy/.test(opis)) dodaj({ nazwa: "Kucie / przygotowanie trasy pod C.O.", szukaj: ["kucie", "bruzdowanie", "co", "centralne ogrzewanie"], jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt C.O. wymaga przygotowania trasy" });
        dodaj({ nazwa: przerobka ? "Przeróbka punktu C.O." : "Wykonanie punktu C.O.", szukaj: ["co", "centralne ogrzewanie", "grzejnik", "podejście"], jednostka: "szt.", ilosc, cena: przerobka ? 450 : 380, uwaga: przerobka ? "Zakres z opisu: przeróbka punktu C.O." : "Zakres z opisu: wykonanie punktu C.O." });
        if (grzejniki || /grzejnik/.test(opis)) dodaj({ nazwa: "Montaż grzejnika", szukaj: ["montaż grzejnika", "montaz grzejnika", "grzejnik"], jednostka: "szt.", ilosc, cena: 180, uwaga: "Doliczono automatycznie: punkt C.O. zwykle kończy się montażem grzejnika" });
        dodaj({ nazwa: "Próba szczelności instalacji C.O.", szukaj: ["próba szczelności", "proba szczelnosci", "szczelność", "szczelnosc", "co"], jednostka: "usługa", ilosc: 1, cena: 200, uwaga: "Doliczono automatycznie: instalacja C.O. wymaga próby szczelności" });
    }

    if (/scianka|ścianka|gk|karton gips|karton-gips|regips|dzialowa|działowa/.test(opis)) {
        const m2 = sciankaM2 || 10;
        dodaj({ nazwa: "Konstrukcja ścianki GK", szukaj: ["ścianka", "scianka", "gk", "karton gips", "profil"], jednostka: "m²", ilosc: m2, cena: 85, uwaga: "Doliczono automatycznie: ścianka GK wymaga konstrukcji" });
        dodaj({ nazwa: "Płytowanie ścianki GK", szukaj: ["płyta gk", "plyta gk", "karton gips", "regips"], jednostka: "m²", ilosc: m2, cena: 95, uwaga: "Zakres z opisu: ścianka GK" });
        dodaj({ nazwa: "Taśmowanie i spoinowanie GK", szukaj: ["taśmowanie", "tasmowanie", "spoinowanie", "gk"], jednostka: "m²", ilosc: m2, cena: 35, uwaga: "Doliczono automatycznie: GK wymaga spoinowania" });
        dodaj({ nazwa: "Szlifowanie i gruntowanie GK", szukaj: ["szlifowanie", "gruntowanie", "gk"], jednostka: "m²", ilosc: m2, cena: 18, uwaga: "Doliczono automatycznie: przygotowanie GK pod malowanie" });
    }

    if (/wykladzina|wykładzina|podloge|podłoge|podłogę|podloga|podłoga|panele|paneli/.test(opis)) {
        const m2 = podlogaM2 || metraz || 50;
        dodaj({ nazwa: "Przygotowanie podłoża pod podłogę", szukaj: ["przygotowanie podłoża", "podłoże", "podloze", "podłoga"], jednostka: "m²", ilosc: m2, cena: 12, uwaga: "Doliczono automatycznie: przed ułożeniem podłogi trzeba przygotować podłoże" });
        dodaj({ nazwa: /panele|paneli/.test(opis) ? "Ułożenie paneli" : "Ułożenie wykładziny", szukaj: /panele|paneli/.test(opis) ? ["panele", "podłoga"] : ["wykładzina", "wykladzina", "podłoga", "podloga"], jednostka: "m²", ilosc: m2, cena: /panele|paneli/.test(opis) ? 55 : 45, uwaga: podlogaM2 ? "Metraż podłogi z opisu" : "Przyjęto metraż mieszkania jako powierzchnię podłogi" });
        dodaj({ nazwa: "Docinki / progi / wykończenie podłogi", szukaj: ["docinki", "progi", "listwy", "podłoga"], jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 120, uwaga: "Doliczono automatycznie: podłoga wymaga docinek i wykończeń" });
    }

    if (!propozycje.length) {
        if (metraz) {
            dodaj({ nazwa: "Robocizna remontowa — wycena szacunkowa", szukaj: ["robocizna", "remont", "prace"], jednostka: "m²", ilosc: metraz, cena: 110, uwaga: "Nie wykryto szczegółów — szacunek z metrażu" });
        } else {
            alert("Nie udało się rozpoznać zakresu. Dopisz metraż albo słowa: malowanie, gładź, gniazda, punkty, wod-kan, C.O., wykładzina.");
            return;
        }
    }

    szybkaWycenaPropozycje = normalizujPozycjeSzybkiejWyceny(propozycje);
    renderujSzybkaWyceneWynik({
        metraz,
        punkty: punktyElektryczne,
        pokoje,
        odZera,
        remont,
        wymiana,
        przerobka,
        gniazda,
        laczniki,
        sanitarne: punktySanitarne,
        co: punktyCO || grzejniki
    });
}



// ==========================================
// SZYBKA WYCENA V10 — ZESTAWY ROBÓT BEZ POWIELANIA
// ==========================================

function dodajPozycjeRegulyBezPowielania(lista, config) {
    if (!config || !config.nazwa) return;

    const key = normalizeText(config.nazwa)
        .replace(/\s+/g, " ")
        .replace(/wykonanie /g, "")
        .replace(/montaz /g, "")
        .replace(/montaż /g, "")
        .trim();

    const istnieje = lista.some(p => {
        const nazwa = normalizeText(p.nazwa || p.name || "")
            .replace(/\s+/g, " ")
            .replace(/wykonanie /g, "")
            .replace(/montaz /g, "")
            .replace(/montaż /g, "")
            .trim();
        return nazwa === key;
    });

    if (istnieje) return;

    const cena = Number(config.cena ?? config.cena_netto ?? config.cenaNetto ?? 0);
    const ilosc = Number(config.ilosc ?? 1);
    const vat = Number(config.vat ?? 23);

    lista.push({
        id: "rule-" + Date.now() + "-" + Math.random().toString(16).slice(2),
        usluga_id: null,
        nazwa: config.nazwa,
        name: config.nazwa,
        jednostka: config.jednostka || "szt.",
        unit: config.jednostka || "szt.",
        cena_netto: cena,
        cenaNetto: cena,
        price: cena,
        cena: cena,
        ilosc: ilosc,
        quantity: ilosc,
        vat: vat,
        vat_rate: vat,
        uwaga: config.uwaga || "Doliczono automatycznie w trybie remontowym",
        note: config.uwaga || "Doliczono automatycznie w trybie remontowym",
        zrodlo: "reguly-remontowe"
    });
}

function generujSzybkaWycene() {
    if (rolaUsera === "guest") {
        alert("Gość nie może generować wyceny.");
        return;
    }

    const pole = document.getElementById("szybka-wycena-opis");
    const opisOryginalny = pole?.value?.trim() || "";
    const opis = normalizeText(opisOryginalny);

    if (!opis) {
        alert("Opisz zlecenie, np. mieszkanie 30 m², malowanie, gładź, 10 punktów elektrycznych.");
        return;
    }

    const metraz = pobierzLiczbeZOpisu(opis, [
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów|metry|metra|m powierzchni)\b/,
        /mieszkanie\s*(\d+(?:[.,]\d+)?)/,
        /lokal\s*(\d+(?:[.,]\d+)?)/,
        /dom\s*(\d+(?:[.,]\d+)?)/
    ]);

    const pokoje = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:pokoi|pokoje|pokojach|pokój|pokoj|pomieszczenia|pomieszczeń)\b/
    ]);

    const okna = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:okien|okna|okno)\b/]) || pokoje || 1;
    const drzwi = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:drzwi|oscieznic|ościeżnic)\b/]) || pokoje || 1;

    const punktyElektryczne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktów|punkty|pkt|punkt)\s*(?:elektrycznych|elektryczne|elektryki|instalacji elektrycznej)?\b/,
        /(?:instalacj[ai] elektryczn[aej]?|elektryka)[^\d]{0,35}(\d+)\s*(?:szt|punkt|punktow|punktów|pkt)?/
    ]);

    const gniazda = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:gniazd|gniazdek|gniazda|gniazdo)\b/,
        /(?:gniazd|gniazdek|gniazda|gniazdo)[^\d]{0,20}(\d+)/
    ]);

    const laczniki = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:lacznikow|łączników|wlacznikow|włączników|laczniki|łączniki|wlaczniki|włączniki)\b/,
        /(\d+)\s*(?:rocznikow|roczników|roczniki)\b/
    ]);

    const punktySanitarne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktów|punkty|pkt|punkt)\s*(?:sanitarnych|sanitarne|wod-kan|wodkan|wodno|wody|kanalizacji|hydraulicznych)\b/,
        /(?:instalacj[ai] sanitarn[aej]?|wod-kan|wodkan|kanalizacj[ai]|hydraulik[ai]|wodno kanalizacyjn[aej]?)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktów|pkt)?/
    ]);

    const punktyCO = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktów|punkty|pkt|punkt)\s*(?:co|c\.o\.|grzejnikowych|grzejnikowe|centralnego ogrzewania)\b/,
        /(?:instalacj[ai] co|instalacj[ai] c\.o\.|centralne ogrzewanie|grzejnik|grzejnika|grzejniki)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktów|pkt)?/
    ]);

    const grzejniki = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:grzejnikow|grzejników|grzejniki|grzejnik)\b/]);

    const sciankaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:scianka|ścianka|gk|karton gips|karton-gips|regips)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:scianka|ścianka|gk|karton gips|karton-gips|regips)/
    ]);

    const podlogaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:wykladzina|wykładzina|podloge|podłoge|podłogę|podloga|podłoga|panele)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metrow|metrów)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|m²)\s*(?:wykladzina|wykładzina|podloga|podłoga|panele)/
    ]);

    const odZera = /od zera|nowa instalacja|nowe punkty|wykonanie|wykonac|wykonać|kompletna instalacja|stan deweloperski|deweloperski|generalny/.test(opis);
    const remont = /remont|stare|stary|modernizacja|przerobka|przeróbka|przerobienie|przerobić|przerobic/.test(opis);
    const wymiana = /wymiana|wymienic|wymienić|do wymiany/.test(opis);
    const przerobka = /przerobka|przeróbka|przerobienie|przerobić|przerobic|przeniesienie|przeniesc|przenieść/.test(opis);

    const zakresMalowanie = /malowania|malowanie|pomalowac|pomalować|farba|bialy|biały|kolor|sciany|ściany|sufit/.test(opis);
    const zakresGladz = /gladz|gładź|gladzie|gładzie|szpachlowanie|szlifowanie/.test(opis);
    const zakresZabezpieczen = /zabezpiec|folia|folie|taśmy|tasmy|oklejanie|okleic|okleić|parapet|detal|meble/.test(opis);
    const zakresSanitarny = /sanitarn|wod-kan|wodkan|wodno|kanalizac|hydraul|woda|odpływ|odplyw|podejscie|podejście|umywalk|zlew|wc|toalet|prysznic|wanna/.test(opis);
    const zakresCO = /c\.o\.|co |centralne ogrzewanie|grzejnik|grzejniki|podlogowka|podłogówka|ogrzewanie/.test(opis);

    const propozycje = [];
    const dodaj = (config) => dodajPozycjeRegulyBezPowielania(propozycje, config);

    let powierzchniaMalowania = null;
    let uwagaMalowania = "";

    if (metraz && zakresMalowanie) {
        const sufit = Math.round(metraz);
        const sciany = Math.round(metraz * 3);
        powierzchniaMalowania = sufit + sciany;
        uwagaMalowania = `Szacunek: sufit ${sufit} m² + ściany ok. ${sciany} m²`;
    }

    const powierzchniaRobocza = powierzchniaMalowania || (metraz ? Math.round(metraz * 4) : 120);

    // 1. ZABEZPIECZENIE — jeden kontrolowany zestaw, bez łapania każdego słowa osobno.
    if (zakresZabezpieczen || zakresMalowanie || zakresGladz) {
        if (metraz) {
            dodaj({ nazwa: "Zabezpieczenie podłóg folią", jednostka: "m²", ilosc: metraz, cena: 6, uwaga: "Doliczono automatycznie: prace wykończeniowe wymagają zabezpieczenia podłóg" });
        }
        dodaj({ nazwa: "Oklejanie taśmą malarską detali", jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 80, uwaga: "Doliczono automatycznie: zabezpieczenie detali, narożników, ościeżnic i krawędzi" });
        if (okna) dodaj({ nazwa: "Zabezpieczenie okien i parapetów", jednostka: "kpl.", ilosc: okna, cena: 45, uwaga: "Szacunek: przyjęto orientacyjnie 1 okno/parapet na pomieszczenie" });
    }

    // 2. GŁADŹ — bez podwójnej gładzi i bez podwójnego gruntowania.
    if (zakresGladz) {
        dodaj({ nazwa: "Przygotowanie powierzchni pod gładź", jednostka: "m²", ilosc: powierzchniaRobocza, cena: 8, uwaga: "Doliczono automatycznie: gładź wymaga przygotowania podłoża" });
        dodaj({ nazwa: "Gruntowanie pod gładź", jednostka: "m²", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: gładź wymaga gruntowania" });
        dodaj({ nazwa: "Montaż narożników aluminiowych", jednostka: "mb", ilosc: Math.max(4, Math.round(okna * 4 + drzwi * 2)), cena: 18, uwaga: "Szacunek: narożniki przy oknach/drzwiach i detalach" });
        dodaj({ nazwa: "Wykonanie gładzi", jednostka: "m²", ilosc: powierzchniaRobocza, cena: 32, uwaga: "Zakres z opisu: gładź" });
        dodaj({ nazwa: "Szlifowanie gładzi", jednostka: "m²", ilosc: powierzchniaRobocza, cena: 10, uwaga: "Doliczono automatycznie: po gładzi potrzebne jest szlifowanie" });
        dodaj({ nazwa: "Gruntowanie pod malowanie", jednostka: "m²", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: przygotowanie powierzchni po gładzi pod malowanie" });
    }

    // 3. MALOWANIE.
    if (zakresMalowanie) {
        dodaj({ nazwa: "Malowanie ścian i sufitu", jednostka: "m²", ilosc: powierzchniaMalowania || 100, cena: 28, uwaga: uwagaMalowania || "Szacunek powierzchni malowania" });
    }

    // 4. ELEKTRYKA.
    if (punktyElektryczne) {
        dodaj({ nazwa: "Wykonanie punktu elektrycznego", jednostka: "szt.", ilosc: punktyElektryczne, cena: 120, uwaga: "Ilość punktów z opisu" });
        if (odZera || przerobka) {
            dodaj({ nazwa: "Kucie / bruzdowanie pod punkt elektryczny", jednostka: "szt.", ilosc: punktyElektryczne, cena: 45, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt wymaga przygotowania trasy" });
            dodaj({ nazwa: "Naprawa bruzd po elektryce", jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: po wykonaniu punktu trzeba naprawić bruzdę" });
        }
        dodaj({ nazwa: "Montaż osprzętu elektrycznego", jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: punkt wymaga montażu/podłączenia osprzętu" });
    }

    if (gniazda) {
        if (wymiana) dodaj({ nazwa: "Demontaż starego gniazda", jednostka: "szt.", ilosc: gniazda, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaż starego osprzętu" });
        dodaj({ nazwa: "Montaż gniazda elektrycznego", jednostka: "szt.", ilosc: gniazda, cena: 90, uwaga: "Ilość gniazd z opisu" });
    }

    if (laczniki) {
        if (wymiana) dodaj({ nazwa: "Demontaż starego łącznika / włącznika", jednostka: "szt.", ilosc: laczniki, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaż starego osprzętu" });
        dodaj({ nazwa: "Montaż łącznika światła", jednostka: "szt.", ilosc: laczniki, cena: 80, uwaga: opis.includes("rocznik") ? "Rozpoznano z dyktowania jako „roczniki” — potraktowano jako łączniki" : "Ilość łączników z opisu" });
    }

    // 5. WOD-KAN.
    if (zakresSanitarny || punktySanitarne) {
        const ilosc = punktySanitarne || 1;
        if (przerobka || wymiana || remont) {
            dodaj({ nazwa: "Demontaż / odkrycie starego punktu wod-kan", jednostka: "szt.", ilosc, cena: 90, uwaga: "Doliczono automatycznie: przeróbka/wymiana punktu sanitarnego wymaga demontażu lub odkrycia starego układu" });
        }
        if (odZera || przerobka || /wykonanie|wykonac|wykonać|nowy/.test(opis)) {
            dodaj({ nazwa: "Kucie / przygotowanie trasy pod wod-kan", jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy punkt sanitarny wymaga przygotowania trasy" });
        }
        dodaj({ nazwa: przerobka ? "Przeróbka punktu wod-kan" : "Wykonanie punktu wod-kan", jednostka: "szt.", ilosc, cena: przerobka ? 420 : 360, uwaga: przerobka ? "Zakres z opisu: przeróbka punktu sanitarnego" : "Zakres z opisu: wykonanie punktu sanitarnego" });
        dodaj({ nazwa: "Naprawa bruzd po instalacji wod-kan", jednostka: "szt.", ilosc, cena: 45, uwaga: "Doliczono automatycznie: po instalacji sanitarnej trzeba naprawić bruzdy" });
        dodaj({ nazwa: "Próba szczelności instalacji wod-kan", jednostka: "usługa", ilosc: 1, cena: 180, uwaga: "Doliczono automatycznie: instalacja wod-kan wymaga sprawdzenia szczelności" });
    }

    // 6. C.O.
    if (zakresCO || punktyCO || grzejniki) {
        const ilosc = punktyCO || grzejniki || 1;
        if (przerobka || wymiana || remont) {
            dodaj({ nazwa: "Demontaż grzejnika / starego podejścia C.O.", jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: przeróbka/wymiana C.O. wymaga demontażu starego elementu" });
        }
        if (odZera || przerobka || /wykonanie|wykonac|wykonać|nowy/.test(opis)) {
            dodaj({ nazwa: "Kucie / przygotowanie trasy pod C.O.", jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt C.O. wymaga przygotowania trasy" });
        }
        dodaj({ nazwa: przerobka ? "Przeróbka punktu C.O." : "Wykonanie punktu C.O.", jednostka: "szt.", ilosc, cena: przerobka ? 450 : 380, uwaga: przerobka ? "Zakres z opisu: przeróbka punktu C.O." : "Zakres z opisu: wykonanie punktu C.O." });
        if (grzejniki || /grzejnik/.test(opis)) {
            dodaj({ nazwa: "Montaż grzejnika", jednostka: "szt.", ilosc, cena: 180, uwaga: "Doliczono automatycznie: punkt C.O. zwykle kończy się montażem grzejnika" });
        }
        dodaj({ nazwa: "Próba szczelności instalacji C.O.", jednostka: "usługa", ilosc: 1, cena: 200, uwaga: "Doliczono automatycznie: instalacja C.O. wymaga próby szczelności" });
    }

    // 7. GK.
    if (/scianka|ścianka|gk|karton gips|karton-gips|regips|dzialowa|działowa/.test(opis)) {
        const m2 = sciankaM2 || 10;
        dodaj({ nazwa: "Konstrukcja ścianki GK", jednostka: "m²", ilosc: m2, cena: 85, uwaga: "Doliczono automatycznie: ścianka GK wymaga konstrukcji" });
        dodaj({ nazwa: "Płytowanie ścianki GK", jednostka: "m²", ilosc: m2, cena: 95, uwaga: "Zakres z opisu: ścianka GK" });
        dodaj({ nazwa: "Taśmowanie i spoinowanie GK", jednostka: "m²", ilosc: m2, cena: 35, uwaga: "Doliczono automatycznie: GK wymaga spoinowania" });
        dodaj({ nazwa: "Szlifowanie i gruntowanie GK", jednostka: "m²", ilosc: m2, cena: 18, uwaga: "Doliczono automatycznie: przygotowanie GK pod malowanie" });
    }

    // 8. PODŁOGI.
    if (/wykladzina|wykładzina|podloge|podłoge|podłogę|podloga|podłoga|panele|paneli/.test(opis)) {
        const m2 = podlogaM2 || metraz || 50;
        dodaj({ nazwa: "Przygotowanie podłoża pod podłogę", jednostka: "m²", ilosc: m2, cena: 12, uwaga: "Doliczono automatycznie: przed ułożeniem podłogi trzeba przygotować podłoże" });
        dodaj({ nazwa: /panele|paneli/.test(opis) ? "Ułożenie paneli" : "Ułożenie wykładziny", jednostka: "m²", ilosc: m2, cena: /panele|paneli/.test(opis) ? 55 : 45, uwaga: podlogaM2 ? "Metraż podłogi z opisu" : "Przyjęto metraż mieszkania jako powierzchnię podłogi" });
        dodaj({ nazwa: "Docinki / progi / wykończenie podłogi", jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 120, uwaga: "Doliczono automatycznie: podłoga wymaga docinek i wykończeń" });
    }

    if (!propozycje.length) {
        if (metraz) {
            dodaj({ nazwa: "Robocizna remontowa — wycena szacunkowa", jednostka: "m²", ilosc: metraz, cena: 110, uwaga: "Nie wykryto szczegółów — szacunek z metrażu" });
        } else {
            alert("Nie udało się rozpoznać zakresu. Dopisz metraż albo słowa: malowanie, gładź, gniazda, punkty, wod-kan, C.O., wykładzina.");
            return;
        }
    }

    szybkaWycenaPropozycje = normalizujPozycjeSzybkiejWyceny(propozycje);
    renderujSzybkaWyceneWynik({
        metraz,
        punkty: punktyElektryczne,
        pokoje,
        odZera,
        remont,
        wymiana,
        przerobka,
        gniazda,
        laczniki,
        sanitarne: punktySanitarne,
        co: punktyCO || grzejniki
    });
}



// ==========================================
// SZYBKA WYCENA V12 — POPRAWKA DODAWANIA DO ZESTAWIENIA
// ==========================================

function pobierzLiczbeBezpiecznieV12(value, fallback = 0) {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (value === null || value === undefined) return fallback;
    const parsed = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
}

function przygotujPozycjeDoGlownejWycenyV12(p) {
    const nazwa = p.nazwa || p.name || p.usluga || "Pozycja";
    const jednostka = p.jednostka || p.unit || "szt.";
    const ilosc = pobierzLiczbeBezpiecznieV12(p.ilosc ?? p.quantity ?? p.qty, 1);
    const cenaNetto = pobierzLiczbeBezpiecznieV12(p.cenaNetto ?? p.cena_netto ?? p.cena ?? p.price ?? p.netto, 0);
    const vat = pobierzLiczbeBezpiecznieV12(p.vat ?? p.vat_rate ?? 23, 23);

    return {
        id: p.id || ("wycena-" + Date.now() + "-" + Math.random().toString(16).slice(2)),
        usluga_id: p.usluga_id || null,

        nazwa,
        name: nazwa,
        usluga: nazwa,
        opis: p.opis || p.uwaga || p.note || "",

        jednostka,
        unit: jednostka,

        ilosc,
        quantity: ilosc,

        cena_netto: cenaNetto,
        cenaNetto,
        cena: cenaNetto,
        price: cenaNetto,

        vat,
        vat_rate: vat,

        uwaga: p.uwaga || p.note || "",
        note: p.uwaga || p.note || "",
        zrodlo: p.zrodlo || "szybka-wycena"
    };
}

function dodajPozycjeZSzybkiejWyceny() {
    if (!Array.isArray(szybkaWycenaPropozycje) || !szybkaWycenaPropozycje.length) {
        alert("Najpierw wygeneruj propozycję wyceny.");
        return;
    }

    const pozycje = normalizujPozycjeSzybkiejWyceny(szybkaWycenaPropozycje)
        .map(przygotujPozycjeDoGlownejWycenyV12)
        .filter(p => p.nazwa && p.ilosc > 0);

    if (!pozycje.length) {
        alert("Brak poprawnych pozycji do dodania.");
        return;
    }

    // Najczęstsza nazwa tablicy w EL-Net.
    if (!Array.isArray(window.wycenaPozycje)) {
        window.wycenaPozycje = [];
    }

    pozycje.forEach(p => window.wycenaPozycje.push(p));

    // Dla starszych fragmentów kodu, które mogą używać zmiennej globalnej bez window.
    try {
        if (typeof wycenaPozycje !== "undefined" && Array.isArray(wycenaPozycje) && wycenaPozycje !== window.wycenaPozycje) {
            pozycje.forEach(p => wycenaPozycje.push(p));
        }
    } catch (err) {
        // ignorujemy — window.wycenaPozycje jest główne
    }

    // Odśwież tabelę i sumy — obsługa różnych nazw funkcji z wcześniejszych wersji.
    const renderFns = [
        "renderujWycene",
        "renderujPozycjeWyceny",
        "renderujTabeleWyceny",
        "renderWycena",
        "odswiezWycene",
        "przeliczWycene",
        "aktualizujPodsumowanieWyceny",
        "renderujKosztorys"
    ];

    renderFns.forEach(fn => {
        try {
            if (typeof window[fn] === "function") window[fn]();
        } catch (err) {
            console.warn("Nie udało się wykonać", fn, err);
        }
    });

    try { przeliczWyceneAwaryjnieV12(); } catch (err) { console.warn(err); }

    // Jeżeli istnieje ręczny formularz dodawania, nie czyścimy go. Czyścimy tylko propozycję.
    szybkaWycenaPropozycje = [];
    const wynik = document.getElementById("szybka-wycena-wynik");
    if (wynik) {
        wynik.innerHTML = `
            <div class="notice success">
                Dodano ${pozycje.length} pozycji do zestawienia prac.
            </div>
        `;
    }

    // Przewiń do głównego zestawienia.
    const zestawienie = document.querySelector("#wycena-pozycje, #lista-pozycji-wyceny, #wycena-table, .wycena-table, .estimate-table, .table-scroll");
    if (zestawienie && typeof zestawienie.scrollIntoView === "function") {
        zestawienie.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

// Awaryjne przeliczenie tabeli, gdy starsza funkcja renderująca nie zna nowych pól.
function przeliczWyceneAwaryjnieV12() {
    const lista = Array.isArray(window.wycenaPozycje) ? window.wycenaPozycje : [];
    const netto = lista.reduce((sum, p) => {
        const ilosc = pobierzLiczbeBezpiecznieV12(p.ilosc ?? p.quantity, 0);
        const cena = pobierzLiczbeBezpiecznieV12(p.cenaNetto ?? p.cena_netto ?? p.cena ?? p.price, 0);
        return sum + ilosc * cena;
    }, 0);
    const vat = lista.reduce((sum, p) => {
        const ilosc = pobierzLiczbeBezpiecznieV12(p.ilosc ?? p.quantity, 0);
        const cena = pobierzLiczbeBezpiecznieV12(p.cenaNetto ?? p.cena_netto ?? p.cena ?? p.price, 0);
        const stawka = pobierzLiczbeBezpiecznieV12(p.vat ?? p.vat_rate, 23);
        return sum + ilosc * cena * stawka / 100;
    }, 0);

    const kwoty = {
        netto: netto.toFixed(2) + " PLN",
        vat: vat.toFixed(2) + " PLN",
        brutto: (netto + vat).toFixed(2) + " PLN"
    };

    document.querySelectorAll("[data-wycena-netto], #wycena-netto, .wycena-netto").forEach(el => el.textContent = kwoty.netto);
    document.querySelectorAll("[data-wycena-vat], #wycena-vat, .wycena-vat").forEach(el => el.textContent = kwoty.vat);
    document.querySelectorAll("[data-wycena-brutto], #wycena-brutto, .wycena-brutto").forEach(el => el.textContent = kwoty.brutto);
}



// RESTORE V19 — Wycena przywrócona do stabilnej wersji v12. Bez panelu Edycja.
