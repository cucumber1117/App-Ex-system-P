import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db } from '../firebaseConfig';

export async function saveUserProfile(user) {
  if (!user?.uid) return;

  await setDoc(
    doc(db, 'users', user.uid),
    {
      uid: user.uid,
      name: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

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

export async function updateUserName(user, name) {
  if (!user?.uid) throw new Error('ログインが必要です');

  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('名前を入力してください');
  if (normalizedName.length > 30) throw new Error('名前は30文字以内で入力してください');

  await updateProfile(user, { displayName: normalizedName });
  await setDoc(
    doc(db, 'users', user.uid),
    {
      name: normalizedName,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return normalizedName;
}
