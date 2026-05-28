// ==========================================
// SYSTEM EL-NET - SECURE AUTH & CLOUD REST
// ==========================================

const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";

const supabaseHeaders = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
};

let bazaUslug = [];
let bazaKosztorysow = [];
let aktualnaWycena = [];
let edytowanyKosztorysId = null;
let edytowanaUslugaId = null;

// Zmienne przechowujące dane zalogowanego użytkownika
let zalogowanyUser = null;
let rolaUsera = 'guest';

// OCHRONA STRON I AUTORYZACJA SESJI
document.addEventListener("DOMContentLoaded", async function() {
    
    // Inicjalizacja tokenów sesji pobranych z localStorage po zalogowaniu
    const token = localStorage.getItem("elnet_session_token");
    const userSessionData = localStorage.getItem("elnet_user_data");
    
    // Jeśli użytkownik nie jest zalogowany, a próbuje wejść na podstrony funkcjonalne
    if (!token && !window.location.href.endsWith("index.html") && window.location.pathname !== "/elnet/") {
        window.location.href = "index.html";
        return;
    }

    if (userSessionData) {
        const parsed = JSON.parse(userSessionData);
        zalogowanyUser = parsed.user;
        rolaUsera = parsed.rola;
        supabaseHeaders["Authorization"] = `Bearer ${token}`;
        
        // Wyświetlenie informacji o zalogowanym użytkowniku w nagłówku (jeśli element istnieje)
        const userLabel = document.getElementById("user-profile-nav");
        if (userLabel) {
            userLabel.textContent = `Zalogowany: ${zalogowanyUser.email} (${rolaUsera.toUpperCase()})`;
        }
    }

    // OBSŁUGA STRONY LOGOWANIA (index.html)
    if (document.getElementById("btn-submit-login")) {
        document.getElementById("btn-submit-login").addEventListener("click", obslugaLogowania);
        if (token) window.location.href = "wycena.html"; // Jeśli zalogowany, przekieruj z ekranu logowania
        return;
    }

    // PODPIĘCIE PRZYCISKU WYLOGOWANIA W MENU NAV
    const btnWyloguj = document.getElementById("btn-logout");
    if (btnWyloguj) { btnWyloguj.addEventListener("click", wylogujUzytkownika); }

    // BLOKADA UPRAWNIEŃ DLA GOŚCIA (GUEST) ORAZ PRACOWNIKA (USER)
    zastosujUprawnieniaRoli();

    // ŁADOWANIE MODUŁÓW PODSTRON
    if (document.getElementById("rodzaj-prac")) {
        await pobierzUslugiZChmury();
        renderujOpcjeUslug();
        ustawCeneDlaWybranejUslugi();
        
        document.getElementById("rodzaj-prac").addEventListener("change", ustawCeneDlaWybranejUslugi);
        document.getElementById("btn-dodaj").addEventListener("click", dodajPozycjeDoWyceny);
        document.getElementById("btn-wyczysc").addEventListener("click", wyczyscWycene);
        document.getElementById("korekta-procent").addEventListener("input", przeliczPodsumowanie);
        
        if (rolaUsera !== 'guest') {
            document.getElementById("btn-zapisz-kosztorys").addEventListener("click", zapiszKosztorysWChmurze);
        }

        const parametrEdycji = sessionStorage.getItem("edycja_kosztorysu_id");
        if (parametrEdycji) {
            await pobierzKosztorysyZChmury();
            wczytajKosztorysDoEdycji(parametrEdycji);
        }
    }

    if (document.getElementById("tabela-kosztorysow")) {
        await pobierzKosztorysyZChmury();
        renderujBazeKosztorysow();
        document.getElementById("szukaj-kosztorys").addEventListener("input", renderujBazeKosztorysow);
        document.getElementById("sortuj-kosztorys").addEventListener("change", renderujBazeKosztorysow);
    }

    if (document.getElementById("tabela-cennika")) {
        await pobierzUslugiZChmury();
        renderujTabeleCennika();
        if (rolaUsera === 'admin') {
            document.getElementById("btn-dodaj-usluge").addEventListener("click", obslugaFormularzaUslugi);
            document.getElementById("btn-anuluj-edycje").addEventListener("click", anulujEdycjeUslugi);
        }
        document.getElementById("cennik-szukaj").addEventListener("input", renderujTabeleCennika);
        document.getElementById("cennik-sortuj").addEventListener("change", renderujTabeleCennika);
    }
});

