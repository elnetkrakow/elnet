// ==========================================
// SYSTEM EL-NET - LOGIKA CHMURY SUPABASE
// ==========================================

// 1. KONFIGURACJA POŁĄCZENIA Z BAZĄ SUPABASE
const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";

// Inicjalizacja nagłówków dla zapytań HTTP do Supabase REST API
const supabaseHeaders = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
};

// Podręczne zmienne robocze systemu
let bazaUslug = [];
let bazaKosztorysow = [];
let aktualnaWycena = [];
let edytowanyKosztorysId = null;
let edytowanaUslugaId = null;

// STREFA STARTOWA - ŁADOWANIE SYSTEMU I DETEKCJA STRON
document.addEventListener("DOMContentLoaded", async function() {
    
    // Podstrona: WYCENA (wycena.html)
    if (document.getElementById("rodzaj-prac")) {
        await pobierzUslugiZChmury();
        renderujOpcjeUslug();
        ustawCeneDlaWybranejUslugi();
        
        document.getElementById("rodzaj-prac").addEventListener("change", ustawCeneDlaWybranejUslugi);
        document.getElementById("btn-dodaj").addEventListener("click", dodajPozycjeDoWyceny);
        document.getElementById("btn-wyczysc").addEventListener("click", wyczyscWycene);
        document.getElementById("korekta-procent").addEventListener("input", przeliczPodsumowanie);
        document.getElementById("btn-zapisz-kosztorys").addEventListener("click", zapiszKosztorysWChmurze);

        const parametrEdycji = sessionStorage.getItem("edycja_kosztorysu_id");
        if (parametrEdycji) {
            await pobierzKosztorysyZChmury();
            wczytajKosztorysDoEdycji(parametrEdycji);
        }
    }

    // Podstrona: KOSZTORYSY (kosztorysy.html)
    if (document.getElementById("tabela-kosztorysow")) {
        await pobierzKosztorysyZChmury();
        renderujBazeKosztorysow();
        document.getElementById("szukaj-kosztorys").addEventListener("input", renderujBazeKosztorysow);
        document.getElementById("sortuj-kosztorys").addEventListener("change", renderujBazeKosztorysow);
    }

    // Podstrona: USŁUGI (uslugi.html)
    if (document.getElementById("tabela-cennika")) {
        await pobierzUslugiZChmury();
        renderujTabeleCennika();
        document.getElementById("btn-dodaj-usluge").addEventListener("click", obslugaFormularzaUslugi);
        document.getElementById("btn-anuluj-edycje").addEventListener("click", anulujEdycjeUslugi);
        document.getElementById("cennik-szukaj").addEventListener("input", renderujTabeleCennika);
        document.getElementById("cennik-sortuj").addEventListener("change", renderujTabeleCennika);
    }
});

// ==========================================
// FUNKCJE KOMUNIKACJI Z SERWEREM (API CHMURY)
// ==========================================

async function pobierzUslugiZChmury() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?select=*`, { headers: supabaseHeaders });
        if (!response.ok) throw new Error("Błąd pobierania usług");
        bazaUslug = await response.json();
    } catch (error) {
        console.error(error);
        alert("Błąd połączenia z bazą chmury (Usługi). Sprawdź konfigurację API.");
    }
}

async function pobierzKosztorysyZChmury() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?select=*`, { headers: supabaseHeaders });
        if (!response.ok) throw new Error("Błąd pobierania kosztorysów");
        bazaKosztorysow = await response.json();
    } catch (error) {
        console.error(error);
        alert("Błąd połączenia z bazą chmury (Kosztorysy).");
    }
}

// ==========================================
// LOGIKA ZAKŁADKI: WYCENA (wycena.html)
// ==========================================
function renderujOpcjeUslug() {
    const select = document.getElementById("rodzaj-prac");
    if (!select) return;
    select.innerHTML = "";
    const posortowane = [...bazaUslug].sort((a, b) => a.nazwa.localeCompare(b.nazwa));
    posortowane.forEach(usluga => {
        const opcja = document.createElement("option");
        opcja.value = usluga.id;
        opcja.textContent = `${usluga.nazwa} (${parseFloat(usluga.cena).toFixed(2)} PLN)`;
        select.appendChild(opcja);
    });
}

function ustawCeneDlaWybranejUslugi() {
    const id = document.getElementById("rodzaj-prac").value;
    const usluga = bazaUslug.find(u => u.id === id);
    if (usluga) {
        document.getElementById("cena-netto").value = usluga.cena;
    }
}

