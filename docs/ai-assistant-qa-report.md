# AI Local Parser - QA Report

**Date:** 2026-03-24
**File:** `src/lib/ai-local-parser.ts`
**Test file:** `tests/ai-parser.test.ts`
**Tests:** 50 total (40 main + 10 helper function tests)
**Result:** 50/50 PASS

---

## Score: 8/10 (after fixes)

**Before fixes: 5/10** - Multiple critical bugs causing wrong pattern matches, missing informal language support, and date parsing failures.

**After fixes: 8/10** - All 40 test cases pass. Remaining -2 points for: multi-intent limitation (only first match returned) and some edge cases that inherently require LLM fallback.

---

## Bugs Found and Fixed

### BUG 1: "marca" not matched by appointment pattern
- **Severity:** HIGH
- **Test cases affected:** #1, #26
- **Problem:** Regex `/marcar/` requires the full word "marcar" but users write "marca" (conjugated). "Marca pediatra do Martim" failed to match appointment.
- **Fix:** Changed regex to `/marc[ao]r?/` which matches "marca", "marco", "marcar".

### BUG 2: "gasto" not matched by expense pattern
- **Severity:** HIGH
- **Test cases affected:** #2
- **Problem:** Regex `/gast[eo]i/` only matches "gastei"/"gastoi" but "Registra gasto de 80 reais" uses "gasto" (noun form).
- **Fix:** Added `gasto\b` as alternative in expense pattern.

### BUG 3: Date range "dia 5 a 10 de abril" parsed incorrectly
- **Severity:** MEDIUM
- **Test cases affected:** #9
- **Problem:** Regex `dia\s+(\d{1,2})\s+(?:de\s+)?(\w+)` matched "dia 5 a" capturing "a" as the month name, which failed lookup. Then fell through to bare day match losing the month.
- **Fix:** Added dedicated range regex `dia\s+(\d{1,2})\s+a\s+\d{1,2}\s+(?:de\s+)?(\w+)` that runs before the generic day+month pattern.

### BUG 4: "alergia" in health pattern caught note-intent text
- **Severity:** HIGH
- **Test cases affected:** #11
- **Problem:** "Anota que preciso comprar remedio de alergia" matched health (Pattern 3) due to "alergia" before reaching note (Pattern 7).
- **Fix:** Added guard: `alergia` only matches health when NOT accompanied by "comprar"/"anota"/"lembr"/"remedio".

### BUG 5: "futsal" not in activity patterns
- **Severity:** MEDIUM
- **Test cases affected:** #14
- **Problem:** Activity regex only had "futebol" but not "futsal". Many Brazilian children play futsal.
- **Fix:** Added "futsal", "tenis", "basquete", "ginastica", "danca", "teatro", "piano" to activity pattern.

### BUG 6: Swap pattern "trocar o dia" not matched
- **Severity:** MEDIUM
- **Test cases affected:** #15
- **Problem:** Regex `/trocar?\s+dia/` expected "trocar dia" but text was "trocar o dia" with "o" in between.
- **Fix:** Changed to `/troc(?:ar?|o)\s+(?:o\s+)?dia/` and added `quero\s+trocar`.

### BUG 7: "esta mal" not matched by health pattern
- **Severity:** MEDIUM
- **Test cases affected:** #20
- **Problem:** Health regex had `mal\s+estar` (with space) but "Otto esta mal" has "esta mal" as separate words without "estar" following.
- **Fix:** Added `esta\s+mal` and `passou\s+mal` to health pattern.

### BUG 8: Child name matching too loose (substring)
- **Severity:** LOW
- **Test cases affected:** #31
- **Problem:** `n.includes(norm(firstName))` caused "Martinho" to match "Martim" since "martim" is a substring of "martinho".
- **Fix:** Changed to word-boundary regex `\bfirstName\b`.

