import { collection, collectionGroup, deleteDoc, doc, documentId, serverTimestamp, query, where, orderBy, startAt, endAt, getDocs, getDoc, setDoc, updateDoc, increment, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const groupsCol = collection(db, 'groups');

export async function createGroup(name, creatorUid) {
  const groupRef = doc(groupsCol);
  const batch = writeBatch(db);

  batch.set(groupRef, {
    groupId: groupRef.id,
    name,
    ...(creatorUid ? { createdBy: creatorUid } : {}),
    createdAt: serverTimestamp(),
    memberCount: creatorUid ? 1 : 0,
  });

  if (creatorUid) {
    const memberRef = doc(db, 'groups', groupRef.id, 'members', creatorUid);
    batch.set(memberRef, {
      uid: creatorUid,
      joinedAt: serverTimestamp(),
      role: 'owner',
    });
  }

  await batch.commit();
  return groupRef.id;
}

export async function listGroups(groupIdSearch = '') {
  const search = groupIdSearch.trim();
  const q = search
    ? query(groupsCol, orderBy(documentId()), startAt(search), endAt(search + '\uf8ff'))
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

export async function listJoinedGroups(uid) {
  if (!uid) return [];

  try {
    const byUidField = query(collectionGroup(db, 'members'), where('uid', '==', uid));
    const snap = await getDocs(byUidField);
    const groupIds = snap.docs
      .map((memberDoc) => memberDoc.ref.parent.parent?.id)
      .filter(Boolean);

    if (groupIds.length > 0) {
      const groups = await Promise.all(groupIds.map((groupId) => getGroupDetails(groupId)));
      return groups.filter(Boolean);
    }
  } catch (err) {
    console.error(err);
  }

  const groupsSnap = await getDocs(groupsCol);
  const groups = await Promise.all(
    groupsSnap.docs.map(async (groupDoc) => {
      const memberSnap = await getDoc(doc(db, 'groups', groupDoc.id, 'members', uid));
      if (!memberSnap.exists()) return null;

      const data = groupDoc.data();
      const memberCount = typeof data.memberCount === 'number' ? data.memberCount : 0;
      return { id: groupDoc.id, ...data, memberCount };
    })
  );

  return groups.filter(Boolean);
}

export async function joinGroup(groupId, uid) {
  if (!uid) throw new Error('uid required');
  const memberRef = doc(db, 'groups', groupId, 'members', uid);
  const memberSnap = await getDoc(memberRef);
  if (memberSnap.exists()) {
    await setDoc(memberRef, { uid }, { merge: true });
    return;
  }

  await setDoc(memberRef, { uid, joinedAt: serverTimestamp() });
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, { memberCount: increment(1) });
}

export async function leaveGroup(groupId, uid) {
  if (!uid) throw new Error('uid required');
  const memberRef = doc(db, 'groups', groupId, 'members', uid);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) return;

  await deleteDoc(memberRef);
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, { memberCount: increment(-1) });
}

export async function inviteFriendToGroup(groupId, inviterUid, friendUid) {
  if (!groupId || !inviterUid || !friendUid) throw new Error('招待情報が不足しています');
  if (!(await isMember(groupId, inviterUid))) throw new Error('参加中のグループのみ招待できます');
  if (await isMember(groupId, friendUid)) throw new Error('このフレンドはすでに参加済みです');

  const group = await getGroupDetails(groupId);
  if (!group) throw new Error('グループが見つかりません');

  await setDoc(
    doc(db, 'users', friendUid, 'groupInvites', groupId),
    {
      groupId,
      groupName: group.name,
      inviterUid,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listGroupInvites(uid) {
  if (!uid) return [];

  const snap = await getDocs(collection(db, 'users', uid, 'groupInvites'));
  const invites = await Promise.all(
    snap.docs.map(async (inviteDoc) => {
      const data = inviteDoc.data();
      const group = await getGroupDetails(data.groupId || inviteDoc.id);
      if (!group) return null;
      return { id: inviteDoc.id, ...data, group };
    })
  );

  return invites.filter(Boolean);
}

export async function acceptGroupInvite(groupId, uid) {
  if (!groupId || !uid) throw new Error('招待情報が不足しています');
  await joinGroup(groupId, uid);
  await deleteDoc(doc(db, 'users', uid, 'groupInvites', groupId));
}

export async function declineGroupInvite(groupId, uid) {
  if (!groupId || !uid) throw new Error('招待情報が不足しています');
  await deleteDoc(doc(db, 'users', uid, 'groupInvites', groupId));
}
