
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "data.json");

const errors = [];
const warnings = [];
const checks = [];

function error(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function check(condition, message) {
  if (condition) {
    checks.push(message);
  } else {
    error(message);
  }
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

function main() {
  console.log("\nTVAD – Datenqualitätsprüfung");
  console.log("============================\n");

  if (!fs.existsSync(DATA_PATH)) {
    error("data/data.json wurde nicht gefunden.");
    return report();
  }

  let data;

  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    check(true, "JSON-Datei ist syntaktisch gültig.");
  } catch (e) {
    error("JSON-Datei ist fehlerhaft: " + e.message);
    return report();
  }

  const collections = [
    "sources",
    "entities",
    "donations",
    "awards",
    "lobbying",
    "ownership",
    "relationships"
  ];

  for (const name of collections) {
    check(
      Array.isArray(data[name]),
      name + " ist als Datenliste vorhanden."
    );
  }

  if (errors.length > 0) {
    return report();
  }

  const ids = {};

  for (const name of collections) {
    ids[name] = new Set();

    for (const record of data[name]) {
      if (!isObject(record)) {
        error(name + ": Ein Datensatz ist kein Objekt.");
        continue;
      }

      if (!isNonEmptyString(record.id)) {
        error(name + ": Ein Datensatz hat keine gültige ID.");
        continue;
      }

      if (ids[name].has(record.id)) {
        error(name + ": Doppelte ID " + record.id);
      }

      ids[name].add(record.id);
    }
  }

  const sourceIds = ids.sources;
  const entityIds = ids.entities;

  function validateSourceReferences(record, label) {
    let references = [];

    if (typeof record.source_id === "string") {
      references.push(record.source_id);
    }

    if (Array.isArray(record.source_ids)) {
      references.push(...record.source_ids);
    }

    for (const id of references) {
      if (!sourceIds.has(id)) {
        error(label + ": Unbekannte Quellen-ID " + id);
      }
    }

    if (references.length === 0) {
      warn(label + ": Keine Quellenreferenz vorhanden.");
    }
  }

  const entityReferenceFields = [
    "entity_id",
    "donor_entity_id",
    "recipient_entity_id",
    "contractor_entity_id",
    "supplier_entity_id",
    "owner_entity_id",
    "owned_entity_id",
    "from_entity_id",
    "to_entity_id"
  ];

  for (const name of collections) {
    for (const record of data[name]) {
      if (!isObject(record)) continue;

      validateSourceReferences(
        record,
        name + "/" + record.id
      );

      for (const field of entityReferenceFields) {
        const value = record[field];

        if (
          typeof value === "string" &&
          value.trim() !== "" &&
          !entityIds.has(value)
        ) {
          error(
            name + "/" + record.id +
            ": Unbekannte Entity-Referenz in " + field +
            ": " + value
          );
        }
      }
    }
  }

  // Quellenqualität
  for (const source of data.sources) {
    if (!isNonEmptyString(source.url)) {
      warn("Quelle " + source.id + ": URL fehlt.");
    }

    if (
      source.retrieved_at === null ||
      !isNonEmptyString(source.retrieved_at)
    ) {
      warn(
        "Quelle " + source.id +
        ": Abrufzeitpunkt retrieved_at fehlt."
      );
    }
  }

  // Beleglage bei Beziehungen
  for (const relationship of data.relationships) {
    if (
      !Array.isArray(relationship.source_ids) ||
      relationship.source_ids.length === 0
    ) {
      warn(
        "Beziehung " + relationship.id +
        ": Kein Quellenbeleg hinterlegt."
      );
    }

    if (!isNonEmptyString(relationship.notes)) {
      warn(
        "Beziehung " + relationship.id +
        ": Erläuterung fehlt."
      );
    }
  }

  // Vergabedaten: Angebotswert und Rahmenwert
  // dürfen nicht mit tatsächlichen Ausgaben verwechselt werden.
  for (const award of data.awards) {
    const hasOfferValue =
      typeof award.offer_value_eur === "number";

    const hasFrameworkValue =
      typeof award.framework_max_value_eur === "number";

    const hasContractValue =
      typeof award.contract_value_eur === "number";

    if (hasOfferValue && hasContractValue) {
      if (award.offer_value_eur !== award.contract_value_eur) {
        warn(
          "Vergabe " + award.id +
          ": Angebotswert und Vertragswert unterscheiden sich. " +
          "Bitte getrennt darstellen."
        );
      }
    }

    if (hasFrameworkValue && !hasContractValue) {
      warn(
        "Vergabe " + award.id +
        ": Rahmenhöchstwert vorhanden, tatsächlicher Vertragswert fehlt."
      );
    }
  }

  // Plausibilitätsprüfung von Geldbeträgen
  for (const name of ["donations", "awards", "lobbying"]) {
    for (const record of data[name]) {
      for (const [field, value] of Object.entries(record)) {
        if (
          field.endsWith("_eur") &&
          typeof value === "number" &&
          value < 0
        ) {
          error(
            name + "/" + record.id +
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

  console.log("\nErfolgreiche Prüfungen: " + checks.length);
  console.log("Fehler: " + errors.length);
  console.log("Warnungen: " + warnings.length);

  if (warnings.length > 0) {
    console.log("\nWARNUNGEN:");

    for (const message of warnings) {
      console.log("- " + message);
    }
  }

  if (errors.length > 0) {
    console.log("\nFEHLER:");

    for (const message of errors) {
      console.log("- " + message);
    }

    console.log("\nPRÜFUNG NICHT BESTANDEN.");
    process.exitCode = 1;
  } else {
    console.log("\nSTRUKTURELLE PRÜFUNG BESTANDEN.");
  }

  console.log(
    "\nHinweis: Diese Prüfung ersetzt keine " +
    "inhaltliche Überprüfung der Originalquellen."
  );
}

main();