// FUNKCJA LOGOWANIA DO SUPABASE AUTH
async function obslugaLogowania() {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorMsg = document.getElementById("error-msg");

    if (!email || !password) {
        alert("Wpisz e-mail oraz hasło!");
        return;
    }

    try {
        // Logowanie przez Supabase Auth API
        const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (!authResponse.ok) throw new Error();
        const authData = await authResponse.json();

        // Pobranie roli zalogowanego użytkownika z tabeli profile
        const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profile?id=eq.${authData.user.id}&select=rola`, {
            headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${authData.access_token}` }
        });
        const profileData = await profileResponse.json();
        const rola = profileData[0]?.rola || 'user';

        // Zapisanie sesji w pamięci przeglądarki
        localStorage.setItem("elnet_session_token", authData.access_token);
        localStorage.setItem("elnet_user_data", JSON.stringify({ user: authData.user, rola: rola }));

        window.location.href = "wycena.html";
    } catch (error) {
        errorMsg.style.display = "block";
    }
}

function wylogujUzytkownika() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "index.html";
}

function zastosujUprawnieniaRoli() {
    // Ukrywanie funkcji edycji cennika dla pracowników i gości
    if (rolaUsera !== 'admin' && document.getElementById("panel-edycji-uslug")) {
        document.getElementById("panel-edycji-uslug").style.display = "none";
    }
    // Wyłączenie zapisu kosztorysów dla roli Gość
    if (rolaUsera === 'guest' && document.getElementById("btn-zapisz-kosztorys")) {
        document.getElementById("btn-zapisz-kosztorys").disabled = true;
        document.getElementById("btn-zapisz-kosztorys").textContent = "🔒 Zapis zablokowany (Rola Gość)";
        document.getElementById("btn-zapisz-kosztorys").style.backgroundColor = "#7f8c8d";
    }
}

