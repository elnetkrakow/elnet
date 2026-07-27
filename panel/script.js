// ==========================================
// EL-NET v2 â€” jedna strona / panel firmowy
// ==========================================

const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";
const APP_VERSION = "2026.06.13-25-ELNET";

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
const PANEL_BACKUP_PREFIX = "elnet_panel_backup";
const PANEL_LINKS_KEY = "elnet_panel_calendar_investment_links_v1";
let panelLinks = {
    investments: {},
    events: {},
    eventTypes: {},
    investmentDates: {},
    todayPrompts: {},
    backupCreatedForVersion: null
};

let wycenaPozycje = [];
let szybkaWycenaPropozycje = [];
let edytowanaUslugaId = null;
let edytowanaPozycjaId = null;
let edytowanaPozycjaIdPanel = null;
let edytowanaInwestycjaId = null;
let edytowanaZaliczkaId = null;
let edytowanyKosztId = null;
let usunInwestycjeModalResolve = null;
let usunInwestycjeModalWybor = null;
let zakonczInwestycjeModalResolve = null;
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

function wczytajLokalnePowiazaniaPanelu() {
    try {
        const raw = localStorage.getItem(PANEL_LINKS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        panelLinks = {
            investments: parsed.investments || {},
            events: parsed.events || {},
            eventTypes: parsed.eventTypes || {},
            investmentDates: parsed.investmentDates || {},
            todayPrompts: parsed.todayPrompts || {},
            backupCreatedForVersion: parsed.backupCreatedForVersion || null
        };
    } catch (err) {
        console.warn("Nie udalo sie wczytac lokalnych powiazan panelu:", err);
    }
}

function zapiszLokalnePowiazaniaPanelu() {
    try {
        localStorage.setItem(PANEL_LINKS_KEY, JSON.stringify(panelLinks));
    } catch (err) {
        console.warn("Nie udalo sie zapisac lokalnych powiazan panelu:", err);
    }
}

function wyczyscTylkoSesje() {
    try {
        localStorage.removeItem("elnet_token");
        localStorage.removeItem("elnet_user");
        sessionStorage.clear();
    } catch (e) {
        /* ignore */
    }
}

function utworzKopieBezpieczenstwaPanelu() {
    if (panelLinks.backupCreatedForVersion === APP_VERSION) return;
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const key = `${PANEL_BACKUP_PREFIX}_${APP_VERSION}_${stamp}`;
        localStorage.setItem(key, JSON.stringify({
            version: APP_VERSION,
            createdAt: new Date().toISOString(),
            inwestycje,
            terminarz,
            kosztorysy,
            inwestycjeZaliczki,
            inwestycjeKoszty,
            inwestycjePraceDodatkowe,
            links: panelLinks
        }));
        panelLinks.backupCreatedForVersion = APP_VERSION;
        zapiszLokalnePowiazaniaPanelu();
    } catch (err) {
        console.warn("Nie udalo sie utworzyc kopii bezpieczenstwa panelu:", err);
    }
}

wczytajLokalnePowiazaniaPanelu();

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
            console.warn("Nie udaĹ‚o siÄ™ zapisaÄ‡ logu:", warningText);
            return;
        }
    } catch (err) {
        console.warn("Nie udaĹ‚o siÄ™ zapisaÄ‡ logu:", err);
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
        console.error("BĹ‚Ä…d logĂłw:", err);
        logi = [];
    }
}

function obsluzBladAutoryzacji(errorText) {
    // Zabezpieczenie: jeĹ›li bĹ‚Ä…d autoryzacji juĹĽ zostaĹ‚ obsĹ‚uĹĽony, wyjĹ›Ä‡
    if (authErrorHandled === true) return;
    
    if (!errorText || typeof errorText !== 'string') return;

    const lower = errorText.toLowerCase();

    const expired = lower.includes('jwt expired') || lower.includes('pgrst301') || lower.includes('401');
    if (!expired) return;

    // SprawdziÄ‡ czy jesteĹ›my na ekranie logowania
    const login = document.getElementById('login-screen');
    const app = document.getElementById('app-screen');
    const isOnLoginScreen = login && !login.classList.contains('hidden');

    if (isOnLoginScreen) {
        // JeĹ›li juĹĽ na ekranie logowania, tylko wyczyĹ›Ä‡ storage
        wyczyscTylkoSesje();
        accessToken = null;
        zalogowanyUser = null;
        rolaUsera = 'guest';
        authErrorHandled = true;
        return;
    }

    // Ustaw flagÄ™ aby uniknÄ…Ä‡ wielu alertĂłw
    authErrorHandled = true;

    // Clear session and reset state
    wyczyscTylkoSesje();
    accessToken = null;
    zalogowanyUser = null;
    rolaUsera = 'guest';

    // PokaĹĽ alert maksymalnie raz
    alert('Sesja wygasĹ‚a. Zaloguj siÄ™ ponownie.');

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

    const btnTerminarzNowaInwestycja = document.getElementById("btn-terminarz-nowa-inwestycja");
    if (btnTerminarzNowaInwestycja) btnTerminarzNowaInwestycja.addEventListener("click", () => otworzFormularzInwestycji({ source: "terminarz" }));

    const btnTerminarzNoweZadanie = document.getElementById("btn-terminarz-nowe-zadanie");
    if (btnTerminarzNoweZadanie) btnTerminarzNoweZadanie.addEventListener("click", () => {
        anulujEdycjeTerminu();
        document.getElementById("card-terminarz-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const btnZamknijInwestycje = document.getElementById("btn-zamknij-inwestycje");
    if (btnZamknijInwestycje) btnZamknijInwestycje.addEventListener("click", zamknijPanelInwestycji);

    const btnDrukujInwestycje = document.getElementById("btn-drukuj-inwestycje");
    if (btnDrukujInwestycje) btnDrukujInwestycje.addEventListener("click", pokazModalDrukuInwestycji);

    const btnZamknijUsunInwestycje = document.getElementById("btn-zamknij-usun-inwestycje-modal");
    if (btnZamknijUsunInwestycje) btnZamknijUsunInwestycje.addEventListener("click", () => zamknijModalUsuwaniaInwestycji(null));

    const btnAnulujUsunInwestycje = document.getElementById("btn-anuluj-usun-inwestycje");
    if (btnAnulujUsunInwestycje) btnAnulujUsunInwestycje.addEventListener("click", () => zamknijModalUsuwaniaInwestycji(null));

    const btnPotwierdzUsunInwestycje = document.getElementById("btn-potwierdz-usun-inwestycje");
    if (btnPotwierdzUsunInwestycje) btnPotwierdzUsunInwestycje.addEventListener("click", potwierdzWyborUsuwaniaInwestycji);

    const usunInwestycjeBackdrop = document.querySelector("#usun-inwestycje-modal .modal-backdrop");
    if (usunInwestycjeBackdrop) usunInwestycjeBackdrop.addEventListener("click", () => zamknijModalUsuwaniaInwestycji(null));

    document.querySelectorAll("[data-delete-investment-choice]").forEach(btn => {
        btn.addEventListener("click", () => wybierzOpcjeUsuwaniaInwestycji(btn.dataset.deleteInvestmentChoice));
    });

    const btnZamknijZakonczInwestycje = document.getElementById("btn-zamknij-zakoncz-inwestycje-modal");
    if (btnZamknijZakonczInwestycje) btnZamknijZakonczInwestycje.addEventListener("click", () => zamknijModalZakonczeniaInwestycji(null));

    const btnAnulujZakonczInwestycje = document.getElementById("btn-anuluj-zakoncz-inwestycje");
    if (btnAnulujZakonczInwestycje) btnAnulujZakonczInwestycje.addEventListener("click", () => zamknijModalZakonczeniaInwestycji(null));

    const btnPotwierdzZakonczInwestycje = document.getElementById("btn-potwierdz-zakoncz-inwestycje");
    if (btnPotwierdzZakonczInwestycje) btnPotwierdzZakonczInwestycje.addEventListener("click", potwierdzModalZakonczeniaInwestycji);

    const zakonczInwestycjeBackdrop = document.querySelector("#zakoncz-inwestycje-modal .modal-backdrop");
    if (zakonczInwestycjeBackdrop) zakonczInwestycjeBackdrop.addEventListener("click", () => zamknijModalZakonczeniaInwestycji(null));

    document.addEventListener("keydown", event => {
        const modal = document.getElementById("usun-inwestycje-modal");
        if (event.key === "Escape" && modal && !modal.classList.contains("hidden")) {
            zamknijModalUsuwaniaInwestycji(null);
        }
        const finishModal = document.getElementById("zakoncz-inwestycje-modal");
        if (event.key === "Escape" && finishModal && !finishModal.classList.contains("hidden")) {
            zamknijModalZakonczeniaInwestycji(null);
        }
    });

    const btnDodajZaliczke = document.getElementById("btn-dodaj-zaliczke");
    if (btnDodajZaliczke) btnDodajZaliczke.addEventListener("click", dodajZaliczke);

    const btnAnulujZaliczke = document.getElementById("btn-anuluj-zaliczke");
    if (btnAnulujZaliczke) btnAnulujZaliczke.addEventListener("click", anulujEdycjeZaliczki);

    const btnDodajKoszt = document.getElementById("btn-dodaj-koszt");
    if (btnDodajKoszt) btnDodajKoszt.addEventListener("click", dodajKoszt);

    const btnAnulujKoszt = document.getElementById("btn-anuluj-koszt");
    if (btnAnulujKoszt) btnAnulujKoszt.addEventListener("click", anulujEdycjeKosztu);

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
        wyczyscTylkoSesje();
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

    const kosztNetto = document.getElementById("koszt-netto");
    if (kosztNetto) kosztNetto.addEventListener("input", () => przeliczFormularzKosztu("netto"));

    const kosztBrutto = document.getElementById("koszt-brutto");
    if (kosztBrutto) kosztBrutto.addEventListener("input", () => przeliczFormularzKosztu("brutto"));

    const kosztVatRate = document.getElementById("koszt-vat-rate");
    if (kosztVatRate) kosztVatRate.addEventListener("change", () => {
        const source = document.getElementById("koszt-brutto")?.value ? "brutto" : "netto";
        przeliczFormularzKosztu(source);
    });

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
        alert("Wpisz e-mail i hasĹ‚o.");
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

        if (!authResponse.ok) throw new Error("BĹ‚Ä™dne dane logowania.");

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

        // Zresetuj flagÄ™ bĹ‚Ä™du autoryzacji po poprawnym logowaniu
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

    // Formularz usĹ‚ug widoczny dla zalogowanych rĂłl (admin, staff, user)
    // oraz dla konkretnego konta n.norbud@gmail.com niezaleĹĽnie od roli
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
// SUPABASE â€” POBIERANIE
// ==========================================

async function odswiezDane() {
    console.log("ELNET LOAD DEBUG: currentUser", zalogowanyUser);
    console.log("ELNET LOAD DEBUG: localStorage elnet_user", localStorage.getItem("elnet_user"));
    console.log("ELNET LOAD DEBUG: localStorage elnet_token exists", !!localStorage.getItem("elnet_token"));

    await Promise.allSettled([
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

    utworzKopieBezpieczenstwaPanelu();
    await zsynchronizujAktywneInwestycjeZTerminarzem();

    renderujWszystko();
    sprawdzDzisiejszeInwestycjeWTerminarzu();
}

async function pobierzUslugi() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/uslugi?select=*&order=nazwa.asc`;
        console.log("ELNET LOAD DEBUG: pobieram tabelÄ™", "uslugi", "userId", zalogowanyUser?.id || null);
        console.log("ELNET LOAD DEBUG: fetch url", url);
        const res = await fetch(url, {
            headers: headers()
        });
        console.log("ELNET LOAD DEBUG: fetch status", "uslugi", res.status, res.ok);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("ELNET LOAD DEBUG: bĹ‚Ä…d", "uslugi", errorText);
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        uslugi = await res.json();
        console.log("ELNET LOAD DEBUG: wynik", "uslugi", uslugi);
    } catch (err) {
        console.error("BĹ‚Ä…d usĹ‚ug:", err);
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
        console.error("BĹ‚Ä…d kosztorysĂłw:", err);
        kosztorysy = [];
    }
}

async function pobierzInwestycje() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/inwestycje?select=*&order=created_at.desc`;
        console.log("ELNET LOAD DEBUG: pobieram tabelÄ™", "inwestycje", "userId", zalogowanyUser?.id || null);
        console.log("ELNET LOAD DEBUG: fetch url", url);
        const res = await fetch(url, {
            headers: headers()
        });
        console.log("ELNET LOAD DEBUG: fetch status", "inwestycje", res.status, res.ok);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("ELNET LOAD DEBUG: bĹ‚Ä…d", "inwestycje", errorText);
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        inwestycje = await res.json();
        console.log("ELNET LOAD DEBUG: wynik", "inwestycje", inwestycje);
    } catch (err) {
        console.error("BĹ‚Ä…d inwestycji:", err);
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
        console.error("BĹ‚Ä…d zaliczek:", err);
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
        console.error("BĹ‚Ä…d kosztĂłw:", err);
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
        console.error("BĹ‚Ä…d prac dodatkowych:", err);
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
        console.error("BĹ‚Ä…d pobierania magazynu:", err);
        magazyn = [];
    }
}

async function pobierzTerminarz() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/terminarz?select=*&order=data_start.asc`;
        console.log("ELNET LOAD DEBUG: pobieram tabelÄ™", "terminarz", "userId", zalogowanyUser?.id || null);
        console.log("ELNET LOAD DEBUG: fetch url", url);
        const res = await fetch(url, {
            headers: headers()
        });
        console.log("ELNET LOAD DEBUG: fetch status", "terminarz", res.status, res.ok);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("ELNET LOAD DEBUG: bĹ‚Ä…d", "terminarz", errorText);
            obsluzBladAutoryzacji(errorText);
            throw new Error(errorText);
        }

        terminarz = await res.json();
        console.log("ELNET LOAD DEBUG: wynik", "terminarz", terminarz);
    } catch (err) {
        console.error("BĹ‚Ä…d pobierania terminarza:", err);
        terminarz = [];
    }
}

async function dodajTermin() {
    if (rolaUsera === 'guest') {
        alert('Musisz byÄ‡ zalogowany, aby dodaÄ‡ termin.');
        return;
    }

    const dataStart = document.getElementById('terminarz-data-start')?.value;
    const dataKoniec = document.getElementById('terminarz-data-koniec')?.value;
    const klient = document.getElementById('terminarz-klient')?.value.trim();
    const adres = document.getElementById('terminarz-adres')?.value.trim();
    const telefon = document.getElementById('terminarz-telefon')?.value.trim();
    const opis = document.getElementById('terminarz-opis')?.value.trim();
    const status = document.getElementById('terminarz-status')?.value || 'zaplanowane';
    const type = document.getElementById('terminarz-type')?.value || 'Zadanie';

    if (!dataStart || !dataKoniec) {
        alert('Podaj datÄ™ rozpoczÄ™cia i zakoĹ„czenia.');
        return;
    }

    const nowyStart = new Date(dataStart);
    const nowyKoniec = new Date(dataKoniec);

    if (nowyKoniec < nowyStart) {
        alert('Data zakoĹ„czenia nie moĹĽe byÄ‡ wczeĹ›niejsza niĹĽ data rozpoczÄ™cia.');
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
        type: type,
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

        const zapisane = await res.json();
        const zapisanyTermin = Array.isArray(zapisane) ? zapisane[0] : zapisane;
        const terminId = edytowanyTerminId || zapisanyTermin?.id;
        if (terminId) ustawTypTerminu(terminId, type);

        await pobierzTerminarz();
        renderujTerminarz();
        renderujKalendarzTerminarza();
        zapiszLog('Terminarz', logAkcja, `${klient} ${dataStart}â€“${dataKoniec}`);

        edytowanyTerminId = null;
        const btnDodajTermin = document.getElementById('btn-dodaj-termin');
        if (btnDodajTermin) btnDodajTermin.textContent = 'Dodaj zadanie';
        const btnAnulujTermin = document.getElementById('btn-anuluj-termin');
        if (btnAnulujTermin) btnAnulujTermin.classList.add('hidden');

        document.getElementById('terminarz-data-start').value = '';
        document.getElementById('terminarz-data-koniec').value = '';
        document.getElementById('terminarz-klient').value = '';
        document.getElementById('terminarz-adres').value = '';
        document.getElementById('terminarz-telefon').value = '';
        document.getElementById('terminarz-opis').value = '';
        document.getElementById('terminarz-status').value = 'zaplanowane';
        const typeEl = document.getElementById('terminarz-type');
        if (typeEl) typeEl.value = 'Zadanie';
    } catch (err) {
        console.error('BĹ‚Ä…d zapisu terminarza:', err);
        const msg = err?.message || String(err);
        alert('Nie udaĹ‚o siÄ™ zapisaÄ‡ terminu:\n\n' + msg);
    }
}

window.edytujTermin = function(id) {
    if (rolaUsera === 'guest') {
        alert('Tylko zalogowany uĹĽytkownik moĹĽe edytowaÄ‡ termin.');
        return;
    }

    const termin = terminarz.find(item => String(item.id) === String(id));
    if (!termin) return;

    const investmentId = pobierzPowiazanaInwestycjeId(termin);
    if (typTerminu(termin) === "Inwestycja" && investmentId) {
        otworzFormularzInwestycji({ id: investmentId, source: "terminarz" });
        return;
    }

    edytowanyTerminId = String(id);
    document.getElementById('terminarz-data-start').value = termin.data_start || '';
    document.getElementById('terminarz-data-koniec').value = termin.data_koniec || '';
    document.getElementById('terminarz-klient').value = termin.klient || '';
    document.getElementById('terminarz-adres').value = termin.adres || '';
    document.getElementById('terminarz-telefon').value = termin.telefon || '';
    document.getElementById('terminarz-opis').value = termin.opis || '';
    document.getElementById('terminarz-status').value = termin.status || 'zaplanowane';
    const typeEl = document.getElementById('terminarz-type');
    if (typeEl) typeEl.value = typTerminu(termin);

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
    const typeEl = document.getElementById('terminarz-type');
    if (typeEl) typeEl.value = 'Zadanie';

    const btnDodajTermin = document.getElementById('btn-dodaj-termin');
    if (btnDodajTermin) btnDodajTermin.textContent = 'Dodaj zadanie';
    const btnAnulujTermin = document.getElementById('btn-anuluj-termin');
    if (btnAnulujTermin) btnAnulujTermin.classList.add('hidden');
}

window.usunTermin = async function(id) {
    if (rolaUsera === "guest") {
        alert("Tylko zalogowany uĹĽytkownik moĹĽe usuwaÄ‡ terminy.");
        return;
    }

    const termin = terminarz.find(item => String(item.id) === String(id));
    const investmentId = pobierzPowiazanaInwestycjeId(termin);
    const inwestycja = investmentId ? znajdzInwestycjePoId(investmentId) : null;

    if (investmentId && inwestycja) {
        if (!confirm("Ten wpis jest poĹ‚Ä…czony z inwestycjÄ…. Czy usunÄ…Ä‡ tylko wpis z Terminarza i odĹ‚Ä…czyÄ‡ inwestycjÄ™?")) return;
    } else if (!confirm("UsunÄ…Ä‡ termin?")) {
        return;
    }

    try {
        await usunTerminZBazy(id);

        if (inwestycja) {
            const inwestycjaRes = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${encodeURIComponent(investmentId)}`, {
                method: "PATCH",
                headers: headers(),
                body: JSON.stringify({ calendar_event_id: null })
            });
            if (!inwestycjaRes.ok) throw new Error(await inwestycjaRes.text());
        }

        if (id) delete panelLinks.events[String(id)];
        if (investmentId) delete panelLinks.investments[String(investmentId)];
        zapiszLokalnePowiazaniaPanelu();

        await odswiezWidokiPoZmianieTerminarza();
        zapiszLog("Terminarz", "UsuniÄ™to termin", id);
    } catch (err) {
        console.error("BĹ‚Ä…d usuwania terminarza:", err);
        alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ terminu.");
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
            const end = wyswietlanaDataKoncaTerminu(item) ? parseDateLocal(wyswietlanaDataKoncaTerminu(item)) : null;
            if (!start || !end || !filtrowanaData) return false;
            return filtrowanaData >= start && filtrowanaData <= end;
        });
    }

    function statusOrder(item) {
        const order = ['zaplanowane', 'w trakcie', 'zakoĹ„czone', 'przesuniÄ™te', 'odwoĹ‚ane'];
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
            return (parseDateLocal(wyswietlanaDataKoncaTerminu(a)) || 0) - (parseDateLocal(wyswietlanaDataKoncaTerminu(b)) || 0);
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
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Brak terminĂłw w terminarzu.</td></tr>`;
        return;
    }

    const today = new Date();
    tbody.innerHTML = lista.map(item => {
        const start = item.data_start ? parseDateLocal(item.data_start) : null;
        const end = wyswietlanaDataKoncaTerminu(item) ? parseDateLocal(wyswietlanaDataKoncaTerminu(item)) : null;
        const plannedEnd = item.data_koniec ? parseDateLocal(item.data_koniec) : null;
        const startStr = start ? start.toLocaleDateString('pl-PL') : '-';
        const endStr = plannedEnd ? plannedEnd.toLocaleDateString('pl-PL') : (end ? end.toLocaleDateString('pl-PL') : '-');
        const days = start && end ? Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1) : '-';
        const status = String(item.status || '').toLowerCase();
        const itemType = typTerminu(item);
        const investmentId = pobierzPowiazanaInwestycjeId(item);
        const linkedInvestment = investmentId ? znajdzInwestycjePoId(investmentId) : null;
        const orphanInvestmentLink = Boolean(investmentId && !linkedInvestment);
        const isCompletedInvestmentEvent = Boolean(linkedInvestment && czyTerminLubInwestycjaZakonczona(item));
        const statusText = isCompletedInvestmentEvent ? "Zakończona · PI" : (linkedInvestment ? `${status || '-'} · PI` : (status || '-'));
        const statusTitle = linkedInvestment ? 'PI â€” powiÄ…zana inwestycja' : '';
        const statusLabel = `<span class="status-tag status-${status.replace(/\s/g, '-')}" title="${esc(statusTitle)}">${esc(statusText)}</span>`;
        const historicalEnd = linkedInvestment && !isCompletedInvestmentEvent
            ? (rzeczywistaDataZakonczeniaTerminu(item) || rzeczywistaDataZakonczenia(linkedInvestment))
            : "";
        const planInfo = linkedInvestment && isCompletedInvestmentEvent
            ? (() => {
                const { dataStart: planStart, dataKoniec: planEnd } = pobierzDatyInwestycji(linkedInvestment);
                const actualEnd = rzeczywistaDataZakonczeniaTerminu(item) || rzeczywistaDataZakonczenia(linkedInvestment) || "-";
                return `<span class="linked-event-note">Rzeczywiste zakończenie: ${esc(actualEnd)}</span><span class="linked-event-note">Planowany termin: od ${esc(item.data_start || planStart || "-")} do ${esc(item.data_koniec || planEnd || planStart || "-")}</span>`;
            })()
            : historicalEnd
                ? `<span class="linked-event-note">Poprzednio zakończono: ${esc(historicalEnd)}</span>`
            : "";
        const investmentInfo = orphanInvestmentLink
            ? `<span class="orphaned-warning">PowiÄ…zana inwestycja nie istnieje</span>`
            : planInfo
                ? planInfo
            : itemType === "Inwestycja" && !linkedInvestment
                ? `<span class="linked-event-note">Typ: Inwestycja</span>`
                : "";
        const canEdit = rolaUsera !== 'guest';
        const editButton = canEdit
            ? `<button class="btn btn-secondary small-btn" onclick="edytujTermin('${esc(item.id)}')">Edytuj</button>`
            : '';
        const deleteButton = canEdit && !orphanInvestmentLink
            ? `<button class="btn btn-danger small-btn" onclick="usunTermin('${esc(item.id)}')">UsuĹ„</button>`
            : '';
        const investmentButton = orphanInvestmentLink
            ? `<button class="btn btn-danger small-btn" onclick="usunTermin('${esc(item.id)}')">UsuĹ„ wpis</button> <button class="btn btn-secondary small-btn" onclick="odlaczTermin('${esc(item.id)}')">OdĹ‚Ä…cz</button> <button class="btn btn-secondary small-btn" onclick="polaczTerminZInnaInwestycja('${esc(item.id)}')">PoĹ‚Ä…cz z innÄ…</button>`
            : investmentId
                ? `<button class="btn btn-secondary small-btn" onclick="przejdzDoInwestycjiZTerminu('${esc(item.id)}')">Do inwestycji</button>`
                : itemType === "Inwestycja"
                    ? `<button class="btn btn-secondary small-btn" onclick="obsluzTerminInwestycji('${esc(item.id)}')">ObsĹ‚uĹĽ inwestycjÄ™</button>`
                    : '';
        const actionClass = orphanInvestmentLink ? "calendar-row-actions orphaned-actions" : "calendar-row-actions";
        const rowClass = orphanInvestmentLink ? ' class="orphaned-event"' : '';
        const rowIdAttr = ` data-calendar-event-id="${esc(item.id)}"`;
        const akcje = [investmentButton, editButton, deleteButton].filter(Boolean).join(' ');

        return `
            <tr${rowClass}${rowIdAttr}>
                <td>${esc(startStr)} â€“ ${esc(endStr)}</td>
                <td>${esc(item.klient || '')}</td>
                <td>${esc(item.adres || '')}</td>
                <td>${esc(item.telefon || '')}</td>
                <td><div class="terminarz-status-stack">${statusLabel}${investmentInfo}</div></td>
                <td>${esc(item.opis || '')}</td>
                <td>${esc(days)}</td>
                <td class="calendar-actions-column"><div class="${actionClass}">${akcje}</div></td>
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

    const weekdays = ['Pon', 'Wt', 'Ĺšr', 'Czw', 'Pt', 'Sob', 'Nd'];

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

function typTerminu(item) {
    return item?.type || panelLinks.eventTypes?.[String(item?.id)] || "Zadanie";
}

function ustawTypTerminu(id, type) {
    if (!id) return;
    panelLinks.eventTypes[String(id)] = type || "Zadanie";
    zapiszLokalnePowiazaniaPanelu();
}

function pobierzPowiazanyTerminId(inwestycja) {
    return inwestycja?.calendar_event_id || inwestycja?.calendarEventId || panelLinks.investments?.[String(inwestycja?.id)]?.calendarEventId || null;
}

function pobierzPowiazanaInwestycjeId(termin) {
    return termin?.investment_id || termin?.investmentId || panelLinks.events?.[String(termin?.id)]?.investmentId || null;
}

async function zapiszPowiazanieInwestycjaTermin(investmentId, eventId) {
    if (!investmentId || !eventId) return;
    const updatePayload = { calendar_event_id: eventId };
    const inwestycjaRes = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${encodeURIComponent(investmentId)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(updatePayload)
    });
    const inwestycjaText = await inwestycjaRes.text();
    if (!inwestycjaRes.ok) {
        console.error("BĹ‚Ä…d aktualizacji powiÄ…zania inwestycji:", {
            status: inwestycjaRes.status,
            text: inwestycjaText,
            payload: updatePayload
        });
        throw new Error(inwestycjaText);
    }

    const terminarzUpdatePayload = { investment_id: investmentId, type: "Inwestycja" };
    const terminarzRes = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(terminarzUpdatePayload)
    });
    const terminarzText = await terminarzRes.text();
    if (!terminarzRes.ok) {
        console.error("BĹ‚Ä…d aktualizacji powiÄ…zania terminarza:", {
            status: terminarzRes.status,
            text: terminarzText,
            payload: terminarzUpdatePayload
        });
        throw new Error(terminarzText);
    }

    panelLinks.investments[String(investmentId)] = {
        ...(panelLinks.investments[String(investmentId)] || {}),
        calendarEventId: String(eventId)
    };
    panelLinks.events[String(eventId)] = {
        ...(panelLinks.events[String(eventId)] || {}),
        investmentId: String(investmentId)
    };
    panelLinks.eventTypes[String(eventId)] = "Inwestycja";
    zapiszLokalnePowiazaniaPanelu();
}

