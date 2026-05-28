// ==========================================
// EL-NET v2 — jedna strona / panel firmowy
// ==========================================

const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";

let accessToken = localStorage.getItem("elnet_token") || null;
let zalogowanyUser = null;
let rolaUsera = "guest";

let uslugi = [];
let kosztorysy = [];
let inwestycje = [];
let wycenaPozycje = [];

let edytowanaUslugaId = null;

function headers() {
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    };
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
    } catch (err) {
        console.error(err);
        if (error) error.style.display = "block";
    }
}

function wyloguj() {
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

    pokazSekcje("pulpit");
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
}

// ==========================================
// SUPABASE — POBIERANIE
// ==========================================

async function odswiezDane() {
    await Promise.all([
        pobierzUslugi(),
        pobierzKosztorysy(),
        pobierzInwestycje()
    ]);

    renderujWszystko();
}

async function pobierzUslugi() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?select=*&order=nazwa.asc`, {
            headers: headers()
        });

        if (!res.ok) throw new Error(await res.text());
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

        if (!res.ok) throw new Error(await res.text());
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

        if (!res.ok) throw new Error(await res.text());
        inwestycje = await res.json();
    } catch (err) {
        console.error("Błąd inwestycji:", err);
        inwestycje = [];
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

    document.getElementById("stat-kosztorysy").textContent = kosztorysy.length;
    document.getElementById("stat-suma-brutto").textContent = `${sumaBrutto.toFixed(2)} PLN`;
    document.getElementById("stat-uslugi").textContent = uslugi.length;
    document.getElementById("stat-inwestycje").textContent = aktywne;
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

    tbody.innerHTML = lista.map(u => `
        <tr>
            <td>${esc(u.nazwa)}</td>
            <td>${esc(jednostkaUslugi(u))}</td>
            <td><strong>${cenaUslugi(u).toFixed(2)} PLN</strong></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary" onclick="edytujUsluge('${esc(u.id)}')">Edytuj</button>
                    <button class="btn btn-danger" onclick="usunUsluge('${esc(u.id)}')">Usuń</button>
                </div>
            </td>
        </tr>
    `).join("");
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
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać usługi. Sprawdź kolumny tabeli uslugi i RLS.");
    }
}

window.edytujUsluge = function(id) {
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
    const id = document.getElementById("wycena-usluga").value;
    const u = uslugi.find(x => String(x.id) === String(id));

    if (!u) {
        alert("Wybierz usługę z bazy.");
        return;
    }

    const ilosc = Number(document.getElementById("wycena-ilosc").value);
    const cena = Number(document.getElementById("wycena-cena").value);
    const jednostka = document.getElementById("wycena-jednostka").value;

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
        cenaNetto: cena
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
        const vat = netto * 0.23;
        const brutto = netto + vat;

        return `
            <tr>
                <td>${esc(p.nazwa)}</td>
                <td>${esc(p.jednostka)}</td>
                <td>${p.ilosc}</td>
                <td>${p.cenaNetto.toFixed(2)} PLN</td>
                <td>${netto.toFixed(2)} PLN</td>
                <td>23%</td>
                <td>${brutto.toFixed(2)} PLN</td>
                <td>
                    <button class="btn btn-danger small-btn" onclick="usunPozycjeWyceny('${p.id}')">Usuń</button>
                </td>
            </tr>
        `;
    }).join("");

    przeliczWycene();
}

window.usunPozycjeWyceny = function(id) {
    wycenaPozycje = wycenaPozycje.filter(p => p.id !== id);
    renderujWycene();
};

function przeliczWycene() {
    let netto = wycenaPozycje.reduce((s, p) => s + p.ilosc * p.cenaNetto, 0);
    const korekta = Number(document.getElementById("wycena-korekta")?.value || 0);

    netto = netto * (1 + korekta / 100);

    const vat = netto * 0.23;
    const brutto = netto + vat;

    document.getElementById("suma-netto").textContent = `${netto.toFixed(2)} PLN`;
    document.getElementById("suma-vat").textContent = `${vat.toFixed(2)} PLN`;
    document.getElementById("suma-brutto").textContent = `${brutto.toFixed(2)} PLN`;
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

    let netto = wycenaPozycje.reduce((s, p) => s + p.ilosc * p.cenaNetto, 0);
    const korekta = Number(document.getElementById("wycena-korekta").value || 0);
    netto = netto * (1 + korekta / 100);

    const payload = {
        nazwa,
        pozycje: wycenaPozycje,
        korekta,
        netto,
        brutto: netto * 1.23,
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

    tbody.innerHTML = lista.map(k => `
        <tr>
            <td>${esc(k.data)}</td>
            <td><strong>${esc(k.nazwa)}</strong></td>
            <td>${Number(k.netto || 0).toFixed(2)} PLN</td>
            <td>${Number(k.brutto || 0).toFixed(2)} PLN</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary" onclick="wczytajKosztorys('${esc(k.id)}')">Edytuj</button>
                    <button class="btn btn-danger" onclick="usunKosztorys('${esc(k.id)}')">Usuń</button>
                </div>
            </td>
        </tr>
    `).join("");
}

window.wczytajKosztorys = function(id) {
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
    } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć kosztorysu.");
    }
};

// ==========================================
// INWESTYCJE
// ==========================================

function renderujInwestycje() {
    const tbody = document.getElementById("tabela-inwestycji");
    if (!tbody) return;

    if (!inwestycje.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Brak inwestycji w bazie.</td></tr>`;
        return;
    }

    tbody.innerHTML = inwestycje.map(i => {
        const statusClass = `status-${String(i.status || "aktywna").toLowerCase()}`;

        return `
            <tr>
                <td><strong>${esc(i.nazwa)}</strong><br><small>${esc(i.adres || "")}</small></td>
                <td>${esc(i.klient || "-")}</td>
                <td><span class="status-pill ${statusClass}">${esc(i.status || "aktywna")}</span></td>
                <td>0.00 PLN</td>
                <td>0.00 PLN</td>
                <td><strong>0.00 PLN</strong></td>
            </tr>
        `;
    }).join("");
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

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/inwestycje`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        document.getElementById("inwestycja-nazwa").value = "";
        document.getElementById("inwestycja-klient").value = "";
        document.getElementById("inwestycja-adres").value = "";
        document.getElementById("inwestycja-status").value = "aktywna";

        await pobierzInwestycje();
        renderujInwestycje();
        renderujPulpit();
    } catch (err) {
        console.error(err);
        alert("Nie udało się zapisać inwestycji. Sprawdź tabelę inwestycje i RLS.");
    }
}