"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  auth,
  db,
  googleProvider,
  isFirebaseConfigured,
} from "../lib/firebase";

export type CustomerProfile = {
  uid: string;
  email: string;
  displayName?: string;
  phone?: string;
  address?: string;
  customerType?: "individual" | "retailer" | "wholesaler" | "other";
  /**
   * Set once the customer has entered the code we emailed them. Google
   * sign-ins are trusted via the provider instead — see `isEmailVerified`.
   */
  emailVerified?: boolean;
};

type RegisterPayload = {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
};

type CustomerAuthContextType = {
  user: FirebaseUser | null;
  profile: CustomerProfile | null;
  loading: boolean;
  error: string | null;
  /**
   * True when the signed-in customer's email address is confirmed, by either
   * their identity provider or our own emailed code. False while unknown, so
   * callers fail closed.
   */
  isEmailVerified: boolean;
  login: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateCustomerProfile: (payload: Partial<CustomerProfile>) => Promise<void>;
  /** Mail a fresh code to the signed-in customer. */
  sendVerificationEmail: () => Promise<SendVerificationResult>;
  /** Submit the emailed code; refreshes the profile on success. */
  confirmEmailCode: (code: string) => Promise<void>;
  clearError: () => void;
};

export type SendVerificationResult = {
  alreadyVerified?: boolean;
  email?: string;
  expiryMinutes?: number;
};

const CustomerAuthContext = createContext<CustomerAuthContextType | null>(null);

/**
 * Make sure the signed-in user has a `users` and a `customers` document.
 *
 * Runs on every Google sign-in and on registration, so it must be safe to call
 * repeatedly. Two rules keep it that way:
 *
 * 1. Only fields the caller actually knows are written. A Google sign-in knows
 *    nothing about phone or address, and `{ merge: true }` still overwrites any
 *    field present in the payload — so sending `phone: ""` erased the number the
 *    customer had saved on their profile page, forcing them to type it in again
 *    after every login.
 * 2. Defaults and running totals are only written when the document does not
 *    exist. Re-sending `totalSpent: 0` on a repeat sign-in reset the customer's
 *    purchase history, and re-sending `createdAt` lost their join date.
 */
async function upsertCustomerDocuments(
  user: FirebaseUser,
  profile?: Partial<CustomerProfile>,
) {
  if (!db) return;

  const userDocRef = doc(db, "users", user.uid);
  const customerDocRef = doc(db, "customers", user.uid);

  const [userSnap, customerSnap] = await Promise.all([
    getDoc(userDocRef),
    getDoc(customerDocRef),
  ]);

  // Blank strings count as "unknown", not as "clear this field". Clearing is
  // done deliberately through updateCustomerProfile instead.
  const known: Partial<CustomerProfile> = {};
  const name = profile?.displayName?.trim() || user.displayName?.trim();
  if (name) known.displayName = name;
  if (profile?.phone?.trim()) known.phone = profile.phone.trim();
  if (profile?.address?.trim()) known.address = profile.address.trim();
  if (profile?.customerType) known.customerType = profile.customerType;

  const identity = {
    uid: user.uid,
    email: user.email || "",
    updatedAt: serverTimestamp(),
  };

  const firstTimeDefaults = {
    displayName: "Customer",
    phone: "",
    address: "",
    customerType: "individual" as const,
  };

  await setDoc(
    userDocRef,
    {
      ...(userSnap.exists()
        ? {}
        : { ...firstTimeDefaults, createdAt: serverTimestamp() }),
      ...identity,
      ...known,
      role: "customer",
    },
    { merge: true },
  );

  await setDoc(
    customerDocRef,
    {
      ...(customerSnap.exists()
        ? {}
        : {
            ...firstTimeDefaults,
            totalPurchases: 0,
            totalSpent: 0,
            receivables: 0,
            customerSource: "online", // Mark as online customer
            createdAt: serverTimestamp(),
          }),
      ...identity,
      ...known,
      // Safe to re-assert: it only ever goes from unset to true, and the POS
      // customer list uses it to spot shoppers who have a web account.
      isOnline: true,
    },
    { merge: true },
  );
}

/**
 * Ask the server to mail a verification code for the given user.
 *
 * The uid is not sent: the route derives it from this ID token, so a client
 * cannot request mail for somebody else's account.
 */