function zapiszDatyInwestycji(investmentId, dataStart, dataKoniec) {
    if (!investmentId || !dataStart) return;
    panelLinks.investmentDates[String(investmentId)] = {
        data_start: dataStart,
        data_koniec: dataKoniec || dataStart
    };
    zapiszLokalnePowiazaniaPanelu();
}

function znajdzInwestycjePoId(id) {
    return (inwestycje || []).find(i => String(i.id) === String(id));
}

async function usunTerminZBazy(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers()
    });
    if (!res.ok) throw new Error(await res.text());
}

async function odlaczTerminOdInwestycji(termin, options = {}) {
    if (!termin) return;
    const investmentId = pobierzPowiazanaInwestycjeId(termin);
    const terminarzRes = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${encodeURIComponent(termin.id)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ investment_id: null, type: "Zadanie" })
    });
    if (!terminarzRes.ok) throw new Error(await terminarzRes.text());

    const inwestycja = investmentId ? znajdzInwestycjePoId(investmentId) : null;
    if (inwestycja && !options.skipInvestmentUpdate) {
        const inwestycjaRes = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${encodeURIComponent(investmentId)}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ calendar_event_id: null })
        });
        if (!inwestycjaRes.ok) throw new Error(await inwestycjaRes.text());
    }

    if (termin.id) {
        delete panelLinks.events[String(termin.id)];
        panelLinks.eventTypes[String(termin.id)] = "Zadanie";
    }
    if (investmentId) {
        delete panelLinks.investments[String(investmentId)];
    }
    zapiszLokalnePowiazaniaPanelu();
}

async function odswiezWidokiPoZmianieTerminarza() {
    await pobierzInwestycje();
    await pobierzTerminarz();
    renderujInwestycje();
    renderujTerminarz();
    renderujKalendarzTerminarza();
    renderujPulpit();
}

function pobierzDatyInwestycji(inwestycja) {
    const local = panelLinks.investmentDates?.[String(inwestycja?.id)] || {};
    const dataStart = inwestycja?.data_start || inwestycja?.data_rozpoczecia || inwestycja?.start_date || local.data_start || "";
    const dataKoniec = inwestycja?.data_koniec || inwestycja?.data_zakonczenia || inwestycja?.end_date || local.data_koniec || dataStart;
    return { dataStart, dataKoniec };
}

function normalizujStatusTekst(status) {
    return String(status || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function czyStatusInwestycjiZakonczony(status) {
    const normalized = normalizujStatusTekst(status);
    return normalized === "zakonczona" || (normalized.includes("zako") && normalized.includes("czona"));
}

function czyStatusTerminuZakonczony(status) {
    const normalized = normalizujStatusTekst(status);
    return normalized === "zakonczone" || (normalized.includes("zako") && normalized.includes("czone"));
}

function rzeczywistaDataZakonczenia(inwestycja) {
    return inwestycja?.completed_at || inwestycja?.completedAt || "";
}

function rzeczywistaDataZakonczeniaTerminu(termin) {
    return termin?.actual_end_date || termin?.completed_at || "";
}

function powiazanaInwestycjaTerminu(termin) {
    const investmentId = pobierzPowiazanaInwestycjeId(termin);
    return investmentId ? znajdzInwestycjePoId(investmentId) : null;
}

function czyTerminLubInwestycjaZakonczona(termin) {
    if (czyStatusTerminuZakonczony(termin?.status)) return true;
    const linkedInvestment = powiazanaInwestycjaTerminu(termin);
    return Boolean(linkedInvestment && czyStatusInwestycjiZakonczony(linkedInvestment.status));
}

function wyswietlanaDataKoncaTerminu(termin) {
    const plannedEnd = termin?.data_koniec || termin?.data_start || "";
    if (!czyTerminLubInwestycjaZakonczona(termin)) return plannedEnd;
    const linkedInvestment = powiazanaInwestycjaTerminu(termin);
    return rzeczywistaDataZakonczeniaTerminu(termin) || rzeczywistaDataZakonczenia(linkedInvestment) || plannedEnd;
}

function czyStatusInwestycjiDoTerminarza(status) {
    const normalized = String(status || "").toLowerCase().trim();
    return ["aktywna", "planowana", "do realizacji"].includes(normalized);
}

function statusTerminuDlaInwestycji(status) {
    const normalized = String(status || "").toLowerCase().trim();
    if (normalized === "aktywna") return "w trakcie";
    if (czyStatusInwestycjiZakonczony(status)) return "zakoĹ„czone";
    if (normalized === "anulowana") return "odwoĹ‚ane";
    if (normalized === "wstrzymana") return "przesuniÄ™te";
    return "zaplanowane";
}

function payloadTerminuZInwestycji(inwestycja, dataStart, dataKoniec) {
    const completedAt = rzeczywistaDataZakonczenia(inwestycja);
    const isCompleted = czyStatusInwestycjiZakonczony(inwestycja?.status) && completedAt;
    const payload = {
        data_start: dataStart,
        data_koniec: dataKoniec || dataStart,
        klient: inwestycja.klient || inwestycja.nazwa || "",
        adres: inwestycja.adres || "",
        telefon: inwestycja.telefon || "",
        opis: inwestycja.opis || `Inwestycja: ${inwestycja.nazwa || ""}`.trim(),
        status: statusTerminuDlaInwestycji(inwestycja.status),
        investment_id: inwestycja.id,
        type: "Inwestycja",
        user_id: zalogowanyUser?.id || null
    };
    if (isCompleted) {
        payload.actual_end_date = completedAt;
    }
    return payload;
}

async function zsynchronizujInwestycjeZTerminarzem(inwestycja, options = {}) {
    if (!inwestycja) return null;
    if (!options.force && !czyStatusInwestycjiDoTerminarza(inwestycja.status)) return null;

    let { dataStart, dataKoniec } = pobierzDatyInwestycji(inwestycja);
    if (!dataStart && options.pytajODaty) {
        dataStart = prompt("Podaj datÄ™ rozpoczÄ™cia inwestycji (RRRR-MM-DD):", formatDateLocal(new Date()));
        if (!dataStart) return null;
        dataKoniec = prompt("Podaj datÄ™ zakoĹ„czenia inwestycji (RRRR-MM-DD):", dataStart) || dataStart;
        zapiszDatyInwestycji(inwestycja.id, dataStart, dataKoniec);
    }
    if (!dataStart) return null;

    const linkedEventId = pobierzPowiazanyTerminId(inwestycja);
    const payload = payloadTerminuZInwestycji(inwestycja, dataStart, dataKoniec);

    if (linkedEventId) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${encodeURIComponent(linkedEventId)}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify(payload)
        });
        const text = await res.text();
        if (!res.ok) {
            console.error("BĹ‚Ä…d aktualizacji powiÄ…zania terminarza:", {
                status: res.status,
                text,
                payload
            });
            throw new Error(text);
        }
        ustawTypTerminu(linkedEventId, "Inwestycja");
        await zapiszPowiazanieInwestycjaTermin(inwestycja.id, linkedEventId);
        return linkedEventId;
    }

    const alreadyLinked = terminarz.find(t => String(pobierzPowiazanaInwestycjeId(t)) === String(inwestycja.id));
    if (alreadyLinked) {
        await zapiszPowiazanieInwestycjaTermin(inwestycja.id, alreadyLinked.id);
        return alreadyLinked.id;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload)
    });
    const text = await res.text();

    let created = null;
    try {
        created = text ? JSON.parse(text) : null;
    } catch (e) {
        console.error("BĹ‚Ä…d parsowania odpowiedzi Supabase:", e);
    }

    if (!res.ok) {
        console.error("BĹ‚Ä…d dodania wpisu terminarza:", {
            status: res.status,
            text,
            payload
        });
        throw new Error(text);
    }
    const eventId = Array.isArray(created) ? created[0]?.id : created?.id;
    if (eventId) {
        await zapiszPowiazanieInwestycjaTermin(inwestycja.id, eventId);
    }
    return eventId || null;
}

async function zsynchronizujZakonczenieInwestycjiZTerminarzem(inwestycja, completedAt) {
    const linkedEventId = pobierzPowiazanyTerminId(inwestycja);
    const { dataStart, dataKoniec } = pobierzDatyInwestycji(inwestycja);

    if (!linkedEventId) {
        alert("Ta inwestycja nie ma powiÄ…zanego wpisu w Terminarzu. Nowy wpis nie zostaĹ‚ utworzony automatycznie.");
        await zapiszLog("Inwestycje", "Zakończono inwestycję bez powiązanego Terminarza", inwestycja.nazwa || inwestycja.id, {
            old_planned_start: dataStart || null,
            old_planned_end: dataKoniec || null,
            completed_at: completedAt,
            calendar_event_id: null,
            user_id: zalogowanyUser?.id || null,
            email: zalogowanyUser?.email || ""
        });
        return { linkedEventId: null, skipped: true, oldPlannedEnd: dataKoniec || null };
    }

    const payload = {
        data_start: dataStart || completedAt,
        data_koniec: dataKoniec || dataStart || completedAt,
        actual_end_date: completedAt,
        status: "zakoĹ„czone",
        investment_id: inwestycja.id,
        type: "Inwestycja"
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${encodeURIComponent(linkedEventId)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(payload)
    });
    const text = await res.text();
    if (!res.ok) {
        console.error("BĹ‚Ä…d synchronizacji zakoĹ„czenia inwestycji z Terminarzem:", {
            status: res.status,
            text,
            payload,
            investmentId: inwestycja.id,
            linkedEventId
        });
        throw new Error(text);
    }

    await zapiszLog("Inwestycje", "ZakoĹ„czono inwestycjÄ™ i zaktualizowano Terminarz", inwestycja.nazwa || inwestycja.id, {
        old_planned_start: dataStart || null,
        old_planned_end: dataKoniec || null,
        completed_at: completedAt,
        calendar_event_id: linkedEventId,
        user_id: zalogowanyUser?.id || null,
        email: zalogowanyUser?.email || ""
    });

    return { linkedEventId, skipped: false, oldPlannedEnd: dataKoniec || null };
}

async function zsynchronizujAktywneInwestycjeZTerminarzem() {
    for (const inwestycja of inwestycje || []) {
        const { dataStart } = pobierzDatyInwestycji(inwestycja);
        if (dataStart && czyStatusInwestycjiDoTerminarza(inwestycja.status)) {
            try {
                await zsynchronizujInwestycjeZTerminarzem(inwestycja);
            } catch (err) {
                console.warn("Nie udalo sie zsynchronizowac inwestycji z terminarzem:", inwestycja.id, err);
            }
        }
    }
    await pobierzInwestycje();
    await pobierzTerminarz();
}

async function utworzInwestycjeZTerminu(termin, status = "planowana") {
    const payload = {
        nazwa: termin.opis || `Inwestycja ${termin.klient || termin.data_start || ""}`.trim(),
        klient: termin.klient || "",
        adres: termin.adres || "",
        telefon: termin.telefon || "",
        data_start: termin.data_start || null,
        data_koniec: termin.data_koniec || termin.data_start || null,
        status,
        opis: termin.opis || "",
        user_id: zalogowanyUser?.id || null
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    const created = await res.json();
    const inwestycja = Array.isArray(created) ? created[0] : created;
    if (inwestycja?.id) {
        await zapiszPowiazanieInwestycjaTermin(inwestycja.id, termin.id);
        zapiszDatyInwestycji(inwestycja.id, termin.data_start, termin.data_koniec || termin.data_start);
    }
    return inwestycja;
}

async function ustawStatusInwestycji(investmentId, status) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${encodeURIComponent(investmentId)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error(await res.text());
}

function wybierzIstniejacaInwestycje() {
    const lista = (inwestycje || []).slice(0, 20);
    if (!lista.length) {
        alert("Brak inwestycji do poĹ‚Ä…czenia.");
        return null;
    }
    const opis = lista.map((i, index) => `${index + 1}. ${i.nazwa || i.id} - ${i.klient || "bez klienta"}`).join("\n");
    const wybor = prompt(`Wybierz numer inwestycji do poĹ‚Ä…czenia:\n${opis}`);
    const index = Number(wybor) - 1;
    return lista[index] || null;
}

window.obsluzTerminInwestycji = async function(id) {
    const termin = terminarz.find(t => String(t.id) === String(id));
    if (!termin) return;
    if (typTerminu(termin) !== "Inwestycja") {
        alert("Ten wpis nie jest oznaczony jako typ Inwestycja.");
        return;
    }

    const wybor = prompt("Wybierz opcjÄ™:\n1 - UtwĂłrz inwestycjÄ™ z tego wpisu\n2 - PoĹ‚Ä…cz z istniejÄ…cÄ… inwestycjÄ…\n3 - Zostaw tylko w Terminarzu", "3");
    try {
        if (wybor === "1") {
            await utworzInwestycjeZTerminu(termin, "planowana");
        } else if (wybor === "2") {
            const inwestycja = wybierzIstniejacaInwestycje();
            if (!inwestycja) return;
            await zapiszPowiazanieInwestycjaTermin(inwestycja.id, termin.id);
            zapiszDatyInwestycji(inwestycja.id, termin.data_start, termin.data_koniec || termin.data_start);
        } else {
            return;
        }
        await pobierzInwestycje();
        await pobierzTerminarz();
        renderujInwestycje();
        renderujTerminarz();
        renderujKalendarzTerminarza();
        zapiszLog("Terminarz", "PowiÄ…zano wpis z inwestycjÄ…", id);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ obsĹ‚uĹĽyÄ‡ powiÄ…zania inwestycji.");
    }
};

window.odlaczTermin = async function(id) {
    const termin = terminarz.find(t => String(t.id) === String(id));
    if (!termin) return;
    if (!confirm("OdĹ‚Ä…czyÄ‡ ten wpis od inwestycji?")) return;
    try {
        await odlaczTerminOdInwestycji(termin);
        await odswiezWidokiPoZmianieTerminarza();
        zapiszLog("Terminarz", "OdĹ‚Ä…czono wpis od inwestycji", id);
    } catch (err) {
        console.error("BĹ‚Ä…d odĹ‚Ä…czania wpisu terminarza od inwestycji:", err);
        alert("Nie udaĹ‚o siÄ™ odĹ‚Ä…czyÄ‡ wpisu od inwestycji.");
    }
};

window.polaczTerminZInnaInwestycja = async function(id) {
    const termin = terminarz.find(t => String(t.id) === String(id));
    if (!termin) return;
    const inwestycja = wybierzIstniejacaInwestycje();
    if (!inwestycja) return;
    try {
        await zapiszPowiazanieInwestycjaTermin(inwestycja.id, termin.id);
        zapiszDatyInwestycji(inwestycja.id, termin.data_start, termin.data_koniec || termin.data_start);
        await odswiezWidokiPoZmianieTerminarza();
        zapiszLog("Terminarz", "PoĹ‚Ä…czono wpis z innÄ… inwestycjÄ…", id);
    } catch (err) {
        console.error("BĹ‚Ä…d Ĺ‚Ä…czenia wpisu terminarza z inwestycjÄ…:", err);
        alert("Nie udaĹ‚o siÄ™ poĹ‚Ä…czyÄ‡ wpisu z inwestycjÄ….");
    }
};

window.przejdzDoInwestycjiZTerminu = async function(id) {
    const termin = terminarz.find(t => String(t.id) === String(id));
    const investmentId = pobierzPowiazanaInwestycjeId(termin);
    if (!investmentId) return;
    const inwestycja = znajdzInwestycjePoId(investmentId);
    if (inwestycja) {
        pokazSekcje("inwestycje");
        window.otworzInwestycje(investmentId);
        return;
    }

    const wybor = prompt("Ta inwestycja zostaĹ‚a usuniÄ™ta albo nie istnieje.\n1 - UsuĹ„ wpis z Terminarza\n2 - OdĹ‚Ä…cz wpis od inwestycji\n3 - Anuluj", "3");
    try {
        if (wybor === "1") {
            await usunTerminZBazy(id);
            delete panelLinks.events[String(id)];
            delete panelLinks.investments[String(investmentId)];
            zapiszLokalnePowiazaniaPanelu();
        } else if (wybor === "2") {
            await odlaczTerminOdInwestycji(termin, { skipInvestmentUpdate: true });
        } else {
            return;
        }
        await odswiezWidokiPoZmianieTerminarza();
    } catch (err) {
        console.error("BĹ‚Ä…d obsĹ‚ugi osieroconego powiÄ…zania terminarza:", err);
        alert("Nie udaĹ‚o siÄ™ obsĹ‚uĹĽyÄ‡ powiÄ…zania z usuniÄ™tÄ… inwestycjÄ….");
    }
};

window.dodajInwestycjeDoTerminarza = async function(id) {
    const inwestycja = inwestycje.find(i => String(i.id) === String(id));
    if (!inwestycja) return;
    try {
        await zsynchronizujInwestycjeZTerminarzem(inwestycja, { pytajODaty: true });
        await pobierzInwestycje();
        await pobierzTerminarz();
        renderujInwestycje();
        renderujTerminarz();
        renderujKalendarzTerminarza();
        zapiszLog("Inwestycje", "Dodano inwestycjÄ™ do terminarza", inwestycja.nazwa);
    } catch (err) {
        console.error("BĹ‚Ä…d dodania inwestycji do terminarza:", err);
        console.error("Supabase error:", err?.message, err?.details, err?.hint, err?.code);
        alert("Nie udaĹ‚o siÄ™ dodaÄ‡ inwestycji do Terminarza. SzczegĂłĹ‚y bĹ‚Ä™du sÄ… w konsoli F12.");
    }
};

window.pokazInwestycjeWTerminarzu = function(id) {
    const inwestycja = inwestycje.find(i => String(i.id) === String(id));
    const eventId = pobierzPowiazanyTerminId(inwestycja);
    pokazSekcje("terminarz");

    const dateFilter = document.getElementById("terminarz-date-filter");
    if (dateFilter) dateFilter.value = "";

    renderujTerminarz();

    if (!eventId) {
        alert("PowiÄ…zany wpis Terminarza nie istnieje.");
        return;
    }

    setTimeout(() => {
        const searchFilter = document.getElementById("terminarz-search");
        let row = Array.from(document.querySelectorAll("[data-calendar-event-id]"))
            .find(el => String(el.dataset.calendarEventId) === String(eventId));

        if (!row && searchFilter?.value) {
            searchFilter.value = "";
            renderujTerminarz();
            row = Array.from(document.querySelectorAll("[data-calendar-event-id]"))
                .find(el => String(el.dataset.calendarEventId) === String(eventId));
        }

        if (!row) {
            alert("PowiÄ…zany wpis Terminarza nie istnieje.");
            return;
        }

        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("calendar-row-highlight");
        setTimeout(() => row.classList.remove("calendar-row-highlight"), 3000);
    }, 0);
};

async function przesunTerminInwestycji(termin) {
    const nowaData = prompt("Podaj nowÄ… datÄ™ rozpoczÄ™cia (RRRR-MM-DD):", termin.data_start || formatDateLocal(new Date()));
    if (!nowaData) return;
    const nowyKoniec = prompt("Podaj nowÄ… datÄ™ zakoĹ„czenia (RRRR-MM-DD):", termin.data_koniec || nowaData) || nowaData;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/terminarz?id=eq.${encodeURIComponent(termin.id)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ data_start: nowaData, data_koniec: nowyKoniec, status: "przesuniÄ™te" })
    });
    if (!res.ok) throw new Error(await res.text());
    const investmentId = pobierzPowiazanaInwestycjeId(termin);
    if (investmentId) {
        const inwestycjaRes = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${encodeURIComponent(investmentId)}`, {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ data_start: nowaData, data_koniec: nowyKoniec })
        });
        if (!inwestycjaRes.ok) throw new Error(await inwestycjaRes.text());
        zapiszDatyInwestycji(investmentId, nowaData, nowyKoniec);
    }
}

function sprawdzDzisiejszeInwestycjeWTerminarzu() {
    const today = formatDateLocal(new Date());
    const dzisiejsze = (terminarz || []).filter(t => typTerminu(t) === "Inwestycja" && t.data_start === today);
    dzisiejsze.forEach(termin => {
        const promptKey = `${today}_${termin.id}`;
        if (panelLinks.todayPrompts[promptKey]) return;
        panelLinks.todayPrompts[promptKey] = true;
        zapiszLokalnePowiazaniaPanelu();
        setTimeout(async () => {
            const wybor = prompt("Czy inwestycja jest aktualna?\n1 - Tak, oznacz jako aktywnÄ…\n2 - PrzesuĹ„ termin\n3 - UtwĂłrz inwestycjÄ™\n4 - PoĹ‚Ä…cz z istniejÄ…cÄ…\n5 - Zostaw bez zmian", "5");
            try {
                if (wybor === "1") {
                    let investmentId = pobierzPowiazanaInwestycjeId(termin);
                    if (!investmentId) {
                        const inwestycja = await utworzInwestycjeZTerminu(termin, "aktywna");
                        investmentId = inwestycja?.id;
                    } else {
                        await ustawStatusInwestycji(investmentId, "aktywna");
                    }
                    if (investmentId) await zapiszPowiazanieInwestycjaTermin(investmentId, termin.id);
                } else if (wybor === "2") {
                    await przesunTerminInwestycji(termin);
                } else if (wybor === "3") {
                    await utworzInwestycjeZTerminu(termin, "planowana");
                } else if (wybor === "4") {
                    const inwestycja = wybierzIstniejacaInwestycje();
                    if (inwestycja) await zapiszPowiazanieInwestycjaTermin(inwestycja.id, termin.id);
                } else {
                    return;
                }
                await odswiezDane();
            } catch (err) {
                console.error(err);
                alert("Nie udaĹ‚o siÄ™ wykonaÄ‡ wybranej akcji dla dzisiejszej inwestycji.");
            }
        }, 800);
    });
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
        const end = wyswietlanaDataKoncaTerminu(item) ? parseDateLocal(wyswietlanaDataKoncaTerminu(item)) : null;
        if (!start || !end) return;
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (normalized >= start && normalized <= end) {
            const status = String(item.status || '').toLowerCase();
            if (status === 'rezerwacja') {
                foundReserved = true;
            } else if (['zaplanowane', 'w trakcie', 'zakoĹ„czone', 'przesuniÄ™te'].includes(status)) {
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
        const end = wyswietlanaDataKoncaTerminu(item) ? parseDateLocal(wyswietlanaDataKoncaTerminu(item)) : null;
        if (!start || !end) return;
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (normalized >= start && normalized <= end) {
            // Ignore canceled entries
            const status = String(item.status || '').toLowerCase();
            if (status === 'odwoĹ‚ane' || status === 'odwolane') return;
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
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Brak pasujÄ…cych wpisĂłw.</td></tr>`;
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
            ? `<button class="btn btn-danger small-btn" onclick="usunMagazyn('${esc(item.id)}')">UsuĹ„</button>`
            : '';

        return `
            <tr ${warn ? 'class="warning-row"' : ''}>
                <td>${esc(item.nazwa || '')}</td>
                <td>${esc(dataZakupuStr)}</td>
                <td>${kwota} PLN</td>
                <td>${gwar}</td>
                <td>${esc(item.uwagi || '')}</td>
                <td><div class="table-actions">${akcje}</div></td>
            </tr>
        `;
    }).join('');
}

async function zapiszMagazyn() {
    if (rolaUsera !== 'admin') {
        alert('Tylko administrator moĹĽe dodawaÄ‡ sprzÄ™t do magazynu.');
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
        alert('Wpisz nazwÄ™ sprzÄ™tu.');
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

        if (!res.ok) {
            const errorText = await res.text();
            console.error("BĹ‚Ä…d zapisu magazynu Supabase:", {
                status: res.status,
                statusText: res.statusText,
                response: errorText,
                payload
            });
            throw new Error(errorText);
        }

        alert('SprzÄ™t dodany do magazynu.');
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
        console.error("BĹ‚Ä…d zapisu magazynu:", err);
        const msg = err && err.message ? err.message : String(err);
        alert("Nie udaĹ‚o siÄ™ zapisaÄ‡ wpisu w magazynie:\n\n" + msg);
    }
}

