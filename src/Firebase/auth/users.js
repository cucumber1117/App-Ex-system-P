import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export async function getUserSettings(uid) {
  if (!uid) return {};
  const d = await getDoc(doc(db, 'users', uid));
  if (!d.exists()) return {};
  const data = d.data();
  return data.settings || {};
}

export async function setUserSettings(uid, settings) {
  if (!uid) throw new Error('uid required');
  await setDoc(doc(db, 'users', uid), { settings }, { merge: true });
}
