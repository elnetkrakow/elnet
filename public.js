// ==========================================
// Wersja i konfiguracja Supabase
// ==========================================
const PUBLIC_QUOTE_VERSION = "v2026.06.13-09";
const SUPABASE_URL = "https://ebguhxeywwsmqbvnfhnp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy";

// ==========================================
// Stan cennika
// ==========================================
let uslugiZBazy = []; // Usługi pobrane z Supabase
let cennikoZLive = false; // Czy cennik pochodzi z bazy (live) czy z fallback

const fallbackUslugi = {
    'Zabezpieczenie podłóg i elementów': 420,
    'Gruntowanie powierzchni': 18,
    'Malowanie sufitów': 30,
    'Malowanie ścian': 32,
    'Drobne przygotowanie i poprawki podłoża': 380,
    'Szpachlowanie / gładzie': 28,
    'Prace podłogowe': 105,
    'Prace przy drzwiach i oknach': 450,
};

// ==========================================
// Pobieranie cennika z Supabase
// ==========================================
async function pobierzUslugiZBazy() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/uslugi?select=id,nazwa,cena,cena_netto,jednostka&widoczna_publicznie=eq.true`, {
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        uslugiZBazy = await res.json();
        
        if (uslugiZBazy.length > 0) {
            cennikoZLive = true;
            console.log(`✓ Cennik pobrany z bazy: ${uslugiZBazy.length} usług`);
            return true;
        }
    } catch (err) {
        console.warn("Nie udało się pobrać cennika z bazy:", err.message);
    }
    
    cennikoZLive = false;
    return false;
}

function znajdzUslugePoSlowach(slowa) {
    if (!uslugiZBazy.length || !Array.isArray(slowa) || slowa.length === 0) {
        return null;
    }

    const keywords = slowa
        .map(s => String(s || '').toLowerCase().trim())
        .filter(Boolean);

    if (!keywords.length) {
        return null;
    }

    return uslugiZBazy.find(u => {
        const nazwa = String(u.nazwa || '').toLowerCase();
        return keywords.every(kw => nazwa.includes(kw));
    }) || null;
}

function getCenaUslugi(nazwaUslugi, slowaKluczowe = []) {
    if (uslugiZBazy.length > 0) {
        const normalizedName = String(nazwaUslugi || '').toLowerCase().trim();
        let usluga = uslugiZBazy.find(u => String(u.nazwa || '').toLowerCase().trim() === normalizedName);

        if (!usluga) {
            usluga = znajdzUslugePoSlowach(slowaKluczowe);
        }

        if (usluga) {
            const cena = usluga.cena_netto ?? usluga.cena;
            if (cena !== null && cena !== undefined && !Number.isNaN(Number(cena))) {
                return Number(cena);
            }
        }
    }

    return fallbackUslugi[nazwaUslugi] || 0;
}

function pobierzCeneDlaPozycji(nazwaPozycji, slowaKluczowe = []) {
    const cena = getCenaUslugi(nazwaPozycji, slowaKluczowe);
    const matched = uslugiZBazy.length > 0
        ? uslugiZBazy.find(u => String(u.nazwa || '').toLowerCase().trim() === String(nazwaPozycji || '').toLowerCase().trim())
            || znajdzUslugePoSlowach(slowaKluczowe)
        : null;
    const source = matched ? 'supabase' : 'fallback';
    console.log('Pozycja:', nazwaPozycji, 'cena:', cena, 'źródło:', source, 'dopasowana usługa:', matched ? matched.nazwa : null);
    return cena;
}

const formatPrice = (value) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(Math.round(value));

const parseArea = (value) => {
    if (!value) return 0;
    const normalized = value.toString().trim().replace(',', '.').replace(/[^0-9.]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const guessAreaFromText = (text) => {
    const match = text.match(/(\d+(?:[.,]\d+)?)\s?(m2|m²|m kw|mkw|metr|m)\b/i);
    if (!match) return 0;
    const parsed = parseFloat(match[1].replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const addQuoteItem = (items, name, quantity, unit, unitPrice) => {
    const total = Math.round(quantity * unitPrice);
    items.push({ name, quantity, unit, unitPrice, total });
    return total;
};

const estimateQuote = (description, area) => {
    const text = description.trim().toLowerCase();
    const items = [];
    let m2 = parseArea(area) || guessAreaFromText(text);

    if (!m2) {
        m2 = 25;
    }

    const hasPainting = /malow|maluj|malowan|farba/.test(text);
    const hasWalls = /ścian|ściany|ścian/.test(text) || hasPainting;
    const hasCeiling = /sufit/.test(text) || hasPainting;
    const hasPlastering = /szpachl|gładź|gładzi|gips|grunt/.test(text);
    const hasFloor = /podłog|posadzk|panel|parkiet|glazur|terakot|kafle/.test(text);
    const hasDoors = /drzwi|okna/.test(text);
    const hasRenovation = /remont|wykończ|adaptac|modernizac|odśwież/.test(text);

    const wallArea = hasWalls ? Math.round(m2 * 3) : 0;
    const ceilingArea = hasCeiling ? m2 : 0;
    const totalPaintArea = wallArea + ceilingArea;
    const gruntArea = Math.round(m2 * 4);

    if (hasPainting || hasRenovation || hasWalls || hasCeiling) {
        items.push({
            name: 'Zabezpieczenie podłóg i elementów',
            quantity: 1,
            unit: 'ryczałt',
            unitPrice: getCenaUslugi('Zabezpieczenie podłóg i elementów'),
            total: getCenaUslugi('Zabezpieczenie podłóg i elementów'),
        });

        if (gruntArea > 0) {
            items.push({
                name: 'Gruntowanie powierzchni',
                quantity: gruntArea,
                unit: 'm²',
                unitPrice: getCenaUslugi('Gruntowanie powierzchni'),
                total: Math.round(gruntArea * getCenaUslugi('Gruntowanie powierzchni')),
            });
        }

        if (ceilingArea > 0) {
            items.push({
                name: 'Malowanie sufitów',
                quantity: ceilingArea,
                unit: 'm²',
                unitPrice: getCenaUslugi('Malowanie sufitów'),
                total: Math.round(ceilingArea * getCenaUslugi('Malowanie sufitów')),
            });
        }

        if (wallArea > 0) {
            items.push({
                name: 'Malowanie ścian',
                quantity: wallArea,
                unit: 'm²',
                unitPrice: getCenaUslugi('Malowanie ścian'),
                total: Math.round(wallArea * getCenaUslugi('Malowanie ścian')),
            });
        }

        items.push({
            name: 'Drobne przygotowanie i poprawki podłoża',
            quantity: 1,
            unit: 'ryczałt',
            unitPrice: getCenaUslugi('Drobne przygotowanie i poprawki podłoża'),
            total: getCenaUslugi('Drobne przygotowanie i poprawki podłoża'),
        });
    }

    if (hasPlastering && !hasPainting) {
        items.push({
            name: 'Szpachlowanie / gładzie',
            quantity: m2,
            unit: 'm²',
            unitPrice: getCenaUslugi('Szpachlowanie / gładzie'),
            total: Math.round(m2 * getCenaUslugi('Szpachlowanie / gładzie')),
        });
    }

    if (hasFloor) {
        items.push({
            name: 'Prace podłogowe',
            quantity: m2,
            unit: 'm²',
            unitPrice: getCenaUslugi('Prace podłogowe'),
            total: Math.round(m2 * getCenaUslugi('Prace podłogowe')),
        });
    }

    if (hasDoors) {
        items.push({
            name: 'Prace przy drzwiach i oknach',
            quantity: 1,
            unit: 'komplet',
            unitPrice: getCenaUslugi('Prace przy drzwiach i oknach'),
            total: getCenaUslugi('Prace przy drzwiach i oknach'),
        });
    }

    return { items, assumptions: { m2, wallArea, ceilingArea, totalPaintArea } };
};

const renderQuote = (result) => {
    const { items, assumptions } = result;
    const itemsContainer = document.getElementById('quote-items');
    const totalValue = document.getElementById('quote-total-value');
    const assumptionsContainer = document.getElementById('quote-assumptions');
    itemsContainer.innerHTML = '';

    const sum = items.reduce((acc, item) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${item.unit}</td>
            <td>${formatPrice(item.unitPrice)}</td>
            <td>${formatPrice(item.total)}</td>
        `;
        itemsContainer.appendChild(row);
        return acc + item.total;
    }, 0);

    if (assumptions && assumptions.m2) {
        const areaText = assumptions.m2 > 0
            ? `Szacunek przyjęty dla mieszkania ${assumptions.m2} m²: sufity ok. ${assumptions.ceilingArea} m² + ściany ok. ${assumptions.wallArea} m².`
            : 'Założono standardowe proporcje: sufity ok. 1 część, ściany ok. 3 części.';
        assumptionsContainer.textContent = areaText;
    } else {
        assumptionsContainer.textContent = '';
    }

    totalValue.textContent = formatPrice(sum);
    return sum;
};