window.usunMagazyn = async function(id) {
    if (rolaUsera !== 'admin') {
        alert('Tylko administrator moĹĽe usuwaÄ‡ wpisy magazynu.');
        return;
    }

    if (!confirm('UsunÄ…Ä‡ wpis z magazynu?')) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/magazyn?id=eq.${id}`, {
            method: 'DELETE',
            headers: headers()
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("BĹ‚Ä…d usuwania wpisu magazynu Supabase:", {
                status: res.status,
                statusText: res.statusText,
                response: errorText,
                payload
            });
            throw new Error(errorText);
        }

        await pobierzMagazyn();
        renderujMagazyn();
        zapiszLog('Magazyn', 'UsuniÄ™to wpis', id);
    } catch (err) {
        console.error(err);
        alert('Nie udaĹ‚o siÄ™ usunÄ…Ä‡ wpisu z magazynu.');
    }
};

// ==========================================
// RENDER
// ==========================================

function renderujWszystko() {
    const renderTasks = [
        ["Pulpit", renderujPulpit],
        ["Select usĹ‚ug", renderujSelectUslug],
        ["Select inwestycji kosztorysu", wypelnijSelectInwestycjiKosztorysu],
        ["Wycena", renderujWycene],
        ["Kosztorysy", renderujKosztorysy],
        ["UsĹ‚ugi", renderujUslugi],
        ["Inwestycje", renderujInwestycje],
        ["Kalendarz terminarza", renderujKalendarzTerminarza],
        ["Terminarz", renderujTerminarz],
        ["Administrator", renderujAdministrator],
        ["Magazyn", renderujMagazyn]
    ];

    renderTasks.forEach(([name, renderFn]) => {
        try {
            renderFn();
        } catch (err) {
            console.error(`ELNET LOAD DEBUG: bĹ‚Ä…d renderowania moduĹ‚u ${name}`, err);
        }
    });
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
// OSTRZEĹ»ENIA (ALERTS)
// ==========================================

function generujOstrzezenia() {
    const alerts = [];

    // UsĹ‚ugi z cenÄ… 0 lub brak ceny
    (uslugi || []).forEach(u => {
        if (cenaUslugi(u) === 0) {
            alerts.push({ type: 'warning', msg: `UsĹ‚uga "${u.nazwa || u.id}" ma cenÄ™ 0 lub brak ceny.` });
        }
    });

    // Kosztorysy z brutto 0
    (kosztorysy || []).forEach(k => {
        if (Number(k.brutto || 0) === 0) {
            alerts.push({ type: 'warning', msg: `Kosztorys "${k.nazwa || k.id}" ma wartoĹ›Ä‡ brutto 0.` });
        }
    });

    // Inwestycje - rĂłĹĽne warunki
    (inwestycje || []).forEach(i => {
        const zal = sumaZaliczekDlaInwestycji(i.id);
        const kos = sumaKosztowDlaInwestycji(i.id);

        if (kos > zal && zal > 0) {
            alerts.push({ type: 'danger', msg: `Inwestycja "${i.nazwa || i.id}" - koszty (${kos.toFixed(2)}) wiÄ™ksze niĹĽ zaliczki (${zal.toFixed(2)}).` });
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
        const aEnd = wyswietlanaDataKoncaTerminu(a) ? new Date(wyswietlanaDataKoncaTerminu(a)) : null;
        if (!aStart || !aEnd) continue;

        for (let j = i + 1; j < (terminarz || []).length; j++) {
            const b = terminarz[j];
            const bStart = b.data_start ? new Date(b.data_start) : null;
            const bEnd = wyswietlanaDataKoncaTerminu(b) ? new Date(wyswietlanaDataKoncaTerminu(b)) : null;
            if (!bStart || !bEnd) continue;

            if (aStart <= bEnd && aEnd >= bStart) {
                alerts.push({ type: 'warning', msg: `Terminy "${a.klient || a.id}" i "${b.klient || b.id}" siÄ™ nakĹ‚adajÄ….` });
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
        el.innerHTML = `<div class="admin-alert success">Brak ostrzeĹĽeĹ„. Wszystko wyglÄ…da dobrze.</div>`;
    } else {
        el.innerHTML = alerts.map(a => {
            const cls = a.type === 'danger' ? 'danger' : 'warning';
            return `<div class="admin-alert ${cls}">${esc(a.msg)}</div>`;
        }).join('');
    }

    // Aktualizuj etykietÄ™ w menu (tylko dla admina pokazuj liczbÄ™)
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
        el.innerHTML = `<div class="admin-alert success">Brak logĂłw.</div>`;
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

function parseKwota(value) {
    const raw = String(value ?? "").replace(",", ".").trim();
    if (!raw) return NaN;
    return Number(raw);
}

function cenaPozycji(p) {
    const cena = parseKwota(p?.cenaNetto ?? p?.cena_netto ?? p?.cena ?? p?.price);
    return Number.isFinite(cena) ? cena : 0;
}

function iloscPozycji(p) {
    const ilosc = parseKwota(p?.ilosc ?? p?.quantity ?? p?.qty);
    return Number.isFinite(ilosc) ? ilosc : 0;
}

function ustawCenePozycji(p, cena) {
    p.cenaNetto = cena;
    p.cena_netto = cena;
    p.cena = cena;
    p.price = cena;
}

function normalizujPozycjeKosztorysu(lista) {
    return (lista || []).map(p => {
        const ilosc = iloscPozycji(p);
        const cena = cenaPozycji(p);
        const vat = pobierzVatProcent(p);
        return {
            ...p,
            ilosc,
            quantity: ilosc,
            cenaNetto: cena,
            cena_netto: cena,
            cena,
            price: cena,
            vatProcent: Number.isFinite(vat) ? vat : 23
        };
    });
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

function pobierzPowiazanaInwestycjeKosztorysu(kosztorys) {
    return kosztorys?.investment_id || kosztorys?.inwestycja_id || null;
}

function znajdzInwestycjeKosztorysu(kosztorys) {
    const investmentId = pobierzPowiazanaInwestycjeKosztorysu(kosztorys);
    return investmentId ? inwestycje.find(i => String(i.id) === String(investmentId)) || null : null;
}

function etykietaInwestycji(inwestycja) {
    if (!inwestycja) return "";
    return [inwestycja.nazwa || "Inwestycja", inwestycja.klient || "-", inwestycja.adres || "-"].join(" â€” ");
}

function wypelnijSelectInwestycjiKosztorysu(selectedId = "") {
    const select = document.getElementById("kosztorys-inwestycja");
    if (!select) return;

    const current = selectedId || select.value || "";
    const options = [`<option value="">Brak powiÄ…zania</option>`]
        .concat((inwestycje || []).map(i => `<option value="${esc(i.id)}">${esc(etykietaInwestycji(i))}</option>`));

    select.innerHTML = options.join("");
    select.value = current && (inwestycje || []).some(i => String(i.id) === String(current)) ? String(current) : "";
}

function ustawPowiazanaInwestycjeKosztorysu(investmentId = "") {
    wypelnijSelectInwestycjiKosztorysu(investmentId || "");
}

function kosztorysPasujeDoInwestycji(kosztorys, inwestycjaId) {
    return String(pobierzPowiazanaInwestycjeKosztorysu(kosztorys) || "") === String(inwestycjaId || "");
}

function statusKosztorysuLabel(status) {
    const raw = String(status || "do_akceptacji").toLowerCase();
    if (raw === "do_akceptacji" || raw === "do-akceptacji") return "Do akceptacji";
    if (raw === "zaakceptowany" || raw === "akceptacja" || raw === "zaakceptowana") return "Akceptacja";
    if (raw === "odrzucony" || raw === "odrzucona") return "Odrzucony";
    return status || "Nieznany";
}

function statusKosztorysuClass(status) {
    const raw = String(status || "do_akceptacji").toLowerCase();
    if (raw === "zaakceptowany" || raw === "akceptacja" || raw === "zaakceptowana") return "status-tag-success";
    if (raw === "do_akceptacji" || raw === "do-akceptacji") return "status-tag-warning";
    if (raw === "odrzucony" || raw === "odrzucona") return "status-tag-danger";
    return "";
}

function statusKosztorysuBadge(status) {
    const className = statusKosztorysuClass(status);
    return `<span class="status-tag ${className}">${esc(statusKosztorysuLabel(status))}</span>`;
}

function pozycjeKosztorysu(kosztorys) {
    try {
        const raw = typeof kosztorys?.pozycje === "string" ? JSON.parse(kosztorys.pozycje) : kosztorys?.pozycje || [];
        return Array.isArray(raw) ? normalizujPozycjeKosztorysu(raw) : [];
    } catch (err) {
        console.error("BĹ‚Ä…d odczytu pozycji kosztorysu:", err);
        return [];
    }
}

function kwotaPanel(value) {
    return `${Number(value || 0).toFixed(2)} PLN`;
}

function normalizujPrzeznaczenieZaliczki(value) {
    const raw = String(value || "").toLowerCase().trim();
    if (["materialy", "materiaĹ‚y", "material", "materiaĹ‚y"].includes(raw)) return "materialy";
    if (["robocizna", "praca"].includes(raw)) return "robocizna";
    return "";
}

function etykietaPrzeznaczeniaZaliczki(value) {
    const purpose = normalizujPrzeznaczenieZaliczki(value);
    if (purpose === "materialy") return "MateriaĹ‚y";
    if (purpose === "robocizna") return "Robocizna";
    return "Nieprzypisana";
}

function pobierzPrzeznaczenieZaliczki(zaliczka) {
    return normalizujPrzeznaczenieZaliczki(zaliczka?.purpose || zaliczka?.typ_zaliczki || zaliczka?.przeznaczenie);
}

function pobierzVatKosztu(value) {
    const raw = String(value ?? "").toLowerCase().trim();
    if (!raw || raw === "zw" || raw === "zwolniony" || raw === "nie dotyczy" || raw === "nieustalony") return null;
    const parsed = Number(raw.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
}

function wyliczKosztMaterialowy(koszt) {
    const vatRate = pobierzVatKosztu(koszt?.vat_rate);
    const hasBrutto = koszt?.brutto !== undefined && koszt?.brutto !== null && koszt?.brutto !== "";
    const hasNetto = koszt?.netto !== undefined && koszt?.netto !== null && koszt?.netto !== "";
    const brutto = hasBrutto ? Number(koszt.brutto || 0) : Number(koszt?.kwota || 0);
    const netto = hasNetto ? Number(koszt.netto || 0) : (vatRate === null ? null : brutto / (1 + vatRate / 100));
    const vatAmount = koszt?.vat_amount !== undefined && koszt?.vat_amount !== null && koszt?.vat_amount !== ""
        ? Number(koszt.vat_amount || 0)
        : (netto === null ? null : brutto - netto);

    return {
        netto,
        vatRate,
        vatAmount,
        brutto,
        vatLabel: vatRate === null ? "Nieustalony" : `${vatRate}%`
    };
}

function wyliczRozliczenieInwestycji(inwestycjaId) {
    const powiazaneKosztorysy = kosztorysy.filter(k => kosztorysPasujeDoInwestycji(k, inwestycjaId));
    const zaliczki = inwestycjeZaliczki.filter(z => String(z.inwestycja_id) === String(inwestycjaId));
    const koszty = inwestycjeKoszty.filter(k => String(k.inwestycja_id) === String(inwestycjaId));
    const prace = inwestycjePraceDodatkowe.filter(p => String(p.inwestycja_id) === String(inwestycjaId));

    const robociznaNetto = powiazaneKosztorysy.reduce((sum, k) => sum + Number(k.netto || 0), 0);
    const robociznaBrutto = powiazaneKosztorysy.reduce((sum, k) => sum + Number(k.brutto || 0), 0);
    const robociznaVat = Math.max(0, robociznaBrutto - robociznaNetto);

    const kosztyWyliczone = koszty.map(k => ({ ...k, _kwoty: wyliczKosztMaterialowy(k) }));
    const materialyNetto = kosztyWyliczone.reduce((sum, k) => sum + Number(k._kwoty.netto || 0), 0);
    const materialyVat = kosztyWyliczone.reduce((sum, k) => sum + Number(k._kwoty.vatAmount || 0), 0);
    const materialyBrutto = kosztyWyliczone.reduce((sum, k) => sum + Number(k._kwoty.brutto || 0), 0);

    const praceNetto = prace.reduce((sum, p) => sum + Number(p.netto || 0), 0);
    const praceBrutto = prace.reduce((sum, p) => sum + Number(p.brutto || p.kwota || 0), 0);
    const praceVat = prace.reduce((sum, p) => {
        if (p.vat_amount !== undefined && p.vat_amount !== null && p.vat_amount !== "") return sum + Number(p.vat_amount || 0);
        return sum + Math.max(0, Number(p.brutto || 0) - Number(p.netto || 0));
    }, 0);

    const zaliczkiMaterialy = zaliczki
        .filter(z => pobierzPrzeznaczenieZaliczki(z) === "materialy")
        .reduce((sum, z) => sum + Number(z.kwota || 0), 0);
    const zaliczkiRobocizna = zaliczki
        .filter(z => pobierzPrzeznaczenieZaliczki(z) === "robocizna")
        .reduce((sum, z) => sum + Number(z.kwota || 0), 0);
    const zaliczkiRazem = zaliczki.reduce((sum, z) => sum + Number(z.kwota || 0), 0);

    const razemNetto = robociznaNetto + materialyNetto + praceNetto;
    const vatRazem = robociznaVat + materialyVat + praceVat;
    const razemBrutto = robociznaBrutto + materialyBrutto + praceBrutto;
    const nadwyzkaMaterialowa = Math.max(0, zaliczkiMaterialy - materialyBrutto);
    const pozostaloMaterialy = Math.max(0, materialyBrutto - zaliczkiMaterialy);
    const pokazPraceDodatkowe = praceBrutto > 0 || prace.some(p => Number(p.brutto || p.kwota || 0) > 0);

    return {
        powiazaneKosztorysy,
        zaliczki,
        koszty: kosztyWyliczone,
        prace,
        robociznaNetto,
        robociznaVat,
        robociznaBrutto,
        zaliczkiRobocizna,
        pozostaloRobocizna: robociznaBrutto - zaliczkiRobocizna,
        materialyNetto,
        materialyVat,
        materialyBrutto,
        zaliczkiMaterialy,
        pozostaloMaterialy,
        nadwyzkaMaterialowa,
        praceNetto,
        praceVat,
        praceBrutto,
        pokazPraceDodatkowe,
        razemNetto,
        vatRazem,
        razemBrutto,
        zaliczkiRazem,
        pozostaloDoZaplaty: razemBrutto - zaliczkiRazem
    };
}

function renderujRozliczenieInwestycjiWidok(rozliczenie) {
    const container = document.getElementById("rozliczenie-inwestycji");
    if (!container) return;

    const materialyBalanceLabel = rozliczenie.nadwyzkaMaterialowa > 0
        ? "ZostaĹ‚o z zaliczki na materiaĹ‚y"
        : "PozostaĹ‚o za materiaĹ‚y";
    const materialyBalanceValue = rozliczenie.nadwyzkaMaterialowa > 0
        ? rozliczenie.nadwyzkaMaterialowa
        : rozliczenie.pozostaloMaterialy;
    const praceHtml = rozliczenie.pokazPraceDodatkowe ? `
        <section class="settlement-section">
            <h3>Prace dodatkowe</h3>
            <div class="settlement-lines">
                <div class="settlement-line"><span>Prace dodatkowe netto</span><strong>${kwotaPanel(rozliczenie.praceNetto)}</strong></div>
                <div class="settlement-line"><span>VAT prac dodatkowych</span><strong>${kwotaPanel(rozliczenie.praceVat)}</strong></div>
                <div class="settlement-line total"><span>Prace dodatkowe brutto</span><strong>${kwotaPanel(rozliczenie.praceBrutto)}</strong></div>
            </div>
        </section>
    ` : "";

    container.innerHTML = `
        <section class="settlement-section">
            <h3>Robocizna</h3>
            <div class="settlement-lines">
                <div class="settlement-line"><span>Robocizna netto</span><strong>${kwotaPanel(rozliczenie.robociznaNetto)}</strong></div>
                <div class="settlement-line"><span>VAT robocizny</span><strong>${kwotaPanel(rozliczenie.robociznaVat)}</strong></div>
                <div class="settlement-line"><span>Robocizna brutto</span><strong>${kwotaPanel(rozliczenie.robociznaBrutto)}</strong></div>
                <div class="settlement-line"><span>Zaliczki na robociznÄ™</span><strong>${kwotaPanel(rozliczenie.zaliczkiRobocizna)}</strong></div>
                <div class="settlement-line total"><span>PozostaĹ‚o za robociznÄ™</span><strong>${kwotaPanel(rozliczenie.pozostaloRobocizna)}</strong></div>
            </div>
        </section>

        <section class="settlement-section">
            <h3>MateriaĹ‚y</h3>
            <div class="settlement-lines">
                <div class="settlement-line"><span>MateriaĹ‚y netto</span><strong>${kwotaPanel(rozliczenie.materialyNetto)}</strong></div>
                <div class="settlement-line"><span>VAT materiaĹ‚Ăłw</span><strong>${kwotaPanel(rozliczenie.materialyVat)}</strong></div>
                <div class="settlement-line"><span>MateriaĹ‚y brutto</span><strong>${kwotaPanel(rozliczenie.materialyBrutto)}</strong></div>
                <div class="settlement-line"><span>Zaliczki na materiaĹ‚y</span><strong>${kwotaPanel(rozliczenie.zaliczkiMaterialy)}</strong></div>
                <div class="settlement-line total ${rozliczenie.nadwyzkaMaterialowa > 0 ? "credit" : ""}">
                    <span>${materialyBalanceLabel}</span><strong>${kwotaPanel(materialyBalanceValue)}</strong>
                </div>
            </div>
        </section>

        ${praceHtml}

        <section class="settlement-section">
            <h3>Podsumowanie koĹ„cowe</h3>
            <div class="settlement-lines">
                <div class="settlement-line"><span>Razem netto</span><strong>${kwotaPanel(rozliczenie.razemNetto)}</strong></div>
                <div class="settlement-line"><span>VAT razem</span><strong>${kwotaPanel(rozliczenie.vatRazem)}</strong></div>
                <div class="settlement-line"><span>Razem brutto</span><strong>${kwotaPanel(rozliczenie.razemBrutto)}</strong></div>
                <div class="settlement-line"><span>Zaliczki razem</span><strong>${kwotaPanel(rozliczenie.zaliczkiRazem)}</strong></div>
                <div class="settlement-line"><span>Robocizna do zapĹ‚aty</span><strong>${kwotaPanel(rozliczenie.pozostaloRobocizna)}</strong></div>
                <div class="settlement-line credit"><span>ZostaĹ‚o z zaliczki na materiaĹ‚y</span><strong>-${kwotaPanel(rozliczenie.nadwyzkaMaterialowa)}</strong></div>
                <div class="settlement-line total"><span>PozostaĹ‚o do zapĹ‚aty</span><strong>${kwotaPanel(rozliczenie.pozostaloDoZaplaty)}</strong></div>
            </div>
            ${rozliczenie.nadwyzkaMaterialowa > 0 ? `<p class="settlement-note">NadwyĹĽka z zaliczki materiaĹ‚owej obniĹĽa koĹ„cowÄ… kwotÄ™ do zapĹ‚aty.</p>` : ""}
        </section>
    `;
}

async function zapiszPowiazanieKosztorysuZInwestycja(kosztorysId, investmentId) {
    const payload = { investment_id: investmentId || null };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${encodeURIComponent(kosztorysId)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error("BĹ‚Ä…d zapisu powiÄ…zania kosztorysu z inwestycjÄ…:", {
            status: res.status,
            statusText: res.statusText,
            response: errorText,
            payload
        });
        throw new Error(errorText);
    }

    await pobierzKosztorysy();
    renderujKosztorysy();
    if (aktywnaInwestycjaId) renderujPanelInwestycji();
}

// ==========================================
// PULPIT
// ==========================================

function renderujPulpit() {
    const aktywne = inwestycje.filter(i => i.status === "aktywna").length;
    const sumaZaliczek = inwestycjeZaliczki.reduce((s, z) => s + Number(z.kwota || 0), 0);
    const sumaKosztow = inwestycjeKoszty.reduce((s, k) => s + Number(k.kwota || 0), 0);

    // Zaplanowane terminy - liczenie przyszĹ‚ych terminĂłw
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

    const weekdays = ['Pon', 'Wt', 'Ĺšr', 'Czw', 'Pt', 'Sob', 'Nd'];

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
            <div class="${classNames}" onclick="switchToPulpitTerminarz('${dateStr}')" title="Kliknij aby filtrowaÄ‡ terminy">
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
// USĹUGI
// ==========================================

function renderujSelectUslug() {
    const select = document.getElementById("wycena-usluga");
    if (!select) return;

    if (!uslugi.length) {
        select.innerHTML = `<option value="">Brak usĹ‚ug w bazie</option>`;
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
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Brak usĹ‚ug w bazie.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(u => {
        const canEdit = (rolaUsera && rolaUsera !== 'guest') || (zalogowanyUser && String(zalogowanyUser.email || '').toLowerCase() === 'n.norbud@gmail.com');
        const canDelete = rolaUsera === 'admin';

        const editButton = canEdit ? `<button class="btn btn-secondary" onclick="edytujUsluge('${esc(u.id)}')">Edytuj</button>` : '';
        const deleteButton = canDelete ? `<button class="btn btn-danger" onclick="usunUsluge('${esc(u.id)}')">UsuĹ„</button>` : '';

        const akcje = (editButton || deleteButton)
            ? `<div class="table-actions">${editButton} ${deleteButton}</div>`
            : '';

        return `
            <tr>
                <td>${esc(u.nazwa)}</td>
                <td>${esc(jednostkaUslugi(u))}</td>
                <td><strong>${cenaUslugi(u).toFixed(2)} PLN</strong></td>
                <td><div class="table-actions">${akcje}</div></td>
            </tr>
        `;
    }).join("");
}

async function zapiszUsluge() {
    // Allow saving service for roles admin, staff, user and for specific email
    const allowSave = (rolaUsera && rolaUsera !== 'guest') || (zalogowanyUser && String(zalogowanyUser.email || '').toLowerCase() === 'n.norbud@gmail.com');
    if (!allowSave) {
        alert("Brak uprawnieĹ„ do zapisu usĹ‚ugi.");
        return;
    }

    const nazwa = document.getElementById("usluga-nazwa").value.trim();
    const jednostka = document.getElementById("usluga-jednostka").value;
    const cena = Number(document.getElementById("usluga-cena").value);

    if (!nazwa || isNaN(cena)) {
        alert("Wpisz nazwÄ™ i poprawnÄ… cenÄ™.");
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
        zapiszLog("UsĹ‚ugi", "Zapisano usĹ‚ugÄ™", nazwa);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ zapisaÄ‡ usĹ‚ugi. SprawdĹş kolumny tabeli uslugi i RLS.");
    }
}

window.edytujUsluge = function(id) {
    // Allow editing for non-guest roles and specific account
    const allowEdit = (rolaUsera && rolaUsera !== 'guest') || (zalogowanyUser && String(zalogowanyUser.email || '').toLowerCase() === 'n.norbud@gmail.com');
    if (!allowEdit) {
        alert("Brak uprawnieĹ„ do edycji usĹ‚ugi.");
        return;
    }

    const u = uslugi.find(x => String(x.id) === String(id));
    if (!u) return;

    edytowanaUslugaId = u.id;
    document.getElementById("usluga-nazwa").value = u.nazwa || "";
    document.getElementById("usluga-jednostka").value = jednostkaUslugi(u);
    document.getElementById("usluga-cena").value = cenaUslugi(u);

    document.getElementById("uslugi-form-title").textContent = "Edytuj usĹ‚ugÄ™";
    document.getElementById("btn-zapisz-usluge").textContent = "Zapisz zmiany";
    document.getElementById("btn-anuluj-usluge").classList.remove("hidden");
};

function anulujEdycjeUslugi() {
    edytowanaUslugaId = null;
    document.getElementById("usluga-nazwa").value = "";
    document.getElementById("usluga-cena").value = "";
    document.getElementById("usluga-jednostka").value = "szt.";

    document.getElementById("uslugi-form-title").textContent = "Dodaj usĹ‚ugÄ™";
    document.getElementById("btn-zapisz-usluge").textContent = "Zapisz usĹ‚ugÄ™";
    document.getElementById("btn-anuluj-usluge").classList.add("hidden");
}

window.usunUsluge = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator moĹĽe usuwaÄ‡ usĹ‚ugi.");
        return;
    }

    if (!confirm("UsunÄ…Ä‡ usĹ‚ugÄ™?")) return;

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
        zapiszLog("UsĹ‚ugi", "UsuniÄ™to usĹ‚ugÄ™", id);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ usĹ‚ugi.");
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
        suggestionsBox.innerHTML = `<div class="autocomplete-empty">Brak pasujÄ…cych usĹ‚ug</div>`;
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
        .replace(/[Ä…Ä‡Ä™Ĺ‚Ĺ„ĂłĹ›ĹşĹĽ]/g, ch => ({
            "Ä…": "a", "Ä‡": "c", "Ä™": "e", "Ĺ‚": "l", "Ĺ„": "n",
            "Ăł": "o", "Ĺ›": "s", "Ĺş": "z", "ĹĽ": "z"
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
 * UĹĽywa operatora ?? zamiast || aby prawidĹ‚owo obsĹ‚ugiwaÄ‡ VAT 0%.
 */
function pobierzVatProcent(p) {
    return Number(p?.vatProcent ?? p?.vat ?? p?.vat_rate ?? 23);
}

function zapewnijCenyBazowePozycji() {
    wycenaPozycje.forEach((p) => {
        const aktualnaCena = cenaPozycji(p);
        if (p.cenaBazowa === undefined || p.cenaBazowa === null || Number.isNaN(parseKwota(p.cenaBazowa))) {
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
        uwaga: usluga ? (config.uwaga || "Dopasowano z cennika") : (config.uwaga || "Cena szacunkowa â€” sprawdĹş w cenniku")
    });
}

function generujSzybkaWycene() {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe generowaÄ‡ wyceny.");
        return;
    }

    const pole = document.getElementById("szybka-wycena-opis");
    const opisOryginalny = pole?.value?.trim() || "";
    const opis = normalizeText(opisOryginalny);

    if (!opis) {
        alert("Opisz zlecenie, np. mieszkanie 60 mÂ˛, instalacja od zera, 55 punktĂłw, rozdzielnica.");
        return;
    }

    const metraz = pobierzLiczbeZOpisu(opis, [
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw|metry|metra|m powierzchni)\b/,
        /mieszkanie\s*(\d+(?:[.,]\d+)?)/,
        /dom\s*(\d+(?:[.,]\d+)?)/
    ]);

    const pokoje = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:pokoi|pokoje|pokojach|pokĂłj|pokoj)\b/
    ]);

    const punktyPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt|punkt)\b/
    ]);

    const gniazdaPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:gniazd|gniazdek|gniazda|gniazdo)\b/,
        /(?:gniazd|gniazdek|gniazda|gniazdo)[^\d]{0,20}(\d+)/
    ]);

    const lacznikiPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:lacznikow|Ĺ‚Ä…cznikĂłw|wlacznikow|wĹ‚Ä…cznikĂłw|laczniki|Ĺ‚Ä…czniki|wlaczniki|wĹ‚Ä…czniki)\b/,
        /(\d+)\s*(?:rocznikow|rocznikĂłw|roczniki)\b/,
        /(?:lacznikow|Ĺ‚Ä…cznikĂłw|wlacznikow|wĹ‚Ä…cznikĂłw|rocznikow|rocznikĂłw)[^\d]{0,20}(\d+)/
    ]);

    const lanPodane = pobierzLiczbeZOpisu(opis, [
        /(?:internet|lan|sieci|siec|rj45)[^\d]{0,20}(\d+)/,
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt)\s*(?:lan|internet|sieci|siec|rj45)/
    ]);

    const kameraPodane = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:kamer|kamery|kamera)\b/
    ]);

    const malowanieM2 = pobierzLiczbeZOpisu(opis, [
        /(?:malowania|malowanie|pomalowac|pomalowaÄ‡)[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛)\s*(?:malowania|malowanie)/
    ]);

    const sciankaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛)\s*(?:scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips)/
    ]);

    const wykladzinaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:wykladzina|wykĹ‚adzina|podloge|podĹ‚oge|podĹ‚ogÄ™|podloga|podĹ‚oga)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛)\s*(?:wykladzina|wykĹ‚adzina|podloga|podĹ‚oga)/
    ]);

    const odZera = /od zera|nowa instalacja|kompletna instalacja|stan deweloperski|generalny/.test(opis);
    const remont = /remont|modernizacja|wymiana|przerobka|przerĂłbka/.test(opis);
    const zakresElektryczny = /elektry|gniazd|gniazdek|gniazdo|lacznik|Ĺ‚Ä…cznik|wlacznik|wĹ‚Ä…cznik|rocznik|punkt|rozdzielnica|bezpiecznik|kabel|przewod|przewĂłd|oswietlen|oĹ›wietlen/.test(opis);

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
            nazwa: "MontaĹĽ punktu elektrycznego",
            szukaj: ["punkt elektryczny", "montaĹĽ punktu", "montaz punktu", "punkt"],
            unikaj: ["przemysĹ‚", "przemyslow", "siĹ‚owe", "silowe"],
            jednostka: "pkt",
            ilosc: punktyElektryczne,
            cena: 120,
            uwaga: punktyPodane ? "IloĹ›Ä‡ punktĂłw z opisu" : "IloĹ›Ä‡ punktĂłw elektrycznych oszacowana z metraĹĽu"
        });
    }

    if (gniazdaPodane) {
        dodajPropozycje(propozycje, {
            nazwa: "Wymiana gniazda elektrycznego",
            szukaj: ["wymiana gniazda", "gniazdo elektryczne", "montaĹĽ gniazda", "montaz gniazda", "gniazdo"],
            unikaj: ["przemysĹ‚", "przemyslow", "siĹ‚owe", "silowe", "230v przemyslowe", "400v"],
            jednostka: "szt.",
            ilosc: gniazdaPodane,
            cena: 90,
            uwaga: "IloĹ›Ä‡ gniazd z opisu"
        });
    }

    if (lacznikiPodane) {
        dodajPropozycje(propozycje, {
            nazwa: "Wymiana Ĺ‚Ä…cznika / wĹ‚Ä…cznika Ĺ›wiatĹ‚a",
            szukaj: ["Ĺ‚Ä…cznik", "lacznik", "wĹ‚Ä…cznik", "wlacznik", "osprzÄ™t", "osprzet"],
            unikaj: ["przemysĹ‚", "przemyslow", "siĹ‚owe", "silowe"],
            jednostka: "szt.",
            ilosc: lacznikiPodane,
            cena: 80,
            uwaga: opis.includes("rocznik") ? "Rozpoznano z dyktowania jako â€žrocznikiâ€ť â€” potraktowano jako Ĺ‚Ä…czniki" : "IloĹ›Ä‡ Ĺ‚Ä…cznikĂłw z opisu"
        });
    }

    if (/rozdzielnica|bezpieczniki|skrzynka/.test(opis) || (odZera && zakresElektryczny)) {
        dodajPropozycje(propozycje, {
            nazwa: "MontaĹĽ / podĹ‚Ä…czenie rozdzielnicy",
            szukaj: ["rozdzielnica", "bezpiecznik", "skrzynka"],
            jednostka: "szt.",
            ilosc: 1,
            cena: 900,
            uwaga: "Wykryto rozdzielnicÄ™ albo instalacjÄ™ od zera"
        });
    }

    if (/internet|lan|rj45|sieci|sieÄ‡/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Punkt internetowy LAN / RJ45",
            szukaj: ["lan", "internet", "rj45", "sieÄ‡", "siec"],
            jednostka: "pkt",
            ilosc: lanPodane || pokoje || 4,
            cena: 130,
            uwaga: lanPodane ? "IloĹ›Ä‡ LAN z opisu" : "IloĹ›Ä‡ LAN oszacowana z liczby pokoi"
        });
    }

    if (/domofon|wideodomofon|video domofon|videodomofon/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "MontaĹĽ domofonu / wideodomofonu",
            szukaj: ["domofon", "wideodomofon", "videodomofon"],
            jednostka: "szt.",
            ilosc: 1,
            cena: 450,
            uwaga: "Wykryto domofon"
        });
    }

    if (/monitoring|kamera|kamery|cctv/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "MontaĹĽ kamery / punkt monitoringu",
            szukaj: ["monitoring", "kamera", "cctv"],
            jednostka: "szt.",
            ilosc: kameraPodane || 4,
            cena: 250,
            uwaga: kameraPodane ? "IloĹ›Ä‡ kamer z opisu" : "IloĹ›Ä‡ kamer oszacowana"
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

    if (/bialy montaz|biaĹ‚y montaĹĽ|osprzet|osprzÄ™t/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "BiaĹ‚y montaĹĽ osprzÄ™tu",
            szukaj: ["biaĹ‚y montaĹĽ", "bialy montaz", "osprzÄ™t", "osprzet"],
            jednostka: "szt.",
            ilosc: punktyElektryczne || gniazdaPodane || lacznikiPodane || 30,
            cena: 35,
            uwaga: "Wykryto biaĹ‚y montaĹĽ"
        });
    }

    if (/bruzd|kucie|peszel|peszle|przewody|okablowanie/.test(opis) || (odZera && zakresElektryczny)) {
        dodajPropozycje(propozycje, {
            nazwa: "UkĹ‚adanie przewodĂłw / bruzdowanie",
            szukaj: ["bruzdowanie", "przewod", "przewĂłd", "okablowanie", "peszel"],
            jednostka: "m",
            ilosc: metraz ? Math.round(metraz * 2.2) : 120,
            cena: 18,
            uwaga: "Szacunek dĹ‚ugoĹ›ci z metraĹĽu"
        });
    }

    if (/pomiary|pomiar|protokol|protokĂłĹ‚|odbior/.test(opis) || (odZera && zakresElektryczny)) {
        dodajPropozycje(propozycje, {
            nazwa: "Pomiary elektryczne / uruchomienie",
            szukaj: ["pomiary", "pomiar", "protokĂłĹ‚", "protokol", "uruchomienie"],
            jednostka: "usĹ‚uga",
            ilosc: 1,
            cena: 500,
            uwaga: "Wykryto pomiary albo peĹ‚nÄ… instalacjÄ™"
        });
    }

    if (/malowania|malowanie|pomalowac|pomalowaÄ‡|farba|bialy|biaĹ‚y|kolor|sciany|Ĺ›ciany|sufit/.test(opis)) {
        let iloscMalowania = malowanieM2 || (metraz ? Math.round(metraz * 2.6) : 100);
        dodajPropozycje(propozycje, {
            nazwa: "Malowanie Ĺ›cian i sufitu",
            szukaj: ["malowanie", "malowania", "farba"],
            jednostka: "mÂ˛",
            ilosc: iloscMalowania,
            cena: 28,
            uwaga: malowanieM2 ? "MetraĹĽ malowania z opisu" : "Szacunek powierzchni malowania z metraĹĽu mieszkania"
        });
    }

    if (/scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips|dzialowa|dziaĹ‚owa/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "Ĺšcianka dziaĹ‚owa GK",
            szukaj: ["Ĺ›cianka", "scianka", "gk", "karton gips", "karton-gips", "regips"],
            jednostka: "mÂ˛",
            ilosc: sciankaM2 || 10,
            cena: 180,
            uwaga: sciankaM2 ? "MetraĹĽ Ĺ›cianki z opisu" : "MetraĹĽ Ĺ›cianki oszacowany"
        });
    }

    if (/wykladzina|wykĹ‚adzina|podloge|podĹ‚oge|podĹ‚ogÄ™|podloga|podĹ‚oga/.test(opis)) {
        dodajPropozycje(propozycje, {
            nazwa: "UĹ‚oĹĽenie wykĹ‚adziny",
            szukaj: ["wykĹ‚adzina", "wykladzina", "podĹ‚oga", "podloga"],
            jednostka: "mÂ˛",
            ilosc: wykladzinaM2 || metraz || 50,
            cena: 45,
            uwaga: wykladzinaM2 ? "MetraĹĽ wykĹ‚adziny z opisu" : "PrzyjÄ™to metraĹĽ mieszkania jako powierzchniÄ™ podĹ‚ogi"
        });
    }

    if (!propozycje.length) {
        if (metraz) {
            dodajPropozycje(propozycje, {
                nazwa: "Robocizna â€” wycena szacunkowa",
                szukaj: ["robocizna", "instalacja", "prace"],
                jednostka: "mÂ˛",
                ilosc: metraz,
                cena: 110,
                uwaga: "Nie wykryto szczegĂłĹ‚Ăłw â€” szacunek z metraĹĽu"
            });
        } else {
            alert("Nie udaĹ‚o siÄ™ rozpoznaÄ‡ zakresu. Dopisz metraĹĽ albo sĹ‚owa: gniazda, Ĺ‚Ä…czniki, malowanie, wykĹ‚adzina, Ĺ›cianka.");
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
        meta.metraz ? `MetraĹĽ: ${meta.metraz} mÂ˛` : "",
        meta.gniazda ? `Gniazda: ${meta.gniazda}` : "",
        meta.laczniki ? `ĹÄ…czniki: ${meta.laczniki}` : "",
        meta.punkty && !meta.gniazda && !meta.laczniki ? `Punkty elektryczne: ${meta.punkty}` : "",
        meta.sanitarne ? `Punkty sanitarne: ${meta.sanitarne}` : "",
        meta.co ? `Punkty C.O.: ${meta.co}` : "",
        meta.przerobka ? "Tryb: przerĂłbka" : "",
        meta.wymiana ? "Tryb: wymiana" : "",
        meta.pokoje ? `Pokoje: ${meta.pokoje}` : "",
        meta.odZera ? "Zakres: od zera" : "",
        meta.remont ? "Zakres: remont / modernizacja" : ""
    ].filter(Boolean).join(" â€˘ ");

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
                        <th>IloĹ›Ä‡</th>
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
        alert("GoĹ›Ä‡ nie moĹĽe modyfikowaÄ‡ wyceny.");
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
        if (btn) btn.textContent = "đźŽ™ SĹ‚ucham...";
        window.AndroidSpeech.startListening();
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const opis = document.getElementById("szybka-wycena-opis");

    if (!SpeechRecognition) {
        alert("Ten telefon albo WebView nie obsĹ‚uguje rozpoznawania mowy. Wpisz opis rÄ™cznie.");
        return;
    }

    try {
        const recognition = new SpeechRecognition();
        recognition.lang = "pl-PL";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (btn) btn.textContent = "đźŽ™ SĹ‚ucham...";

        recognition.onresult = (event) => {
            const tekst = event.results?.[0]?.[0]?.transcript || "";
            dopiszTekstDoSzybkiejWyceny(tekst);
        };

        recognition.onerror = () => {
            if (btn) btn.textContent = "đźŽ™ Dopowiedz";
        };

        recognition.onend = () => {
            if (btn) btn.textContent = "đźŽ™ Dopowiedz";
        };

        recognition.start();
    } catch (err) {
        console.error(err);
        if (btn) btn.textContent = "đźŽ™ Dopowiedz";
        alert("Mikrofon nie uruchomiĹ‚ siÄ™. Wpisz opis rÄ™cznie.");
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
    if (btn) btn.textContent = "đźŽ™ Dopowiedz";
};

window.onAndroidSpeechError = function(komunikat) {
    const btn = document.getElementById("btn-szybka-wycena-mow");
    if (btn) btn.textContent = "đźŽ™ Dopowiedz";
    alert(komunikat || "Nie udaĹ‚o siÄ™ rozpoznaÄ‡ gĹ‚osu. Wpisz opis rÄ™cznie.");
};

window.onAndroidSpeechStatus = function(status) {
    const btn = document.getElementById("btn-szybka-wycena-mow");
    if (!btn) return;
    btn.textContent = status === "SĹ‚ucham..." ? "đźŽ™ SĹ‚ucham..." : "đźŽ™ Dopowiedz";
};

function dodajPozycjeRecznieDoWyceny() {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe modyfikowaÄ‡ wyceny.");
        return;
    }

    const selectedId = document.getElementById("wycena-usluga").value;
    const u = uslugi.find(x => String(x.id) === String(selectedId));
    const nazwaInput = document.getElementById("wycena-usluga-search").value.trim();

    const ilosc = parseKwota(document.getElementById("wycena-ilosc").value);
    const cena = parseKwota(document.getElementById("wycena-cena").value);
    const jednostka = document.getElementById("wycena-jednostka").value;
    const vatProcent = Number(document.getElementById("wycena-vat").value);

    if (isNaN(ilosc) || ilosc <= 0) {
        alert("Wpisz poprawnÄ… iloĹ›Ä‡.");
        return;
    }

    if (!Number.isFinite(cena) || cena < 0) {
        alert("Cena jednostkowa nie moĹĽe byÄ‡ pusta ani ujemna.");
        return;
    }

    const nazwa = u ? u.nazwa : (nazwaInput || "");
    if (!nazwa) {
        alert("Wybierz usĹ‚ugÄ™ z bazy lub wpisz nazwÄ™ usĹ‚ugi.");
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
                cena_netto: cena,
                cena: cena,
                price: cena,
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
            cena_netto: cena,
            cena: cena,
            price: cena,
            vatProcent
        });

        // clear only iloĹ›Ä‡ by default as before
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

    wycenaPozycje = normalizujPozycjeKosztorysu(wycenaPozycje);

    tbody.innerHTML = wycenaPozycje.map(p => {
        const ilosc = iloscPozycji(p);
        const cena = cenaPozycji(p);
        const netto = ilosc * cena;
        const vatProcent = pobierzVatProcent(p);
        const vat = netto * (vatProcent / 100);
        const brutto = netto + vat;
        const akcja = rolaUsera !== "guest"
            ? `<div class="wycena-actions"><button class="btn btn-secondary tiny-btn" onclick="pokazPanelEdycjiPozycji('${p.id}')">Edytuj</button><button class="btn btn-danger tiny-btn" onclick="usunPozycjeWyceny('${p.id}')">UsuĹ„</button></div>`
            : "";

        return `
            <tr>
                <td>${esc(p.nazwa)}</td>
                <td>${esc(p.jednostka)}</td>
                <td>${ilosc}</td>
                <td><input class="wycena-price-input" type="text" inputmode="decimal" data-position-id="${esc(p.id)}" value="${cena.toFixed(2)}" onchange="zmienCenePozycjiWyceny('${esc(p.id)}', this.value, false, this)" oninput="zmienCenePozycjiWyceny('${esc(p.id)}', this.value, true, this)"></td>
                <td>${netto.toFixed(2)} PLN</td>
                <td>${vatProcent}%</td>
                <td>${brutto.toFixed(2)} PLN</td>
                <td>${akcja}</td>
            </tr>
        `;
    }).join("");

    przeliczWycene();
}

window.zmienCenePozycjiWyceny = function(id, value, silent = false, inputEl = null) {
    const cena = parseKwota(value);
    if (!Number.isFinite(cena) || cena < 0) {
        if (!silent) alert("Cena jednostkowa nie moĹĽe byÄ‡ pusta ani ujemna.");
        return;
    }

    let updatedPosition = null;
    wycenaPozycje = wycenaPozycje.map(p => {
        if (String(p.id) !== String(id)) return p;
        const updated = { ...p };
        ustawCenePozycji(updated, cena);
        updatedPosition = updated;
        return updated;
    });

    if (silent && inputEl && updatedPosition) {
        const row = inputEl.closest("tr");
        if (row) {
            const ilosc = iloscPozycji(updatedPosition);
            const vatProcent = pobierzVatProcent(updatedPosition);
            const netto = ilosc * cena;
            const vat = netto * (vatProcent / 100);
            const brutto = netto + vat;
            if (row.cells[4]) row.cells[4].textContent = `${netto.toFixed(2)} PLN`;
            if (row.cells[6]) row.cells[6].textContent = `${brutto.toFixed(2)} PLN`;
        }
        przeliczWycene();
        return;
    }

    renderujWycene();
};

function pokazPanelEdycjiPozycji(id) {
    if (rolaUsera === "guest") {
        alert("Tylko zalogowany uĹĽytkownik moĹĽe edytowaÄ‡ pozycje.");
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
    const ilosc = parseKwota(document.getElementById("edycja-ilosc").value);
    const cena = parseKwota(document.getElementById("edycja-cena").value);
    const vatProcent = Number(document.getElementById("edycja-vat").value);
    const uwagi = document.getElementById("edycja-uwagi").value.trim();

    if (!nazwa) {
        alert("Wpisz nazwÄ™ usĹ‚ugi.");
        return;
    }

    if (isNaN(ilosc) || ilosc <= 0) {
        alert("Wpisz poprawnÄ… iloĹ›Ä‡.");
        return;
    }

    if (!Number.isFinite(cena) || cena < 0) {
        alert("Cena jednostkowa nie moĹĽe byÄ‡ pusta ani ujemna.");
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
            cena_netto: cena,
            cena: cena,
            price: cena,
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
        alert("GoĹ›Ä‡ nie moĹĽe modyfikowaÄ‡ wyceny.");
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

    // wyczyĹ›Ä‡ pola formularza Dodaj pozycjÄ™
    const fields = ["wycena-usluga-search", "wycena-ilosc", "wycena-cena"];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const selVat = document.getElementById("wycena-vat");
    if (selVat) selVat.value = "23";
    const jednostka = document.getElementById("wycena-jednostka");
    if (jednostka) jednostka.value = "szt.";

    // przywrĂłÄ‡ tekst przycisku i ukryj Anuluj
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
        alert("Wpisz nazwÄ™ usĹ‚ugi.");
        return;
    }

    if (!jednostka) {
        alert("Wybierz jednostkÄ™.");
        return;
    }

    if (isNaN(cenaNetto) || cenaNetto < 0) {
        alert("Wpisz poprawnÄ… cenÄ™ netto (liczba >= 0).");
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
            console.error("BĹ‚Ä…d zapisu usĹ‚ugi:", errorText);
            alert("Nie udaĹ‚o siÄ™ zapisaÄ‡ usĹ‚ugi. SprawdĹş bazÄ™ usĹ‚ug lub uprawnienia.");
            return;
        }

        // OdĹ›wieĹĽ lokalnÄ… listÄ™ usĹ‚ug
        await pobierzUslugi();
        renderujSelectUslug();

        // WyczyĹ›Ä‡ formularz
        document.getElementById("wycena-nowa-usluga-nazwa").value = "";
        document.getElementById("wycena-nowa-usluga-jednostka").value = "szt.";
        document.getElementById("wycena-nowa-usluga-cena").value = "";

        // PokaĹĽ komunikat sukcesu
        alert("UsĹ‚uga zapisana w cenniku.");

        zapiszLog("Wycena", "Dodano usĹ‚ugÄ™ do cennika", nazwa);
    } catch (err) {
        console.error("BĹ‚Ä…d zapisu usĹ‚ugi:", err);
        alert("Nie udaĹ‚o siÄ™ zapisaÄ‡ usĹ‚ugi. SprawdĹş bazÄ™ usĹ‚ug lub uprawnienia.");
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
        const nettoPoKorekcie = iloscPozycji(p) * cenaPozycji(p) * mnoznikKorekty;
        const vat = nettoPoKorekcie * (vatStawka / 100);

        sumaNettoPoKorekcie += nettoPoKorekcie;
        sumaVAT += vat;
    });

    const brutto = sumaNettoPoKorekcie + sumaVAT;

    const elNetto = document.getElementById("suma-netto");
    const elVat = document.getElementById("suma-vat");
    const elBrutto = document.getElementById("suma-brutto");

    if (!elNetto || !elVat || !elBrutto) {
        console.error("Brak wymaganych elementĂłw podsumowania wyceny.");
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
        const cenaBazowa = parseKwota(p.cenaBazowa ?? cenaPozycji(p)) || 0;
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
    ustawPowiazanaInwestycjeKosztorysu("");
    aktualizujTrybEdycjiKosztorysuWidok();
    renderujWycene();
}

function anulujTrybEdycjiKosztorysu() {
    edytowanyKosztorysId = null;
    trybEdycjiKosztorysu = false;
    document.getElementById("kosztorys-nazwa").value = "";
    document.getElementById("wycena-korekta").value = 0;
    ustawPowiazanaInwestycjeKosztorysu("");
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
        alert("GoĹ›Ä‡ nie moĹĽe zapisywaÄ‡ kosztorysĂłw.");
        return;
    }

    const nazwa = document.getElementById("kosztorys-nazwa").value.trim();

    if (!nazwa) {
        alert("Wpisz nazwÄ™ kosztorysu lub dane klienta.");
        return;
    }

    if (!wycenaPozycje.length) {
        alert("Dodaj przynajmniej jednÄ… pozycjÄ™.");
        return;
    }

    const pozycjeDoZapisu = walidujPozycjeKosztorysu();
    if (!pozycjeDoZapisu) return;
    wycenaPozycje = pozycjeDoZapisu;

    const korekta = Number(document.getElementById("wycena-korekta").value || 0);
    const mnoznikKorekty = 1 + korekta / 100;

    let netto = 0;
    let sumaVAT = 0;

    pozycjeDoZapisu.forEach(p => {
        const vatProcent = pobierzVatProcent(p);
        const nettoPoKorekcie = p.ilosc * p.cenaNetto * mnoznikKorekty;
        const vat = nettoPoKorekcie * (vatProcent / 100);

        netto += nettoPoKorekcie;
        sumaVAT += vat;
    });

    const brutto = netto + sumaVAT;

    const payload = {
        nazwa,
        pozycje: pozycjeDoZapisu,
        korekta,
        netto,
        brutto,
        data: new Date().toLocaleDateString("pl-PL"),
        investment_id: document.getElementById("kosztorys-inwestycja")?.value || null,
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

        if (!res.ok) {
            const errorText = await res.text();
            console.error("BĹ‚Ä…d zapisu kosztorysu Supabase:", {
                status: res.status,
                statusText: res.statusText,
                response: errorText,
                payload
            });
            throw new Error(errorText);
        }

        alert(edytowanyKosztorysId ? "Kosztorys zaktualizowany." : "Kosztorys zapisany.");
        const nazwaLogu = edytowanyKosztorysId ? "Zaktualizowano kosztorys" : "Zapisano kosztorys";
        await pobierzKosztorysy();
        renderujKosztorysy();
        renderujPulpit();
        anulujTrybEdycjiKosztorysu();
        pokazSekcje("kosztorysy");
        zapiszLog("Kosztorysy", nazwaLogu, nazwa);
    } catch (err) {
        console.error("BĹ‚Ä…d zapisu kosztorysu:", err);
        alert("Nie udaĹ‚o siÄ™ zapisaÄ‡ kosztorysu. SzczegĂłĹ‚y bĹ‚Ä™du sÄ… w konsoli.");
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
            String(k.data || "").toLowerCase().includes(szukaj) ||
            String(etykietaInwestycji(znajdzInwestycjeKosztorysu(k)) || "").toLowerCase().includes(szukaj)
        );
    }

    if (sort === "nazwa-az") lista.sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), "pl"));
    if (sort === "brutto-malejaco") lista.sort((a, b) => Number(b.brutto || 0) - Number(a.brutto || 0));
    if (sort === "brutto-rosnaco") lista.sort((a, b) => Number(a.brutto || 0) - Number(b.brutto || 0));

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Brak zapisanych kosztorysĂłw.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(k => {
        const powiazanaInwestycja = znajdzInwestycjeKosztorysu(k);
        const inwestycjaLabel = powiazanaInwestycja
            ? esc(powiazanaInwestycja.nazwa || "Inwestycja")
            : pobierzPowiazanaInwestycjeKosztorysu(k)
                ? `<span class="orphaned-warning">Inwestycja nie istnieje</span>`
                : "-";
        const edytuj = rolaUsera !== "guest"
            ? `<button class="btn btn-secondary" onclick="wczytajKosztorys('${esc(k.id)}')">Edytuj</button>`
            : "";
        const usun = rolaUsera === "admin"
            ? `<button class="btn btn-danger" onclick="usunKosztorys('${esc(k.id)}')">UsuĹ„</button>`
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
            <tr data-kosztorys-id="${esc(k.id)}">
                <td>${esc(k.data)}</td>
                <td><strong>${esc(k.nazwa)}</strong></td>
                <td>${inwestycjaLabel}</td>
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
        console.error('BĹ‚Ä…d aktualizacji statusu kosztorysu:', err);
        alert('Nie udaĹ‚o siÄ™ zaktualizowaÄ‡ statusu kosztorysu.');
    }
};

window.akcjaKosztorysu = async function(id) {
    const kosztorys = kosztorysy.find(x => String(x.id) === String(id));
    if (!kosztorys) return;

    const wybor = prompt(
        'Wybierz opcjÄ™ dla kosztorysu:\n1 - Tylko oznacz jako zaakceptowany\n2 - UtwĂłrz nowÄ… inwestycjÄ™ z kosztorysu\n3 - PoĹ‚Ä…cz z istniejÄ…cÄ… inwestycjÄ…',
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
            await zaakceptujKosztorys(id, { investment_id: inwestycja.id });
            zapiszLog('Kosztorysy', 'PoĹ‚Ä…czono kosztorys z nowÄ… inwestycjÄ…', id);
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
        console.error('BĹ‚Ä…d tworzenia inwestycji z kosztorysu:', err);
        alert('Nie udaĹ‚o siÄ™ utworzyÄ‡ inwestycji z kosztorysu.');
        return null;
    }
}

async function polaczZIstniejacaInwestycja(kosztorys) {
    await pobierzInwestycje();

    if (!inwestycje.length) {
        alert('Brak dostÄ™pnych inwestycji do poĹ‚Ä…czenia.');
        return;
    }
    // Show a numbered list to the user (number - nazwa - klient). User inputs number (1-based).
    const lines = inwestycje.map((i, idx) => `${idx + 1} - ${i.nazwa || '-'} - ${i.klient || '-'}`);
    const promptText = `Wybierz numer inwestycji, z ktĂłrÄ… chcesz poĹ‚Ä…czyÄ‡ kosztorys:\n${lines.join('\n')}`;
    const wybor = prompt(promptText, '1');
    if (!wybor) return;

    const num = Number(wybor.trim());
    if (!Number.isInteger(num) || num < 1 || num > inwestycje.length) {
        alert('NieprawidĹ‚owy wybĂłr inwestycji.');
        return;
    }

    const chosen = inwestycje[num - 1];
    if (!chosen) {
        alert('NieprawidĹ‚owy wybĂłr inwestycji.');
        return;
    }

    // Prepare extra data: set inwestycja_id and ensure zaakceptowany_at if missing
    const extra = { investment_id: chosen.id };
    if (!kosztorys.zaakceptowany_at) extra.zaakceptowany_at = formatDateTimeLocal(new Date());

    await zaakceptujKosztorys(kosztorys.id, extra);
    alert('Kosztorys poĹ‚Ä…czony z inwestycjÄ….');
    zapiszLog('Kosztorysy', 'PoĹ‚Ä…czono kosztorys z istniejÄ…cÄ… inwestycjÄ…', kosztorys.id);
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
        alert("Wybierz przynajmniej jednÄ… kolumnÄ™.");
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
    modal.classList.remove("hidden");

    const btnDetailed = document.getElementById("btn-drukuj-inwestycje-szczegolowy");
    if (btnDetailed) btnDetailed.onclick = () => drukujRozliczenieInwestycji({ tryb: "szczegolowy" });

    const btnCompact = document.getElementById("btn-drukuj-inwestycje-skrocony");
    if (btnCompact) btnCompact.onclick = () => drukujRozliczenieInwestycji({ tryb: "skrocony" });

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
        alert("Wybierz przynajmniej jednÄ… pozycjÄ™ do wydruku.");
        return null;
    }

    return options;
}

function drukujRozliczenieInwestycji({ tryb = "skrocony" } = {}) {
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

    const szczegolowy = tryb === "szczegolowy";
    const { dataStart, dataKoniec } = pobierzDatyInwestycji(inwestycja);
    const rozliczenie = wyliczRozliczenieInwestycji(aktywnaInwestycjaId);
    const powiazaneKosztorysy = rozliczenie.powiazaneKosztorysy;
    const zaliczki = rozliczenie.zaliczki;
    const koszty = rozliczenie.koszty;
    const prace = rozliczenie.prace;

    const kwota = value => `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
    const dataWydruku = new Date().toLocaleString("pl-PL");
    const termin = dataStart && dataKoniec && dataKoniec !== dataStart ? `${dataStart} â€“ ${dataKoniec}` : (dataStart || "-");
    const kosztorysyRows = powiazaneKosztorysy.length
        ? powiazaneKosztorysy.map(k => `
            <tr>
                <td>${esc(k.nazwa || "Kosztorys")}</td>
                <td>${esc(k.data || "-")}</td>
                <td class="num">${kwota(k.netto)}</td>
                <td class="num">${kwota(Math.max(0, Number(k.brutto || 0) - Number(k.netto || 0)))}</td>
                <td class="num">${kwota(k.brutto)}</td>
                <td>${esc(statusKosztorysuLabel(k.status))}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="6">Brak powiÄ…zanych kosztorysĂłw.</td></tr>`;

    const pozycjeKosztorysowHtml = szczegolowy
        ? powiazaneKosztorysy.map(k => {
            const rows = pozycjeKosztorysu(k).map(p => {
                const ilosc = iloscPozycji(p);
                const cena = cenaPozycji(p);
                const vat = pobierzVatProcent(p);
                const brutto = ilosc * cena * (1 + vat / 100);
                return `
                    <tr>
                        <td>${esc(p.nazwa || p.opis || "-")}</td>
                        <td class="num">${Number(ilosc || 0).toLocaleString("pl-PL")}</td>
                        <td>${esc(p.jednostka || p.jm || "-")}</td>
                        <td class="num">${kwota(cena)}</td>
                        <td class="num">${Number(vat || 0).toFixed(0)}%</td>
                        <td class="num">${kwota(brutto)}</td>
                    </tr>
                `;
            }).join("") || `<tr><td colspan="6">Brak pozycji kosztorysu.</td></tr>`;

            return `
                <section class="print-section avoid-break">
                    <h3>${esc(k.nazwa || "Kosztorys")}</h3>
                    <table>
                        <thead>
                            <tr><th>Pozycja</th><th>IloĹ›Ä‡</th><th>Jm</th><th>Cena netto</th><th>VAT</th><th>Brutto</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </section>
            `;
        }).join("")
        : "";

    const kosztyRows = koszty.length
        ? koszty.map(k => {
            const kwoty = k._kwoty || wyliczKosztMaterialowy(k);
            return `
                <tr>
                    <td>${esc(k.data || "-")}</td>
                    <td class="num">${kwoty.netto === null ? "Nieustalone" : kwota(kwoty.netto)}</td>
                    <td class="num">${kwoty.vatAmount === null ? "Nieustalony" : `${esc(kwoty.vatLabel)} / ${kwota(kwoty.vatAmount)}`}</td>
                    <td class="num">${kwota(kwoty.brutto)}</td>
                    <td>${esc(k.kategoria || "-")}</td>
                    <td>${esc(k.opis || "")}</td>
                </tr>
            `;
        }).join("")
        : `<tr><td colspan="6">Brak kosztĂłw materiaĹ‚owych.</td></tr>`;

    const zaliczkiRows = zaliczki.length
        ? zaliczki.map(z => `
            <tr>
                <td>${esc(z.data || "-")}</td>
                <td class="num">${kwota(z.kwota)}</td>
                <td>${esc(z.sposob_platnosci || z.platnosc || "-")}</td>
                <td>${esc(etykietaPrzeznaczeniaZaliczki(pobierzPrzeznaczenieZaliczki(z)))}</td>
                <td>${esc(z.opis || "")}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="5">Brak zaliczek.</td></tr>`;

    const praceRows = prace.length
        ? prace.map(p => `
            <tr>
                <td>${esc(p.data || "-")}</td>
                <td>${esc(p.nazwa || "-")}</td>
                <td class="num">${kwota(p.netto)}</td>
                <td class="num">${kwota(p.vat_amount ?? (Number(p.brutto || 0) - Number(p.netto || 0)))}</td>
                <td class="num">${kwota(p.brutto || p.kwota)}</td>
                <td>${esc(p.opis || "")}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="6">Brak prac dodatkowych.</td></tr>`;

    const materialyBalanceLabel = rozliczenie.nadwyzkaMaterialowa > 0
        ? "ZostaĹ‚o z zaliczki na materiaĹ‚y"
        : "PozostaĹ‚o za materiaĹ‚y";
    const materialyBalanceValue = rozliczenie.nadwyzkaMaterialowa > 0
        ? rozliczenie.nadwyzkaMaterialowa
        : rozliczenie.pozostaloMaterialy;
    const praceSummaryHtml = rozliczenie.pokazPraceDodatkowe ? `
        <section class="print-section avoid-break">
            <h2>Prace dodatkowe</h2>
            <table class="summary-table">
                <tbody>
                    <tr><td>Netto</td><td class="num">${kwota(rozliczenie.praceNetto)}</td></tr>
                    <tr><td>VAT</td><td class="num">${kwota(rozliczenie.praceVat)}</td></tr>
                    <tr class="total"><td>Brutto</td><td class="num">${kwota(rozliczenie.praceBrutto)}</td></tr>
                </tbody>
            </table>
        </section>
    ` : "";
    const rozliczeniePrintHtml = `
        <section class="print-section avoid-break">
            <h2>Rozliczenie robocizny</h2>
            <table class="summary-table">
                <tbody>
                    <tr><td>Netto</td><td class="num">${kwota(rozliczenie.robociznaNetto)}</td></tr>
                    <tr><td>VAT</td><td class="num">${kwota(rozliczenie.robociznaVat)}</td></tr>
                    <tr><td>Brutto</td><td class="num">${kwota(rozliczenie.robociznaBrutto)}</td></tr>
                    <tr><td>Zaliczki na robociznÄ™</td><td class="num">${kwota(rozliczenie.zaliczkiRobocizna)}</td></tr>
                    <tr class="total"><td>PozostaĹ‚o za robociznÄ™</td><td class="num">${kwota(rozliczenie.pozostaloRobocizna)}</td></tr>
                </tbody>
            </table>
        </section>
        <section class="print-section avoid-break">
            <h2>Rozliczenie materiaĹ‚Ăłw</h2>
            <table class="summary-table">
                <tbody>
                    <tr><td>Netto</td><td class="num">${kwota(rozliczenie.materialyNetto)}</td></tr>
                    <tr><td>VAT</td><td class="num">${kwota(rozliczenie.materialyVat)}</td></tr>
                    <tr><td>Brutto</td><td class="num">${kwota(rozliczenie.materialyBrutto)}</td></tr>
                    <tr><td>Zaliczki na materiaĹ‚y</td><td class="num">${kwota(rozliczenie.zaliczkiMaterialy)}</td></tr>
                    <tr class="total"><td>${materialyBalanceLabel}</td><td class="num">${kwota(materialyBalanceValue)}</td></tr>
                </tbody>
            </table>
        </section>
        ${praceSummaryHtml}
        <section class="print-section avoid-break final-summary">
            <h2>Podsumowanie koĹ„cowe</h2>
            <table class="summary-table">
                <tbody>
                    <tr><td>Razem netto</td><td class="num">${kwota(rozliczenie.razemNetto)}</td></tr>
                    <tr><td>VAT razem</td><td class="num">${kwota(rozliczenie.vatRazem)}</td></tr>
                    <tr><td>Razem brutto</td><td class="num">${kwota(rozliczenie.razemBrutto)}</td></tr>
                    <tr><td>Zaliczki razem</td><td class="num">${kwota(rozliczenie.zaliczkiRazem)}</td></tr>
                    <tr><td>Robocizna do zapĹ‚aty</td><td class="num">${kwota(rozliczenie.pozostaloRobocizna)}</td></tr>
                    <tr><td>ZostaĹ‚o z zaliczki na materiaĹ‚y</td><td class="num">-${kwota(rozliczenie.nadwyzkaMaterialowa)}</td></tr>
                    <tr class="total"><td>PozostaĹ‚o do zapĹ‚aty</td><td class="num">${kwota(rozliczenie.pozostaloDoZaplaty)}</td></tr>
                </tbody>
            </table>
            ${rozliczenie.nadwyzkaMaterialowa > 0 ? `<p class="print-note">NadwyĹĽka z zaliczki materiaĹ‚owej pomniejsza koĹ„cowÄ… kwotÄ™ do zapĹ‚aty.</p>` : ""}
        </section>
    `;

    const szczegolyHtml = szczegolowy ? `
        <section class="print-section">
            <h2>Pozycje kosztorysĂłw</h2>
            ${pozycjeKosztorysowHtml || "<p>Brak powiÄ…zanych kosztorysĂłw.</p>"}
        </section>

        <section class="print-section avoid-break">
            <h2>Koszty materiaĹ‚owe</h2>
            <table>
                <thead><tr><th>Data</th><th>Netto</th><th>VAT</th><th>Brutto</th><th>Kategoria</th><th>Opis</th></tr></thead>
                <tbody>${kosztyRows}</tbody>
            </table>
        </section>

        <section class="print-section avoid-break">
            <h2>Zaliczki</h2>
            <table>
                <thead><tr><th>Data</th><th>Kwota</th><th>PĹ‚atnoĹ›Ä‡</th><th>Przeznaczenie</th><th>Opis</th></tr></thead>
                <tbody>${zaliczkiRows}</tbody>
            </table>
        </section>

        ${rozliczenie.pokazPraceDodatkowe ? `<section class="print-section avoid-break">
            <h2>Prace dodatkowe</h2>
            <table>
                <thead><tr><th>Data</th><th>Nazwa</th><th>Netto</th><th>VAT</th><th>Brutto</th><th>Opis</th></tr></thead>
                <tbody>${praceRows}</tbody>
            </table>
        </section>` : ""}
    ` : "";

    const html = `
        <!doctype html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>EL-Net â€” Rozliczenie inwestycji</title>
            <style>
                @page { size: A4 portrait; margin: 12mm; @bottom-right { content: "Strona " counter(page); } }
                * { box-sizing: border-box; }
                body { margin: 0; color: #111827; background: #fff; font-family: Arial, sans-serif; font-size: 11px; line-height: 1.45; }
                .print-header { display: grid; grid-template-columns: 1fr 1.4fr 1fr; align-items: start; gap: 14px; border-bottom: 2px solid #111827; padding: 0 0 12px; margin-bottom: 18px; }
                .brand { font-size: 22px; font-weight: 800; letter-spacing: 0; line-height: 1.1; }
                .doc-title { margin: 0; text-align: center; font-size: 18px; line-height: 1.2; font-weight: 800; }
                .print-meta { text-align: right; color: #4b5563; font-size: 10px; line-height: 1.45; }
                .print-section { margin-top: 16px; break-inside: avoid; page-break-inside: avoid; }
                .print-section h2 { margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; font-size: 14px; }
                .print-section h3 { margin: 10px 0 6px; font-size: 12px; }
                .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 18px; }
                .info-grid p { margin: 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
                thead { display: table-header-group; }
                th, td { border: 1px solid #d1d5db; padding: 5px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
                th { background: #f3f4f6; font-weight: 700; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                .num { text-align: right; white-space: nowrap; }
                .summary-table td { border-color: #cbd5e1; }
                .summary-table .total td { background: #eef2ff; font-weight: 800; font-size: 12px; }
                .final-summary { border: 1px solid #c7d2fe; padding: 8px; background: #f8fafc; }
                .print-note { margin: 8px 0 0; color: #166534; font-weight: 700; }
                .avoid-break { break-inside: avoid; page-break-inside: avoid; }
                .footer-note { margin-top: 18px; color: #6b7280; font-size: 9px; }
                @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
        </head>
        <body>
            <header class="print-header">
                <div class="brand">EL-Net</div>
                <div class="doc-title">Rozliczenie inwestycji</div>
                <div class="print-meta">
                    <div>${szczegolowy ? "Wydruk szczegĂłĹ‚owy" : "Wydruk bez szczegĂłĹ‚Ăłw"}</div>
                    <div>Data: ${esc(dataWydruku)}</div>
                </div>
            </header>

            <section class="print-section avoid-break">
                <h2>Dane inwestycji</h2>
                <div class="info-grid">
                    <p><strong>Nazwa:</strong> ${esc(inwestycja.nazwa || "-")}</p>
                    <p><strong>Klient:</strong> ${esc(inwestycja.klient || "-")}</p>
                    <p><strong>Adres:</strong> ${esc(inwestycja.adres || "-")}</p>
                    <p><strong>Telefon:</strong> ${esc(inwestycja.telefon || "-")}</p>
                    <p><strong>Termin:</strong> ${esc(termin)}</p>
                    <p><strong>Status:</strong> ${esc(inwestycja.status || "-")}</p>
                </div>
            </section>

            <section class="print-section avoid-break">
                <h2>PowiÄ…zane kosztorysy</h2>
                <table>
                    <thead><tr><th>Nazwa</th><th>Data</th><th>Netto</th><th>VAT</th><th>Brutto</th><th>Status</th></tr></thead>
                    <tbody>${kosztorysyRows}</tbody>
                </table>
            </section>

            ${rozliczeniePrintHtml}

            ${szczegolyHtml}
            <div class="footer-note">EL-Net â€” data wydruku: ${esc(dataWydruku)}</div>
        </body>
        </html>
    `;

    if (window.AndroidPrint && window.AndroidPrint.printHtml) {
        window.AndroidPrint.printHtml(html);
        return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("Nie udaĹ‚o siÄ™ otworzyÄ‡ okna drukowania.");
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    zapiszLog("Inwestycje", szczegolowy ? "Druk rozliczenia szczegĂłĹ‚owego" : "Druk rozliczenia bez szczegĂłĹ‚Ăłw", inwestycja.nazwa);
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
    const kosztorys = kosztorysy.find(k => kosztorysPasujeDoInwestycji(k, aktywnaInwestycjaId));

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
            kosztorysHtml = `<p>Brak powiÄ…zanego kosztorysu robocizny.</p>`;
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
                    <thead><tr><th>Nazwa</th><th>IloĹ›Ä‡</th><th>Cena netto</th><th>VAT</th><th>Netto</th><th>Brutto</th><th>Opis</th></tr></thead>
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
            zaliczkiHtml = `<table><thead><tr><th>Data</th><th>Kwota</th><th>PĹ‚atnoĹ›Ä‡</th><th>Opis</th></tr></thead><tbody>${rows}</tbody></table>`;
        }
    }

    let kosztyHtml = "";
    if (options.koszty) {
        if (!koszty.length) kosztyHtml = `<p>Brak kosztĂłw.</p>`;
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
                <tr><td>Koszty materiaĹ‚owe</td><td style="text-align:right">${sumaKosztow.toFixed(2)} PLN</td></tr>
                <tr><td><strong>Razem do rozliczenia</strong></td><td style="text-align:right"><strong>${razemDoRozliczenia.toFixed(2)} PLN</strong></td></tr>
                <tr><td>Zaliczki</td><td style="text-align:right">${sumaZaliczek.toFixed(2)} PLN</td></tr>
                <tr><td><strong>PozostaĹ‚o do zapĹ‚aty</strong></td><td style="text-align:right"><strong>${pozostaloDoZaplaty.toFixed(2)} PLN</strong></td></tr>
                <tr><td>Bilans gotĂłwki (zaliczki - koszty materiaĹ‚owe)</td><td style="text-align:right">${bilansGotowki.toFixed(2)} PLN</td></tr>
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
            <h1>EL-Net â€” Rozliczenie inwestycji</h1>
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
            ${options.koszty ? `<div class="section"><h2>Koszty materiaĹ‚owe</h2>${kosztyHtml}</div>` : ''}
            ${options.podsumowanie ? `<div class="section"><h2>Podsumowanie koĹ„cowe</h2>${podsumowanieHtml}</div>` : ''}
            ${uwagiHtml}
        </body>
        </html>
    `;

    if (window.AndroidPrint && window.AndroidPrint.printHtml) { window.AndroidPrint.printHtml(html); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { alert("Nie udaĹ‚o siÄ™ otworzyÄ‡ okna drukowania."); return; }
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
            console.error("BĹ‚Ä…d parsowania pozycji kosztorysu:", err);
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
        { key: "ilosc", label: "IloĹ›Ä‡", visible: options.ilosc },
        { key: "cenaNetto", label: "Cena netto", visible: options.cenaNetto },
        { key: "wartoscNetto", label: "WartoĹ›Ä‡ netto", visible: options.wartoscNetto },
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
        : `<tr><td colspan="4">Brak kosztĂłw</td></tr>`;

    const html = `
        <html>
        <head>
            <meta charset="UTF-8">
            <title>EL-Net â€” Rozliczenie inwestycji</title>
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
            <h1>EL-Net â€” Rozliczenie inwestycji</h1>
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
                <p class="summary-box"><strong>Suma kosztĂłw:</strong> ${sumaKosztow.toFixed(2)} PLN</p>
                <p class="summary-box"><strong>RĂłĹĽnica:</strong> ${roznica.toFixed(2)} PLN</p>
            </div>

            <div class="section">
                <h2>Zaliczki</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Kwota</th>
                            <th>SposĂłb pĹ‚atnoĹ›ci</th>
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
        alert("Nie udaĹ‚o siÄ™ otworzyÄ‡ okna drukowania.");
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
        alert("GoĹ›Ä‡ nie moĹĽe edytowaÄ‡ kosztorysĂłw.");
        return;
    }

    const k = kosztorysy.find(x => String(x.id) === String(id));
    if (!k) return;

    try {
        const zapisanePozycje = typeof k.pozycje === "string" ? JSON.parse(k.pozycje) : k.pozycje || [];
        wycenaPozycje = normalizujPozycjeKosztorysu(zapisanePozycje);
    } catch {
        wycenaPozycje = [];
    }

    document.getElementById("kosztorys-nazwa").value = k.nazwa || "";
    document.getElementById("wycena-korekta").value = k.korekta || 0;
    ustawPowiazanaInwestycjeKosztorysu(pobierzPowiazanaInwestycjeKosztorysu(k) || "");
    edytowanyKosztorysId = k.id;
    trybEdycjiKosztorysu = true;
    aktualizujTrybEdycjiKosztorysuWidok();

    renderujWycene();
    pokazSekcje("wycena");
};

window.usunKosztorys = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator moĹĽe usuwaÄ‡ kosztorysy.");
        return;
    }

    if (!confirm("UsunÄ…Ä‡ kosztorys?")) return;

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${id}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        await pobierzKosztorysy();
        renderujKosztorysy();
        renderujPulpit();
        zapiszLog("Kosztorysy", "UsuniÄ™to kosztorys", id);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ kosztorysu.");
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
        const linkedEventId = pobierzPowiazanyTerminId(i);
        const calendarButton = linkedEventId
            ? `<button class="btn btn-secondary small-btn" onclick="pokazInwestycjeWTerminarzu('${esc(i.id)}')">PokaĹĽ w Terminarzu</button>`
            : `<button class="btn btn-secondary small-btn" onclick="dodajInwestycjeDoTerminarza('${esc(i.id)}')">Dodaj do Terminarza</button>`;

        const akcje = rolaUsera === "admin"
            ? `<button class="btn btn-secondary small-btn" onclick="edytujInwestycje('${esc(i.id)}')">Edytuj</button><button class="btn btn-danger small-btn" onclick="usunInwestycje('${esc(i.id)}')">UsuĹ„</button>`
            : "";

        return `
            <tr>
                <td><strong>${esc(i.nazwa)}</strong><br><small>${esc(i.adres || "")}</small></td>
                <td>${esc(i.klient || "-")}</td>
                <td class="nowrap-cell">${zaliczki.toFixed(2)} PLN</td>
                <td class="nowrap-cell">${koszty.toFixed(2)} PLN</td>
                <td class="nowrap-cell"><strong>${roznica.toFixed(2)} PLN</strong></td>
                <td><div class="table-actions investycje-actions"><button class="btn btn-secondary small-btn" onclick="otworzInwestycje('${esc(i.id)}')">OtwĂłrz</button>${calendarButton}${akcje}</div></td>
            </tr>
        `;
    }).join("");

    if (aktywnaInwestycjaId) {
        renderujPanelInwestycji();
    }
}

