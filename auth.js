// Konfiguracja Twojego hasła dostępu do systemu EL-Net
const HASLO_DOSTEPU = "elnet2026";

// Funkcja sprawdzająca czy użytkownik jest już zalogowany w bieżącej sesji
function czyZalogowany() {
    return sessionStorage.getItem("elnet_autoryzacja") === "true";
}

// Funkcja chroniąca podstronę merytoryczną
function chronPodstrone() {
    if (!czyZalogowany()) {
        // [Czat VS Code Podpowiedział]: Upewniamy się, że body istnieje.
        // Jeśli nie, ochrona uruchomi się przez DOMContentLoaded.
        if (document.body) {
            // Ukrywamy całą zawartość strony natychmiast, zanim cokolwiek się narysuje
            document.body.style.display = "none";
            
            // Pytamy o hasło w oknie prompt
            let podaneHaslo = prompt("Dostęp do tej sekcji wymaga hasła systemu EL-Net:");
            
            if (podaneHaslo === HASLO_DOSTEPU) {
                // Jeśli hasło jest OK, zapamiętujemy logowanie w pamięci sesji
                sessionStorage.setItem("elnet_autoryzacja", "true");
                // Odblokowujemy widok strony
                document.body.style.display = "block";
            } else {
                // Hasło jest złe, cofamy na bezpieczną stronę główną
                alert("Błędne hasło! Dostęp zabroniony.");
                window.location.href = "index.html";
            }
        }
    }
}

// [Czat VS Code Podpowiedział]: Czekamy, aż przeglądarka zbuduje strukturę strony (<body>), 
// ale zanim cokolwiek zostanie narysowane. To gwarantuje, że style i prompt zadziałają.
document.addEventListener("DOMContentLoaded", chronPodstrone);

// Na wszelki wypadek, jeśli script.js (główna logika kosztorysu/cennika) załaduje się 
// przed auth.js, blokujemy jego działanie, dopóki nie wpiszemy hasła.
if (window.elnet) {
    window.elnet.zablokowany = !czyZalogowany();
}