function dodajPozycjeDoWyceny() {
    const select = document.getElementById("rodzaj-prac");
    const idUslugi = select.value;
    const nazwaUslugi = select.options[select.selectedIndex].text.split(" (")[0];
    const jednostka = document.getElementById("jednostka").value;
    const ilosc = parseFloat(document.getElementById("ilosc").value);
    const cenaNetto = parseFloat(document.getElementById("cena-netto").value);

    if (isNaN(ilosc) || ilosc <= 0 || isNaN(cenaNetto) || cenaNetto < 0) {
        alert("Wpisz poprawną ilość oraz cenę usługi!");
        return;
    }

    const nowaPozycja = {
        id: Date.now().toString(),
        nazwa: nazwaUslugi,
        jednostka: jednostka,
        ilosc: ilosc,
        cenaNetto: cenaNetto
    };

    aktualnaWycena.push(nowaPozycja);
    renderujTabeleWyceny();
    document.getElementById("ilosc").value = "";
}

function renderujTabeleWyceny() {
    const tbody = document.getElementById("lista-pozycji");
    tbody.innerHTML = "";

    if (aktualnaWycena.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #888;">Brak pozycji w zestawieniu. Dodaj pierwszą pracę za pomocą panelu obok.</td></tr>`;
        przeliczPodsumowanie();
        return;
    }

    aktualnaWycena.forEach((pozycja) => {
        const wartoscNetto = pozycja.ilosc * pozycja.cenaNetto;
        const kwotaVat = wartoscNetto * 0.23;
        const wartoscBrutto = wartoscNetto + kwotaVat;

        const wiersz = document.createElement("tr");
        wiersz.innerHTML = `
            <td>${pozycja.nazwa}</td>
            <td>${pozycja.jednostka}</td>
            <td>${pozycja.ilosc}</td>
            <td>${parseFloat(pozycja.cenaNetto).toFixed(2)} PLN</td>
            <td>${wartoscNetto.toFixed(2)} PLN</td>
            <td>23%</td>
            <td>${wartoscBrutto.toFixed(2)} PLN</td>
            <td class="no-print"><button class="btn btn-danger" style="padding: 2px 8px; font-size: 11px;" onclick="usunPozycjeZWyceny('${pozycja.id}')">X</button></td>
        `;
        tbody.appendChild(wiersz);
    });

    przeliczPodsumowanie();
}

window.usunPozycjeZWyceny = function(id) {
    aktualnaWycena = aktualnaWycena.filter(p => p.id !== id);
    renderujTabeleWyceny();
};

function przeliczPodsumowanie() {
    let sumaNetto = 0;
    aktualnaWycena.forEach(p => {
        sumaNetto += p.ilosc * p.cenaNetto;
    });

    const korektaProcent = parseFloat(document.getElementById("korekta-procent").value) || 0;
    if (korektaProcent !== 0) {
        sumaNetto = sumaNetto * (1 + (korektaProcent / 100));
    }

    const sumaVat = sumaNetto * 0.23;
    const sumaBrutto = sumaNetto + sumaVat;

    document.getElementById("suma-netto").textContent = sumaNetto.toFixed(2) + " PLN";
    document.getElementById("suma-vat").textContent = sumaVat.toFixed(2) + " PLN";
    document.getElementById("suma-brutto").textContent = sumaBrutto.toFixed(2) + " PLN";
}

function wyczyscWycene() {
    if (confirm("Czy na pewno chcesz wyczyścić bieżące zestawienie prac?")) {
        aktualnaWycena = [];
        edytowanyKosztorysId = null;
        sessionStorage.removeItem("edycja_kosztorysu_id");
        document.getElementById("nazwa-klienta-zapis").value = "";
        document.getElementById("korekta-procent").value = "0";
        renderujTabeleWyceny();
    }
}