function pobierzPolaFormularzaInwestycji() {
    const dataStart = document.getElementById("inwestycja-data-start")?.value || "";
    const dataKoniec = document.getElementById("inwestycja-data-koniec")?.value || "";
    const nazwa = document.getElementById("inwestycja-nazwa")?.value.trim() || "";
    const klient = document.getElementById("inwestycja-klient")?.value.trim() || "";
    const adres = document.getElementById("inwestycja-adres")?.value.trim() || "";
    const telefon = document.getElementById("inwestycja-telefon")?.value.trim() || "";
    const opis = document.getElementById("inwestycja-opis")?.value.trim() || "";
    const status = document.getElementById("inwestycja-status")?.value || "aktywna";

    if (!nazwa) {
        alert("Wpisz nazwÄ™ inwestycji.");
        return null;
    }

    if (dataStart && dataKoniec && parseDateLocal(dataKoniec) < parseDateLocal(dataStart)) {
        alert("Data zakoĹ„czenia nie moĹĽe byÄ‡ wczeĹ›niejsza niĹĽ data rozpoczÄ™cia.");
        return null;
    }

    return {
        nazwa,
        klient,
        adres,
        telefon,
        data_start: dataStart || null,
        data_koniec: dataKoniec || null,
        opis,
        status
    };
}

