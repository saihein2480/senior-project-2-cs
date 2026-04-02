import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

const app = getApps()[0]
  ? getApps()[0]
  : serviceAccount
    ? initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
    : null;

export const adminDb = app ? getFirestore(app) : null;
export const isAdminDbConfigured = !!adminDb;
