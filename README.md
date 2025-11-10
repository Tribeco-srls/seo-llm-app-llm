
# SEO LLM – App con LLM integrato (strada facile)

Backend Express + frontend statico nello **stesso servizio** → niente CORS.
Analizza qualsiasi sito e genera **.docx** usando un **LLM** (OpenAI compatibile).

## Env richieste (Render → Environment Variables)
- `LLM_API_KEY` = la tua chiave (es. OpenAI)
- `LLM_MODEL` = `gpt-5.1` (o il tuo modello; default `gpt-4.1`)
- `LLM_BASE_URL` = `https://api.openai.com/v1` (default)
- `USE_REASONING` = `true` per modelli con ragionamento esteso

## Deploy
1) Carica questa cartella su GitHub
2) Render → New **Web Service** (Node)
   - Build: `npm install`
   - Start: `node server.js`
3) Imposta le env sopra. Apri `/health` per verifica.

## Uso
- Inserisci URL, (opzionale) Ragione sociale e Note
- Scegli pacchetto e documento (Offerta/Allegato/Deliverable)
- **Genera** → scarichi il `.docx` con formattazione Arial 11 e logo centrato (se `public/logo.png` esiste)

## Nota
Il server chiede all'LLM un **JSON strutturato** e poi costruisce il DOCX con lo stile richiesto (numeri in grassetto, sottoliste, capitoli separati).
