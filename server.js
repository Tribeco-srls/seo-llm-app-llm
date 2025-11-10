
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const {
  Document, Packer, Paragraph, HeadingLevel,
  TextRun, AlignmentType, ImageRun
} = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

// ====== CONFIG LLM ======
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const LLM_MODEL   = process.env.LLM_MODEL || 'gpt-4.1';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const USE_REASONING = /^true$/i.test(process.env.USE_REASONING || 'true');

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function buildHeaderLogoParagraph() {
  const logoPath = path.join(__dirname, 'public', 'logo.png');
  if (fs.existsSync(logoPath)) {
    const img = fs.readFileSync(logoPath);
    return new Paragraph({
      children: [new ImageRun({ data: img, transformation: { width: 240, height: 80 } })],
      alignment: AlignmentType.CENTER,
    });
  }
  return new Paragraph({ text: "" });
}

function p(text) { return new Paragraph({ children: [ new TextRun({ text }) ] }); }
function pBold(text) { return new Paragraph({ children: [ new TextRun({ text, bold: true }) ] }); }
function pTitle(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1 }); }
function pSubtitle(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2 }); }
function pNumberedBold(number, rest) { return new Paragraph({ children: [ new TextRun({ text: `${number} – `, bold: true }), new TextRun({ text: rest }) ] }); }

function makeDoc(children) {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
          paragraph: { spacing: { after: 120 } }
        }
      }
    },
    sections: [{ children }]
  });
}

async function analyzeSite(url) {
  const html = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (SEO-LLM Bot)' }
  }).then(r => r.data);

  const $ = cheerio.load(html);
  const title = ($('title').first().text() || '').trim();
  const description = ($('meta[name="description"]').attr('content') || '').trim();
  const h1 = $('h1').map((_, el) => $(el).text().trim()).get().slice(0, 5);
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10);
  const navTexts = $('nav a, .menu a, .main-navigation a, header a')
    .map((_, a) => $(a).text().trim()).get().filter(Boolean).slice(0, 20);

  return { url, title, description, h1, h2, navTexts };
}

async function callLLM_JSON(systemPrompt, userPrompt) {
  if (!LLM_API_KEY) throw new Error("LLM_API_KEY non impostata.");

  const body = {
    model: LLM_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  };
  if (USE_REASONING) body.reasoning = { effort: "high" };

  const resp = await axios.post(`${LLM_BASE_URL}/chat/completions`, body, {
    headers: { "Authorization": `Bearer ${LLM_API_KEY}`, "Content-Type": "application/json" },
    timeout: 60000
  });

  const txt = resp.data?.choices?.[0]?.message?.content || "";
  let json;
  try { json = JSON.parse(txt); } catch(e){ throw new Error("LLM: JSON non valido: " + txt.slice(0, 400)); }
  return json;
}

app.get('/health', (_, res) => res.json({ ok: true, model: LLM_MODEL, llm: !!LLM_API_KEY }));

app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL mancante' });
    res.json(await analyzeSite(url));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

