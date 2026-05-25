import admin from "firebase-admin";
// JSON key file එක import කරගන්නවා
import serviceAccount from "../serviceAccountKey.json" assert { type: "json" };

// Firebase Admin initialize කිරීම
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Firestore Database එක export කරගන්නවා
export const db = admin.firestore();
console.log("Firebase Admin Database Connected Successfully");