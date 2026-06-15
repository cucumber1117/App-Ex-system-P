import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

const FRIEND_ID_PATTERN = /^[a-z]-\d{5}$/;
const FRIEND_ID_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const FRIEND_ID_GENERATION_ATTEMPTS = 20;

function getFriendProfile(data = {}) {
  return {
    name: data.name || data.displayName || '',
    email: data.email || '',
    photoURL: data.photoURL || data.avatarUrl || data.avatarURL || data.imageUrl || data.picture || '',
    friendId: data.friendId || '',
  };
}

function createFriendId() {
  const letter = FRIEND_ID_LETTERS[Math.floor(Math.random() * FRIEND_ID_LETTERS.length)];
  const number = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${letter}-${number}`;
}

function normalizeFriendId(friendId) {
  return friendId.trim().toLowerCase();
}

export async function getOrCreateFriendId(uid) {
  if (!uid) throw new Error('ログインが必要です');

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const existingFriendId = normalizeFriendId(userSnap.data()?.friendId || '');

  if (FRIEND_ID_PATTERN.test(existingFriendId)) {
    return existingFriendId;
  }

  for (let attempt = 0; attempt < FRIEND_ID_GENERATION_ATTEMPTS; attempt += 1) {
    const friendId = createFriendId();
    const friendIdRef = doc(db, 'friendIds', friendId);

    const assignedFriendId = await runTransaction(db, async (transaction) => {
      const [latestUserSnap, friendIdSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(friendIdRef),
      ]);
      const latestFriendId = normalizeFriendId(latestUserSnap.data()?.friendId || '');

      if (FRIEND_ID_PATTERN.test(latestFriendId)) {
        return latestFriendId;
      }

      if (friendIdSnap.exists()) {
        return null;
      }

      transaction.set(friendIdRef, {
        uid,
        createdAt: serverTimestamp(),
      });
      transaction.set(
        userRef,
        {
          uid,
          friendId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return friendId;
    });

    if (assignedFriendId) {
      return assignedFriendId;
    }
  }

  throw new Error('フレンドIDを発行できませんでした。もう一度お試しください');
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

export async function addFriend(uid, friendId) {
  const normalizedFriendId = normalizeFriendId(friendId);
  if (!uid) throw new Error('ログインが必要です');
  if (!normalizedFriendId) throw new Error('フレンドIDを入力してください');
  if (!FRIEND_ID_PATTERN.test(normalizedFriendId)) {
    throw new Error('フレンドIDは「j-00000」の形式で入力してください');
  }

  const friendIdSnap = await getDoc(doc(db, 'friendIds', normalizedFriendId));
  if (!friendIdSnap.exists()) throw new Error('ユーザーが見つかりません');

  const friendUid = friendIdSnap.data().uid;
  if (!friendUid) throw new Error('フレンドIDが無効です');
  if (uid === friendUid) throw new Error('自分自身は追加できません');

  const friendUserRef = doc(db, 'users', friendUid);
  const friendUserSnap = await getDoc(friendUserRef);
  if (!friendUserSnap.exists()) throw new Error('ユーザーが見つかりません');
  const friendProfile = getFriendProfile(friendUserSnap.data());

  const currentUserSnap = await getDoc(doc(db, 'users', uid));
  const currentUserProfile = currentUserSnap.exists()
    ? getFriendProfile(currentUserSnap.data())
    : {};

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'friends', friendUid),
    { uid: friendUid, ...friendProfile, addedAt: serverTimestamp() },
    { merge: true }
  );
  batch.set(
    doc(db, 'users', friendUid, 'friends', uid),
    { uid, ...currentUserProfile, addedAt: serverTimestamp() },
    { merge: true }
  );
  await batch.commit();

  return { id: friendUserSnap.id, ...friendUserSnap.data(), ...friendProfile };
}

export async function deleteFriend(uid, friendUid) {
  if (!uid) throw new Error('ログインが必要です');
  if (!friendUid) throw new Error('フレンドIDが無効です');

  const batch = writeBatch(db);

  batch.delete(doc(db, 'users', uid, 'friends', friendUid));
  batch.delete(doc(db, 'users', friendUid, 'friends', uid));

  await batch.commit();
}