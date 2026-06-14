// public.js
// Precyzyjny kalkulator kosztorysu z cennika Supabase dla szybka-wycena.html

const SUPABASE_URL = 'https://ebguhxeywwsmqbvnfhnp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy';

const formatPrice = (value) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(Math.round(value));

// Global variables
let uslugiCennika = [];
let activeItems = []; // Array of { id, nazwa, jednostka, cena, ilosc }

// DOM elements (initialized on DOMContentLoaded)
let statusEl;
let searchInput;
let searchResultsContainer;
let tableBody;
let totalValueEl;

// Diagnostic elements
let diagStatusEl;
let diagCountEl;
let diagPhraseEl;
let diagResultsCountEl;
let diagFirstThreeEl;

const showMessage = (text, isError = false) => {
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.hidden = false;
        statusEl.className = isError ? 'quote-message quote-message-error' : 'quote-message quote-message-success';
    }
};

const hideMessage = () => {
    if (statusEl) {
        statusEl.hidden = true;
    }
};

// Required normalization function
function normalizujTekst(txt) {
  return String(txt || "")
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/ż/g, "z")
    .replace(/ź/g, "z")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetch public services from Supabase (exactly like test-cennik.html)
async function loadServices(){
  console.log("START pobierania cennika szybka-wycena");
  console.log("SUPABASE URL:", SUPABASE_URL);
  
  if (diagStatusEl) diagStatusEl.textContent = 'ładowanie';
  
  try{
    const url = `${SUPABASE_URL}/rest/v1/uslugi?select=id,nazwa,jednostka,cena,cena_netto,widoczna_publicznie&widoczna_publicznie=eq.true`;
    
    // Copy headers exactly from test-cennik.html
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    uslugiCennika = data;
    
    if (statusEl) {
      hideMessage();
    }
    
    // Required log
    console.log("Pobrane usługi szybka-wycena:", uslugiCennika.length, uslugiCennika.slice(0, 5));
    
    if (diagStatusEl) diagStatusEl.textContent = 'pobrano';
    if (diagCountEl) diagCountEl.textContent = uslugiCennika.length;
  }catch(error){
    console.error("Błąd pobierania szybka-wycena:", error);
    showMessage('Cennik online nie został pobrany. Odśwież stronę.', true);
    
    if (diagStatusEl) diagStatusEl.textContent = 'błąd';
    if (diagCountEl) diagCountEl.textContent = '0';
    if (diagFirstThreeEl) diagFirstThreeEl.textContent = 'Błąd: ' + (error && error.message ? error.message : String(error));
  }
}