// ZAPIS/AKTUALIZACJA KOSZTORYSU W CHMURZE
async function zapiszKosztorysWChmurze() {
    const nazwaKlienta = document.getElementById("nazwa-klienta-zapis").value.trim();
    if (!nazwaKlienta) {
        alert("Wpisz nazwę kosztorysu lub dane klienta!");
        return;
    }
    if (aktualnaWycena.length === 0) {
        alert("Nie można zapisać pustego kosztorysu!");
        return;
    }

    let sumaNettoBase = 0;
    aktualnaWycena.forEach(p => sumaNettoBase += p.ilosc * p.cenaNetto);
    const korektaProcent = parseFloat(document.getElementById("korekta-procent").value) || 0;
    const finalNetto = sumaNettoBase * (1 + (korektaProcent / 100));
    const finalBrutto = finalNetto * 1.23;

    const daneKosztorysu = {
        nazwa: nazwaKlienta,
        pozycje: aktualnaWycena,
        korekta: korektaProcent,
        netto: finalNetto,
        brutto: finalBrutto,
        data: new Date().toLocaleDateString("pl-PL")
    };

    try {
        if (edytowanyKosztorysId) {
            // Metoda PATCH dla aktualizacji rekordu
            daneKosztorysu.data += " (edytowany)";
            const response = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${edytowanyKosztorysId}`, {
                method: "PATCH",
                headers: supabaseHeaders,
                body: JSON.stringify(daneKosztorysu)
            });
            if (!response.ok) throw new Error("Błąd podczas edycji wyceny");
            alert("Kosztorys pomyślnie zaktualizowany w chmurze Supabase!");
            edytowanyKosztorysId = null;
            sessionStorage.removeItem("edycja_kosztorysu_id");
        } else {
            // Metoda POST dla nowego rekordu
            daneKosztorysu.id = Date.now().toString();
            const response = await fetch(`${SUPABASE_URL}/rest/v1/kosztorysy`, {
                method: "POST",
                headers: supabaseHeaders,
                body: JSON.stringify(daneKosztorysu)
            });
            if (!response.ok) throw new Error("Błąd podczas zapisu nowej wyceny");
            alert("Kosztorys został bezpiecznie zapisany w chmurze!");
        }

        aktualnaWycena = [];
        document.getElementById("nazwa-klienta-zapis").value = "";
        document.getElementById("korekta-procent").value = "0";
        renderujTabeleWyceny();

    } catch (error) {
        console.error(error);
        alert("Wystąpił problem z zapisem do bazy danych online.");
    }
}

function wczytajKosztorysDoEdycji(id) {
    const kosztorys = bazaKosztorysow.find(k => k.id === id);
    if (kosztorys) {
        edytowanyKosztorysId = kosztorys.id;
        document.getElementById("nazwa-klienta-zapis").value = kosztorys.nazwa;
        document.getElementById("korekta-procent").value = kosztorys.korekta || 0;
        aktualnaWycena = typeof kosztorys.pozycje === 'string' ? JSON.parse(kosztorys.pozycje) : kosztorys.pozycje;
        renderujTabeleWyceny();
    }
}

// ==========================================
// LOGIKA ZAKŁADKI: KOSZTORYSY (kosztorysy.html)
// ==========================================
function renderujBazeKosztorysow() {
    const tbody = document.getElementById("tabela-kosztorysow");
    if (!tbody) return;
    tbody.innerHTML = "";

    let lista = [...bazaKosztorysow];

    const fraza = document.getElementById("szukaj-kosztorys").value.toLowerCase();
    if (fraza) {
        lista = lista.filter(k => k.nazwa.toLowerCase().includes(fraza) || k.data.toLowerCase().includes(fraza));
    }

    const typSortowania = document.getElementById("sortuj-kosztorys").value;
    if (typSortowania === "data-nowsze") {
        lista.sort((a, b) => b.id.localeCompare(a.id));
    } else if (typSortowania === "data-starsze") {
        lista.sort((a, b) => a.id.localeCompare(b.id));
    } else if (typSortowania === "nazwa-az") {
        lista.sort((a, b) => a.nazwa.localeCompare(b.nazwa));
    } else if (typSortowania === "nazwa-za") {
        lista.sort((a, b) => b.nazwa.localeCompare(a.nazwa));
    } else if (typSortowania === "wartosc-malejaco") {
        lista.sort((a, b) => b.brutto - a.brutto);
    } else if (typSortowania === "wartosc-rosnaco") {
        lista.sort((a, b) => a.brutto - b.brutto);
    }

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888; padding: 30px;">Brak kosztorysów w chmurze.</td></tr>`;
        return;
    }

    lista.forEach(kosztorys => {
        const wiersz = document.createElement("tr");
        wiersz.innerHTML = `
            <td>${kosztorys.data}</td>
            <td style="font-weight: bold; color: #2c3e50;">${kosztorys.nazwa}</td>
            <td>${parseFloat(kosztorys.netto).toFixed(2)} PLN</td>
            <td style="color: #27ae60; font-weight: bold;">${parseFloat(kosztorys.brutto).toFixed(2)} PLN</td>
            <td style="text-align: center;">
                <button class="btn btn-success" style="padding: 4px 10px; font-size: 12px; width: auto; background-color: #2980b9;" onclick="edytujKosztorys('${kosztorys.id}')">🛠️ Edycja</button>
                <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px; width: auto;" onclick="usunKosztorysZChmury('${kosztorys.id}')">🗑️ Usuń</button>
            </td>
        `;
        tbody.appendChild(wiersz);
    });
}

window.edytujKosztorys = function(id) {
    sessionStorage.setItem("edycja_kosztorysu_id", id);
    window.location.href = "wycena.html";
};

window.usunKosztorysZChmury = function(id) {
    if (confirm("Czy na pewno chcesz bezpowrotnie usunąć ten kosztorys z bazy online?")) {
        fetch(`${SUPABASE_URL}/rest/v1/kosztorysy?id=eq.${id}`, {
            method: "DELETE",
            headers: supabaseHeaders
        }).then(res => {
            if (res.ok) {
                bazaKosztorysow = bazaKosztorysow.filter(k => k.id !== id);
                renderujBazeKosztorysow();
            } else {
                alert("Nie udało się usunąć rekordu z chmury.");
            }
        });
    }
};

// ==========================================
// LOGIKA ZAKŁADKI: USŁUGI (uslugi.html)
// ==========================================
function renderujTabeleCennika() {
    const tbody = document.getElementById("tabela-cennika");
    if (!tbody) return;
    tbody.innerHTML = "";

    let lista = [...bazaUslug];

    const fraza = document.getElementById("cennik-szukaj").value.toLowerCase();
    if (fraza) {
        lista = lista.filter(u => u.nazwa.toLowerCase().includes(fraza));
    }

    const sortowanie = document.getElementById("cennik-sortuj").value;
    if (sortowanie === "alfabetycznie-az") {
        lista.sort((a, b) => a.nazwa.localeCompare(b.nazwa));
    } else if (sortowanie === "alfabetycznie-za") {
        lista.sort((a, b) => b.nazwa.localeCompare(a.nazwa));
    } else if (sortowanie === "cena-rosnaco") {
        lista.sort((a, b) => a.cena - b.cena);
    } else if (sortowanie === "cena-malejaco") {
        lista.sort((a, b) => b.cena - a.cena);
    }

    lista.forEach(usluga => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${usluga.nazwa}</td>
            <td><b>${parseFloat(usluga.cena).toFixed(2)} PLN</b></td>
            <td style="text-align: center;">
                <button class="btn" style="padding: 4px 10px; font-size: 12px; width: auto; background-color: #f39c12;" onclick="przygotujEdycjeUslugi('${usluga.id}')">Opcje</button>
                <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px; width: auto;" onclick="usunUslugeZChmury('${usluga.id}')">Usuń</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function obslugaFormularzaUslugi() {
    const nazwa = document.getElementById("nowa-usluga-nazwa").value.trim();
    const cena = parseFloat(document.getElementById("nowa-usluga-cena").value);

    if (!nazwa || isNaN(cena) || cena < 0) {
        alert("Wpisz poprawną nazwę usługi oraz stawkę!");
        return;
    }

    try {
        if (edytowanaUslugaId) {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?id=eq.${edytowanaUslugaId}`, {
                method: "PATCH",
                headers: supabaseHeaders,
                body: JSON.stringify({ nazwa, cena })
            });
            if (!response.ok) throw new Error();
            edytowanaUslugaId = null;
            document.getElementById("btn-dodaj-usluge").textContent = "Dodaj pozycję do bazy usług";
            document.getElementById("btn-anuluj-edycje").style.display = "none";
            document.getElementById("form-title").textContent = "Dodaj nową usługę do listy";
        } else {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/uslugi`, {
                method: "POST",
                headers: supabaseHeaders,
                body: JSON.stringify({ id: Date.now().toString(), nazwa, cena })
            });
            if (!response.ok) throw new Error();
        }

        document.getElementById("nowa-usluga-nazwa").value = "";
        document.getElementById("nowa-usluga-cena").value = "";
        await pobierzUslugiZChmury();
        renderujTabeleCennika();

    } catch (e) {
        alert("Wystąpił błąd zapisu usługi w chmurze.");
    }
}

window.przygotujEdycjeUslugi = function(id) {
    const usluga = bazaUslug.find(u => u.id === id);
    if (usluga) {
        edytowanaUslugaId = usluga.id;
        document.getElementById("nowa-usluga-nazwa").value = usluga.nazwa;
        document.getElementById("nowa-usluga-cena").value = usluga.cena;
        document.getElementById("btn-dodaj-usluge").textContent = "Zapisz zmiany w usłudze";
        document.getElementById("btn-anuluj-edycje").style.display = "block";
        document.getElementById("form-title").textContent = "Edycja usługi: " + usluga.nazwa;
    }
};

function anulujEdycjeUslugi() {
    edytowanaUslugaId = null;
    document.getElementById("nowa-usluga-nazwa").value = "";
    document.getElementById("nowa-usluga-cena").value = "";
    document.getElementById("btn-dodaj-usluge").textContent = "Dodaj pozycję do bazy usług";
    document.getElementById("btn-anuluj-edycje").style.display = "none";
    document.getElementById("form-title").textContent = "Dodaj nową usługę do listy";
}

window.usunUslugeZChmury = function(id) {
    if (confirm("Czy chcesz usunąć tę usługę z chmury?")) {
        fetch(`${SUPABASE_URL}/rest/v1/uslugi?id=eq.${id}`, {
            method: "DELETE",
            headers: supabaseHeaders
        }).then(async () => {
            await pobierzUslugiZChmury();
            renderujTabeleCennika();
        });
    }
};