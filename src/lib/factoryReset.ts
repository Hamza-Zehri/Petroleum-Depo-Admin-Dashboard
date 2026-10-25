// Cloud factory reset.
//
// Wipes the shared Firestore depot data without touching the Firebase Auth
// account of the signed-in owner. The owner profile (`users/{ownerUid}`) and
// the one-time `settings/bootstrap_lock` document are deliberately kept so the
// dashboard remains usable and another account cannot claim ownership after a
// reset.
//
// Firestore has no client-side "delete collection" call, so each collection is
// paged (400 documents at a time) and deleted in write batches. Keeping the
// batch below the 500-write limit leaves room for future additions.
import { collection, doc, getDoc, getDocs, limit, query, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS } from "./types";

export interface FactoryResetProgress {
  collection: string;
  deleted: number;
  totalDeleted: number;
}

export interface FactoryResetResult {
  totalDeleted: number;
  perCollection: Record<string, number>;
}

interface ResetTarget {
  name: string;
  keepIds?: Set<string>;
}

// Operational data first, then master data, devices, audit trail, backups,
// other users and finally settings. If a later step fails the owner account and
// the lock are still intact, and the remaining collections can be retried.
const RESET_TARGETS: ResetTarget[] = [
  { name: COLLECTIONS.purchases },
  { name: COLLECTIONS.sales },
  { name: COLLECTIONS.customerPayments },
  { name: COLLECTIONS.supplierPayments },
  { name: COLLECTIONS.expenses },
  { name: COLLECTIONS.cashbook },
  { name: COLLECTIONS.stockLedger },
  { name: COLLECTIONS.tankDips },
  { name: COLLECTIONS.stockAdjustments },
  { name: COLLECTIONS.dailyClosings },
  { name: COLLECTIONS.receipts },
  { name: COLLECTIONS.auditLogs },
  { name: COLLECTIONS.devices },
  { name: COLLECTIONS.customers },
  { name: COLLECTIONS.suppliers },
  { name: COLLECTIONS.vehicles },
  { name: COLLECTIONS.tanks },
  { name: "backups" },
  { name: COLLECTIONS.users },
  { name: COLLECTIONS.settings },
];

/**
 * Deletes every document in `name` except the ids listed in `keepIds`.
 * Returns the number of deleted documents.
 */
export async function wipeCollection(
  name: string,
  keepIds: Set<string> = new Set(),
  onProgress?: (deleted: number) => void,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await getDocs(query(collection(db, name), limit(400)));
    if (snap.empty) break;

    const batch = writeBatch(db);
    let writes = 0;
    for (const d of snap.docs) {
      if (keepIds.has(d.id)) continue;
      batch.delete(d.ref);
      writes++;
    }

    // Only protected documents (the owner profile / bootstrap lock) remain.
    if (writes === 0) break;

    await batch.commit();
    deleted += writes;
    onProgress?.(deleted);

    // A short page means there was nothing left after this batch.
    if (snap.size < 400) break;
  }
  return deleted;
}

/**
 * Deletes all depot cloud data, keeping only the signed-in owner profile and
 * the bootstrap lock. Throws if a collection cannot be read or deleted (for
 * example when the caller is not the owner under the Firestore rules).
 */
export async function factoryResetCloudData(
  ownerUid: string,
  onProgress?: (p: FactoryResetProgress) => void,
): Promise<FactoryResetResult> {
  if (!ownerUid) throw new Error("Owner account is required");

  // Never start a destructive wipe unless the owner profile and lock are in a
  // known-good state. Both are preserved by the loop below.
  const ownerSnap = await getDoc(doc(db, COLLECTIONS.users, ownerUid));
  if (!ownerSnap.exists()) throw new Error("Owner profile not found");
  const lockSnap = await getDoc(doc(db, COLLECTIONS.settings, "bootstrap_lock"));
  if (!lockSnap.exists() || lockSnap.data()?.owner_uid !== ownerUid) {
    throw new Error("Owner lock does not belong to this account");
  }

  const targets: ResetTarget[] = RESET_TARGETS.map((target) => {
    if (target.name === COLLECTIONS.users) {
      return { name: target.name, keepIds: new Set([ownerUid]) };
    }
    if (target.name === COLLECTIONS.settings) {
      return { name: target.name, keepIds: new Set(["bootstrap_lock"]) };
    }
    return { name: target.name };
  });

  let totalDeleted = 0;
  const perCollection: Record<string, number> = {};

  for (const target of targets) {
    const deleted = await wipeCollection(
      target.name,
      target.keepIds,
      (count) => onProgress?.({
        collection: target.name,
        deleted: count,
        totalDeleted: totalDeleted + count,
      }),
    );
    perCollection[target.name] = deleted;
    totalDeleted += deleted;
  }

  const [ownerAfter, lockAfter] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.users, ownerUid)),
    getDoc(doc(db, COLLECTIONS.settings, "bootstrap_lock")),
  ]);
  if (!ownerAfter.exists() || !lockAfter.exists()) {
    throw new Error("Owner account or owner lock was not preserved");
  }

  return { totalDeleted, perCollection };
}