// Render costing table
const renderCostingTable = () => {
  if (!tableBody || !totalValueEl) return;
  
  const printButton = document.getElementById('print-quote');
  if (printButton) {
    if (activeItems.length === 0) {
      printButton.style.opacity = '0.6';
      printButton.style.cursor = 'not-allowed';
    } else {
      printButton.style.opacity = '1';
      printButton.style.cursor = 'pointer';
    }
  }
  
  if (activeItems.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 32px 16px; font-style: italic; font-size: 14px;">Dodaj pierwszą usługę z cennika po lewej stronie.</td></tr>';
    totalValueEl.textContent = '0 zł';
    return;
  }
  
  tableBody.innerHTML = '';
  
  let totalSum = 0;
  
  activeItems.forEach((item, index) => {
    const row = document.createElement('tr');
    const rowValue = Math.round(item.ilosc * item.cena);
    totalSum += rowValue;
    
    row.innerHTML = `
      <td style="font-weight: 600;">${item.nazwa}</td>
      <td>
        <input type="number" min="0.1" step="any" value="${item.ilosc}" style="width: 80px; padding: 6px; border: 1px solid #ded8cd; border-radius: 8px;" data-index="${index}" class="costing-qty-input">
      </td>
      <td>${item.jednostka}</td>
      <td>${item.cena} zł</td>
      <td style="font-weight: bold; color: #087d59;">${rowValue} zł</td>
      <td>
        <button type="button" class="btn-remove-item" data-index="${index}" style="background: #e74c3c; color: white; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;">Usuń</button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  
  totalValueEl.textContent = formatPrice(totalSum);
  
  // Input change listeners
  document.querySelectorAll('.costing-qty-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      const newVal = parseFloat(e.target.value);
      if (!isNaN(newVal) && newVal >= 0) {
        activeItems[idx].ilosc = newVal;
        renderCostingTable();
      }
    });
  });
  
  // Remove button listeners
  document.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      activeItems.splice(idx, 1);
      renderCostingTable();
    });
  });
};

// Search services in cennik
const searchServices = () => {
  if (!searchInput || !searchResultsContainer) return;
  
  const query = searchInput.value;
  const q = normalizujTekst(query);
  
  if (diagPhraseEl) diagPhraseEl.textContent = query || '-';
  
  if (q.length < 2) {
    searchResultsContainer.innerHTML = '';
    if (diagResultsCountEl) diagResultsCountEl.textContent = '0';
    if (diagFirstThreeEl) diagFirstThreeEl.textContent = '-';
    return;
  }
  
  // Required filter logic
  const wyniki = uslugiCennika.filter(u => normalizujTekst(u.nazwa).includes(q));
  
  // Update diagnostics
  if (diagResultsCountEl) diagResultsCountEl.textContent = wyniki.length;
  if (diagFirstThreeEl) {
    const topThree = wyniki.slice(0, 3).map(u => u.nazwa).join(', ');
    diagFirstThreeEl.textContent = topThree || '-';
  }
  
  // Maximum of 10 results
  const topMatches = wyniki.slice(0, 10);
  searchResultsContainer.innerHTML = '';
  
  if (topMatches.length === 0) {
    searchResultsContainer.innerHTML = `<div style="padding: 10px; color: #888; text-align: center; border: 1px dashed #ded8cd; border-radius: 8px;">Brak pasujących usług. Pobrano ${uslugiCennika.length} usług. Szukana fraza: "${query}"</div>`;
    return;
  }
  
  topMatches.forEach(s => {
    const cena = s.cena_netto ?? s.cena ?? 0;
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #ded8cd; border-radius: 12px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.02);';
    
    itemDiv.innerHTML = `
      <div style="flex-grow: 1; margin-right: 16px; text-align: left;">
        <strong style="display: block; font-size: 14px; color: #0e1b2f;">${s.nazwa}</strong>
        <span style="font-size: 13px; color: #087d59; font-weight: 600;">Cena: ${cena} zł / ${s.jednostka || 'm²'}</span>
      </div>
      <button type="button" class="btn-add-service" style="background: #087d59; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;">Dodaj</button>
    `;
    
    itemDiv.querySelector('.btn-add-service').addEventListener('click', () => {
      const alreadyAddedIndex = activeItems.findIndex(item => item.id === s.id);
      if (alreadyAddedIndex !== -1) {
        activeItems[alreadyAddedIndex].ilosc += 1;
      } else {
        activeItems.push({
          id: s.id,
          nazwa: s.nazwa,
          jednostka: s.jednostka || 'm²',
          cena: Number(cena),
          ilosc: 1
        });
      }
      renderCostingTable();
      searchInput.value = '';
      searchResultsContainer.innerHTML = '';
      if (diagPhraseEl) diagPhraseEl.textContent = '-';
      if (diagResultsCountEl) diagResultsCountEl.textContent = '0';
      if (diagFirstThreeEl) diagFirstThreeEl.textContent = '-';
    });
    
    searchResultsContainer.appendChild(itemDiv);
  });
};

// Print quote logic
const printQuote = () => {
  if (activeItems.length === 0) {
    alert("Dodaj przynajmniej jedną usługę do kosztorysu.");
    return;
  }
  
  // Update print date
  const printDateEl = document.getElementById('print-date');
  if (printDateEl) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()} r.`;
    printDateEl.textContent = 'Data wydruku: ' + dateStr;
  }
  
  // Update print note
  const opisEl = document.getElementById('opis');
  const printNoteContainer = document.getElementById('print-note-container');
  const printNoteText = document.getElementById('print-note-text');
  if (printNoteContainer && printNoteText && opisEl) {
    const noteText = (opisEl.value || '').trim();
    if (noteText) {
      printNoteText.textContent = noteText;
      printNoteContainer.classList.add('show-print');
    } else {
      printNoteContainer.classList.remove('show-print');
    }
  }
  
  window.print();
};

// Clear all inputs
const clearQuote = () => {
  const opisEl = document.getElementById('opis');
  if (opisEl) opisEl.value = '';
  const metrazEl = document.getElementById('metraz');
  if (metrazEl) metrazEl.value = '';
  const lokEl = document.getElementById('lokalizacja');
  if (lokEl) lokEl.value = '';
  
  if (searchInput) searchInput.value = '';
  if (searchResultsContainer) searchResultsContainer.innerHTML = '';
  activeItems = [];
  renderCostingTable();
  hideMessage();
  if (diagPhraseEl) diagPhraseEl.textContent = '-';
  if (diagResultsCountEl) diagResultsCountEl.textContent = '0';
  if (diagFirstThreeEl) diagFirstThreeEl.textContent = '-';
};

// Initialization function
const init = () => {
  // Initialize DOM elements
  statusEl = document.getElementById('quote-message');
  searchInput = document.getElementById('search-usluga');
  searchResultsContainer = document.getElementById('search-results');
  tableBody = document.getElementById('quote-items');
  totalValueEl = document.getElementById('quote-total-value');
  
  // Initialize Diagnostic elements
  diagStatusEl = document.getElementById('diag-status');
  diagCountEl = document.getElementById('diag-count');
  diagPhraseEl = document.getElementById('diag-phrase');
  diagResultsCountEl = document.getElementById('diag-results-count');
  diagFirstThreeEl = document.getElementById('diag-first-three');
  
  loadServices();
  renderCostingTable();
  
  if (searchInput) {
    searchInput.addEventListener('input', searchServices);
  }
  
  const resetButton = document.getElementById('reset-quote');
  if (resetButton) {
    resetButton.addEventListener('click', clearQuote);
  }

  const printButton = document.getElementById('print-quote');
  if (printButton) {
    printButton.addEventListener('click', printQuote);
  }
};

// Safe load execution
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