function walidujPozycjeKosztorysu() {
    document.querySelectorAll(".wycena-price-input[data-position-id]").forEach(input => {
        const id = input.dataset.positionId;
        const cena = parseKwota(input.value);
        if (!Number.isFinite(cena)) return;
        wycenaPozycje = wycenaPozycje.map(p => {
            if (String(p.id) !== String(id)) return p;
            const updated = { ...p };
            ustawCenePozycji(updated, cena);
            return updated;
        });
    });

    const normalized = normalizujPozycjeKosztorysu(wycenaPozycje);
    for (const [index, p] of normalized.entries()) {
        const input = Array.from(document.querySelectorAll(".wycena-price-input[data-position-id]"))
            .find(el => String(el.dataset.positionId) === String(p.id));
        if (input && !String(input.value || "").trim()) {
            alert(`Cena jednostkowa w pozycji ${index + 1} nie moĹĽe byÄ‡ pusta ani ujemna.`);
            return null;
        }
        if (input) {
            const inputCena = parseKwota(input.value);
            if (!Number.isFinite(inputCena) || inputCena < 0) {
                alert(`Cena jednostkowa w pozycji ${index + 1} nie moĹĽe byÄ‡ pusta ani ujemna.`);
                return null;
            }
        }
        if (!Number.isFinite(p.ilosc) || p.ilosc <= 0) {
            alert(`IloĹ›Ä‡ w pozycji ${index + 1} musi byÄ‡ wiÄ™ksza od zera.`);
            return null;
        }
        if (!Number.isFinite(p.cenaNetto) || p.cenaNetto < 0) {
            alert(`Cena jednostkowa w pozycji ${index + 1} nie moĹĽe byÄ‡ pusta ani ujemna.`);
            return null;
        }
    }
    return normalized;
}

function ustawTrybFormularzaInwestycji({ editing = false, source = "inwestycje" } = {}) {
    const title = document.getElementById("inwestycja-form-title");
    const btnDodaj = document.getElementById("btn-dodaj-inwestycje");
    const btnAnuluj = document.getElementById("btn-anuluj-inwestycje");
    if (title) title.textContent = editing ? "Edytuj inwestycjÄ™" : "Nowa inwestycja";
    if (btnDodaj) {
        btnDodaj.textContent = editing ? "Zapisz zmiany" : "Zapisz inwestycjÄ™";
        btnDodaj.disabled = false;
        btnDodaj.dataset.source = source;
    }
    if (btnAnuluj) btnAnuluj.classList.toggle("hidden", !editing && source !== "terminarz");
}

function wyczyscFormularzInwestycji() {
    document.getElementById("inwestycja-nazwa").value = "";
    document.getElementById("inwestycja-klient").value = "";
    document.getElementById("inwestycja-adres").value = "";
    document.getElementById("inwestycja-telefon").value = "";
    document.getElementById("inwestycja-data-start").value = "";
    document.getElementById("inwestycja-data-koniec").value = "";
    document.getElementById("inwestycja-opis").value = "";
    document.getElementById("inwestycja-status").value = "aktywna";
}

function wypelnijFormularzInwestycji(inwestycja) {
    const { dataStart, dataKoniec } = pobierzDatyInwestycji(inwestycja);
    document.getElementById("inwestycja-nazwa").value = inwestycja?.nazwa || "";
    document.getElementById("inwestycja-klient").value = inwestycja?.klient || "";
    document.getElementById("inwestycja-adres").value = inwestycja?.adres || "";
    document.getElementById("inwestycja-telefon").value = inwestycja?.telefon || "";
    document.getElementById("inwestycja-data-start").value = dataStart || "";
    document.getElementById("inwestycja-data-koniec").value = dataKoniec || "";
    document.getElementById("inwestycja-opis").value = inwestycja?.opis || "";
    document.getElementById("inwestycja-status").value = inwestycja?.status || "aktywna";
}

