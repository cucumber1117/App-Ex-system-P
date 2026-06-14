import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { isMember, listGroupMembers } from './groups';

const SHAREABLE_EVENT_FIELDS = [
  'title',
  'location',
  'allDay',
  'startDate',
  'startTime',
  'endDate',
  'endTime',
  'categoryId',
  'categoryName',
  'categoryColor',
  'repeat',
  'notes',
];

function normalizeEvent(event = {}) {
  return SHAREABLE_EVENT_FIELDS.reduce((result, field) => {
    if (event[field] !== undefined) {
      result[field] = event[field];
    }
    return result;
  }, {});
}

function mapShare(documentSnapshot) {
  return {
    id: documentSnapshot.id,
    ...documentSnapshot.data(),
  };
}

export async function shareSchedule({
  sender,
  recipient,
  event,
}) {
  if (!sender?.uid) throw new Error('ログインが必要です');
  if (!recipient?.id) throw new Error('共有するフレンドを選択してください');
  if (!event?.title) throw new Error('共有する予定を選択してください');
  if (sender.uid === recipient.id) throw new Error('自分自身には共有できません');

  const shareRef = doc(collection(db, 'users', recipient.id, 'sharedSchedules'));
  const sentShareRef = doc(db, 'users', sender.uid, 'sentSchedules', shareRef.id);
  const schedule = normalizeEvent(event);
  const senderName = sender.displayName || sender.email || '名前未設定';
  const recipientName = recipient.name || recipient.email || '名前未設定';
  const sharedAt = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(shareRef, {
    shareId: shareRef.id,
    senderUid: sender.uid,
    senderName,
    recipientUid: recipient.id,
    recipientName,
    schedule,
    status: 'pending',
    sharedAt,
  });
  batch.set(sentShareRef, {
    shareId: shareRef.id,
    senderUid: sender.uid,
    senderName,
    recipientUid: recipient.id,
    recipientName,
    schedule,
    status: 'pending',
    sharedAt,
  });

  await batch.commit();
  return shareRef.id;
}

export async function shareScheduleToGroup({
  sender,
  group,
  event,
}) {
  if (!sender?.uid) throw new Error('ログインが必要です');
  if (!group?.id) throw new Error('共有するグループを選択してください');
  if (!event?.title) throw new Error('共有する予定を選択してください');
  if (!(await isMember(group.id, sender.uid))) {
    throw new Error('参加中のグループのみ共有できます');
  }

  const members = await listGroupMembers(group.id);
  const recipients = members
    .map((member) => member.uid || member.id)
    .filter((uid) => uid && uid !== sender.uid);

  if (recipients.length === 0) {
    throw new Error('共有できるグループメンバーがいません');
  }

  const schedule = normalizeEvent(event);
  const senderName = sender.displayName || sender.email || '名前未設定';
  const groupName = group.name || '名前未設定のグループ';
  const batchSize = 200;

  for (let start = 0; start < recipients.length; start += batchSize) {
    const batch = writeBatch(db);
    const memberUids = recipients.slice(start, start + batchSize);

    memberUids.forEach((recipientUid) => {
      const shareRef = doc(collection(db, 'users', recipientUid, 'sharedSchedules'));
      const sentShareRef = doc(db, 'users', sender.uid, 'sentSchedules', shareRef.id);
      const sharedAt = serverTimestamp();
      const shareData = {
        shareId: shareRef.id,
        senderUid: sender.uid,
        senderName,
        recipientUid,
        recipientName: groupName,
        targetType: 'group',
        groupId: group.id,
        groupName,
        schedule,
        status: 'pending',
        sharedAt,
      };

      batch.set(shareRef, shareData);
      batch.set(sentShareRef, shareData);
    });

    await batch.commit();
  }

  return recipients.length;
}

export async function listReceivedSchedules(uid) {
  if (!uid) return [];

  const schedulesQuery = query(
    collection(db, 'users', uid, 'sharedSchedules'),
    orderBy('sharedAt', 'desc')
  );
  const snapshot = await getDocs(schedulesQuery);
  return snapshot.docs.map(mapShare);
}

export async function listSentSchedules(uid) {
  if (!uid) return [];

  const schedulesQuery = query(
    collection(db, 'users', uid, 'sentSchedules'),
    orderBy('sharedAt', 'desc')
  );
  const snapshot = await getDocs(schedulesQuery);
  return snapshot.docs.map(mapShare);
}

async function updateShareStatus(uid, share, status) {
  if (!uid || !share?.id || !share?.senderUid) {
    throw new Error('共有予定の情報が不足しています');
  }

  const receivedRef = doc(db, 'users', uid, 'sharedSchedules', share.id);
  const sentRef = doc(db, 'users', share.senderUid, 'sentSchedules', share.id);
  const batch = writeBatch(db);

  batch.update(receivedRef, {
    status,
    respondedAt: serverTimestamp(),
  });
  batch.update(sentRef, {
    status,
    respondedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function acceptSharedSchedule(uid, share) {
  await updateShareStatus(uid, share, 'accepted');
}

export async function declineSharedSchedule(uid, share) {
  await updateShareStatus(uid, share, 'declined');
}

export async function markSharedScheduleImported(uid, shareId) {
  if (!uid || !shareId) return;
  await updateDoc(doc(db, 'users', uid, 'sharedSchedules', shareId), {
    importedAt: serverTimestamp(),
  });
}
