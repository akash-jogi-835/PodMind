import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Standard Firebase config. Since we test using local emulators first,
// these placeholder values are fully functional!
// Set to true to run entirely offline with our local Express DB server (requires no Firebase setup!)
// Set to false to use a real Firebase Cloud Project
export const USE_LOCAL_MOCK = true;

const firebaseConfig = {
  apiKey: "ai-podmind-emulator-api-key-placeholder",
  authDomain: "podmind-dev.firebaseapp.com",
  projectId: "podmind-dev",
  storageBucket: "podmind-dev.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:1234567890abcdef"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Connect to Local Emulators if running locally
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  console.log("Connecting to Firebase Local Emulators...");
  
  // Connect Auth
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  
  // Connect Firestore
  connectFirestoreEmulator(db, "localhost", 8080);
  
  // Connect Storage
  connectStorageEmulator(storage, "localhost", 9199);
}

export { app, auth, db, storage };
