
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "data.json");

const errors = [];
const warnings = [];
const checks = [];

function check(condition, message) {
  if (condition) checks.push(message);
  else errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" &&
    value.trim().length > 0;
}

const idFields = {
  sources: "source_id",
  entities: "entity_id",
  donations: "record_id",
  awards: "record_id",
  lobbying: "record_id",
  ownership: "record_id",
  relationships: "relationship_id"
};

const collections = Object.keys(idFields);

function main() {
  console.log("\nTVAD – Datenqualitätsprüfung");
  console.log("============================");

  if (!fs.existsSync(DATA_PATH)) {
    errors.push("data/data.json wurde nicht gefunden.");
    return report();
  }

  let data;

  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    checks.push("JSON-Datei ist syntaktisch gültig.");
  } catch (e) {
    errors.push("JSON-Fehler: " + e.message);
    return report();
  }

  for (const name of collections) {
    check(
      Array.isArray(data[name]),
      name + " ist als Datenliste vorhanden."
    );
  }

  if (errors.length) return report();

  const ids = {};

  for (const name of collections) {
    ids[name] = new Set();
    const idField = idFields[name];

    for (const record of data[name]) {
      if (!isObject(record)) {
        errors.push(name + ": Datensatz ist kein Objekt.");
        continue;
      }

      const id = record[idField];

      if (!isNonEmptyString(id)) {
        errors.push(
          name + ": ID-Feld " + idField + " fehlt oder ist ungültig."
        );
        continue;
      }

      if (ids[name].has(id)) {
        errors.push(name + ": Doppelte ID " + id);
      }

      ids[name].add(id);
    }
  }

  const sourceIds = ids.sources;
  const entityIds = ids.entities;

  function validateSources(record, label) {
    const refs = [];

    if (typeof record.source_id === "string") {
      refs.push(record.source_id);
    }

    if (Array.isArray(record.source_ids)) {
      refs.push(...record.source_ids);
    }

    for (const id of refs) {
      if (!sourceIds.has(id)) {
        errors.push(label + ": Unbekannte Quellen-ID " + id);
      }
    }

    if (!refs.length) {
      warn(label + ": Keine Quellenreferenz vorhanden.");
    }
  }

  const entityFields = [
    "entity_id",
    "donor_entity_id",
    "recipient_entity_id",
    "supplier_entity_id",
    "contractor_entity_id",
    "contracting_authority_id",
    "owner_entity_id",
    "owned_entity_id",
    "from_entity_id",
    "to_entity_id"
  ];

  for (const name of collections) {
    for (const record of data[name]) {
      if (!isObject(record)) continue;

      const id = record[idFields[name]] || "unbekannt";
      const label = name + "/" + id;

      validateSources(record, label);

      for (const field of entityFields) {
        const value = record[field];

        if (
          typeof value === "string" &&
          value.trim() &&
          !entityIds.has(value)
        ) {
          errors.push(
            label + ": Unbekannte Entity-ID in " +
            field + ": " + value
          );
        }
      }
    }
  }

  for (const source of data.sources) {
    if (!isNonEmptyString(source.url)) {
      warn("Quelle " + source.source_id + ": URL fehlt.");
    }

    if (!isNonEmptyString(source.retrieved_at)) {
      warn(
        "Quelle " + source.source_id +
        ": Abrufdatum nicht dokumentiert."
      );
    }
  }

  for (const relationship of data.relationships) {
    if (!isNonEmptyString(relationship.notes)) {
      warn(
        "Beziehung " + relationship.relationship_id +
        ": Erläuterung fehlt."
      );
    }

    if (!isNonEmptyString(relationship.evidence_status)) {
      warn(
        "Beziehung " + relationship.relationship_id +
        ": Belegstatus fehlt."
      );
    }
  }

  for (const award of data.awards) {
    if (
      typeof award.framework_max_value_eur === "number" &&
      typeof award.contract_value_eur !== "number"
    ) {
      warn(
        "Vergabe " + award.record_id +
        ": Rahmenhöchstwert ist kein tatsächlicher Vertragswert."
      );
    }
  }

  for (const name of ["donations", "awards", "lobbying"]) {
    for (const record of data[name]) {
      for (const [field, value] of Object.entries(record)) {
        if (
          field.endsWith("_eur") &&
          typeof value === "number" &&
          value < 0
        ) {
          errors.push(
            name + "/" + record[idFields[name]] +
            ": Negativer Geldbetrag in " + field
          );
        }
      }
    }
  }

  report();
}

function report() {
  console.log("\nERGEBNIS");
  console.log("========");
  console.log("Erfolgreiche Prüfungen: " + checks.length);
  console.log("Fehler: " + errors.length);
  console.log("Warnungen: " + warnings.length);

  if (warnings.length) {
    console.log("\nWARNUNGEN:");
    warnings.forEach(x => console.log("- " + x));
  }

  if (errors.length) {
    console.log("\nFEHLER:");
    errors.forEach(x => console.log("- " + x));
    console.log("\nPRÜFUNG NICHT BESTANDEN.");
    process.exitCode = 1;
  } else {
    console.log("\nSTRUKTURELLE PRÜFUNG BESTANDEN.");
  }

  console.log(
    "\nHinweis: Die Prüfung ersetzt keine inhaltliche " +
    "Überprüfung der Originalquellen."
  );
}

main();