function otworzFormularzInwestycji({ id = null, source = "inwestycje" } = {}) {
    pokazSekcje("inwestycje");
    if (id) {
        const inwestycja = inwestycje.find(i => String(i.id) === String(id));
        if (!inwestycja) {
            alert("Nie znaleziono inwestycji do edycji.");
            return;
        }
        edytowanaInwestycjaId = inwestycja.id;
        wypelnijFormularzInwestycji(inwestycja);
        ustawTrybFormularzaInwestycji({ editing: true, source });
    } else {
        edytowanaInwestycjaId = null;
        wyczyscFormularzInwestycji();
        ustawTrybFormularzaInwestycji({ editing: false, source });
    }
    document.getElementById("card-inwestycje-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function dodajInwestycje() {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe dodawaÄ‡ inwestycji.");
        return;
    }

    const payload = pobierzPolaFormularzaInwestycji();
    if (!payload) return;

    const editingId = edytowanaInwestycjaId;
    const poprzedniaInwestycja = editingId
        ? inwestycje.find(i => String(i.id) === String(editingId)) || null
        : null;
    let zakonczenieInwestycji = null;
    const ponowneOtwarcieInwestycji = editingId
        && czyStatusInwestycjiZakonczony(poprzedniaInwestycja?.status)
        && !czyStatusInwestycjiZakonczony(payload.status);
    if (editingId && czyStatusInwestycjiZakonczony(payload.status) && !czyStatusInwestycjiZakonczony(poprzedniaInwestycja?.status)) {
        const linkedEventId = poprzedniaInwestycja ? pobierzPowiazanyTerminId(poprzedniaInwestycja) : null;
        const linkedTermin = linkedEventId ? terminarz.find(t => String(t.id) === String(linkedEventId)) || null : null;
        const completedAt = await pokazModalZakonczeniaInwestycji(poprzedniaInwestycja, linkedTermin);
        if (!completedAt) return;
        payload.completed_at = completedAt;
        zakonczenieInwestycji = { completedAt, linkedEventId, inwestycja: poprzedniaInwestycja };
    }

    const btnDodaj = document.getElementById("btn-dodaj-inwestycje");
    const originalText = btnDodaj?.textContent || "Zapisz inwestycjÄ™";
    if (btnDodaj?.disabled) return;
    if (btnDodaj) {
        btnDodaj.disabled = true;
        btnDodaj.textContent = "Zapisywanie...";
    }

    const akcjaInwestycji = editingId ? "Edytowano inwestycjÄ™" : "Dodano inwestycjÄ™";

    try {
        let res;

        if (editingId) {
            res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${encodeURIComponent(editingId)}`, {
                method: "PATCH",
                headers: headers(),
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({ ...payload, user_id: zalogowanyUser?.id })
            });
        }

        if (!res.ok) {
            const errorText = await res.text();
            console.error("BĹ‚Ä…d zapisu inwestycji Supabase:", {
                status: res.status,
                statusText: res.statusText,
                response: errorText,
                payload
            });
            throw new Error(errorText);
        }

        const zapisane = await res.json();
        const zapisanaInwestycja = Array.isArray(zapisane) ? zapisane[0] : zapisane;
        const zapisanaInwestycjaId = editingId || zapisanaInwestycja?.id;

        await pobierzInwestycje();
        const inwestycjaPoZapisie = inwestycje.find(i => String(i.id) === String(zapisanaInwestycjaId));

        let keepInvestmentFormOpen = false;
        let syncFailed = false;
        try {
            if (!editingId && inwestycjaPoZapisie?.data_start) {
                await zsynchronizujInwestycjeZTerminarzem(inwestycjaPoZapisie, { force: true });
                await pobierzInwestycje();
                await pobierzTerminarz();
            } else if (zakonczenieInwestycji && inwestycjaPoZapisie) {
                await zsynchronizujZakonczenieInwestycjiZTerminarzem(inwestycjaPoZapisie, zakonczenieInwestycji.completedAt);
                await pobierzTerminarz();
            } else if (editingId && inwestycjaPoZapisie && pobierzPowiazanyTerminId(inwestycjaPoZapisie)) {
                await zsynchronizujInwestycjeZTerminarzem(inwestycjaPoZapisie, { force: true });
                await pobierzTerminarz();
                if (ponowneOtwarcieInwestycji) {
                    await zapiszLog("Inwestycje", "Ponownie otwarto inwestycję", inwestycjaPoZapisie.nazwa || inwestycjaPoZapisie.id, {
                        previous_completed_at: rzeczywistaDataZakonczenia(poprzedniaInwestycja),
                        calendar_event_id: pobierzPowiazanyTerminId(inwestycjaPoZapisie),
                        user_id: zalogowanyUser?.id || null,
                        email: zalogowanyUser?.email || ""
                    });
                }
            }
        } catch (syncErr) {
            syncFailed = true;
            console.error("BĹ‚Ä…d synchronizacji inwestycji z Terminarzem:", syncErr);
            if (!editingId) {
                edytowanaInwestycjaId = zapisanaInwestycjaId;
                ustawTrybFormularzaInwestycji({ editing: true, source: btnDodaj?.dataset.source || "inwestycje" });
                keepInvestmentFormOpen = true;
                alert("Inwestycja zostaĹ‚a utworzona, ale nie udaĹ‚o siÄ™ dodaÄ‡ jej do Terminarza.");
            } else {
                keepInvestmentFormOpen = true;
                alert("Inwestycja została zapisana, ale nie udało się zaktualizować powiązanego wpisu w Terminarzu. Szczegóły są w konsoli.");
            }
            await pobierzTerminarz();
        }

        if (!keepInvestmentFormOpen) {
            wyczyscFormularzInwestycji();
            edytowanaInwestycjaId = null;
            ustawTrybFormularzaInwestycji({ editing: false, source: "inwestycje" });
        }

        renderujInwestycje();
        renderujTerminarz();
        renderujKalendarzTerminarza();
        renderujPulpit();
        if (!syncFailed) {
            zapiszLog("Inwestycje", akcjaInwestycji, payload.nazwa);
        }
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ zapisaÄ‡ inwestycji. SprawdĹş tabelÄ™ inwestycje i RLS.");
    } finally {
        if (btnDodaj) {
            btnDodaj.disabled = false;
            if (edytowanaInwestycjaId) {
                btnDodaj.textContent = "Zapisz zmiany";
            } else {
                btnDodaj.textContent = originalText === "Zapisywanie..." ? "Zapisz inwestycjÄ™" : originalText;
            }
        }
    }
}

window.otworzInwestycje = function(id) {
    aktywnaInwestycjaId = id;
    anulujEdycjeZaliczki();
    anulujEdycjeKosztu();
    renderujPanelInwestycji();

    const panel = document.getElementById("panel-inwestycji");
    if (panel) {
        panel.classList.remove("hidden");
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
};

window.edytujInwestycje = function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator moĹĽe edytowaÄ‡ inwestycje.");
        return;
    }
    otworzFormularzInwestycji({ id, source: "inwestycje" });
};

function anulujEdycjeInwestycji() {
    edytowanaInwestycjaId = null;
    wyczyscFormularzInwestycji();
    ustawTrybFormularzaInwestycji({ editing: false, source: "inwestycje" });
}

function zamknijPanelInwestycji() {
    anulujEdycjeZaliczki();
    anulujEdycjeKosztu();
    aktywnaInwestycjaId = null;

    const panel = document.getElementById("panel-inwestycji");
    if (panel) {
        panel.classList.add("hidden");
    }
}

function ustawStanModalaUsuwaniaInwestycji(isSaving) {
    const modal = document.getElementById("usun-inwestycje-modal");
    if (!modal) return;
    modal.querySelectorAll("button").forEach(btn => {
        btn.disabled = isSaving;
    });
}

function wybierzOpcjeUsuwaniaInwestycji(choice) {
    usunInwestycjeModalWybor = choice;
    document.querySelectorAll("[data-delete-investment-choice]").forEach(btn => {
        btn.classList.toggle("selected", btn.dataset.deleteInvestmentChoice === choice);
    });

    const confirmBtn = document.getElementById("btn-potwierdz-usun-inwestycje");
    if (!confirmBtn) return;
    confirmBtn.disabled = !choice;
    if (!choice) {
        confirmBtn.classList.remove("btn-danger");
        confirmBtn.classList.add("btn-main");
        confirmBtn.textContent = "PotwierdĹş";
        return;
    }
    confirmBtn.classList.toggle("btn-danger", choice === "delete-event");
    confirmBtn.classList.toggle("btn-main", choice !== "delete-event");
    confirmBtn.textContent = choice === "delete-event" ? "UsuĹ„ oba wpisy" : "UsuĹ„ i odĹ‚Ä…cz";
}

function zamknijModalUsuwaniaInwestycji(result) {
    const modal = document.getElementById("usun-inwestycje-modal");
    if (modal) modal.classList.add("hidden");
    ustawStanModalaUsuwaniaInwestycji(false);
    usunInwestycjeModalWybor = null;
    document.querySelectorAll("[data-delete-investment-choice]").forEach(btn => btn.classList.remove("selected"));
    const confirmBtn = document.getElementById("btn-potwierdz-usun-inwestycje");
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.remove("btn-danger");
        confirmBtn.classList.add("btn-main");
        confirmBtn.textContent = "PotwierdĹş";
    }

    if (usunInwestycjeModalResolve) {
        const resolve = usunInwestycjeModalResolve;
        usunInwestycjeModalResolve = null;
        resolve(result);
    }
}

function potwierdzWyborUsuwaniaInwestycji() {
    if (!usunInwestycjeModalWybor) return;
    ustawStanModalaUsuwaniaInwestycji(true);
    zamknijModalUsuwaniaInwestycji(usunInwestycjeModalWybor);
}

function pokazModalUsuwaniaInwestycji() {
    const modal = document.getElementById("usun-inwestycje-modal");
    if (!modal) return Promise.resolve(null);
    modal.classList.remove("hidden");
    wybierzOpcjeUsuwaniaInwestycji(null);
    return new Promise(resolve => {
        usunInwestycjeModalResolve = resolve;
    });
}

function ustawStanModalaZakonczeniaInwestycji(isSaving) {
    const modal = document.getElementById("zakoncz-inwestycje-modal");
    if (!modal) return;
    modal.querySelectorAll("button, input").forEach(el => {
        el.disabled = isSaving;
    });
}

function zamknijModalZakonczeniaInwestycji(result) {
    const modal = document.getElementById("zakoncz-inwestycje-modal");
    if (modal) modal.classList.add("hidden");
    ustawStanModalaZakonczeniaInwestycji(false);
    if (zakonczInwestycjeModalResolve) {
        const resolve = zakonczInwestycjeModalResolve;
        zakonczInwestycjeModalResolve = null;
        resolve(result);
    }
}

function potwierdzModalZakonczeniaInwestycji() {
    const input = document.getElementById("zakoncz-inwestycje-completed-at");
    const completedAt = input?.value || "";
    if (!completedAt) {
        alert("Wybierz rzeczywistÄ… datÄ™ zakoĹ„czenia.");
        return;
    }
    ustawStanModalaZakonczeniaInwestycji(true);
    zamknijModalZakonczeniaInwestycji(completedAt);
}

function pokazModalZakonczeniaInwestycji(inwestycja, termin) {
    const modal = document.getElementById("zakoncz-inwestycje-modal");
    if (!modal) return Promise.resolve(formatDateLocal(new Date()));

    const { dataStart, dataKoniec } = pobierzDatyInwestycji(inwestycja);
    const today = formatDateLocal(new Date());
    const input = document.getElementById("zakoncz-inwestycje-completed-at");
    if (input) input.value = rzeczywistaDataZakonczenia(inwestycja) || today;

    const info = document.getElementById("zakoncz-inwestycje-info");
    if (info) {
        const linkedText = termin
            ? `Terminarz zostanie zaktualizowany: ${esc(termin.id)}`
            : "Brak powiÄ…zania z Terminarzem. Nowy wpis nie zostanie utworzony automatycznie.";
        info.innerHTML = `
            <p><strong>Termin planowany:</strong> ${esc(dataStart || "-")}â€“${esc(dataKoniec || dataStart || "-")}</p>
            <p><strong>Rzeczywiste zakoĹ„czenie:</strong> ${esc(input?.value || today)}</p>
            <p>${linkedText}</p>
        `;
        input?.addEventListener("input", () => {
            const dateLine = info.querySelector("p:nth-child(2)");
            if (dateLine) dateLine.innerHTML = `<strong>Rzeczywiste zakoĹ„czenie:</strong> ${esc(input.value || "-")}`;
        }, { once: true });
    }

    modal.classList.remove("hidden");
    return new Promise(resolve => {
        zakonczInwestycjeModalResolve = resolve;
    });
}

window.usunInwestycje = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator moĹĽe usuwaÄ‡ inwestycje.");
        return;
    }

    const inwestycja = inwestycje.find(i => String(i.id) === String(id));
    if (!inwestycja) {
        alert("Nie znaleziono inwestycji do usuniÄ™cia.");
        return;
    }

    const linkedEventId = pobierzPowiazanyTerminId(inwestycja);
    const linkedTermin = linkedEventId ? terminarz.find(t => String(t.id) === String(linkedEventId)) : null;
    let linkedAction = "none";

    if (linkedEventId) {
        linkedAction = await pokazModalUsuwaniaInwestycji();
        if (!linkedAction) return;
    } else if (!confirm("UsunÄ…Ä‡ inwestycjÄ™ razem z jej zaliczkami i kosztami?")) {
        return;
    }

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje?id=eq.${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());

        if (linkedAction === "delete-event" && linkedEventId) {
            await usunTerminZBazy(linkedEventId);
        } else if (linkedAction === "detach-event" && linkedEventId) {
            await odlaczTerminOdInwestycji(linkedTermin || {
                id: linkedEventId,
                investment_id: id
            }, { skipInvestmentUpdate: true });
        }

        if (linkedEventId) delete panelLinks.events[String(linkedEventId)];
        delete panelLinks.investments[String(id)];
        zapiszLokalnePowiazaniaPanelu();

        await pobierzInwestycje();
        await pobierzTerminarz();
        await pobierzInwestycjeZaliczki();
        await pobierzInwestycjeKoszty();
        renderujInwestycje();
        renderujTerminarz();
        renderujKalendarzTerminarza();
        renderujPulpit();
        zapiszLog("Inwestycje", "UsuniÄ™to inwestycjÄ™", id);

        if (String(aktywnaInwestycjaId) === String(id)) {
            zamknijPanelInwestycji();
        }
    } catch (err) {
        console.error("BĹ‚Ä…d usuwania inwestycji:", err);
        alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ inwestycji.");
    }
}

function renderujPanelInwestycji() {
    const inwestycja = inwestycje.find(i => String(i.id) === String(aktywnaInwestycjaId));
    if (!inwestycja) return;

    const title = document.getElementById("wybrana-inwestycja-title");
    if (title) {
        title.textContent = `${inwestycja.nazwa} â€” ${inwestycja.klient || "bez klienta"}`;
    }

    const meta = document.getElementById("wybrana-inwestycja-meta");
    if (meta) {
        const { dataStart, dataKoniec } = pobierzDatyInwestycji(inwestycja);
        meta.innerHTML = `
            <p><strong>Telefon:</strong> ${esc(inwestycja.telefon || "-")}</p>
            <p><strong>Termin:</strong> ${esc(dataStart || "-")}${dataKoniec ? ` â€“ ${esc(dataKoniec)}` : ""}</p>
            <p><strong>Opis:</strong> ${esc(inwestycja.opis || "-")}</p>
        `;
    }

    const rozliczenie = wyliczRozliczenieInwestycji(aktywnaInwestycjaId);
    renderujRozliczenieInwestycjiWidok(rozliczenie);

    renderujTabeleZaliczek(rozliczenie.zaliczki);
    renderujTabeleKosztow(rozliczenie.koszty);
    renderujPowiazaneKosztorysyInwestycji();
    renderujPraceDodatkoweInwestycji();
    renderujSelectPracDodatkowych();
}

function renderujPraceDodatkoweInwestycji() {
    const tbody = document.getElementById("tabela-prace-dodatkowe");
    if (!tbody) return;
    const section = tbody.closest(".full-row");

    const related = inwestycjePraceDodatkowe.filter(p => String(p.inwestycja_id) === String(aktywnaInwestycjaId));
    const sumBrutto = related.reduce((s, p) => s + Number(p.brutto || p.kwota || 0), 0);
    if (!related.length || sumBrutto <= 0) {
        if (section) section.classList.add("hidden");
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Brak prac dodatkowych.</td></tr>`;
        return;
    }

    if (section) section.classList.remove("hidden");

    tbody.innerHTML = related.map(p => {
        const akcja = rolaUsera === "admin"
            ? `<button class="btn btn-danger small-btn" onclick="usunPraceDodatkowa('${esc(p.id)}')">UsuĹ„</button>`
            : "";

        return `
            <tr>
                <td>${esc(p.nazwa || "")}</td>
                <td>${Number(p.ilosc || 0)}</td>
                <td>${Number(p.cena_netto || 0).toFixed(2)} PLN</td>
                <td>${Number(p.vat || 0)}% / ${Number((p.vat_amount ?? (Number(p.brutto || 0) - Number(p.netto || 0))) || 0).toFixed(2)} PLN</td>
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

    const related = kosztorysy.filter(k => kosztorysPasujeDoInwestycji(k, aktywnaInwestycjaId));
    const actionsHtml = `
        <div class="investment-estimates-actions">
            <button class="btn btn-main small-btn" onclick="utworzKosztorysDlaInwestycji('${esc(aktywnaInwestycjaId)}')">Nowy kosztorys</button>
            <button class="btn btn-secondary small-btn" onclick="polaczIstniejacyKosztorysZInwestycja('${esc(aktywnaInwestycjaId)}')">PoĹ‚Ä…cz istniejÄ…cy</button>
        </div>
    `;

    if (!related.length) {
        container.innerHTML = `
            <div class="investment-estimates-header">
                <h2>Kosztorysy</h2>
                ${actionsHtml}
            </div>
            <p class="investment-estimate-empty">Brak powiÄ…zanych kosztorysĂłw dla tej inwestycji.</p>
        `;
        return;
    }

    const itemsHtml = related.map(k => {
        const statusLabel = statusKosztorysuBadge(k.status);
        const openButton = `<button class="btn btn-secondary small-btn" onclick="otworzKosztorysNaLiscie('${esc(k.id)}')">OtwĂłrz</button>`;
        const editButton = rolaUsera !== "guest"
            ? `<button class="btn btn-secondary small-btn" onclick="wczytajKosztorys('${esc(k.id)}')">Edytuj</button>`
            : "";
        const printButton = `<button class="btn btn-secondary small-btn" onclick="drukujKosztorys('${esc(k.id)}')">Drukuj</button>`;
        const detachButton = rolaUsera !== "guest"
            ? `<button class="btn btn-danger small-btn" onclick="odlaczKosztorysOdInwestycji('${esc(k.id)}')">OdĹ‚Ä…cz</button>`
            : "";

        return `
            <div class="investment-estimate-card">
                <div>
                    <h3 class="investment-estimate-title">${esc(k.nazwa || "Kosztorys robocizny")}</h3>
                    <div class="investment-estimate-meta">
                        <span>Data: ${esc(k.data || "-")}</span>
                        <span>Netto: <span class="investment-estimate-money">${Number(k.netto || 0).toFixed(2)} PLN</span></span>
                        <span>Brutto: <span class="investment-estimate-money">${Number(k.brutto || 0).toFixed(2)} PLN</span></span>
                    </div>
                </div>
                <div class="investment-estimate-status">${statusLabel}</div>
                <div class="investment-estimate-actions">${openButton}${editButton}${printButton}${detachButton}</div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="investment-estimates-header">
            <h2>Kosztorysy</h2>
            ${actionsHtml}
        </div>
        <div class="investment-estimates-list">${itemsHtml}</div>
    `;
}

window.utworzKosztorysDlaInwestycji = function(inwestycjaId = aktywnaInwestycjaId) {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe tworzyÄ‡ kosztorysĂłw.");
        return;
    }

    const inwestycja = inwestycje.find(i => String(i.id) === String(inwestycjaId));
    if (!inwestycja) {
        alert("Nie znaleziono inwestycji.");
        return;
    }

    pokazSekcje("wycena");
    edytowanyKosztorysId = null;
    trybEdycjiKosztorysu = false;
    wycenaPozycje = [];
    document.getElementById("kosztorys-nazwa").value = inwestycja.nazwa || "";
    document.getElementById("wycena-korekta").value = 0;
    ustawPowiazanaInwestycjeKosztorysu(inwestycja.id);
    aktualizujTrybEdycjiKosztorysuWidok();
    renderujWycene();
    document.getElementById("card-wycena-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.polaczIstniejacyKosztorysZInwestycja = async function(inwestycjaId = aktywnaInwestycjaId) {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe Ĺ‚Ä…czyÄ‡ kosztorysĂłw z inwestycjÄ….");
        return;
    }

    const inwestycja = inwestycje.find(i => String(i.id) === String(inwestycjaId));
    if (!inwestycja) {
        alert("Nie znaleziono inwestycji.");
        return;
    }

    const lista = (kosztorysy || []).filter(k => !kosztorysPasujeDoInwestycji(k, inwestycjaId));
    if (!lista.length) {
        alert("Brak kosztorysĂłw do poĹ‚Ä…czenia.");
        return;
    }

    const lines = lista.map((k, idx) => {
        const linked = znajdzInwestycjeKosztorysu(k);
        const suffix = linked ? ` (obecnie: ${linked.nazwa || "inna inwestycja"})` : "";
        return `${idx + 1} - ${k.nazwa || "Kosztorys"} - ${k.data || "-"}${suffix}`;
    });
    const wybor = prompt(`Wybierz numer kosztorysu do poĹ‚Ä…czenia z inwestycjÄ…:\n${lines.join("\n")}`, "1");
    if (!wybor) return;

    const num = Number(wybor.trim());
    if (!Number.isInteger(num) || num < 1 || num > lista.length) {
        alert("NieprawidĹ‚owy wybĂłr kosztorysu.");
        return;
    }

    const kosztorys = lista[num - 1];
    const currentInvestment = znajdzInwestycjeKosztorysu(kosztorys);
    if (currentInvestment && !confirm(`Ten kosztorys jest juĹĽ poĹ‚Ä…czony z inwestycjÄ… "${currentInvestment.nazwa || "-"}". ZmieniÄ‡ powiÄ…zanie?`)) {
        return;
    }

    try {
        await zapiszPowiazanieKosztorysuZInwestycja(kosztorys.id, inwestycjaId);
        alert("Kosztorys poĹ‚Ä…czony z inwestycjÄ….");
        zapiszLog("Kosztorysy", "PoĹ‚Ä…czono kosztorys z inwestycjÄ…", kosztorys.id);
    } catch (err) {
        console.error("BĹ‚Ä…d poĹ‚Ä…czenia kosztorysu z inwestycjÄ…:", err);
        alert("Nie udaĹ‚o siÄ™ poĹ‚Ä…czyÄ‡ kosztorysu z inwestycjÄ…. SzczegĂłĹ‚y sÄ… w konsoli.");
    }
};

window.odlaczKosztorysOdInwestycji = async function(kosztorysId) {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe odĹ‚Ä…czaÄ‡ kosztorysĂłw.");
        return;
    }

    if (!confirm("OdĹ‚Ä…czyÄ‡ kosztorys od inwestycji?")) return;

    try {
        await zapiszPowiazanieKosztorysuZInwestycja(kosztorysId, null);
        alert("Kosztorys odĹ‚Ä…czony od inwestycji.");
        zapiszLog("Kosztorysy", "OdĹ‚Ä…czono kosztorys od inwestycji", kosztorysId);
    } catch (err) {
        console.error("BĹ‚Ä…d odĹ‚Ä…czenia kosztorysu od inwestycji:", err);
        alert("Nie udaĹ‚o siÄ™ odĹ‚Ä…czyÄ‡ kosztorysu. SzczegĂłĹ‚y sÄ… w konsoli.");
    }
};

window.otworzKosztorysNaLiscie = function(kosztorysId) {
    pokazSekcje("kosztorysy");
    const search = document.getElementById("szukaj-kosztorys");
    if (search) search.value = "";
    renderujKosztorysy();
    const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(kosztorysId)) : String(kosztorysId).replace(/"/g, '\\"');
    const row = document.querySelector(`[data-kosztorys-id="${safeId}"]`);
    if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("calendar-row-highlight");
        setTimeout(() => row.classList.remove("calendar-row-highlight"), 2500);
    }
};

function pobierzKwoteFormularza(inputId, komunikat) {
    const raw = String(document.getElementById(inputId)?.value || "").replace(",", ".").trim();
    const kwota = Number(raw);
    if (!Number.isFinite(kwota) || kwota <= 0) {
        alert(komunikat);
        return null;
    }
    return kwota;
}

function ustawPrzyciskZapisu(button, isSaving) {
    if (!button) return;
    button.disabled = isSaving;
}

function anulujEdycjeZaliczki() {
    edytowanaZaliczkaId = null;
    const today = formatDateLocal(new Date());
    const title = document.getElementById("zaliczka-form-title");
    const btn = document.getElementById("btn-dodaj-zaliczke");
    const cancel = document.getElementById("btn-anuluj-zaliczke");
    if (title) title.textContent = "Dodaj zaliczkÄ™";
    if (btn) {
        btn.textContent = "Dodaj zaliczkÄ™";
        btn.disabled = false;
    }
    if (cancel) cancel.classList.add("hidden");
    const data = document.getElementById("zaliczka-data");
    const kwota = document.getElementById("zaliczka-kwota");
    const purpose = document.getElementById("zaliczka-purpose");
    const platnosc = document.getElementById("zaliczka-platnosc");
    const opis = document.getElementById("zaliczka-opis");
    if (data) data.value = today;
    if (kwota) kwota.value = "";
    if (purpose) purpose.value = "";
    if (platnosc) platnosc.selectedIndex = 0;
    if (opis) opis.value = "";
}

function anulujEdycjeKosztu() {
    edytowanyKosztId = null;
    const today = formatDateLocal(new Date());
    const title = document.getElementById("koszt-form-title");
    const btn = document.getElementById("btn-dodaj-koszt");
    const cancel = document.getElementById("btn-anuluj-koszt");
    if (title) title.textContent = "Dodaj koszt";
    if (btn) {
        btn.textContent = "Dodaj koszt";
        btn.disabled = false;
    }
    if (cancel) cancel.classList.add("hidden");
    const data = document.getElementById("koszt-data");
    const kwota = document.getElementById("koszt-kwota");
    const netto = document.getElementById("koszt-netto");
    const vatRate = document.getElementById("koszt-vat-rate");
    const brutto = document.getElementById("koszt-brutto");
    const kategoria = document.getElementById("koszt-kategoria");
    const opis = document.getElementById("koszt-opis");
    if (data) data.value = today;
    if (kwota) kwota.value = "";
    if (netto) netto.value = "";
    if (vatRate) vatRate.value = "23";
    if (brutto) brutto.value = "";
    if (kategoria) kategoria.selectedIndex = 0;
    if (opis) opis.value = "";
}

window.edytujZaliczke = function(id) {
    const zaliczka = inwestycjeZaliczki.find(z =>
        String(z.id) === String(id) && String(z.inwestycja_id) === String(aktywnaInwestycjaId)
    );
    if (!zaliczka) {
        alert("Nie znaleziono zaliczki do edycji.");
        return;
    }

    edytowanaZaliczkaId = String(id);
    const title = document.getElementById("zaliczka-form-title");
    const btn = document.getElementById("btn-dodaj-zaliczke");
    const cancel = document.getElementById("btn-anuluj-zaliczke");
    if (title) title.textContent = "Edytuj zaliczkÄ™";
    if (btn) btn.textContent = "Zapisz zmiany";
    if (cancel) cancel.classList.remove("hidden");
    document.getElementById("zaliczka-data").value = zaliczka.data || "";
    document.getElementById("zaliczka-kwota").value = Number(zaliczka.kwota || 0);
    document.getElementById("zaliczka-purpose").value = pobierzPrzeznaczenieZaliczki(zaliczka) || "";
    document.getElementById("zaliczka-platnosc").value = zaliczka.sposob_platnosci || "gotĂłwka";
    document.getElementById("zaliczka-opis").value = zaliczka.opis || "";
    document.getElementById("card-zaliczka-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

window.edytujKoszt = function(id) {
    const koszt = inwestycjeKoszty.find(k =>
        String(k.id) === String(id) && String(k.inwestycja_id) === String(aktywnaInwestycjaId)
    );
    if (!koszt) {
        alert("Nie znaleziono kosztu do edycji.");
        return;
    }

    edytowanyKosztId = String(id);
    const title = document.getElementById("koszt-form-title");
    const btn = document.getElementById("btn-dodaj-koszt");
    const cancel = document.getElementById("btn-anuluj-koszt");
    if (title) title.textContent = "Edytuj koszt";
    if (btn) btn.textContent = "Zapisz zmiany";
    if (cancel) cancel.classList.remove("hidden");
    const kwoty = wyliczKosztMaterialowy(koszt);
    document.getElementById("koszt-data").value = koszt.data || "";
    document.getElementById("koszt-kwota").value = Number(kwoty.brutto || 0);
    document.getElementById("koszt-netto").value = kwoty.netto === null ? "" : Number(kwoty.netto || 0).toFixed(2);
    document.getElementById("koszt-vat-rate").value = kwoty.vatRate === null ? "zw" : String(kwoty.vatRate);
    document.getElementById("koszt-brutto").value = Number(kwoty.brutto || 0).toFixed(2);
    document.getElementById("koszt-kategoria").value = koszt.kategoria || "materiaĹ‚y";
    document.getElementById("koszt-opis").value = koszt.opis || "";
    document.getElementById("card-koszt-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

function renderujTabeleZaliczek(lista) {
    const tbody = document.getElementById("tabela-zaliczek");
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Brak zaliczek.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(z => {
        const akcja = rolaUsera === "admin"
            ? `<div class="table-actions"><button class="btn btn-secondary small-btn" onclick="edytujZaliczke('${esc(z.id)}')">Edytuj</button><button class="btn btn-danger small-btn" onclick="usunZaliczke('${esc(z.id)}')">UsuĹ„</button></div>`
            : "";

        return `
            <tr>
                <td>${esc(z.data)}</td>
                <td><strong>${Number(z.kwota || 0).toFixed(2)} PLN</strong></td>
                <td>${esc(z.sposob_platnosci || "-")}</td>
                <td>${esc(etykietaPrzeznaczeniaZaliczki(pobierzPrzeznaczenieZaliczki(z)))}</td>
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
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Brak kosztĂłw.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(k => {
        const akcja = rolaUsera === "admin"
            ? `<div class="table-actions"><button class="btn btn-secondary small-btn" onclick="edytujKoszt('${esc(k.id)}')">Edytuj</button><button class="btn btn-danger small-btn" onclick="usunKoszt('${esc(k.id)}')">UsuĹ„</button></div>`
            : "";

        const kwoty = k._kwoty || wyliczKosztMaterialowy(k);
        const nettoText = kwoty.netto === null ? "Nieustalone" : `${Number(kwoty.netto || 0).toFixed(2)} PLN`;
        const vatText = kwoty.vatAmount === null ? "Nieustalony" : `${kwoty.vatLabel} / ${Number(kwoty.vatAmount || 0).toFixed(2)} PLN`;

        return `
            <tr>
                <td>${esc(k.data)}</td>
                <td>${esc(nettoText)}</td>
                <td>${esc(vatText)}</td>
                <td><strong>${Number(kwoty.brutto || 0).toFixed(2)} PLN</strong></td>
                <td>${esc(k.kategoria || "-")}</td>
                <td>${esc(k.opis || "")}</td>
                <td>${akcja}</td>
            </tr>
        `;
    }).join("");
}

function przeliczFormularzKosztu(source = "netto") {
    const nettoInput = document.getElementById("koszt-netto");
    const bruttoInput = document.getElementById("koszt-brutto");
    const vatSelect = document.getElementById("koszt-vat-rate");
    const kwotaInput = document.getElementById("koszt-kwota");
    if (!nettoInput || !bruttoInput || !vatSelect) return;

    const vatRate = pobierzVatKosztu(vatSelect.value);
    const multiplier = vatRate === null ? 1 : 1 + vatRate / 100;

    if (source === "brutto") {
        const brutto = parseKwota(bruttoInput.value);
        if (Number.isFinite(brutto)) {
            nettoInput.value = (brutto / multiplier).toFixed(2);
            if (kwotaInput) kwotaInput.value = brutto.toFixed(2);
        }
        return;
    }

    const netto = parseKwota(nettoInput.value);
    if (Number.isFinite(netto)) {
        const brutto = netto * multiplier;
        bruttoInput.value = brutto.toFixed(2);
        if (kwotaInput) kwotaInput.value = brutto.toFixed(2);
    }
}

async function dodajZaliczke() {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe dodawaÄ‡ zaliczek.");
        return;
    }

    if (!aktywnaInwestycjaId) {
        alert("Najpierw otwĂłrz inwestycjÄ™.");
        return;
    }

    const data = document.getElementById("zaliczka-data").value;
    const kwota = pobierzKwoteFormularza("zaliczka-kwota", "Wpisz poprawnÄ… kwotÄ™ zaliczki.");
    const purpose = document.getElementById("zaliczka-purpose")?.value || "";
    const sposob_platnosci = document.getElementById("zaliczka-platnosc").value;
    const opis = document.getElementById("zaliczka-opis").value.trim();

    if (!data) {
        alert("Wybierz datÄ™ zaliczki.");
        return;
    }

    if (kwota === null) return;
    if (!purpose) {
        alert("Wybierz przeznaczenie zaliczki.");
        return;
    }

    const payload = {
        data,
        kwota,
        purpose,
        sposob_platnosci,
        opis
    };

    const btn = document.getElementById("btn-dodaj-zaliczke");
    ustawPrzyciskZapisu(btn, true);

    try {
        const editingId = edytowanaZaliczkaId;
        const url = editingId
            ? `${SUPABASE_URL}/rest/v1/inwestycje_zaliczki?id=eq.${encodeURIComponent(editingId)}&inwestycja_id=eq.${encodeURIComponent(aktywnaInwestycjaId)}`
            : `${SUPABASE_URL}/rest/v1/inwestycje_zaliczki`;
        const body = editingId
            ? payload
            : { ...payload, inwestycja_id: aktywnaInwestycjaId, user_id: zalogowanyUser?.id };

        const res = await fetch(url, {
            method: editingId ? "PATCH" : "POST",
            headers: headers(),
            body: JSON.stringify(body)
        });

        const responseText = await res.text();
        if (!res.ok) throw new Error(responseText);
        if (editingId) {
            const updated = responseText ? JSON.parse(responseText) : [];
            if (Array.isArray(updated) && !updated.length) {
                throw new Error("Nie znaleziono zaliczki do aktualizacji.");
            }
        }

        anulujEdycjeZaliczki();

        await pobierzInwestycjeZaliczki();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", editingId ? "Zmieniono zaliczkÄ™" : "Dodano zaliczkÄ™", opis);
    } catch (err) {
        console.error("BĹ‚Ä…d zapisu zaliczki:", err);
        alert(edytowanaZaliczkaId ? "Nie udaĹ‚o siÄ™ zapisaÄ‡ zmian." : "Nie udaĹ‚o siÄ™ zapisaÄ‡ zaliczki.");
        ustawPrzyciskZapisu(btn, false);
    }
}

async function dodajKoszt() {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe dodawaÄ‡ kosztĂłw.");
        return;
    }

    if (!aktywnaInwestycjaId) {
        alert("Najpierw otwĂłrz inwestycjÄ™.");
        return;
    }

    const data = document.getElementById("koszt-data").value;
    przeliczFormularzKosztu(document.getElementById("koszt-brutto")?.value ? "brutto" : "netto");
    const netto = parseKwota(document.getElementById("koszt-netto")?.value);
    const brutto = parseKwota(document.getElementById("koszt-brutto")?.value);
    const vat_rate = document.getElementById("koszt-vat-rate")?.value || "zw";
    const vatRateNumber = pobierzVatKosztu(vat_rate);
    const kategoria = document.getElementById("koszt-kategoria").value;
    const opis = document.getElementById("koszt-opis").value.trim();

    if (!data) {
        alert("Wybierz datÄ™ kosztu.");
        return;
    }

    if (!Number.isFinite(netto) || netto < 0 || !Number.isFinite(brutto) || brutto < 0) {
        alert("Wpisz poprawnÄ… kwotÄ™ netto albo brutto kosztu.");
        return;
    }

    const vat_amount = Math.max(0, brutto - netto);
    const kwota = brutto;

    const payload = {
        data,
        kwota,
        netto,
        vat_rate,
        vat_amount,
        brutto,
        kategoria,
        opis
    };

    const btn = document.getElementById("btn-dodaj-koszt");
    ustawPrzyciskZapisu(btn, true);

    try {
        const editingId = edytowanyKosztId;
        const url = editingId
            ? `${SUPABASE_URL}/rest/v1/inwestycje_koszty?id=eq.${encodeURIComponent(editingId)}&inwestycja_id=eq.${encodeURIComponent(aktywnaInwestycjaId)}`
            : `${SUPABASE_URL}/rest/v1/inwestycje_koszty`;
        const body = editingId
            ? payload
            : { ...payload, inwestycja_id: aktywnaInwestycjaId, user_id: zalogowanyUser?.id };

        const res = await fetch(url, {
            method: editingId ? "PATCH" : "POST",
            headers: headers(),
            body: JSON.stringify(body)
        });

        const responseText = await res.text();
        if (!res.ok) throw new Error(responseText);
        if (editingId) {
            const updated = responseText ? JSON.parse(responseText) : [];
            if (Array.isArray(updated) && !updated.length) {
                throw new Error("Nie znaleziono kosztu do aktualizacji.");
            }
        }

        anulujEdycjeKosztu();

        await pobierzInwestycjeKoszty();
        renderujInwestycje();
        renderujPanelInwestycji();
        zapiszLog("Inwestycje", editingId ? "Zmieniono koszt" : "Dodano koszt", opis);
    } catch (err) {
        console.error("BĹ‚Ä…d zapisu kosztu:", err);
        alert(edytowanyKosztId ? "Nie udaĹ‚o siÄ™ zapisaÄ‡ zmian." : "Nie udaĹ‚o siÄ™ zapisaÄ‡ kosztu.");
        ustawPrzyciskZapisu(btn, false);
    }
}

