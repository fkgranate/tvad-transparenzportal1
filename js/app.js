
(async function () {
"use strict";

const $ = id => document.getElementById(id);

const money = n => new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
}).format(n);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

try {
  const response = await fetch("data/data.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("data/data.json konnte nicht geladen werden (HTTP " + response.status + ").");
  }

  const d = await response.json();

  const entityMap = new Map(
    d.entities.map(e => [e.entity_id, e])
  );

  const sourceMap = new Map(
    d.sources.map(s => [s.source_id, s])
  );

  const name = id =>
    entityMap.get(id)?.name || ("Unbekannte ID: " + id);

  const sourceLink = ids => {
    if (!Array.isArray(ids) || !ids.length) return "—";

    return ids.map(id => {
      const s = sourceMap.get(id);
      if (!s) return "Unbekannte Quelle: " + esc(id);

      return `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)} ↗</a>`;
    }).join("<br>");
  };

  $("countDonations").textContent = d.donations.length;
  $("countAwards").textContent = d.awards.length;
  $("countLobby").textContent = d.lobbying.length;
  $("countLinks").textContent = d.relationships.length;

  $("donationRows").innerHTML = d.donations
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(x => `
      <tr data-search="${esc((
        name(x.donor_entity_id) + " " +
        name(x.recipient_entity_id) + " " +
        x.date
      ).toLowerCase())}">
        <td>${esc(x.date)}</td>
        <td>${esc(name(x.donor_entity_id))}</td>
        <td>${esc(name(x.recipient_entity_id))}</td>
        <td>${money(x.amount_eur)}</td>
        <td>${sourceLink(x.source_ids)}</td>
      </tr>
    `).join("");

  $("awardRows").innerHTML = d.awards.map(x => {
  const subcontractors = d.relationships.filter(r =>
  r.relationship_type === "subcontractor" &&
  r.to_entity_id === x.supplier_entity_id &&
  r.lot_id === x.lot_id
);

const subcontractorText = subcontractors.length
  ? subcontractors.map(r =>
      `${esc(name(r.from_entity_id))}: als Unterauftragnehmer für ${esc(r.lot_id)} dokumentiert. Unterauftragswert nicht veröffentlicht.`
    ).join("<br>")
  : "Kein Unterauftragnehmer für dieses Los dokumentiert.";

    const subcontractorText = subcontractors.length
      ? subcontractors.map(r =>
          `${esc(name(r.from_entity_id))}: im Verfahren als Unterauftragnehmer dokumentiert. Loszuordnung und Unterauftragswert sind nicht separat ausgewiesen.`
        ).join("<br>")
      : "Kein Unterauftragnehmer für dieses Verfahren in den Daten dokumentiert.";

    return `
      <tr>
        <td>${esc(x.lot_id || "—")}</td>
        <td>${esc(name(x.supplier_entity_id))}</td>
        <td>${esc(x.contract_date || "—")}</td>
        <td>${x.offer_value_eur == null ? "Nicht angegeben" : money(x.offer_value_eur)}</td>
        <td>${x.framework_max_value_eur == null ? "Nicht angegeben" : money(x.framework_max_value_eur)}</td>
        <td>${subcontractorText}</td>
      </tr>
    `;
  }).join("");

  $("lobbyRows").innerHTML = d.lobbying.map(x => `
    <tr>
      <td>${esc(name(x.entity_id))}</td>
      <td>${esc(x.register_id)}</td>
      <td>${esc(x.reporting_year ?? "—")}</td>
      <td>
        ${x.expenses_min_eur == null
          ? "Nicht angegeben"
          : money(x.expenses_min_eur) + " – " + money(x.expenses_max_eur)}
      </td>
      <td>${esc(x.fte ?? "—")}</td>
      <td>${sourceLink(x.source_ids)}</td>
    </tr>
  `).join("");

  $("relationshipRows").innerHTML = d.relationships.map(x => `
    <article class="panel">
      <strong>
        ${esc(name(x.from_entity_id))}
        → ${esc(name(x.to_entity_id))}
      </strong>
      <p>
        <span class="pill">${esc(x.evidence_status)}</span>
        ${esc(x.relationship_type)}
      </p>
      <p>${esc(x.notes || "Keine zusätzliche Erläuterung.")}</p>
      <p>${sourceLink(x.source_ids)}</p>
    </article>
  `).join("");

  $("sourceRows").innerHTML = d.sources.map(s => `
    <article class="panel">
      <strong>${esc(s.title)}</strong>
      <p>${esc(s.publisher)}</p>
      <p>
        <a href="${esc(s.url)}" target="_blank" rel="noopener">
          Primärquelle öffnen ↗
        </a>
      </p>
      <p class="small">${esc(s.notes || "")}</p>
      <p class="small">
        Abrufdatum: ${esc(s.retrieved_at || "Nicht dokumentiert")}
      </p>
    </article>
  `).join("");

  $("status").textContent =
    `Daten geladen: ${d.donations.length} Spenden, ` +
    `${d.awards.length} Vergabelose, ` +
    `${d.lobbying.length} Lobbyregistereinträge. ` +
    `Datenstand ${d.generated_at}. Teilbestand, keine Vollerhebung.`;

  $("donationSearch").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();

    document.querySelectorAll("#donationRows tr").forEach(r => {
      r.hidden = !r.dataset.search.includes(q);
    });
  });

  document.querySelectorAll(".tab").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x =>
        x.classList.toggle("active", x === b)
      );

      document.querySelectorAll(".section").forEach(s =>
        s.classList.toggle("active", s.id === b.dataset.tab)
      );
    });
  });

} catch (err) {
  $("status").textContent =
    "FEHLER: " + err.message +
    " Prüfe Dateipfad und GitHub-Pages-Bereitstellung.";
}
})();