const showMessage = (text, isError = false) => {
    const message = document.getElementById('quote-message');
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('quote-message-error', isError);
    message.classList.toggle('quote-message-success', !isError);
};

const hideMessage = () => {
    const message = document.getElementById('quote-message');
    message.hidden = true;
};

const showResult = () => {
    document.getElementById('quote-result').hidden = false;
};

const hideResult = () => {
    document.getElementById('quote-result').hidden = true;
};

const clearQuote = () => {
    document.getElementById('opis').value = '';
    document.getElementById('metraz').value = '';
    document.getElementById('lokalizacja').value = '';
    hideResult();
    hideMessage();
};

document.addEventListener('DOMContentLoaded', async () => {
    // Wstaw wersję na stronie
    const versionEl = document.getElementById('quote-version');
    if (versionEl) {
        versionEl.textContent = PUBLIC_QUOTE_VERSION;
    }

    console.log('PUBLIC_QUOTE_VERSION v2026.06.13-09 loaded');
    console.log('EL-Net public quote version:', PUBLIC_QUOTE_VERSION);

    // Pobierz cennik z bazy na starcie
    const udanoPobrano = await pobierzUslugiZBazy();
    console.log('Pobrane usługi z Supabase:', uslugiZBazy);
    console.log('Czy używam Supabase:', udanoPobrano === true);
    console.log('Czy używam fallback:', udanoPobrano !== true);
    
    // Pokaż status cennika
    const cennikerStatusEl = document.getElementById('cennik-status');
    if (cennikerStatusEl) {
        if (udanoPobrano) {
            cennikerStatusEl.textContent = `Cennik: Supabase / aktualny / pobrano ${uslugiZBazy.length} usług`;
            cennikerStatusEl.className = 'cennik-status cennik-status-live';
        } else {
            cennikerStatusEl.textContent = 'Cennik: fallback / ceny przykładowe';
            cennikerStatusEl.className = 'cennik-status cennik-status-fallback';
        }
        cennikerStatusEl.hidden = false;
    }
    
    // Pokaż komunikat ostrzeżenia jeśli nie udało się pobrać
    if (!udanoPobrano) {
        const message = document.getElementById('quote-message');
        if (message) {
            message.textContent = 'Cennik online chwilowo niedostępny. Pokazano orientacyjne ceny przykładowe.';
            message.className = 'quote-message quote-message-warning';
            message.hidden = false;
        }
    }

    const descriptionInput = document.getElementById('opis');
    const areaInput = document.getElementById('metraz');
    const generateButton = document.getElementById('generate-quote');
    const resetButton = document.getElementById('reset-quote');

    if (!generateButton || !resetButton) return;

    generateButton.addEventListener('click', () => {
        const description = descriptionInput.value.trim();
        const area = areaInput.value.trim();

        if (!description && !area) {
            showMessage('Podaj opis zakresu prac lub metraż, aby uzyskać orientacyjną wycenę.', true);
            hideResult();
            return;
        }

        hideMessage();
        const estimateResult = estimateQuote(description, area);
        renderQuote(estimateResult);
        showResult();

        if (!area && description) {
            showMessage('Metraż nie został podany. Szacunkowa wycena oparta jest na opisie i standardowym obrysie prac.', false);
        }
    });

    resetButton.addEventListener('click', clearQuote);
});
