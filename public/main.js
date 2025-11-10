
const $ = (sel) => document.querySelector(sel);

function setSpinner(on) { $("#spinner").style.display = on ? "inline-block" : "none"; }
function showMsg(text, type="info") { const el = $("#msg"); el.textContent = text; el.style.color = type === "error" ? "#c00" : "#111"; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function fillMonths() { const mode = $("#mode").value; const sel = $("#month"); sel.innerHTML = ""; const max = mode === "hospitality" ? 3 : 6; for (let i = 1; i <= max; i++) { const opt = document.createElement("option"); opt.value = i; opt.textContent = i; sel.appendChild(opt); } $("#monthBox").style.display = $("#doctype").value === "deliverables" ? "block" : "none"; }
$("#mode").addEventListener("change", fillMonths);
$("#doctype").addEventListener("change", fillMonths);
fillMonths();

$("#btnGenerate").addEventListener("click", async () => {
  const site = $("#siteUrl").value.trim();
  const company = $("#company").value.trim();
  const mode = $("#mode").value;
  const doctype = $("#doctype").value;
  const month = $("#month").value;
  const notes = $("#notes").value.trim();
  if (!site) { showMsg("Inserisci l'URL del cliente"); return; }

  setSpinner(true); showMsg("");
  try {
    const health = await fetch("/health", { cache: "no-store" }).then(r => r.json());
    if (!health.ok) throw new Error("Backend non raggiungibile");

    const body = JSON.stringify({ site, company, mode, month, notes });
    let path = "/api/llm/offerta";
    if (doctype === "allegatoA") path = "/api/llm/allegato-a";
    if (doctype === "deliverables") path = "/api/llm/deliverables";

    const resp = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!resp.ok) { const t = await resp.text(); throw new Error(`Errore: ${resp.status} – ${t}`); }
    const blob = await resp.blob();
    const fname =
      doctype === "offerta" ? `Offerta_${new URL(site).hostname}.docx` :
      doctype === "allegatoA" ? `Allegato_A_${new URL(site).hostname}.docx` :
      `Deliverable_Mese_${month}_${new URL(site).hostname}.docx`;

    downloadBlob(blob, fname);
    showMsg("Documento generato.");
  } catch (e) {
    console.error(e);
    showMsg(e.message, "error");
  } finally { setSpinner(false); }
});