// REST RESTRICTIONS (FILTROWANIE ZAPISU I ODCZYTU)
async function pobierzUslugiZChmury() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?select=*`, { headers: supabaseHeaders });
        bazaUslug = await response.json();
    } catch (e) { console.error(e); }
}

async function pobierzKosztorysyZChmury() {
    try {
        // PRACOWNIK widzi tylko swoje kosztorysy, ADMIN widzi wszystkie
        let url = `${SUPABASE_URL}/rest/v1/kosztorysy?select=*`;
        if (rolaUsera === 'user') {
            url = `${SUPABASE_URL}/rest/v1/kosztorysy?user_id=eq.${zalogowanyUser.id}&select=*`;
        }
        const response = await fetch(url, { headers: supabaseHeaders });
        bazaKosztorysow = await response.json();
    } catch (e) { console.error(e); }
}

// LOGIKA STRONY WYCENA
function renderujOpcjeUslug() {
    const select = document.getElementById("rodzaj-prac");
    if (!select) return;
    select.innerHTML = "";
    [...bazaUslug].sort((a, b) => a.nazwa.localeCompare(b.nazwa)).forEach(usluga => {
        const opcja = document.createElement("option");
        opcja.value = usluga.id;
        opcja.textContent = `${usluga.nazwa} (${parseFloat(usluga.cena).toFixed(2)} PLN)`;
        select.appendChild(opcja);
    });
}

function ustawCeneDlaWybranejUslugi() {
    const id = document.getElementById("rodzaj-prac").value;
    const usluga = bazaUslug.find(u => u.id === id);
    if (usluga) document.getElementById("cena-netto").value = usluga.cena;
}

function dodajPozycjeDoWyceny() {
    const select = document.getElementById("rodzaj-prac");
    const idUslugi = select.value;
    const nazwaUslugi = select.options[select.selectedIndex].text.split(" (")[0];
    const jednostka = document.getElementById("jednostka").value;
    const ilosc = parseFloat(document.getElementById("ilosc").value);
    const cenaNetto = parseFloat(document.getElementById("cena-netto").value);

    if (isNaN(ilosc) || ilosc <= 0) return;

    aktualnaWycena.push({ id: Date.now().toString(), nazwa: nazwaUslugi, jednostka, ilosc, cenaNetto });
    renderujTabeleWyceny();
    document.getElementById("ilosc").value = "";
}

function renderujTabeleWyceny() {
    const tbody = document.getElementById("lista-pozycji");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (aktualnaWycena.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #888;">Puste zestawienie.</td></tr>`;
        przeliczPodsumowanie();
        return;
    }

    aktualnaWycena.forEach((p) => {
        const wn = p.ilosc * p.cenaNetto;
        const wb = wn * 1.23;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${p.nazwa}</td><td>${p.jednostka}</td><td>${p.ilosc}</td><td>${p.cenaNetto.toFixed(2)} PLN</td><td>${wn.toFixed(2)} PLN</td><td>23%</td><td>${wb.toFixed(2)} PLN</td>
        <td class="no-print"><button class="btn btn-danger" style="padding: 2px 8px;" onclick="usunPozycjeZWyceny('${p.id}')">X</button></td>`;
        tbody.appendChild(tr);
    });
    przeliczPodsumowanie();
}

window.usunPozycjeZWyceny = function(id) {
    aktualnaWycena = aktualnaWycena.filter(p => p.id !== id);
    renderujTabeleWyceny();
};

function przeliczPodsumowanie() {
    let sn = 0;
    aktualnaWycena.forEach(p => sn += p.ilosc * p.cenaNetto);
    const kp = parseFloat(document.getElementById("korekta-procent").value) || 0;
    if (kp !== 0) sn = sn * (1 + (kp / 100));
    
    document.getElementById("suma-netto").textContent = sn.toFixed(2) + " PLN";
    document.getElementById("suma-vat").textContent = (sn * 0.23).toFixed(2) + " PLN";
    document.getElementById("suma-brutto").textContent = (sn * 1.23).toFixed(2) + " PLN";
}

function wyczyscWycene() {
    aktualnaWycena = []; edytowanyKosztorysId = null; sessionStorage.removeItem("edycja_kosztorysu_id");
    document.getElementById("nazwa-klienta-zapis").value = ""; renderujTabeleWyceny();
}

async function zapiszKosztorysWChmurze() {
    const nazwaKlienta = document.getElementById("nazwa-klienta-zapis").value.trim();
    if (!nazwaKlienta || aktualnaWycena.length === 0) return;

    let sn = 0; aktualnaWycena.forEach(p => sn += p.ilosc * p.cenaNetto);
    const kp = parseFloat(document.getElementById("korekta-procent").value) || 0;
    const fn = sn * (1 + (kp / 100));

    const dane = {
        nazwa: nazwaKlienta, pozycje: aktualnaWycena, korekta: kp, netto: fn, brutto: fn * 1.23,
        data: new Date().toLocaleDateString("pl-PL"), user_id: zalogowanyUser.id
    };

    try {
        if (edytowanyKosztorysId) {
            dane.data += " (edytowany)";
            await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${edytowanyKosztorysId}`, {
                method: "PATCH", headers: supabaseHeaders, body: JSON.stringify(dane)
            });
        } else {
            dane.id = Date.now().toString();
            await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy`, {
                method: "POST", headers: supabaseHeaders, body: JSON.stringify(dane)
            });
        }
        alert("Zapisano kosztorys w chmurze!");
        wyczyscWycene();
    } catch (e) { alert("Błąd zapisu."); }
}

function wczytajKosztorysDoEdycji(id) {
    const k = bazaKosztorysow.find(x => x.id === id);
    if (k) {
        edytowanyKosztorysId = k.id;
        document.getElementById("nazwa-klienta-zapis").value = k.nazwa;
        document.getElementById("korekta-procent").value = k.korekta || 0;
        aktualnaWycena = typeof k.pozycje === 'string' ? JSON.parse(k.pozycje) : k.pozycje;
        renderujTabeleWyceny();
    }
}

// LOGIKA KOSZTORYSY
function renderujBazeKosztorysow() {
    const tbody = document.getElementById("tabela-kosztorysow");
    if (!tbody) return; tbody.innerHTML = "";

    bazaKosztorysow.forEach(k => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${k.data}</td><td><b>${k.nazwa}</b></td><td>${parseFloat(k.netto).toFixed(2)} PLN</td><td>${parseFloat(k.brutto).toFixed(2)} PLN</td>
        <td>
            <button class="btn btn-success" style="padding:4px;" onclick="edytujKosztorys('${k.id}')">🛠️ Edycja</button>
            ${rolaUsera === 'admin' ? `<button class="btn btn-danger" style="padding:4px;" onclick="usunKosztorysZChmury('${k.id}')">🗑️ Usuń</button>` : ''}
        </td>`;
        tbody.appendChild(tr);
    });
}