function buildOffertaPrompt({ company, site, analysis, mode, notes }) {
  const sectorHint = analysis?.navTexts?.slice(0,8).join(" • ");
  return `Sei un consulente esperto di SEO tradizionale e SEO per LLM.
Obiettivo: creare l'OFFERTA iniziale perfetta per l'azienda target, in stile professionale, zero fronzoli.

DATI DI CONTESTO
- Azienda: ${company || '(da inferire)'}
- Sito: ${site}
- Title: ${analysis?.title || '-'}
- Description: ${analysis?.description || '-'}
- H1: ${(analysis?.h1 || []).join(' | ')}
- Menu/Servizi: ${sectorHint || '-'}
- Note/Priorità del cliente: ${notes || '-'}
- Tipologia pacchetto: ${mode === 'hospitality' ? 'Ospitalità (3 mesi)' : 'B2B (6 mesi)'}

CONSEGNA
Restituisci SOLO JSON con questo schema:
{
 "company": "string",
 "objectives": ["...","...","...","..."],
 "activities": {
   "A": "Audit iniziale del sito: ... (quantità in battute / pagine)",
   "B": "Ottimizzazione contenuti chiave: ... (quantità)",
   "C": ["n. 3 pagine guida (pillar)...", "n. 1 glossario ...", "n. 10 FAQ ..."],
   "D": ["n. 2 case study ...", "n. 1 white paper ..."],
   "E": ["n. 2 articoli blog ...", "n. 4 post LinkedIn ...", "n. 1 newsletter ..."],
   "F": ["n. 1 LLM Query Pack ...", "n. 1 Optimization Report ..."]
 },
 "roadmap": {
   "mese1": "1 audit, 3 testi servizi/prodotto, sitemap ottimizzata",
   "mese2_3": "1 pillar/mese, glossario tecnico, 10 FAQ",
   "mese4_5": "1 pillar, 2 case study, 1 white paper, 1 articolo blog, 2 post LinkedIn, 1 newsletter",
   "mese6": "1 articolo blog, 2 post LinkedIn, LLM Query Pack, Optimization Report"
 },
 "notes": [
   "Tutti i contenuti sono consegnati mese per mese con istruzioni operative precise di caricamento.",
   "Caricamento a cura del webmaster del Cliente (su richiesta possiamo includerlo)."
 ]
}

REGOLE STILISTICHE
- Le quantità DEVONO essere esplicite (battute/pagine/numero pezzi).
- Mantieni coerenza con il settore dedotto dal sito (esempi concreti).
- Non promettere garanzie di risultato; concentrati su deliverable e qualità.
- Se il sito è solo italiano, non introdurre mercati esteri.`;
}

function buildDeliverablesPrompt({ company, site, analysis, mode, month, notes }) {
  const sectorHint = analysis?.navTexts?.slice(0,8).join(" • ");
  return `Sei un consulente SEO/LLM. Crea il pacchetto DELIVERABLE del mese richiesto per il cliente.

DATI
- Azienda: ${company || '(da inferire)'}  — Sito: ${site}
- H1: ${(analysis?.h1 || []).join(' | ')} — Menu: ${sectorHint || '-'}
- Piano: ${mode === 'hospitality' ? 'Ospitalità (3 mesi)' : 'B2B (6 mesi)'}
- Mese richiesto: ${month}
- Note del cliente: ${notes || '-'}

CONSEGNA
Rispondi SOLO JSON con schema:
{
 "title": "Mese X — ...",
 "items": ["...", "...", "..."],
 "guidelines": ["...", "...", "..."]
}
Regole: quantità esplicite, tono tecnico-chiaro, niente promesse, settore coerente.`;
}

function renderOffertaDoc(json, companyLabel) {
  const children = [];
  children.push(buildHeaderLogoParagraph());
  children.push(pTitle(`SERVIZIO OTTIMIZZAZIONE PER AI - PIANO COMPLETO`));
  children.push(pSubtitle(`OBIETTIVI PRINCIPALI – SERVIZIO PER ${json.company || companyLabel}`));
  children.push(p(""));
  (json.objectives || []).forEach((obj, idx) => {
    const n = String(idx+1);
    children.push(new Paragraph({ children: [ new TextRun({ text: `${n} – `, bold: true }), new TextRun({ text: obj }) ] }));
  });
  children.push(p(""));
  children.push(pSubtitle(`ATTIVITÀ PREVISTE - COSA PRODURREMO PER VOI`));
  if (typeof json.activities?.A === 'string') children.push(p(`A - ${json.activities.A}`));
  if (typeof json.activities?.B === 'string') children.push(p(`B - ${json.activities.B}`));
  if (Array.isArray(json.activities?.C)) { children.push(p(`C - Creazione contenuti guida:`)); json.activities.C.forEach(s => children.push(p(`• ${s}`))); }
  if (Array.isArray(json.activities?.D)) { children.push(p(`D - Contenuti di autorevolezza:`)); json.activities.D.forEach(s => children.push(p(`• ${s}`))); }
  if (Array.isArray(json.activities?.E)) { children.push(p(`E - Distribuzione:`)); json.activities.E.forEach(s => children.push(p(`• ${s}`))); }
  if (Array.isArray(json.activities?.F)) { children.push(p(`F - Monitoraggio & ottimizzazione:`)); json.activities.F.forEach(s => children.push(p(`• ${s}`))); }
  children.push(p(""));
  children.push(pSubtitle(`TEMPISTICHE - ROADMAP DI SEI MESI`));
  if (json.roadmap?.mese1) children.push(pBold(`Mese 1 → ${json.roadmap.mese1}`));
  if (json.roadmap?.mese2_3) children.push(pBold(`Mese 2–3 → ${json.roadmap.mese2_3}`));
  if (json.roadmap?.mese4_5) children.push(pBold(`Mese 4–5 → ${json.roadmap.mese4_5}`));
  if (json.roadmap?.mese6) children.push(pBold(`Mese 6 → ${json.roadmap.mese6}`));
  children.push(p(""));
  (json.notes || []).forEach(n => children.push(p(n)));
  const doc = makeDoc(children);
  return Packer.toBuffer(doc);
}

