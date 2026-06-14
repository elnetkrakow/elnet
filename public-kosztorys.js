// public-kosztorys.js
// Precyzyjny kalkulator kosztorysu z cennika Supabase dla szybka-wycena.html

const SUPABASE_URL = 'https://ebguhxeywwsmqbvnfhnp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JHiOY_XRueQ6R1ApozzfEA_ujc6ymvy';

const formatPrice = (value) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(Math.round(value));

let allServices = [];
let activeItems = []; // Array of { id, nazwa, jednostka, cena, ilosc }

const statusEl = document.getElementById('quote-message');
const searchInput = document.getElementById('search-usluga');
const searchResultsContainer = document.getElementById('search-results');
const tableBody = document.getElementById('quote-items');
const totalValueEl = document.getElementById('quote-total-value');
const resultSection = document.getElementById('quote-result');

const showMessage = (text, isError = false) => {
    statusEl.textContent = text;
    statusEl.hidden = false;
    statusEl.className = isError ? 'quote-message quote-message-error' : 'quote-message quote-message-success';
};

const hideMessage = () => {
    statusEl.hidden = true;
};

// Fetch visible public services from Supabase
async function loadServices(){
  showMessage('Ładowanie cennika online...', false);
  try{
    const url = `${SUPABASE_URL}/rest/v1/uslugi?select=id,nazwa,jednostka,cena,cena_netto,widoczna_publicznie&widoczna_publicznie=eq.true`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    allServices = data;
    hideMessage();
    console.log('Załadowano cennik Supabase:', allServices.length);
  }catch(err){
    console.error(err);
    showMessage('Nie udało się pobrać cennika online. Spróbuj ponownie później.', true);
  }
}

// Render costing table
const renderCostingTable = () => {
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

// Search services in loaded list
const searchServices = () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    searchResultsContainer.innerHTML = '';
    return;
  }
  
  // Normalize Polish signs
  const normalize = (str) => {
    return str.toLowerCase()
      .replace(/ą/g, 'a')
      .replace(/ć/g, 'c')
      .replace(/ę/g, 'e')
      .replace(/ł/g, 'l')
      .replace(/ń/g, 'n')
      .replace(/ó/g, 'o')
      .replace(/ś/g, 's')
      .replace(/ż/g, 'z')
      .replace(/ź/g, 'z');
  };
  
  const normQuery = normalize(query);
  
  const matches = allServices.filter(s => {
    return normalize(s.nazwa || '').includes(normQuery);
  });
  
  // Display maximum of 10 best matches
  const topMatches = matches.slice(0, 10);
  searchResultsContainer.innerHTML = '';
  
  if (topMatches.length === 0) {
    searchResultsContainer.innerHTML = '<div style="padding: 10px; color: #888; text-align: center; border: 1px dashed #ded8cd; border-radius: 8px;">Brak pasujących usług w cenniku</div>';
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
    });
    
    searchResultsContainer.appendChild(itemDiv);
  });
};

// Clear all inputs and costing state
const clearQuote = () => {
  const opisEl = document.getElementById('opis');
  if (opisEl) opisEl.value = '';
  const metrazEl = document.getElementById('metraz');
  if (metrazEl) metrazEl.value = '';
  const lokEl = document.getElementById('lokalizacja');
  if (lokEl) lokEl.value = '';
  
  searchInput.value = '';
  searchResultsContainer.innerHTML = '';
  activeItems = [];
  renderCostingTable();
  hideMessage();
};

document.addEventListener('DOMContentLoaded', () => {
  loadServices();
  renderCostingTable();
  
  searchInput.addEventListener('input', searchServices);
  
  const resetButton = document.getElementById('reset-quote');
  if (resetButton) {
    resetButton.addEventListener('click', clearQuote);
  }
});
