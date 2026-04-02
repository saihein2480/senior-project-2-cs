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
  login: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateCustomerProfile: (payload: Partial<CustomerProfile>) => Promise<void>;
  clearError: () => void;
};

const CustomerAuthContext = createContext<CustomerAuthContextType | null>(null);

async function upsertCustomerDocuments(
  user: FirebaseUser,
  profile?: Partial<CustomerProfile>,
) {
  if (!db) return;

  const userDocRef = doc(db, "users", user.uid);
  const customerDocRef = doc(db, "customers", user.uid);

  const baseProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName: profile?.displayName || user.displayName || "Customer",
    phone: profile?.phone || "",
    address: profile?.address || "",
    customerType: profile?.customerType || "individual",
    updatedAt: serverTimestamp(),
  };

  await setDoc(
    userDocRef,
    {
      ...baseProfile,
      role: "customer",
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    customerDocRef,
    {
      ...baseProfile,
      totalPurchases: 0,
      totalSpent: 0,
      receivables: 0,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
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

  const value = useMemo<CustomerAuthContextType>(
    () => ({
      user,
      profile,
      loading,
      error,
      login,
      signInWithGoogle,
      register,
      logout,
      refreshProfile,
      updateCustomerProfile,
      clearError: () => setError(null),
    }),
    [user, profile, loading, error],
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