window.edytujKosztorys = function(id) { sessionStorage.setItem("edycja_kosztorysu_id", id); window.location.href = "wycena.html"; };

window.usunKosztorysZChmury = function(id) {
    if (confirm("Usunąć kosztorys z bazy?")) {
        fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${id}`, { method: "DELETE", headers: supabaseHeaders }).then(() => {
            bazaKosztorysow = bazaKosztorysow.filter(x => x.id !== id); renderujBazeKosztorysow();
        });
    }
};

// LOGIKA USŁUGI
function renderujTabeleCennika() {
    const tbody = document.getElementById("tabela-cennika");
    if (!tbody) return; tbody.innerHTML = "";

    bazaUslug.forEach(u => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${u.nazwa}</td><td><b>${parseFloat(u.cena).toFixed(2)} PLN</b></td>
        <td>
            ${rolaUsera === 'admin' ? `
                <button class="btn" style="background-color:#f39c12; padding:4px;" onclick="przygotujEdycjeUslugi('${u.id}')">Opcje</button>
                <button class="btn btn-danger" style="padding:4px;" onclick="usunUslugeZChmury('${u.id}')">Usuń</button>
            ` : '🔒 Tylko odczyt'}
        </td>`;
        tbody.appendChild(tr);
    });
}

async function obslugaFormularzaUslugi() {
    const nazwa = document.getElementById("nowa-usluga-nazwa").value.trim();
    const cena = parseFloat(document.getElementById("nowa-usluga-cena").value);
    if (!nazwa || isNaN(cena)) return;

    try {
        if (edytowanaUslugaId) {
            await fetch(`${SUPABASE_URL}/rest/v1/uslugi?id=eq.${edytowanaUslugaId}`, {
                method: "PATCH", headers: supabaseHeaders, body: JSON.stringify({ nazwa, cena })
            });
            edytowanaUslugaId = null;
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/uslugi`, {
                method: "POST", headers: supabaseHeaders, body: JSON.stringify({ id: Date.now().toString(), nazwa, cena })
            });
        }
        document.getElementById("nowa-usluga-nazwa").value = ""; document.getElementById("nowa-usluga-cena").value = "";
        await pobierzUslugiZChmury(); renderujTabeleCennika();
    } catch (e) { alert("Błąd zapisu."); }
}

window.przygotujEdycjeUslugi = function(id) {
    const u = bazaUslug.find(x => x.id === id);
    if (u) {
        edytowanaUslugaId = u.id;
        document.getElementById("nowa-usluga-nazwa").value = u.nazwa;
        document.getElementById("nowa-usluga-cena").value = u.cena;
    }
};

function anulujEdycjeUslugi() { edytowanaUslugaId = null; document.getElementById("nowa-usluga-nazwa").value = ""; }

window.usunUslugeZChmury = function(id) {
    if (confirm("Usunąć usługę?")) {
        fetch(`${SUPABASE_URL}/rest/v1/uslugi?id=eq.${id}`, { method: "DELETE", headers: supabaseHeaders }).then(async () => {
            await pobierzUslugiZChmury(); renderujTabeleCennika();
        });
    }
};