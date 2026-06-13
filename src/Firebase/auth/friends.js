import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

function getFriendProfile(data = {}) {
  return {
    name: data.name || data.displayName || '',
    email: data.email || '',
    photoURL: data.photoURL || data.avatarUrl || data.avatarURL || data.imageUrl || data.picture || '',
  };
}

export async function listFriends(uid) {
  if (!uid) return [];

  const friendsSnap = await getDocs(collection(db, 'users', uid, 'friends'));
  const friends = await Promise.all(
    friendsSnap.docs.map(async (friendDoc) => {
      const userSnap = await getDoc(doc(db, 'users', friendDoc.id));
      const friendship = friendDoc.data();
      if (!userSnap.exists()) {
        return {
          id: friendDoc.id,
          ...getFriendProfile(friendship),
          friendship,
        };
      }

      return {
        id: userSnap.id,
        ...userSnap.data(),
        ...getFriendProfile(userSnap.data()),
        friendship,
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
  const friendProfile = getFriendProfile(friendUserSnap.data());

  const currentUserSnap = await getDoc(doc(db, 'users', uid));
  const currentUserProfile = currentUserSnap.exists()
    ? getFriendProfile(currentUserSnap.data())
    : {};

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'friends', normalizedFriendUid),
    { uid: normalizedFriendUid, ...friendProfile, addedAt: serverTimestamp() },
    { merge: true }
  );
  batch.set(
    doc(db, 'users', normalizedFriendUid, 'friends', uid),
    { uid, ...currentUserProfile, addedAt: serverTimestamp() },
    { merge: true }
  );
  await batch.commit();

  return { id: friendUserSnap.id, ...friendUserSnap.data(), ...friendProfile };
}

export async function deleteFriend(uid, friendUid) {
  if (!uid) throw new Error('ログインが必要です');
  if (!friendUid)throw new Error('フレンドIDが無効です');

  const batch = writeBatch(db);

  batch.delete(doc(db, 'users', uid, 'friend', friendUid));
  batch.delete(doc(db, 'users', friendUid, 'friends', uid));

  await batch.commit();
  
}