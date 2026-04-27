import { collection, addDoc, serverTimestamp, query, orderBy, startAt, endAt, getDocs, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const groupsCol = collection(db, 'groups');

export async function createGroup(name) {
  const docRef = await addDoc(groupsCol, {
    name,
    createdAt: serverTimestamp(),
    memberCount: 0,
  });
  return docRef.id;
}

export async function listGroups(search = '') {
  // simple prefix search using startAt/endAt on ordered name
  const q = search
    ? query(groupsCol, orderBy('name'), startAt(search), endAt(search + '\uf8ff'))
    : query(groupsCol, orderBy('createdAt'));

  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return items;
}

export async function getGroupDetails(groupId) {
  const d = await getDoc(doc(db, 'groups', groupId));
  if (!d.exists()) return null;
  const data = d.data();

  const memberCount = typeof data.memberCount === 'number' ? data.memberCount : 0;
  return { id: d.id, ...data, memberCount };
}

export async function isMember(groupId, uid) {
  if (!uid) return false;
  const m = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  return m.exists();
}

export async function joinGroup(groupId, uid) {
  if (!uid) throw new Error('uid required');
  const memberRef = doc(db, 'groups', groupId, 'members', uid);
  await setDoc(memberRef, { uid, joinedAt: serverTimestamp() });
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, { memberCount: increment(1) });
}