### BUG 9: Year in "dia 15 de abril de 2026" ignored
- **Severity:** MEDIUM
- **Test cases affected:** #39
- **Problem:** Date regex `dia\s+(\d{1,2})\s+(?:de\s+)?(\w+)` only captured day+month, ignoring explicit year.
- **Fix:** Added higher-priority regex `dia\s+(\d{1,2})\s+(?:de\s+)?(\w+)\s+(?:de\s+)?(\d{4})` that captures year.

### BUG 10: "semana que vem" not parsed
- **Severity:** MEDIUM
- **Test cases affected:** #40
- **Problem:** No pattern for "semana que vem" in parseRelativeDate.
- **Fix:** Added dedicated check returning next Monday.

### BUG 11: Brazilian thousands format "R$ 1.500,00" not parsed
- **Severity:** MEDIUM
- **Problem:** Amount regex `\d+(?:[.,]\d{1,2})?` stopped at the thousands dot (matching just "1").
- **Fix:** Added pre-check for `\d{1,3}(?:\.\d{3})+,\d{1,2}` format, stripping dots before parsing.

### BUG 12: Pattern priority - Agreement vs Check-in
- **Severity:** HIGH
- **Test cases affected:** #13
- **Problem:** "Acordo: limite de 2h de tela por dia" - "tela" triggered Check-in (Pattern 4) before "acordo"/"limite" could reach Agreement (Pattern 8).
- **Fix:** Added guard to Check-in: skip if "acordo"/"regra"/"limite" keywords present.

### BUG 13: Pattern priority - Appointment vs Health
- **Severity:** MEDIUM
- **Test cases affected:** #37
- **Problem:** "Martim tem febre e preciso marcar pediatra" matched Appointment (Pattern 2) because "marcar" + "pediatr" matched before Health (Pattern 3) could catch "febre".
- **Fix:** Added guard to Appointment: skip if strong health keywords (febre, vomit, diarreia, etc.) are present.

### BUG 14: Invalid dates not rejected
- **Severity:** LOW
- **Test cases affected:** #32
- **Problem:** "dia 32 de marco" created Date(2026, 2, 32) which JavaScript silently rolls over to April 1.
- **Fix:** Added `isValidDate()` validation that checks the constructed date matches the input day/month/year.

### BUG 15: Empty string not handled
- **Severity:** LOW
- **Test cases affected:** #33
- **Problem:** Empty string would run through all regex patterns unnecessarily.
- **Fix:** Added early return `if (!text || !text.trim()) return null`.

### BUG 16: No expense result when amount missing
- **Severity:** LOW
- **Test cases affected:** #19
- **Problem:** "Gastei com remedio" matched expense but amount=0, so the if(amount>0) check caused it to fall through to medication pattern instead.
- **Fix:** Added fallback: when expense keywords match but amount=0, return createExpense with confidence 0.5.

---

## Improvements Added

### Informal Language Preprocessing
Added `preprocessInformal()` function that normalizes slang before parsing:
- "mano," -> removed
- "tipo uns" -> removed
- "conto/contos" -> "reais"
- "pila/pilas" -> "reais"
- "pro" -> "para o"
- "pra" -> "para"
- "finde" -> "fim de semana"
- "bota/botar" -> "marca"

### Word-Based Number Parsing
Added `parseWordNumber()` and `NUMBER_WORDS` map supporting:
- Units: zero through nove
- Teens: dez through dezenove
- Tens: vinte through noventa
- Hundreds: cem/cento through novecentos
- Compound: "cento e cinquenta reais" = 150

### Better Health Log Type Detection
Instead of always setting logType="temperature", now detects: temperature, vomiting, diarrhea, cough, allergy, symptom.

---

## Test Results (all 40 cases)

