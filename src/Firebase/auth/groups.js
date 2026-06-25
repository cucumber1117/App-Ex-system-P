import { collection, collectionGroup, deleteDoc, doc, documentId, serverTimestamp, query, where, orderBy, startAt, endAt, getDocs, getDoc, setDoc, updateDoc, increment, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const groupsCol = collection(db, 'groups');
const GROUP_ID_PATTERN = /^g-\d{5}$/;
const GROUP_ID_GENERATION_ATTEMPTS = 20;

function createGroupId() {
  const number = Math.floor(Math.random() * 100000)
  .toString()
  .padStart(5, '0');

  return `g-${number}`;
}

export async function createGroup(name, creatorUid) {
  const batch = writeBatch(db);
  let groupId;
  let groupRef;
  let exists = true;

  for (
    let attempt = 0;
    attempt < GROUP_ID_GENERATION_ATTEMPTS && exists;
    attempt++
  ) {
    groupId = createGroupId();
    groupRef = doc(db, 'groups', groupId);

    const snap = await getDoc(groupRef);

    if (!snap.exists()) {
      exists = false;
    }
  }

  if (exists) {
    throw new Error('グループIDを発行できませんでした');
  }

  batch.set(groupRef, {
    groupId,
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
  return groupId;
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

export async function updateGroupName(groupId, uid, name) {
  const nextName = String(name || '').trim();

  if (!groupId) throw new Error('グループが選択されていません');
  if (!uid) throw new Error('ログインが必要です');
  if (!nextName) throw new Error('グループ名を入力してください');
  if (!(await isMember(groupId, uid))) {
    throw new Error('参加中のグループのみ編集できます');
  }

  await updateDoc(doc(db, 'groups', groupId), {
    name: nextName,
    updatedAt: serverTimestamp(),
  });

  return nextName;
}

export async function isMember(groupId, uid) {
  if (!uid) return false;
  const m = await getDoc(doc(db, 'groups', groupId, 'members', uid));
  return m.exists();
}

export async function listGroupMembers(groupId) {
  if (!groupId) return [];

  const snapshot = await getDocs(collection(db, 'groups', groupId, 'members'));
  return snapshot.docs
    .map((memberDoc) => ({
      id: memberDoc.id,
      ...memberDoc.data(),
    }))
    .filter((member) => member.uid || member.id);
}

async function deliverGroupSharedSchedulesToMember(groupId, uid) {
  if (!groupId || !uid) return;

  const snapshot = await getDocs(collection(db, 'groups', groupId, 'sharedSchedules'));
  const shares = snapshot.docs
    .map((shareDoc) => ({
      id: shareDoc.id,
      ...shareDoc.data(),
    }))
    .filter((share) => share.senderUid !== uid);
  const batchSize = 200;

  for (let start = 0; start < shares.length; start += batchSize) {
    const batch = writeBatch(db);
    const batchShares = shares.slice(start, start + batchSize);

    batchShares.forEach((share) => {
      const shareRef = doc(db, 'users', uid, 'sharedSchedules', share.id);
      batch.set(shareRef, {
        ...share,
        shareId: share.shareId || share.id,
        recipientUid: uid,
        recipientName: share.groupName || 'グループ',
        targetType: 'group',
        groupId,
        status: 'pending',
      }, { merge: true });
    });

    await batch.commit();
  }
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
    await deliverGroupSharedSchedulesToMember(groupId, uid);
    return;
  }

  await setDoc(memberRef, { uid, joinedAt: serverTimestamp() });
  const groupRef = doc(db, 'groups', groupId);
  await updateDoc(groupRef, { memberCount: increment(1) });
  await deliverGroupSharedSchedulesToMember(groupId, uid);
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
