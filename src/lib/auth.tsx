// Authentication + role-based access control.
//
// Uses Firebase Auth (email + password). The user's role lives in the shared
// `users/{uid}` Firestore document (same collection the phone app uses), not in
// the client, so permissions cannot be forged by editing browser state.
//
// Two ways an account becomes the depot OWNER:
//   1. First-run bootstrap  — create a brand new Auth account + owner profile.
//   2. Claim ownership      — an account you created in the Firebase console
//                             signs in, and (only while no owner exists yet)
//                             writes its own `users/{uid}` owner profile.
// Both paths also write the one-time `settings/bootstrap_lock` lock in the same
// atomic batch, so exactly one owner can ever exist.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut as fbSignOut, type User as FbUser,
} from "firebase/auth";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { auth, db, OWNER_UID } from "./firebase";
import { COLLECTIONS, type Role } from "./types";

export interface SessionUser {
  uid: string;
  email: string | null;
  fullName: string;
  role: Role;
}

interface AuthCtx {
  ready: boolean;
  user: SessionUser | null;
  /** Signed in, but no `users/{uid}` profile document exists yet. */
  profileMissing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrapOwner: (email: string, password: string, fullName: string) => Promise<void>;
  claimOwner: (fullName: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function loadSession(
  fb: FbUser,
): Promise<{ user: SessionUser; profileMissing: boolean }> {
  const snap = await getDoc(doc(db, COLLECTIONS.users, fb.uid));
  const data = snap.data() as { full_name?: string; role?: Role } | undefined;
  return {
    user: {
      uid: fb.uid,
      email: fb.email,
      fullName: data?.full_name ?? fb.displayName ?? fb.email ?? "User",
      role: (data?.role as Role) ?? "operator",
    },
    profileMissing: !snap.exists(),
  };
}

function writeBatchOwner(uid: string, username: string, fullName: string) {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTIONS.users, uid), {
    id: uid,
    username,
    full_name: fullName || "مالک",
    role: "owner",
    active: true,
    created_at: now,
    updated_at: now,
    version: 1,
    sync_status: "synced",
    _createdBy: uid,
  });
  // The lock may only be created while it does not yet exist (security rules),
  // so a second owner can never claim the depot.
  batch.set(doc(db, COLLECTIONS.settings, "bootstrap_lock"), {
    id: "bootstrap_lock",
    value: uid,
    owner_uid: uid,
    created_at: now,
  });
  return batch;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fb) => {
      if (fb) {
        try {
          const { user: session, profileMissing: missing } = await loadSession(fb);
          if (missing && fb.uid === OWNER_UID) {
            // Configured owner account: provision its owner profile + lock now.
            try {
              await writeBatchOwner(fb.uid, fb.email ?? "مالک", "ڈپو مالک").commit();
              setUser({ uid: fb.uid, email: fb.email, fullName: "ڈپو مالک", role: "owner" });
              setProfileMissing(false);
            } catch {
              setUser(session);
              setProfileMissing(true);
            }
          } else {
            setUser(session);
            setProfileMissing(missing);
          }
        } catch {
          setUser({ uid: fb.uid, email: fb.email, fullName: fb.email ?? "User", role: "operator" });
          setProfileMissing(true);
        }
      } else {
        setUser(null);
        setProfileMissing(false);
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const logout = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  // First-run bootstrap: creates the Auth account AND its owner profile.
  const bootstrapOwner = useCallback(async (email: string, password: string, fullName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const name = fullName.trim() || "مالک";
    await writeBatchOwner(cred.user.uid, email.trim(), fullName.trim()).commit();
    setUser({ uid: cred.user.uid, email: cred.user.email, fullName: name, role: "owner" });
    setProfileMissing(false);
  }, []);

  // Claim: turns an existing (console-created) Auth account into the owner when
  // the depot has no owner yet. Fails harmlessly once an owner exists.
  const claimOwner = useCallback(async (fullName: string) => {
    const fb = auth.currentUser;
    if (!fb) throw new Error("پہلے لاگ ان کریں");
    const name = fullName.trim() || fb.email || "مالک";
    await writeBatchOwner(fb.uid, fb.email ?? name, name).commit();
    setUser({ uid: fb.uid, email: fb.email, fullName: name, role: "owner" });
    setProfileMissing(false);
  }, []);

  const value = useMemo(
    () => ({ ready, user, profileMissing, login, logout, bootstrapOwner, claimOwner }),
    [ready, user, profileMissing, login, logout, bootstrapOwner, claimOwner],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