window.usunZaliczke = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator moĹĽe usuwaÄ‡ zaliczki.");
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
        zapiszLog("Inwestycje", "UsuniÄ™to zaliczkÄ™", id);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ zaliczki.");
    }
};

window.usunKoszt = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator moĹĽe usuwaÄ‡ koszty.");
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
        zapiszLog("Inwestycje", "UsuniÄ™to koszt", id);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ koszt.");
    }
};

async function dodajPraceDodatkowa() {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe dodawaÄ‡ prac dodatkowych.");
        return;
    }

    if (!aktywnaInwestycjaId) {
        alert("Najpierw otwĂłrz inwestycjÄ™.");
        return;
    }

    const nazwa = document.getElementById("praca-nazwa").value.trim();
    const opis = document.getElementById("praca-opis").value.trim();
    const ilosc = Number(document.getElementById("praca-ilosc").value);
    const cena_netto = Number(document.getElementById("praca-cena-netto").value);
    const vat = Number(document.getElementById("praca-vat").value);

    if (!nazwa) {
        alert("Podaj nazwÄ™ pracy.");
        return;
    }
    if (isNaN(ilosc) || ilosc <= 0) {
        alert("Podaj poprawnÄ… iloĹ›Ä‡.");
        return;
    }
    if (isNaN(cena_netto) || cena_netto < 0) {
        alert("Podaj poprawnÄ… cenÄ™ netto.");
        return;
    }

    const netto = ilosc * cena_netto;
    const vat_amount = netto * ((vat || 0) / 100);
    const brutto = netto + vat_amount;

    const payload = {
        inwestycja_id: aktywnaInwestycjaId,
        nazwa,
        opis,
        ilosc,
        cena_netto,
        vat,
        vat_amount,
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
        zapiszLog("Inwestycje", "Dodano pracÄ™ dodatkowÄ…", nazwa);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ zapisaÄ‡ pracy dodatkowej.");
    }
}

window.usunPraceDodatkowa = async function(id) {
    if (rolaUsera !== "admin") {
        alert("Tylko administrator moĹĽe usuwaÄ‡ prace dodatkowe.");
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
        zapiszLog("Inwestycje", "UsuniÄ™to pracÄ™ dodatkowÄ…", id);
    } catch (err) {
        console.error(err);
        alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ pracy dodatkowej.");
    }
};

