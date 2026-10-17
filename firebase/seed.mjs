// ---------------------------------------------------------------------------
// Petroleum Depot — Firestore seed
//
// Writes the default depot `settings` documents (the same keys the Android app
// and the dashboard read) into the shared `petroleum-depot` Firestore project.
// It is idempotent: existing keys are left untouched unless FORCE=1.
//
// Auth: the script signs in with the owner's email/password through the
// Firebase Auth REST API and uses the returned ID token, so it respects the
// same security rules as the dashboard (no service-account key required).
//
// Usage (PowerShell):
//   $env:SEED_EMAIL="owner@example.com"
//   $env:SEED_PASSWORD="secret"
//   node firebase/seed.mjs
//
// Optional env:
//   FORCE=1                     overwrite existing keys
//   SEED_MASTER=1               also seed tanks/customers/suppliers from seed-data.json
// ---------------------------------------------------------------------------

const API_KEY =
  process.env.VITE_FIREBASE_API_KEY ?? "AIzaSyA2Xxz9r_wNfg9-zdncYHW5_iyNyqiXZvs";
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? "petroleum-depot";
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
const FORCE = process.env.FORCE === "1";

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const SETTINGS = {
  depot_name: "پٹرولیم ڈپو",
  depot_contact: "0300-0000000",
  depot_address: "لاہور، پاکستان",
  currency: "Rs",
  receipt_width: "80",
  business_day_start_hour: "6",
  low_stock_threshold: "20",
  petrol_rate: "0",
  diesel_rate: "0",
};

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  return { stringValue: String(v) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return fields;
}

async function signIn() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`sign-in failed: ${body?.error?.message ?? res.status}`);
  }
  return body.idToken;
}

async function docExists(token, collection, id) {
  const res = await fetch(`${BASE}/${collection}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function patchDoc(token, collection, id, data) {
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `${BASE}/${collection}/${encodeURIComponent(id)}?${mask}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`write ${collection}/${id} failed: ${res.status} ${body}`);
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Set SEED_EMAIL and SEED_PASSWORD env vars first.");
    process.exit(2);
  }
  const token = await signIn();
  console.log(`Signed in as ${EMAIL}`);

  let written = 0;
  for (const [key, value] of Object.entries(SETTINGS)) {
    const exists = await docExists(token, "settings", key);
    if (exists && !FORCE) {
      console.log(`  = settings/${key} exists (skipped)`);
      continue;
    }
    await patchDoc(token, "settings", key, { id: key, value });
    written++;
    console.log(`  + settings/${key} = ${value}`);
  }

  if (process.env.SEED_MASTER === "1") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = new URL("seed-data.json", import.meta.url);
    const raw = await readFile(fileURLToPath(path), "utf8");
    const data = JSON.parse(raw);
    for (const [collection, docs] of Object.entries(data)) {
      for (const doc of docs) {
        const id = doc.id;
        if (!id) continue;
        const exists = await docExists(token, collection, id);
        if (exists && !FORCE) continue;
        await patchDoc(token, collection, id, doc);
        written++;
      }
    }
  }

  console.log(`Done. ${written} document(s) written.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
