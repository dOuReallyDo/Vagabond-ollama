# tripStyle Feature — Commit 2337589

## Data
4 maggio 2026

## Cosa è cambiato

### 1. `src/shared/contract.ts`
- Aggiunto campo `tripStyle: z.enum(["relax", "balanced", "adventure"])` al `TravelInputsSchema`
- Posizionato dopo `stopover`, prima di `preferredStops`

### 2. `src/App.tsx`

**Import** — aggiunto `Palmtree, Tent, Compass` da lucide-react

**State** — aggiunto `tripStyle: 'balanced'` come default in `useState`

**UI** — rimpiazzato il +/- counter "Quante tappe vuoi fare?" con:
- **3 card stilizzate** (grid 3 colonne):
  - 🌴 Relax (`Palmtree`) → "1 città base, escursioni da lì"
  - 📍 Equilibrato (`MapPin`) → "Alcune tappe, ≥2 notti ciascuna"
  - ⛺ Avventura (`Tent`) → "Tante tappe, anche 1 notte"
- Selezione: bordo + colore cambiati per la card attiva
- Click su Relax → `preferredStops = 1` e selettore tappe nascosto
- Click su Balanced/Adventure → selettore tappe visibile con default diversi (2 e 3)
- Etichetta tappe dinamica: adventurous dice "tappe", balanced dice "città"

**Condizionamento preferredStops**:
- `inputs.tripStyle !== 'relax'` → mostra selettore tappe
- Avventura: label "(anche 1 notte per tappa)", default 3
- Equilibrato: label "(ogni tappa ≥ 2 notti)", default 2

### 3. `src/services/step1Service.ts`

**Dettagli viaggio** (in entrambi i prompt, principale e compatto):
- Aggiunta riga: `- Stile viaggio: Relax/Avventura/Equilibrato (label descrittivo)`
- `Numero tappe` adattato: Relax → "1 (città base)", altri → preferredStops o "auto"

**Regole tappe** — prompt principale:
- **Relax**: "1 sola città base per tutto il viaggio. Mai cambiare hotel. Escursioni giornaliere (day-trip)."
- **Avventura**: "Tappe anche di 1 notte. ~N/2+1 tappe. Ogni giorno può essere in una città diversa."
- **Equilibrato**: comportamento precedente (≥2 notti, max N/2)

**Regole tappe** — prompt compatto:
- Stessa logica con sintassi condensata per risparmiare tokens

## Comportamento per stile

| Stile | preferredStops | Vincolo notti | Descrizione |
|-------|---------------|---------------|-------------|
| Relax | 1 (hardcoded) | N-1 notti nella stessa città | Città base + day-trip |
| Balanced | default 2, selezionabile 1-10 | ≥ 2 notti per tappa | Comportamento originale |
| Adventure | default 3, selezionabile 1-10 | 1 notte permessa | Massimo spostamento |

## Step2 compatibilità
Step2 calcola le notti per stop dai `dayIndices` dell'itinerario generato. Nessun vincolo hardcoded sulle notti minime → le tappe da 1 notte generate dallo stile Avventura vengono gestite correttamente.

**Fix 3c64aca**: `extractStops()` ora riceve `tripStyle`. In modalità Relax, se rileva >1 stop (dovuto a variazioni AI tipo "Anacapri" vs "Capri centro"), li fonde in un unico stop → 1 solo hotel per tutto il viaggio.

## Rollback
```
git revert 2337589
```
Oppure il pre-commit è `ca77750` (working tree pulito).

## File toccati
- `src/shared/contract.ts` (+1 riga)
- `src/App.tsx` (+43/-7 righe)
- `src/services/step1Service.ts` (+16/-7 righe)