function renderujSelectPracDodatkowych() {
    const select = document.getElementById("praca-usluga");
    if (!select) return;

    if (!uslugi.length) {
        select.innerHTML = `<option value="">â€” Brak usĹ‚ug w bazie â€”</option>`;
        return;
    }

    select.innerHTML = `<option value="">â€” Brak wyboru (wpisz rÄ™cznie) â€”</option>
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
    // Keep ILoĹ›Ä‡ at 1 (default), opis empty unless user fills, VAT at 23%
}

// ==========================================
// SZYBKA WYCENA V8 â€” REGUĹY REMONTOWE
// ==========================================

function dodajRemontowaPropozycje(lista, config) {
    dodajPropozycje(lista, config);
}

function generujSzybkaWycene() {
    if (rolaUsera === "guest") {
        alert("GoĹ›Ä‡ nie moĹĽe generowaÄ‡ wyceny.");
        return;
    }

    const pole = document.getElementById("szybka-wycena-opis");
    const opisOryginalny = pole?.value?.trim() || "";
    const opis = normalizeText(opisOryginalny);

    if (!opis) {
        alert("Opisz zlecenie, np. mieszkanie 30 mÂ˛, malowanie, gĹ‚adĹş, 10 punktĂłw elektrycznych.");
        return;
    }

    const metraz = pobierzLiczbeZOpisu(opis, [
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw|metry|metra|m powierzchni)\b/,
        /mieszkanie\s*(\d+(?:[.,]\d+)?)/,
        /lokal\s*(\d+(?:[.,]\d+)?)/,
        /dom\s*(\d+(?:[.,]\d+)?)/
    ]);

    const pokoje = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:pokoi|pokoje|pokojach|pokĂłj|pokoj|pomieszczenia|pomieszczeĹ„)\b/
    ]);

    const okna = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:okien|okna|okno)\b/]) || pokoje || 1;
    const drzwi = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:drzwi|oscieznic|oĹ›cieĹĽnic)\b/]) || pokoje || 1;

    const punktyElektryczne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt|punkt)\s*(?:elektrycznych|elektryczne|elektryki|instalacji elektrycznej)?\b/,
        /(?:instalacj[ai] elektryczn[aej]?|elektryka)[^\d]{0,35}(\d+)\s*(?:szt|punkt|punktow|punktĂłw|pkt)?/
    ]);

    const gniazda = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:gniazd|gniazdek|gniazda|gniazdo)\b/,
        /(?:gniazd|gniazdek|gniazda|gniazdo)[^\d]{0,20}(\d+)/
    ]);

    const laczniki = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:lacznikow|Ĺ‚Ä…cznikĂłw|wlacznikow|wĹ‚Ä…cznikĂłw|laczniki|Ĺ‚Ä…czniki|wlaczniki|wĹ‚Ä…czniki)\b/,
        /(\d+)\s*(?:rocznikow|rocznikĂłw|roczniki)\b/
    ]);

    const punktySanitarne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt|punkt)\s*(?:sanitarnych|sanitarne|wod-kan|wodkan|wodno|wody|kanalizacji|hydraulicznych)\b/,
        /(?:instalacj[ai] sanitarn[aej]?|wod-kan|wodkan|kanalizacj[ai]|hydraulik[ai]|wodno kanalizacyjn[aej]?)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktĂłw|pkt)?/
    ]);

    const punktyCO = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt|punkt)\s*(?:co|c\.o\.|grzejnikowych|grzejnikowe|centralnego ogrzewania)\b/,
        /(?:instalacj[ai] co|instalacj[ai] c\.o\.|centralne ogrzewanie|grzejnik|grzejnika|grzejniki)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktĂłw|pkt)?/
    ]);

    const grzejniki = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:grzejnikow|grzejnikĂłw|grzejniki|grzejnik)\b/]);

    const sciankaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛)\s*(?:scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips)/
    ]);

    const podlogaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:wykladzina|wykĹ‚adzina|podloge|podĹ‚oge|podĹ‚ogÄ™|podloga|podĹ‚oga|panele)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛)\s*(?:wykladzina|wykĹ‚adzina|podloga|podĹ‚oga|panele)/
    ]);

    const odZera = /od zera|nowa instalacja|nowe punkty|wykonanie|wykonac|wykonaÄ‡|kompletna instalacja|stan deweloperski|deweloperski|generalny/.test(opis);
    const remont = /remont|stare|stary|modernizacja|przerobka|przerĂłbka|przerobienie|przerobiÄ‡|przerobic/.test(opis);
    const wymiana = /wymiana|wymienic|wymieniÄ‡|do wymiany/.test(opis);
    const przerobka = /przerobka|przerĂłbka|przerobienie|przerobiÄ‡|przerobic|przeniesienie|przeniesc|przenieĹ›Ä‡/.test(opis);

    const zakresMalowanie = /malowania|malowanie|pomalowac|pomalowaÄ‡|farba|bialy|biaĹ‚y|kolor|sciany|Ĺ›ciany|sufit/.test(opis);
    const zakresGladz = /gladz|gĹ‚adĹş|gladzie|gĹ‚adzie|szpachlowanie|szlifowanie/.test(opis);
    const zakresZabezpieczen = /zabezpiec|folia|folie|taĹ›my|tasmy|oklejanie|okleic|okleiÄ‡|parapet|detal|meble/.test(opis);
    const zakresSanitarny = /sanitarn|wod-kan|wodkan|wodno|kanalizac|hydraul|woda|odpĹ‚yw|odplyw|podejscie|podejĹ›cie|umywalk|zlew|wc|toalet|prysznic|wanna/.test(opis);
    const zakresCO = /c\.o\.|co |centralne ogrzewanie|grzejnik|grzejniki|podlogowka|podĹ‚ogĂłwka|ogrzewanie/.test(opis);

    const propozycje = [];
    const dodaj = (config) => dodajRemontowaPropozycje(propozycje, config);

    let powierzchniaMalowania = null;
    let uwagaMalowania = "";

    if (metraz && zakresMalowanie) {
        const sufit = Math.round(metraz);
        const sciany = Math.round(metraz * 3);
        powierzchniaMalowania = sufit + sciany;
        uwagaMalowania = `Szacunek: sufit ${sufit} mÂ˛ + Ĺ›ciany ok. ${sciany} mÂ˛`;
    }

    const powierzchniaRobocza = powierzchniaMalowania || (metraz ? Math.round(metraz * 4) : 120);

    if (zakresZabezpieczen || zakresMalowanie || zakresGladz) {
        if (metraz) {
            dodaj({ nazwa: "Zabezpieczenie podĹ‚Ăłg foliÄ…", szukaj: ["zabezpieczenie podĹ‚Ăłg", "folia", "zabezpieczenie"], jednostka: "mÂ˛", ilosc: metraz, cena: 6, uwaga: "Doliczono automatycznie: prace wykoĹ„czeniowe wymagajÄ… zabezpieczenia podĹ‚Ăłg" });
        }
        dodaj({ nazwa: "Oklejanie taĹ›mÄ… malarskÄ… detali", szukaj: ["taĹ›ma", "tasma", "oklejanie", "zabezpieczenie"], jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 80, uwaga: "Doliczono automatycznie: zabezpieczenie detali, naroĹĽnikĂłw, oĹ›cieĹĽnic i krawÄ™dzi" });
        dodaj({ nazwa: "Zabezpieczenie okien i parapetĂłw", szukaj: ["zabezpieczenie okien", "parapet", "okno"], jednostka: "kpl.", ilosc: okna, cena: 45, uwaga: "Szacunek: przyjÄ™to orientacyjnie 1 okno/parapet na pomieszczenie" });
    }

    if (zakresGladz) {
        dodaj({ nazwa: "Przygotowanie powierzchni pod gĹ‚adĹş", szukaj: ["przygotowanie powierzchni", "przygotowanie pod gĹ‚adĹş", "gladz"], jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 8, uwaga: "Doliczono automatycznie: gĹ‚adĹş wymaga przygotowania podĹ‚oĹĽa" });
        dodaj({ nazwa: "Gruntowanie pod gĹ‚adĹş", szukaj: ["gruntowanie", "grunt"], jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: gĹ‚adĹş wymaga gruntowania" });
        dodaj({ nazwa: "MontaĹĽ naroĹĽnikĂłw aluminiowych", szukaj: ["naroĹĽnik", "naroznik", "aluminiowy"], jednostka: "mb", ilosc: Math.max(4, Math.round(okna * 4 + drzwi * 2)), cena: 18, uwaga: "Szacunek: naroĹĽniki przy oknach/drzwiach i detalach" });
        dodaj({ nazwa: "Wykonanie gĹ‚adzi", szukaj: ["gĹ‚adĹş", "gladz", "gladzie", "gĹ‚adzie"], jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 32, uwaga: "Zakres z opisu: gĹ‚adĹş" });
        dodaj({ nazwa: "Szlifowanie gĹ‚adzi", szukaj: ["szlifowanie", "gladz", "gĹ‚adĹş"], jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 10, uwaga: "Doliczono automatycznie: po gĹ‚adzi potrzebne jest szlifowanie" });
        dodaj({ nazwa: "Gruntowanie po gĹ‚adzi pod malowanie", szukaj: ["gruntowanie", "grunt"], jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: przygotowanie pod malowanie" });
    }

    if (zakresMalowanie) {
        dodaj({ nazwa: "Malowanie Ĺ›cian i sufitu", szukaj: ["malowanie", "malowania", "farba"], jednostka: "mÂ˛", ilosc: powierzchniaMalowania || 100, cena: 28, uwaga: uwagaMalowania || "Szacunek powierzchni malowania" });
    }

    if (punktyElektryczne) {
        dodaj({ nazwa: "Wykonanie punktu elektrycznego", szukaj: ["punkt elektryczny", "montaĹĽ punktu", "montaz punktu", "punkt"], unikaj: ["przemysĹ‚", "przemyslow", "siĹ‚owe", "silowe"], jednostka: "pkt", ilosc: punktyElektryczne, cena: 120, uwaga: "IloĹ›Ä‡ punktĂłw z opisu" });
        if (odZera || przerobka) {
            dodaj({ nazwa: "Kucie / bruzdowanie pod punkt elektryczny", szukaj: ["bruzdowanie", "kucie", "bruzda"], jednostka: "szt.", ilosc: punktyElektryczne, cena: 45, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt wymaga przygotowania trasy" });
            dodaj({ nazwa: "Naprawa bruzd po elektryce", szukaj: ["naprawa bruzd", "bruzdy", "zaprawienie"], jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: po wykonaniu punktu trzeba naprawiÄ‡ bruzdÄ™" });
        }
        dodaj({ nazwa: "MontaĹĽ osprzÄ™tu elektrycznego", szukaj: ["osprzÄ™t", "osprzet", "gniazdo", "Ĺ‚Ä…cznik", "wlacznik"], unikaj: ["przemysĹ‚", "przemyslow", "siĹ‚owe", "silowe"], jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: punkt wymaga montaĹĽu/podĹ‚Ä…czenia osprzÄ™tu" });
    }

    if (gniazda) {
        if (wymiana) dodaj({ nazwa: "DemontaĹĽ starego gniazda", szukaj: ["demontaĹĽ", "demontaz", "gniazdo"], jednostka: "szt.", ilosc: gniazda, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaĹĽ starego osprzÄ™tu" });
        dodaj({ nazwa: "Wymiana / montaĹĽ gniazda elektrycznego", szukaj: ["wymiana gniazda", "gniazdo elektryczne", "montaĹĽ gniazda", "montaz gniazda", "gniazdo"], unikaj: ["przemysĹ‚", "przemyslow", "siĹ‚owe", "silowe", "230v przemyslowe", "400v"], jednostka: "szt.", ilosc: gniazda, cena: 90, uwaga: "IloĹ›Ä‡ gniazd z opisu" });
    }

    if (laczniki) {
        if (wymiana) dodaj({ nazwa: "DemontaĹĽ starego Ĺ‚Ä…cznika / wĹ‚Ä…cznika", szukaj: ["demontaĹĽ", "demontaz", "Ĺ‚Ä…cznik", "wlacznik"], jednostka: "szt.", ilosc: laczniki, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaĹĽ starego osprzÄ™tu" });
        dodaj({ nazwa: "Wymiana / montaĹĽ Ĺ‚Ä…cznika Ĺ›wiatĹ‚a", szukaj: ["Ĺ‚Ä…cznik", "lacznik", "wĹ‚Ä…cznik", "wlacznik", "osprzÄ™t", "osprzet"], unikaj: ["przemysĹ‚", "przemyslow", "siĹ‚owe", "silowe"], jednostka: "szt.", ilosc: laczniki, cena: 80, uwaga: opis.includes("rocznik") ? "Rozpoznano z dyktowania jako â€žrocznikiâ€ť â€” potraktowano jako Ĺ‚Ä…czniki" : "IloĹ›Ä‡ Ĺ‚Ä…cznikĂłw z opisu" });
    }

    if (zakresSanitarny || punktySanitarne) {
        const ilosc = punktySanitarne || 1;
        if (przerobka || wymiana || remont) dodaj({ nazwa: "DemontaĹĽ / odkrycie starego punktu wod-kan", szukaj: ["demontaĹĽ", "demontaz", "wod-kan", "hydraulika"], jednostka: "szt.", ilosc, cena: 90, uwaga: "Doliczono automatycznie: przerĂłbka/wymiana punktu sanitarnego wymaga demontaĹĽu lub odkrycia starego ukĹ‚adu" });
        if (odZera || przerobka || /wykonanie|wykonac|wykonaÄ‡|nowy/.test(opis)) dodaj({ nazwa: "Kucie / przygotowanie trasy pod wod-kan", szukaj: ["kucie", "bruzdowanie", "wod-kan", "hydraulika"], jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy punkt sanitarny wymaga przygotowania trasy" });
        dodaj({ nazwa: przerobka ? "PrzerĂłbka punktu wod-kan" : "Wykonanie punktu wod-kan", szukaj: ["wod-kan", "hydraulika", "punkt sanitarny", "kanalizacja", "woda"], jednostka: "szt.", ilosc, cena: przerobka ? 420 : 360, uwaga: przerobka ? "Zakres z opisu: przerĂłbka punktu sanitarnego" : "Zakres z opisu: wykonanie punktu sanitarnego" });
        dodaj({ nazwa: "Naprawa bruzd po instalacji wod-kan", szukaj: ["naprawa bruzd", "zaprawienie", "bruzdy"], jednostka: "szt.", ilosc, cena: 45, uwaga: "Doliczono automatycznie: po instalacji sanitarnej trzeba naprawiÄ‡ bruzdy" });
        dodaj({ nazwa: "PrĂłba szczelnoĹ›ci instalacji wod-kan", szukaj: ["prĂłba szczelnoĹ›ci", "proba szczelnosci", "szczelnoĹ›Ä‡", "szczelnosc"], jednostka: "usĹ‚uga", ilosc: 1, cena: 180, uwaga: "Doliczono automatycznie: instalacja wod-kan wymaga sprawdzenia szczelnoĹ›ci" });
    }

    if (zakresCO || punktyCO || grzejniki) {
        const ilosc = punktyCO || grzejniki || 1;
        if (przerobka || wymiana || remont) dodaj({ nazwa: "DemontaĹĽ grzejnika / starego podejĹ›cia C.O.", szukaj: ["demontaĹĽ", "demontaz", "grzejnik", "co"], jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: przerĂłbka/wymiana C.O. wymaga demontaĹĽu starego elementu" });
        if (odZera || przerobka || /wykonanie|wykonac|wykonaÄ‡|nowy/.test(opis)) dodaj({ nazwa: "Kucie / przygotowanie trasy pod C.O.", szukaj: ["kucie", "bruzdowanie", "co", "centralne ogrzewanie"], jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt C.O. wymaga przygotowania trasy" });
        dodaj({ nazwa: przerobka ? "PrzerĂłbka punktu C.O." : "Wykonanie punktu C.O.", szukaj: ["co", "centralne ogrzewanie", "grzejnik", "podejĹ›cie"], jednostka: "szt.", ilosc, cena: przerobka ? 450 : 380, uwaga: przerobka ? "Zakres z opisu: przerĂłbka punktu C.O." : "Zakres z opisu: wykonanie punktu C.O." });
        if (grzejniki || /grzejnik/.test(opis)) dodaj({ nazwa: "MontaĹĽ grzejnika", szukaj: ["montaĹĽ grzejnika", "montaz grzejnika", "grzejnik"], jednostka: "szt.", ilosc, cena: 180, uwaga: "Doliczono automatycznie: punkt C.O. zwykle koĹ„czy siÄ™ montaĹĽem grzejnika" });
        dodaj({ nazwa: "PrĂłba szczelnoĹ›ci instalacji C.O.", szukaj: ["prĂłba szczelnoĹ›ci", "proba szczelnosci", "szczelnoĹ›Ä‡", "szczelnosc", "co"], jednostka: "usĹ‚uga", ilosc: 1, cena: 200, uwaga: "Doliczono automatycznie: instalacja C.O. wymaga prĂłby szczelnoĹ›ci" });
    }

    if (/scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips|dzialowa|dziaĹ‚owa/.test(opis)) {
        const m2 = sciankaM2 || 10;
        dodaj({ nazwa: "Konstrukcja Ĺ›cianki GK", szukaj: ["Ĺ›cianka", "scianka", "gk", "karton gips", "profil"], jednostka: "mÂ˛", ilosc: m2, cena: 85, uwaga: "Doliczono automatycznie: Ĺ›cianka GK wymaga konstrukcji" });
        dodaj({ nazwa: "PĹ‚ytowanie Ĺ›cianki GK", szukaj: ["pĹ‚yta gk", "plyta gk", "karton gips", "regips"], jednostka: "mÂ˛", ilosc: m2, cena: 95, uwaga: "Zakres z opisu: Ĺ›cianka GK" });
        dodaj({ nazwa: "TaĹ›mowanie i spoinowanie GK", szukaj: ["taĹ›mowanie", "tasmowanie", "spoinowanie", "gk"], jednostka: "mÂ˛", ilosc: m2, cena: 35, uwaga: "Doliczono automatycznie: GK wymaga spoinowania" });
        dodaj({ nazwa: "Szlifowanie i gruntowanie GK", szukaj: ["szlifowanie", "gruntowanie", "gk"], jednostka: "mÂ˛", ilosc: m2, cena: 18, uwaga: "Doliczono automatycznie: przygotowanie GK pod malowanie" });
    }

    if (/wykladzina|wykĹ‚adzina|podloge|podĹ‚oge|podĹ‚ogÄ™|podloga|podĹ‚oga|panele|paneli/.test(opis)) {
        const m2 = podlogaM2 || metraz || 50;
        dodaj({ nazwa: "Przygotowanie podĹ‚oĹĽa pod podĹ‚ogÄ™", szukaj: ["przygotowanie podĹ‚oĹĽa", "podĹ‚oĹĽe", "podloze", "podĹ‚oga"], jednostka: "mÂ˛", ilosc: m2, cena: 12, uwaga: "Doliczono automatycznie: przed uĹ‚oĹĽeniem podĹ‚ogi trzeba przygotowaÄ‡ podĹ‚oĹĽe" });
        dodaj({ nazwa: /panele|paneli/.test(opis) ? "UĹ‚oĹĽenie paneli" : "UĹ‚oĹĽenie wykĹ‚adziny", szukaj: /panele|paneli/.test(opis) ? ["panele", "podĹ‚oga"] : ["wykĹ‚adzina", "wykladzina", "podĹ‚oga", "podloga"], jednostka: "mÂ˛", ilosc: m2, cena: /panele|paneli/.test(opis) ? 55 : 45, uwaga: podlogaM2 ? "MetraĹĽ podĹ‚ogi z opisu" : "PrzyjÄ™to metraĹĽ mieszkania jako powierzchniÄ™ podĹ‚ogi" });
        dodaj({ nazwa: "Docinki / progi / wykoĹ„czenie podĹ‚ogi", szukaj: ["docinki", "progi", "listwy", "podĹ‚oga"], jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 120, uwaga: "Doliczono automatycznie: podĹ‚oga wymaga docinek i wykoĹ„czeĹ„" });
    }

    if (!propozycje.length) {
        if (metraz) {
            dodaj({ nazwa: "Robocizna remontowa â€” wycena szacunkowa", szukaj: ["robocizna", "remont", "prace"], jednostka: "mÂ˛", ilosc: metraz, cena: 110, uwaga: "Nie wykryto szczegĂłĹ‚Ăłw â€” szacunek z metraĹĽu" });
        } else {
            alert("Nie udaĹ‚o siÄ™ rozpoznaÄ‡ zakresu. Dopisz metraĹĽ albo sĹ‚owa: malowanie, gĹ‚adĹş, gniazda, punkty, wod-kan, C.O., wykĹ‚adzina.");
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
// SZYBKA WYCENA V10 â€” ZESTAWY ROBĂ“T BEZ POWIELANIA
// ==========================================

function dodajPozycjeRegulyBezPowielania(lista, config) {
    if (!config || !config.nazwa) return;

    const key = normalizeText(config.nazwa)
        .replace(/\s+/g, " ")
        .replace(/wykonanie /g, "")
        .replace(/montaz /g, "")
        .replace(/montaĹĽ /g, "")
        .trim();

    const istnieje = lista.some(p => {
        const nazwa = normalizeText(p.nazwa || p.name || "")
            .replace(/\s+/g, " ")
            .replace(/wykonanie /g, "")
            .replace(/montaz /g, "")
            .replace(/montaĹĽ /g, "")
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
        alert("GoĹ›Ä‡ nie moĹĽe generowaÄ‡ wyceny.");
        return;
    }

    const pole = document.getElementById("szybka-wycena-opis");
    const opisOryginalny = pole?.value?.trim() || "";
    const opis = normalizeText(opisOryginalny);

    if (!opis) {
        alert("Opisz zlecenie, np. mieszkanie 30 mÂ˛, malowanie, gĹ‚adĹş, 10 punktĂłw elektrycznych.");
        return;
    }

    const metraz = pobierzLiczbeZOpisu(opis, [
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw|metry|metra|m powierzchni)\b/,
        /mieszkanie\s*(\d+(?:[.,]\d+)?)/,
        /lokal\s*(\d+(?:[.,]\d+)?)/,
        /dom\s*(\d+(?:[.,]\d+)?)/
    ]);

    const pokoje = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:pokoi|pokoje|pokojach|pokĂłj|pokoj|pomieszczenia|pomieszczeĹ„)\b/
    ]);

    const okna = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:okien|okna|okno)\b/]) || pokoje || 1;
    const drzwi = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:drzwi|oscieznic|oĹ›cieĹĽnic)\b/]) || pokoje || 1;

    const punktyElektryczne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt|punkt)\s*(?:elektrycznych|elektryczne|elektryki|instalacji elektrycznej)?\b/,
        /(?:instalacj[ai] elektryczn[aej]?|elektryka)[^\d]{0,35}(\d+)\s*(?:szt|punkt|punktow|punktĂłw|pkt)?/
    ]);

    const gniazda = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:gniazd|gniazdek|gniazda|gniazdo)\b/,
        /(?:gniazd|gniazdek|gniazda|gniazdo)[^\d]{0,20}(\d+)/
    ]);

    const laczniki = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:lacznikow|Ĺ‚Ä…cznikĂłw|wlacznikow|wĹ‚Ä…cznikĂłw|laczniki|Ĺ‚Ä…czniki|wlaczniki|wĹ‚Ä…czniki)\b/,
        /(\d+)\s*(?:rocznikow|rocznikĂłw|roczniki)\b/
    ]);

    const punktySanitarne = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt|punkt)\s*(?:sanitarnych|sanitarne|wod-kan|wodkan|wodno|wody|kanalizacji|hydraulicznych)\b/,
        /(?:instalacj[ai] sanitarn[aej]?|wod-kan|wodkan|kanalizacj[ai]|hydraulik[ai]|wodno kanalizacyjn[aej]?)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktĂłw|pkt)?/
    ]);

    const punktyCO = pobierzLiczbeZOpisu(opis, [
        /(\d+)\s*(?:punktow|punktĂłw|punkty|pkt|punkt)\s*(?:co|c\.o\.|grzejnikowych|grzejnikowe|centralnego ogrzewania)\b/,
        /(?:instalacj[ai] co|instalacj[ai] c\.o\.|centralne ogrzewanie|grzejnik|grzejnika|grzejniki)[^\d]{0,45}(\d+)\s*(?:szt|punkt|punktow|punktĂłw|pkt)?/
    ]);

    const grzejniki = pobierzLiczbeZOpisu(opis, [/(\d+)\s*(?:grzejnikow|grzejnikĂłw|grzejniki|grzejnik)\b/]);

    const sciankaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛)\s*(?:scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips)/
    ]);

    const podlogaM2 = pobierzLiczbeZOpisu(opis, [
        /(?:wykladzina|wykĹ‚adzina|podloge|podĹ‚oge|podĹ‚ogÄ™|podloga|podĹ‚oga|panele)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛|metrow|metrĂłw)?/,
        /(\d+(?:[.,]\d+)?)\s*(?:m2|mÂ˛)\s*(?:wykladzina|wykĹ‚adzina|podloga|podĹ‚oga|panele)/
    ]);

    const odZera = /od zera|nowa instalacja|nowe punkty|wykonanie|wykonac|wykonaÄ‡|kompletna instalacja|stan deweloperski|deweloperski|generalny/.test(opis);
    const remont = /remont|stare|stary|modernizacja|przerobka|przerĂłbka|przerobienie|przerobiÄ‡|przerobic/.test(opis);
    const wymiana = /wymiana|wymienic|wymieniÄ‡|do wymiany/.test(opis);
    const przerobka = /przerobka|przerĂłbka|przerobienie|przerobiÄ‡|przerobic|przeniesienie|przeniesc|przenieĹ›Ä‡/.test(opis);

    const zakresMalowanie = /malowania|malowanie|pomalowac|pomalowaÄ‡|farba|bialy|biaĹ‚y|kolor|sciany|Ĺ›ciany|sufit/.test(opis);
    const zakresGladz = /gladz|gĹ‚adĹş|gladzie|gĹ‚adzie|szpachlowanie|szlifowanie/.test(opis);
    const zakresZabezpieczen = /zabezpiec|folia|folie|taĹ›my|tasmy|oklejanie|okleic|okleiÄ‡|parapet|detal|meble/.test(opis);
    const zakresSanitarny = /sanitarn|wod-kan|wodkan|wodno|kanalizac|hydraul|woda|odpĹ‚yw|odplyw|podejscie|podejĹ›cie|umywalk|zlew|wc|toalet|prysznic|wanna/.test(opis);
    const zakresCO = /c\.o\.|co |centralne ogrzewanie|grzejnik|grzejniki|podlogowka|podĹ‚ogĂłwka|ogrzewanie/.test(opis);

    const propozycje = [];
    const dodaj = (config) => dodajPozycjeRegulyBezPowielania(propozycje, config);

    let powierzchniaMalowania = null;
    let uwagaMalowania = "";

    if (metraz && zakresMalowanie) {
        const sufit = Math.round(metraz);
        const sciany = Math.round(metraz * 3);
        powierzchniaMalowania = sufit + sciany;
        uwagaMalowania = `Szacunek: sufit ${sufit} mÂ˛ + Ĺ›ciany ok. ${sciany} mÂ˛`;
    }

    const powierzchniaRobocza = powierzchniaMalowania || (metraz ? Math.round(metraz * 4) : 120);

    // 1. ZABEZPIECZENIE â€” jeden kontrolowany zestaw, bez Ĺ‚apania kaĹĽdego sĹ‚owa osobno.
    if (zakresZabezpieczen || zakresMalowanie || zakresGladz) {
        if (metraz) {
            dodaj({ nazwa: "Zabezpieczenie podĹ‚Ăłg foliÄ…", jednostka: "mÂ˛", ilosc: metraz, cena: 6, uwaga: "Doliczono automatycznie: prace wykoĹ„czeniowe wymagajÄ… zabezpieczenia podĹ‚Ăłg" });
        }
        dodaj({ nazwa: "Oklejanie taĹ›mÄ… malarskÄ… detali", jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 80, uwaga: "Doliczono automatycznie: zabezpieczenie detali, naroĹĽnikĂłw, oĹ›cieĹĽnic i krawÄ™dzi" });
        if (okna) dodaj({ nazwa: "Zabezpieczenie okien i parapetĂłw", jednostka: "kpl.", ilosc: okna, cena: 45, uwaga: "Szacunek: przyjÄ™to orientacyjnie 1 okno/parapet na pomieszczenie" });
    }

    // 2. GĹADĹą â€” bez podwĂłjnej gĹ‚adzi i bez podwĂłjnego gruntowania.
    if (zakresGladz) {
        dodaj({ nazwa: "Przygotowanie powierzchni pod gĹ‚adĹş", jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 8, uwaga: "Doliczono automatycznie: gĹ‚adĹş wymaga przygotowania podĹ‚oĹĽa" });
        dodaj({ nazwa: "Gruntowanie pod gĹ‚adĹş", jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: gĹ‚adĹş wymaga gruntowania" });
        dodaj({ nazwa: "MontaĹĽ naroĹĽnikĂłw aluminiowych", jednostka: "mb", ilosc: Math.max(4, Math.round(okna * 4 + drzwi * 2)), cena: 18, uwaga: "Szacunek: naroĹĽniki przy oknach/drzwiach i detalach" });
        dodaj({ nazwa: "Wykonanie gĹ‚adzi", jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 32, uwaga: "Zakres z opisu: gĹ‚adĹş" });
        dodaj({ nazwa: "Szlifowanie gĹ‚adzi", jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 10, uwaga: "Doliczono automatycznie: po gĹ‚adzi potrzebne jest szlifowanie" });
        dodaj({ nazwa: "Gruntowanie pod malowanie", jednostka: "mÂ˛", ilosc: powierzchniaRobocza, cena: 7, uwaga: "Doliczono automatycznie: przygotowanie powierzchni po gĹ‚adzi pod malowanie" });
    }

    // 3. MALOWANIE.
    if (zakresMalowanie) {
        dodaj({ nazwa: "Malowanie Ĺ›cian i sufitu", jednostka: "mÂ˛", ilosc: powierzchniaMalowania || 100, cena: 28, uwaga: uwagaMalowania || "Szacunek powierzchni malowania" });
    }

    // 4. ELEKTRYKA.
    if (punktyElektryczne) {
        dodaj({ nazwa: "Wykonanie punktu elektrycznego", jednostka: "szt.", ilosc: punktyElektryczne, cena: 120, uwaga: "IloĹ›Ä‡ punktĂłw z opisu" });
        if (odZera || przerobka) {
            dodaj({ nazwa: "Kucie / bruzdowanie pod punkt elektryczny", jednostka: "szt.", ilosc: punktyElektryczne, cena: 45, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt wymaga przygotowania trasy" });
            dodaj({ nazwa: "Naprawa bruzd po elektryce", jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: po wykonaniu punktu trzeba naprawiÄ‡ bruzdÄ™" });
        }
        dodaj({ nazwa: "MontaĹĽ osprzÄ™tu elektrycznego", jednostka: "szt.", ilosc: punktyElektryczne, cena: 35, uwaga: "Doliczono automatycznie: punkt wymaga montaĹĽu/podĹ‚Ä…czenia osprzÄ™tu" });
    }

    if (gniazda) {
        if (wymiana) dodaj({ nazwa: "DemontaĹĽ starego gniazda", jednostka: "szt.", ilosc: gniazda, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaĹĽ starego osprzÄ™tu" });
        dodaj({ nazwa: "MontaĹĽ gniazda elektrycznego", jednostka: "szt.", ilosc: gniazda, cena: 90, uwaga: "IloĹ›Ä‡ gniazd z opisu" });
    }

    if (laczniki) {
        if (wymiana) dodaj({ nazwa: "DemontaĹĽ starego Ĺ‚Ä…cznika / wĹ‚Ä…cznika", jednostka: "szt.", ilosc: laczniki, cena: 20, uwaga: "Doliczono automatycznie: wymiana = demontaĹĽ starego osprzÄ™tu" });
        dodaj({ nazwa: "MontaĹĽ Ĺ‚Ä…cznika Ĺ›wiatĹ‚a", jednostka: "szt.", ilosc: laczniki, cena: 80, uwaga: opis.includes("rocznik") ? "Rozpoznano z dyktowania jako â€žrocznikiâ€ť â€” potraktowano jako Ĺ‚Ä…czniki" : "IloĹ›Ä‡ Ĺ‚Ä…cznikĂłw z opisu" });
    }

    // 5. WOD-KAN.
    if (zakresSanitarny || punktySanitarne) {
        const ilosc = punktySanitarne || 1;
        if (przerobka || wymiana || remont) {
            dodaj({ nazwa: "DemontaĹĽ / odkrycie starego punktu wod-kan", jednostka: "szt.", ilosc, cena: 90, uwaga: "Doliczono automatycznie: przerĂłbka/wymiana punktu sanitarnego wymaga demontaĹĽu lub odkrycia starego ukĹ‚adu" });
        }
        if (odZera || przerobka || /wykonanie|wykonac|wykonaÄ‡|nowy/.test(opis)) {
            dodaj({ nazwa: "Kucie / przygotowanie trasy pod wod-kan", jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy punkt sanitarny wymaga przygotowania trasy" });
        }
        dodaj({ nazwa: przerobka ? "PrzerĂłbka punktu wod-kan" : "Wykonanie punktu wod-kan", jednostka: "szt.", ilosc, cena: przerobka ? 420 : 360, uwaga: przerobka ? "Zakres z opisu: przerĂłbka punktu sanitarnego" : "Zakres z opisu: wykonanie punktu sanitarnego" });
        dodaj({ nazwa: "Naprawa bruzd po instalacji wod-kan", jednostka: "szt.", ilosc, cena: 45, uwaga: "Doliczono automatycznie: po instalacji sanitarnej trzeba naprawiÄ‡ bruzdy" });
        dodaj({ nazwa: "PrĂłba szczelnoĹ›ci instalacji wod-kan", jednostka: "usĹ‚uga", ilosc: 1, cena: 180, uwaga: "Doliczono automatycznie: instalacja wod-kan wymaga sprawdzenia szczelnoĹ›ci" });
    }

    // 6. C.O.
    if (zakresCO || punktyCO || grzejniki) {
        const ilosc = punktyCO || grzejniki || 1;
        if (przerobka || wymiana || remont) {
            dodaj({ nazwa: "DemontaĹĽ grzejnika / starego podejĹ›cia C.O.", jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: przerĂłbka/wymiana C.O. wymaga demontaĹĽu starego elementu" });
        }
        if (odZera || przerobka || /wykonanie|wykonac|wykonaÄ‡|nowy/.test(opis)) {
            dodaj({ nazwa: "Kucie / przygotowanie trasy pod C.O.", jednostka: "szt.", ilosc, cena: 120, uwaga: "Doliczono automatycznie: nowy/przerabiany punkt C.O. wymaga przygotowania trasy" });
        }
        dodaj({ nazwa: przerobka ? "PrzerĂłbka punktu C.O." : "Wykonanie punktu C.O.", jednostka: "szt.", ilosc, cena: przerobka ? 450 : 380, uwaga: przerobka ? "Zakres z opisu: przerĂłbka punktu C.O." : "Zakres z opisu: wykonanie punktu C.O." });
        if (grzejniki || /grzejnik/.test(opis)) {
            dodaj({ nazwa: "MontaĹĽ grzejnika", jednostka: "szt.", ilosc, cena: 180, uwaga: "Doliczono automatycznie: punkt C.O. zwykle koĹ„czy siÄ™ montaĹĽem grzejnika" });
        }
        dodaj({ nazwa: "PrĂłba szczelnoĹ›ci instalacji C.O.", jednostka: "usĹ‚uga", ilosc: 1, cena: 200, uwaga: "Doliczono automatycznie: instalacja C.O. wymaga prĂłby szczelnoĹ›ci" });
    }

    // 7. GK.
    if (/scianka|Ĺ›cianka|gk|karton gips|karton-gips|regips|dzialowa|dziaĹ‚owa/.test(opis)) {
        const m2 = sciankaM2 || 10;
        dodaj({ nazwa: "Konstrukcja Ĺ›cianki GK", jednostka: "mÂ˛", ilosc: m2, cena: 85, uwaga: "Doliczono automatycznie: Ĺ›cianka GK wymaga konstrukcji" });
        dodaj({ nazwa: "PĹ‚ytowanie Ĺ›cianki GK", jednostka: "mÂ˛", ilosc: m2, cena: 95, uwaga: "Zakres z opisu: Ĺ›cianka GK" });
        dodaj({ nazwa: "TaĹ›mowanie i spoinowanie GK", jednostka: "mÂ˛", ilosc: m2, cena: 35, uwaga: "Doliczono automatycznie: GK wymaga spoinowania" });
        dodaj({ nazwa: "Szlifowanie i gruntowanie GK", jednostka: "mÂ˛", ilosc: m2, cena: 18, uwaga: "Doliczono automatycznie: przygotowanie GK pod malowanie" });
    }

    // 8. PODĹOGI.
    if (/wykladzina|wykĹ‚adzina|podloge|podĹ‚oge|podĹ‚ogÄ™|podloga|podĹ‚oga|panele|paneli/.test(opis)) {
        const m2 = podlogaM2 || metraz || 50;
        dodaj({ nazwa: "Przygotowanie podĹ‚oĹĽa pod podĹ‚ogÄ™", jednostka: "mÂ˛", ilosc: m2, cena: 12, uwaga: "Doliczono automatycznie: przed uĹ‚oĹĽeniem podĹ‚ogi trzeba przygotowaÄ‡ podĹ‚oĹĽe" });
        dodaj({ nazwa: /panele|paneli/.test(opis) ? "UĹ‚oĹĽenie paneli" : "UĹ‚oĹĽenie wykĹ‚adziny", jednostka: "mÂ˛", ilosc: m2, cena: /panele|paneli/.test(opis) ? 55 : 45, uwaga: podlogaM2 ? "MetraĹĽ podĹ‚ogi z opisu" : "PrzyjÄ™to metraĹĽ mieszkania jako powierzchniÄ™ podĹ‚ogi" });
        dodaj({ nazwa: "Docinki / progi / wykoĹ„czenie podĹ‚ogi", jednostka: "kpl.", ilosc: Math.max(1, pokoje || 1), cena: 120, uwaga: "Doliczono automatycznie: podĹ‚oga wymaga docinek i wykoĹ„czeĹ„" });
    }

    if (!propozycje.length) {
        if (metraz) {
            dodaj({ nazwa: "Robocizna remontowa â€” wycena szacunkowa", jednostka: "mÂ˛", ilosc: metraz, cena: 110, uwaga: "Nie wykryto szczegĂłĹ‚Ăłw â€” szacunek z metraĹĽu" });
        } else {
            alert("Nie udaĹ‚o siÄ™ rozpoznaÄ‡ zakresu. Dopisz metraĹĽ albo sĹ‚owa: malowanie, gĹ‚adĹş, gniazda, punkty, wod-kan, C.O., wykĹ‚adzina.");
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
// SZYBKA WYCENA V12 â€” POPRAWKA DODAWANIA DO ZESTAWIENIA
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
        alert("Najpierw wygeneruj propozycjÄ™ wyceny.");
        return;
    }

    const pozycje = normalizujPozycjeSzybkiejWyceny(szybkaWycenaPropozycje)
        .map(przygotujPozycjeDoGlownejWycenyV12)
        .filter(p => p.nazwa && p.ilosc > 0);

    if (!pozycje.length) {
        alert("Brak poprawnych pozycji do dodania.");
        return;
    }

    // NajczÄ™stsza nazwa tablicy w EL-Net.
    if (!Array.isArray(window.wycenaPozycje)) {
        window.wycenaPozycje = [];
    }

    pozycje.forEach(p => window.wycenaPozycje.push(p));

    // Dla starszych fragmentĂłw kodu, ktĂłre mogÄ… uĹĽywaÄ‡ zmiennej globalnej bez window.
    try {
        if (typeof wycenaPozycje !== "undefined" && Array.isArray(wycenaPozycje) && wycenaPozycje !== window.wycenaPozycje) {
            pozycje.forEach(p => wycenaPozycje.push(p));
        }
    } catch (err) {
        // ignorujemy â€” window.wycenaPozycje jest gĹ‚Ăłwne
    }

    // OdĹ›wieĹĽ tabelÄ™ i sumy â€” obsĹ‚uga rĂłĹĽnych nazw funkcji z wczeĹ›niejszych wersji.
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
            console.warn("Nie udaĹ‚o siÄ™ wykonaÄ‡", fn, err);
        }
    });

    try { przeliczWyceneAwaryjnieV12(); } catch (err) { console.warn(err); }

    // JeĹĽeli istnieje rÄ™czny formularz dodawania, nie czyĹ›cimy go. CzyĹ›cimy tylko propozycjÄ™.
    szybkaWycenaPropozycje = [];
    const wynik = document.getElementById("szybka-wycena-wynik");
    if (wynik) {
        wynik.innerHTML = `
            <div class="notice success">
                Dodano ${pozycje.length} pozycji do zestawienia prac.
            </div>
        `;
    }

    // PrzewiĹ„ do gĹ‚Ăłwnego zestawienia.
    const zestawienie = document.querySelector("#wycena-pozycje, #lista-pozycji-wyceny, #wycena-table, .wycena-table, .estimate-table, .table-scroll");
    if (zestawienie && typeof zestawienie.scrollIntoView === "function") {
        zestawienie.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

// Awaryjne przeliczenie tabeli, gdy starsza funkcja renderujÄ…ca nie zna nowych pĂłl.
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



// RESTORE V19 â€” Wycena przywrĂłcona do stabilnej wersji v12. Bez panelu Edycja.
