import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db } from '../firebaseConfig';

export async function saveUserProfile(user) {
  if (!user?.uid) return;

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const nextProfile = {
    uid: user.uid,
    name: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    updatedAt: serverTimestamp(),
  };

  if (!userSnap.exists()) {
    nextProfile.createdAt = serverTimestamp();
  }

  await setDoc(
    userRef,
    nextProfile,
    { merge: true }
  );
}

export async function getUserProfile(uid) {
  if (!uid) return null;
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return null;
  return { id: userSnap.id, ...userSnap.data() };
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

export async function updateUserProfile(user, { name, status }) {
  if (!user?.uid) throw new Error('ログインが必要です');

  const normalizedName = name.trim();
  const normalizedStatus = status.trim();

  if (!normalizedName) throw new Error('名前を入力してください');
  if (normalizedName.length > 30) throw new Error('名前は30文字以内で入力してください');
  if (normalizedStatus.length > 80) throw new Error('ステータスは80文字以内で入力してください');

  await updateProfile(user, { displayName: normalizedName });
  await setDoc(
    doc(db, 'users', user.uid),
    {
      name: normalizedName,
      status: normalizedStatus,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    name: normalizedName,
    status: normalizedStatus,
  };
}
