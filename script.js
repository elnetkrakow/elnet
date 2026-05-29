// ==========================================
// EL-NET v2 — jedna strona / panel firmowy
// ==========================================

const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";
const APP_VERSION = "2026.05.29-10";

let accessToken = localStorage.getItem("elnet_token") || null;
let zalogowanyUser = null;
let rolaUsera = "guest";

let uslugi = [];
let kosztorysy = [];
let inwestycje = [];
let inwestycjeZaliczki = [];
let inwestycjeKoszty = [];
let logi = [];
let aktywnaInwestycjaId = null;

let wycenaPozycje = [];
let edytowanaUslugaId = null;
let edytowanaInwestycjaId = null;

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
    if (!errorText || typeof errorText !== 'string') return;

    const lower = errorText.toLowerCase();

    const expired = lower.includes('jwt expired') || lower.includes('pgrst301') || lower.includes('401');
    if (!expired) return;

    // Clear session and reset state
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* ignore */ }
    accessToken = null;
    zalogowanyUser = null;
    rolaUsera = 'guest';

    alert('Sesja wygasła. Zaloguj się ponownie.');

    // Show login screen (or reload as fallback)
    try {
        const login = document.getElementById('login-screen');
        const app = document.getElementById('app-screen');
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

    const btnDodajPozycje = document.getElementById("btn-dodaj-pozycje");
    if (btnDodajPozycje) btnDodajPozycje.addEventListener("click", dodajPozycjeDoWyceny);

    const btnWyczyscWycene = document.getElementById("btn-wyczysc-wycene");
    if (btnWyczyscWycene) btnWyczyscWycene.addEventListener("click", wyczyscWycene);

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

    const btnDodajInwestycje = document.getElementById("btn-dodaj-inwestycje");
    if (btnDodajInwestycje) btnDodajInwestycje.addEventListener("click", dodajInwestycje);

    const btnZamknijInwestycje = document.getElementById("btn-zamknij-inwestycje");
    if (btnZamknijInwestycje) btnZamknijInwestycje.addEventListener("click", zamknijPanelInwestycji);

    const btnDrukujInwestycje = document.getElementById("btn-drukuj-inwestycje");
    if (btnDrukujInwestycje) btnDrukujInwestycje.addEventListener("click", drukujInwestycje);

    const btnDodajZaliczke = document.getElementById("btn-dodaj-zaliczke");
    if (btnDodajZaliczke) btnDodajZaliczke.addEventListener("click", dodajZaliczke);

    const btnDodajKoszt = document.getElementById("btn-dodaj-koszt");
    if (btnDodajKoszt) btnDodajKoszt.addEventListener("click", dodajKoszt);

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

    const dzisiaj = new Date().toISOString().slice(0, 10);

    const zaliczkaData = document.getElementById("zaliczka-data");
    if (zaliczkaData) zaliczkaData.value = dzisiaj;

    const kosztData = document.getElementById("koszt-data");
    if (kosztData) kosztData.value = dzisiaj;
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

    if (cardUslugiForm) cardUslugiForm.classList.toggle("hidden", rolaUsera !== "admin");
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
    document.querySelectorAll(".app-section").forEach(sec => {
        sec.classList.remove("active-section");
    });

    const section = document.getElementById(`section-${nazwa}`);
    if (section) section.classList.add("active-section");

    document.querySelectorAll(".nav-link").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.section === nazwa);
    });

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
        pobierzLogi()
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
    renderujAdministrator();
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
    const sumaBrutto = kosztorysy.reduce((s, k) => s + Number(k.brutto || 0), 0);
    const aktywne = inwestycje.filter(i => i.status === "aktywna").length;
    const sumaZaliczek = inwestycjeZaliczki.reduce((s, z) => s + Number(z.kwota || 0), 0);
    const sumaKosztow = inwestycjeKoszty.reduce((s, k) => s + Number(k.kwota || 0), 0);
    const roznica = sumaZaliczek - sumaKosztow;

    const ostatnieKosztorysy = [...kosztorysy]
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .slice(0, 5);

    const ostatnieInwestycje = [...inwestycje]
        .slice(-5)
        .reverse();

    document.getElementById("stat-kosztorysy").textContent = kosztorysy.length;
    document.getElementById("stat-suma-brutto").textContent = `${sumaBrutto.toFixed(2)} PLN`;
    document.getElementById("stat-uslugi").textContent = uslugi.length;
    document.getElementById("stat-inwestycje").textContent = aktywne;
    document.getElementById("stat-zaliczek").textContent = `${sumaZaliczek.toFixed(2)} PLN`;
    document.getElementById("stat-kosztow").textContent = `${sumaKosztow.toFixed(2)} PLN`;
    document.getElementById("stat-roznica").textContent = `${roznica.toFixed(2)} PLN`;

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
}

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
        const akcje = rolaUsera === "admin"
            ? `
                <div class="table-actions">
                    <button class="btn btn-secondary" onclick="edytujUsluge('${esc(u.id)}')">Edytuj</button>
                    <button class="btn btn-danger" onclick="usunUsluge('${esc(u.id)}')">Usuń</button>
                </div>
            `
            : "";

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
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może zapisywać usługi.");
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
    if (rolaUsera !== "admin") {
        alert("Tylko administrator może edytować usługi.");
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
    document.getElementById("kosztorys-nazwa").value = "";
    document.getElementById("wycena-korekta").value = 0;
    renderujWycene();
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

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        alert("Kosztorys zapisany.");
        wyczyscWycene();
        await pobierzKosztorysy();
        renderujKosztorysy();
        renderujPulpit();
        pokazSekcje("kosztorysy");
        zapiszLog("Kosztorysy", "Zapisano kosztorys", nazwa);
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
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Brak zapisanych kosztorysów.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(k => {
        const edytuj = rolaUsera !== "guest"
            ? `<button class="btn btn-secondary" onclick="wczytajKosztorys('${esc(k.id)}')">Edytuj</button>`
            : "";
        const usun = rolaUsera === "admin"
            ? `<button class="btn btn-danger" onclick="usunKosztorys('${esc(k.id)}')">Usuń</button>`
            : "";

        return `
            <tr>
                <td>${esc(k.data)}</td>
                <td><strong>${esc(k.nazwa)}</strong></td>
                <td>${Number(k.netto || 0).toFixed(2)} PLN</td>
                <td>${Number(k.brutto || 0).toFixed(2)} PLN</td>
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

        return `
            <tr>
                <td>${esc(p.nazwa || "")}</td>
                <td>${esc(p.jednostka || "")}</td>
                <td>${Number(p.ilosc || 0).toFixed(2)}</td>
                <td>${Number(p.cenaNetto || 0).toFixed(2)} PLN</td>
                <td>${netto.toFixed(2)} PLN</td>
                <td>${vatPerc}%</td>
                <td>${brutto.toFixed(2)} PLN</td>
            </tr>
        `;
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
            <title>Drukuj kosztorys</title>
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
            <h1>EL-Net</h1>
            <h2>${esc(kosztorys.nazwa || "Kosztorys")}</h2>
            <p>Data: ${esc(kosztorys.data || "-")}</p>
            <table>
                <thead>
                    <tr>
                        <th>Nazwa</th>
                        <th>Jedn.</th>
                        <th>Ilość</th>
                        <th>Cena netto</th>
                        <th>Wartość netto</th>
                        <th>VAT</th>
                        <th>Brutto</th>
                    </tr>
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

    if (!inwestycje.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Brak inwestycji w bazie.</td></tr>`;
        return;
    }

    tbody.innerHTML = inwestycje.map(i => {
        const statusClass = `status-${String(i.status || "aktywna").toLowerCase()}`;
        const zaliczki = sumaZaliczekDlaInwestycji(i.id);
        const koszty = sumaKosztowDlaInwestycji(i.id);
        const roznica = zaliczki - koszty;

        const akcje = rolaUsera === "admin"
            ? `
                <button class="btn btn-secondary small-btn" onclick="edytujInwestycje('${esc(i.id)}')">Edytuj</button>
                <button class="btn btn-danger small-btn" onclick="usunInwestycje('${esc(i.id)}')">Usuń</button>
            `
            : "";

        return `
            <tr>
                <td><strong>${esc(i.nazwa)}</strong><br><small>${esc(i.adres || "")}</small></td>
                <td>${esc(i.klient || "-")}</td>
                <td><span class="status-pill ${statusClass}">${esc(i.status || "aktywna")}</span></td>
                <td>${zaliczki.toFixed(2)} PLN</td>
                <td>${koszty.toFixed(2)} PLN</td>
                <td><strong>${roznica.toFixed(2)} PLN</strong></td>
                <td>
                    <button class="btn btn-secondary small-btn" onclick="otworzInwestycje('${esc(i.id)}')">Otwórz</button>
                    ${akcje}
                </td>
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