| # | Input | Expected Action | Result | Confidence |
|---|-------|----------------|--------|------------|
| 1 | Marca pediatra do Martim amanha as 14h | createAppointment | PASS | >= 0.7 |
| 2 | Registra gasto de 80 reais com escola do Otto | createExpense | PASS | 0.9 |
| 3 | Gastei 150 em material escolar | createExpense | PASS | 0.9 |
| 4 | Consulta do Martim dia 15 as 10h | createAppointment | PASS | >= 0.7 |
| 5 | Eduarda esta com febre 38.5 | createHealthLog | PASS | >= 0.7 |
| 6 | Martim vomitou hoje de manha | createHealthLog | PASS | >= 0.7 |
| 7 | Check-in: Otto dormiu bem | createCheckin | PASS | 0.85 |
| 8 | Martim comeu bem no almoco | createCheckin | PASS | 0.85 |
| 9 | Cria evento viagem casa da vovo dia 5 a 10 de abril | createEvent | PASS | >= 0.7 |
| 10 | Criar decisao sobre escola do Otto | createDecision | PASS | 0.8 |
| 11 | Anota que preciso comprar remedio de alergia | createNote | PASS | 0.85 |
| 12 | Lembrete: levar documento na escola | createNote | PASS | 0.85 |
| 13 | Acordo: limite de 2h de tela por dia | createAgreement | PASS | 0.75 |
| 14 | Futsal do Martim terca e quinta as 18h | createActivity | PASS | >= 0.7 |
| 15 | Quero trocar o dia 30 de marco | createSwapRequest | PASS | >= 0.7 |
| 16 | Martim dia 15 | null (ambiguous) | PASS | N/A |
| 17 | Consulta amanha | createAppointment | PASS | 0.75 |
| 18 | Evento sexta | createEvent | PASS | 0.8 |
| 19 | Gastei com remedio | createExpense (low) | PASS | 0.5 |
| 20 | Otto esta mal | createHealthLog | PASS | 0.85 |
| 21 | Faz aquilo | null | PASS | N/A |
| 22 | Resolve isso | null | PASS | N/A |
| 23 | Arruma o dia | null | PASS | N/A |
| 24 | Me ajuda | null | PASS | N/A |
| 25 | Ta bom | null | PASS | N/A |
| 26 | mano, marca um medico pro Martim amanha | createAppointment | PASS | >= 0.7 |
| 27 | gastei tipo uns 100 conto com remedio | createExpense | PASS | 0.9 |
| 28 | acho que ele fica comigo esse finde | null (too vague) | PASS | N/A |
| 29 | bota consulta dia 20 pro Otto | createAppointment | PASS | >= 0.7 |
| 30 | paguei 50 pila no uber do Martim | createExpense | PASS | 0.9 |
| 31 | Martinho (close but wrong name) | null | PASS | N/A |
| 32 | dia 32 de marco (invalid date) | empty string | PASS | N/A |
| 33 | "" (empty string) | null | PASS | N/A |
| 34 | consulta consulta consulta | createAppointment | PASS | 0.6 |
| 35 | R$ 0 reais em nada | null | PASS | N/A |
| 36 | Marca consulta e registra despesa de 50 | first match | PASS | varies |
| 37 | Martim tem febre e preciso marcar pediatra | createHealthLog | PASS | 0.85 |
| 38 | proxima terca-feira | valid Tuesday | PASS | N/A |
| 39 | dia 15 de abril de 2026 | 2026-04-15 | PASS | N/A |
| 40 | semana que vem | next Monday | PASS | N/A |

---

## Remaining Issues

1. **Multi-intent limitation**: The parser returns only the first matching intent. Test #36 ("Marca consulta e registra despesa de 50") only captures one action. Would require architectural change to return `ParsedIntent[]`.

2. **Custody/schedule inference**: Test #28 ("acho que ele fica comigo esse finde") is too ambiguous for regex. Correctly falls through to Groq.

3. **Description extraction could be cleaner**: Informal preprocessing leaves some artifacts in extracted descriptions (e.g., "reais" from slang conversion). Not incorrect but could be polished.

4. **No support for "meia-noite" / "meio-dia"**: Time parsing doesn't handle word-based times.

5. **No "ontem" (yesterday) support**: parseRelativeDate only handles future dates, which makes sense for the app's use case but could be relevant for health logs.
