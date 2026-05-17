import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export async function listFriends(uid) {
  if (!uid) return [];

  const friendsSnap = await getDocs(collection(db, 'users', uid, 'friends'));
  const friends = await Promise.all(
    friendsSnap.docs.map(async (friendDoc) => {
      const userSnap = await getDoc(doc(db, 'users', friendDoc.id));
      if (!userSnap.exists()) return null;

      return {
        id: userSnap.id,
        ...userSnap.data(),
        friendship: friendDoc.data(),
      };
    })
  );

  return friends.filter(Boolean);
}

export async function addFriend(uid, friendUid) {
  const normalizedFriendUid = friendUid.trim();
  if (!uid) throw new Error('ログインが必要です');
  if (!normalizedFriendUid) throw new Error('フレンドIDを入力してください');
  if (uid === normalizedFriendUid) throw new Error('自分自身は追加できません');

  const friendUserRef = doc(db, 'users', normalizedFriendUid);
  const friendUserSnap = await getDoc(friendUserRef);
  if (!friendUserSnap.exists()) throw new Error('ユーザーが見つかりません');

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'friends', normalizedFriendUid),
    { uid: normalizedFriendUid, addedAt: serverTimestamp() },
    { merge: true }
  );
  batch.set(
    doc(db, 'users', normalizedFriendUid, 'friends', uid),
    { uid, addedAt: serverTimestamp() },
    { merge: true }
  );
  await batch.commit();

  return { id: friendUserSnap.id, ...friendUserSnap.data() };
}
