import React, { useCallback, useEffect, useState } from 'react';
import { UserRound, UserRoundPlus } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../Firebase/firebaseConfig';
import { addFriend, listFriends } from '../../Firebase/auth/friends';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './Friends.module.css';

export default function Friends() {
  const { theme } = useTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [friendId, setFriendId] = useState('');
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [failedAvatarIds, setFailedAvatarIds] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshFriends = useCallback(async (uid) => {
    if (!uid) {
      setFriends([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const items = await listFriends(uid);
      setFriends(items);
      setFailedAvatarIds({});
    } catch (err) {
      console.error(err);
      setFriends([]);
      setError('フレンド一覧を読み込めませんでした');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      refreshFriends(user?.uid);
    });
    return () => unsub();
  }, [refreshFriends]);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      setAdding(true);
      setError('');
      setMessage('');
      await addFriend(currentUser.uid, friendId);
      await refreshFriends(currentUser.uid);
      setFriendId('');
      setMessage('フレンドを追加しました');
    } catch (err) {
      console.error(err);
      setError(err.message || 'フレンドを追加できませんでした');
    } finally {
      setAdding(false);
    }
  };

  return (
    <main className={`${styles.container} ${styles[theme]}`}>
      <h1 className={styles.title}>フレンド</h1>

      <section className={styles.addSection}>
        <h2 className={styles.sectionTitle}>フレンド追加</h2>
        {!currentUser ? (
          <p className={styles.note}>ログインするとフレンドを追加できます。</p>
        ) : (
          <>
            <p className={styles.ownId}>自分のID: {currentUser.uid}</p>
            <form className={styles.addForm} onSubmit={handleAddFriend}>
              <input
                className={styles.input}
                value={friendId}
                onChange={(e) => setFriendId(e.target.value)}
                placeholder="フレンドIDを入力"
                required
              />
              <button className={styles.addBtn} type="submit" disabled={adding}>
                <UserRoundPlus size={18} />
                <span>{adding ? '追加中...' : '追加'}</span>
              </button>
            </form>
          </>
        )}
        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </section>

      <section className={styles.listSection}>
        <h2 className={styles.sectionTitle}>フレンド一覧</h2>
        {!currentUser && <p className={styles.note}>ログインするとフレンドを確認できます。</p>}
        {currentUser && loading && <p className={styles.note}>読み込み中...</p>}
        {currentUser && !loading && friends.length === 0 && (
          <p className={styles.note}>フレンドはいません。</p>
        )}
        {currentUser && !loading && friends.length > 0 && (
          <ul className={styles.friendList}>
            {friends.map((friend) => {
              const friendName = friend.name || friend.displayName || '名前未設定';
              const fallbackLabel = (friendName !== '名前未設定' ? friendName : friend.email || '').slice(0, 1);
              const canShowAvatar = friend.photoURL && !failedAvatarIds[friend.id];

              return (
                <li key={friend.id} className={styles.friendItem}>
                  {canShowAvatar ? (
                    <img
                      className={styles.avatar}
                      src={friend.photoURL}
                      alt={`${friendName}のアイコン`}
                      referrerPolicy="no-referrer"
                      onError={() => {
                        setFailedAvatarIds((prev) => ({ ...prev, [friend.id]: true }));
                      }}
                    />
                  ) : (
                    <div className={styles.avatarFallback} aria-label={`${friendName}のアイコン`}>
                      {fallbackLabel || <UserRound size={22} strokeWidth={2.4} />}
                    </div>
                  )}
                  <div className={styles.friendMeta}>
                    <strong className={styles.friendName}>{friendName}</strong>
                    {friend.email && <span className={styles.friendEmail}>{friend.email}</span>}
                    <span className={styles.friendId}>ID: {friend.id}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