function renderDeliverablesDoc(json, companyLabel, month) {
  const children = [];
  children.push(buildHeaderLogoParagraph());
  children.push(pTitle(`DELIVERABLE — ${json.title || ('Mese ' + month)}`));
  children.push(pBold(`Cliente: ${companyLabel}`));
  children.push(p(""));
  (json.items || []).forEach(it => children.push(p(`• ${it}`)));
  children.push(p(""));
  if (Array.isArray(json.guidelines) && json.guidelines.length) {
    children.push(pSubtitle("Linee guida operative"));
    json.guidelines.forEach(g => children.push(p(`• ${g}`)));
  }
  const doc = makeDoc(children);
  return Packer.toBuffer(doc);
}

app.post('/api/llm/offerta', async (req, res) => {
  try {
    const { site, company = "", mode = "b2b", notes = "" } = req.body || {};
    if (!site) return res.status(400).json({ error: 'site obbligatorio' });
    const analysis = await analyzeSite(site);
    const system = "Sei un consulente senior di SEO e SEO per LLM. Segui rigorosamente istruzioni e formato.";
    const user = buildOffertaPrompt({ company, site, analysis, mode, notes });
    const json = await callLLM_JSON(system, user);
    const companyLabel = company || (analysis.h1?.[0] || new URL(site).hostname);
    const buffer = await renderOffertaDoc(json, companyLabel);
    const fname = `Offerta_${companyLabel.replace(/\W+/g,"_")}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/llm/allegato-a', async (req, res) => {
  try {
    const { site, company = "", notes = "" } = req.body || {};
    if (!site) return res.status(400).json({ error: 'site obbligatorio' });
    const analysis = await analyzeSite(site);
    const system = "Sei un consulente senior di SEO/LLM. Crea Allegato A (6 mesi) con quantità esplicite, tono tecnico.";
    const user = buildOffertaPrompt({ company, site, analysis, mode: 'b2b', notes });
    const json = await callLLM_JSON(system, user);
    const companyLabel = company || (analysis.h1?.[0] || new URL(site).hostname);
    const buffer = await renderOffertaDoc(json, companyLabel);
    const fname = `Allegato_A_${companyLabel.replace(/\W+/g,"_")}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/llm/deliverables', async (req, res) => {
  try {
    const { site, company = "", mode = "b2b", month = 1, notes = "" } = req.body || {};
    if (!site) return res.status(400).json({ error: 'site obbligatorio' });
    const m = Number(month) || 1;
    const analysis = await analyzeSite(site);
    const system = "Sei un consulente SEO/LLM. Produci il pacchetto di deliverable del mese richiesto, con quantità e istruzioni di caricamento.";
    const user = buildDeliverablesPrompt({ company, site, analysis, mode, month: m, notes });
    const json = await callLLM_JSON(system, user);
    const companyLabel = company || (analysis.h1?.[0] || new URL(site).hostname);
    const buffer = await renderDeliverablesDoc(json, companyLabel, m);
    const fname = `Deliverable_Mese_${m}_${companyLabel.replace(/\W+/g,"_")}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server up on http://localhost:${PORT}, LLM=${LLM_MODEL}`));