async function requestVerificationEmail(
  user: FirebaseUser,
): Promise<SendVerificationResult> {
  const idToken = await user.getIdToken();
  const response = await fetch("/api/auth/send-verification", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to send verification email");
  }

  return data as SendVerificationResult;
}

export function CustomerAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async (firebaseUser: FirebaseUser | null) => {
    if (!firebaseUser || !db) {
      setProfile(null);
      return;
    }

    const customerDoc = await getDoc(doc(db, "customers", firebaseUser.uid));
    if (customerDoc.exists()) {
      const data = customerDoc.data() as Partial<CustomerProfile>;
      setProfile({
        uid: firebaseUser.uid,
        email: data.email || firebaseUser.email || "",
        displayName: data.displayName || firebaseUser.displayName || "Customer",
        phone: data.phone || "",
        address: data.address || "",
        customerType: data.customerType || "individual",
        emailVerified: data.emailVerified === true,
      });
      return;
    }

    await upsertCustomerDocuments(firebaseUser);
    setProfile({
      uid: firebaseUser.uid,
      email: firebaseUser.email || "",
      displayName: firebaseUser.displayName || "Customer",
      phone: "",
      address: "",
      customerType: "individual",
      emailVerified: false,
    });
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser);
        await loadProfile(firebaseUser);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load user profile",
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase Auth is not configured");
    setError(null);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (payload: RegisterPayload) => {
    if (!auth) throw new Error("Firebase Auth is not configured");

    setError(null);
    const cred = await createUserWithEmailAndPassword(
      auth,
      payload.email,
      payload.password,
    );
    await updateProfile(cred.user, { displayName: payload.displayName });
    await upsertCustomerDocuments(cred.user, {
      displayName: payload.displayName,
      phone: payload.phone || "",
    });

    // Mail the first code straight away. A send failure must not roll back a
    // successful registration — the verify page offers a Resend button — so
    // this is deliberately swallowed rather than rethrown.
    try {
      await requestVerificationEmail(cred.user);
    } catch (e) {
      console.error("Could not send the initial verification email:", e);
    }
  };

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error("Google sign-in is not configured");
    }

    setError(null);
    const cred = await signInWithPopup(auth, googleProvider);
    await upsertCustomerDocuments(cred.user, {
      displayName: cred.user.displayName || "Customer",
    });
  };

  const logout = async () => {
    if (!auth) return;
    setError(null);
    await signOut(auth);
  };

  const refreshProfile = async () => {
    await loadProfile(auth?.currentUser || null);
  };

  const sendVerificationEmail = async () => {
    if (!auth?.currentUser) throw new Error("Not authenticated");
    setError(null);
    return requestVerificationEmail(auth.currentUser);
  };

  const confirmEmailCode = async (code: string) => {
    if (!auth?.currentUser) throw new Error("Not authenticated");
    setError(null);

    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || "Verification failed");
    }

    // The route just flipped emailVerified on the auth user; force a token
    // refresh so the local FirebaseUser reflects it, then re-read the profile.
    await auth.currentUser.getIdToken(true);
    await auth.currentUser.reload();
    setUser(auth.currentUser);
    await loadProfile(auth.currentUser);
  };

  const updateCustomerProfile = async (payload: Partial<CustomerProfile>) => {
    if (!auth?.currentUser || !db) throw new Error("Not authenticated");

    const uid = auth.currentUser.uid;
    const customerDocRef = doc(db, "customers", uid);
    const userDocRef = doc(db, "users", uid);

    await updateDoc(customerDocRef, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(userDocRef, {
      ...payload,
      updatedAt: serverTimestamp(),
    });

    await refreshProfile();
  };

  // Verified if either the identity provider vouched for the address (Google,
  // or Firebase's own flag once our route sets it) or our Firestore record
  // says the customer entered the emailed code.
  const isEmailVerified = !!user && (user.emailVerified || !!profile?.emailVerified);

  const value = useMemo<CustomerAuthContextType>(
    () => ({
      user,
      profile,
      loading,
      error,
      isEmailVerified,
      login,
      signInWithGoogle,
      register,
      logout,
      refreshProfile,
      updateCustomerProfile,
      sendVerificationEmail,
      confirmEmailCode,
      clearError: () => setError(null),
    }),
    [user, profile, loading, error, isEmailVerified],
  );

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  }
  return ctx;
}
