import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD8XPYCSX_j_Z3SQU8tiN0O1xkzsx7V9to",
  authDomain: "app-ex-system.firebaseapp.com",
  projectId: "app-ex-system",
  storageBucket: "app-ex-system.firebasestorage.app",
  messagingSenderId: "111383001120",
  appId: "1:111383001120:web:c10a96d20981e4923ea445",
  measurementId: "G-8VWCLZ7M5L"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
