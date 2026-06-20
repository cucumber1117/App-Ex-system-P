import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, MoreVertical, Search, Trash2, UserRound, UserRoundPlus } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../Firebase/firebaseConfig';
import {
  addFriend,
  deleteFriend,
  getOrCreateFriendId,
  listFriends,
} from '../../Firebase/auth/friends';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './Friends.module.css';

export default function Friends() {
  const { theme } = useTheme();
  const menuRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [ownFriendId, setOwnFriendId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [failedAvatarIds, setFailedAvatarIds] = useState({});
  const [copied, setCopied] = useState(false);
  const [openMenuId, setOpenMenuId] = useState('');
  const [toast, setToast] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const showToast = useCallback((text) => {
    setToast(text);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast('');
    }, 2400);
  }, []);

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
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      refreshFriends(user?.uid);

      if (!user) {
        setOwnFriendId('');
        return;
      }

      const friendIdCacheKey = `friendId:${user.uid}`;
      const cachedFriendId = localStorage.getItem(friendIdCacheKey);

      if (cachedFriendId) {
        setOwnFriendId(cachedFriendId);
      } else {
        setOwnFriendId('');
      }

      try {
        const issuedFriendId = await getOrCreateFriendId(user.uid);
        setOwnFriendId(issuedFriendId);
        localStorage.setItem(friendIdCacheKey, issuedFriendId);
      } catch (err) {
        console.error(err);
        setError(err.message || 'フレンドIDを読み込めませんでした');
      }
    });
    return () => unsub();
  }, [refreshFriends]);

  useEffect(() => {
    if (!openMenuId) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpenMenuId('');
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenMenuId('');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  useEffect(() => () => {
    window.clearTimeout(toastTimerRef.current);
  }, []);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const normalizedFriendId = friendId.trim().toLowerCase();

    if (!normalizedFriendId) {
      setError('フレンドIDを入力してください');
      setMessage('');
      return;
    }

    if (normalizedFriendId === ownFriendId) {
      setError('自分自身は追加できません');
      setMessage('');
      return;
    }

    if (friends.some((friend) => friend.friendId === normalizedFriendId)) {
      setError('すでにフレンドに追加されています');
      setMessage('');
      return;
    }

    try {
      setAdding(true);
      setError('');
      setMessage('');
      await addFriend(currentUser.uid, normalizedFriendId);
      await refreshFriends(currentUser.uid);
      setFriendId('');
      setMessage('フレンドを追加しました');
      showToast('フレンドを追加しました');
    } catch (err) {
      console.error(err);
      setError(err.message || 'フレンドを追加できませんでした');
    } finally {
      setAdding(false);
    }
  };

  const handleCopyFriendCode = async () => {
    if (!ownFriendId) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(ownFriendId);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = ownFriendId;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copiedSuccessfully = document.execCommand('copy');
        textarea.remove();
        if (!copiedSuccessfully) throw new Error('copy failed');
      }

      setCopied(true);
      showToast('フレンドIDをコピーしました');
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      setError('フレンドコードをコピーできませんでした');
    }
  };

  const handleDeleteFriend = async (friendUid) => {
      if (!currentUser) return;

      const confirmed = window.confirm('このフレンドを削除しますか？');

      if (!confirmed) return;

      try {
        setError('');
        setMessage('');

        await deleteFriend(currentUser.uid, friendUid);
        await refreshFriends(currentUser.uid);
        setOpenMenuId('');

        setMessage('フレンドを削除しました');
        showToast('フレンドを削除しました');
      }
      catch(err) {
        console.error(err);
        setError('フレンドを削除できませんでした');
      }
    };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredFriends = normalizedSearch
    ? friends.filter((friend) => {
        const friendName = friend.name || friend.displayName || '';
        const id = friend.friendId || '';
        const email = friend.email || '';
        return `${friendName} ${id} ${email}`.toLowerCase().includes(normalizedSearch);
      })
    : friends;

  return (
    <main className={`${styles.container} ${styles[theme]}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>フレンド</h1>
        <div className={styles.countBadge} aria-label={`フレンド ${friends.length}人`}>
          <UserRound size={17} aria-hidden="true" />
          <span>{friends.length}</span>
        </div>
      </header>

      <section className={styles.addSection}>
        <h2 className={styles.sectionTitle}>フレンド追加</h2>
        {!currentUser ? (
          <div className={styles.emptyState}>
            <UserRoundPlus size={28} aria-hidden="true" />
            <p className={styles.note}>ログインするとフレンドを追加できます。</p>
          </div>
        ) : (
          <>
            <div className={styles.addGuide}>
              <p>
                自分のIDを相手に共有するか、相手のフレンドIDを入力して追加できます。
              </p>
            </div>

            <div className={styles.friendCode}>
              <div className={styles.friendCodeText}>
                <span className={styles.friendCodeLabel}>自分のフレンドID</span>
                <code className={styles.ownId}>
                  {ownFriendId || '確認中...'}
                </code>
              </div>
              <button
                className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
                type="button"
                onClick={handleCopyFriendCode}
                disabled={!ownFriendId}
                aria-label="フレンドコードをコピー"
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                <span>{copied ? 'コピー済み' : 'コピー'}</span>
              </button>
            </div>
            <span className={styles.copyStatus} aria-live="polite">
              {copied ? 'フレンドコードをコピーしました' : ''}
            </span>
            <form className={styles.addForm} onSubmit={handleAddFriend}>
              <label className={styles.inputField}>
                <span className={styles.inputLabel}>相手のフレンドID</span>
                <input
                  className={styles.input}
                  value={friendId}
                  onChange={(e) => setFriendId(e.target.value.toLowerCase())}
                  placeholder="j-00000"
                  maxLength={7}
                  pattern="[a-z]-[0-9]{5}"
                  title="半角英字1文字、ハイフン、数字5桁で入力してください"
                  autoCapitalize="none"
                  spellCheck="false"
                  required
                />
              </label>
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
        <div className={styles.listHeader}>
          <div>
            <h2 className={styles.sectionTitle}>フレンド一覧</h2>
            {currentUser && !loading && (
              <p className={styles.friendCount}>
                {friends.length}人のフレンドがいます
              </p>
            )}
          </div>
        </div>
        {!currentUser && <p className={styles.note}>ログインするとフレンドを確認できます。</p>}
        {currentUser && loading && <p className={styles.note}>読み込み中...</p>}
        {currentUser && !loading && friends.length > 0 && (
          <label className={styles.searchBox}>
            <Search size={17} aria-hidden="true" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="名前またはIDで検索"
              aria-label="フレンドを検索"
            />
          </label>
        )}
        {currentUser && !loading && friends.length === 0 && (
          <div className={styles.emptyState}>
            <UserRound size={30} aria-hidden="true" />
            <p className={styles.note}>
              まだフレンドがいません。フレンドIDを共有して友達を追加しましょう。
            </p>
          </div>
        )}
        {currentUser && !loading && friends.length > 0 && filteredFriends.length === 0 && (
          <div className={styles.emptyState}>
            <Search size={30} aria-hidden="true" />
            <p className={styles.note}>一致するフレンドはいません。</p>
          </div>
        )}
        {currentUser && !loading && filteredFriends.length > 0 && (
          <ul className={styles.friendList}>
            {filteredFriends.map((friend) => {
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
                    <span className={styles.friendId}>
                      ID: {friend.friendId || '未発行'}
                    </span>
                  </div>
                  <div
                    className={styles.friendMenu}
                    ref={openMenuId === friend.id ? menuRef : null}
                  >
                    <button
                      type="button"
                      className={styles.menuBtn}
                      onClick={() =>
                        setOpenMenuId((prev) => (prev === friend.id ? '' : friend.id))
                      }
                      aria-label={`${friendName}のメニュー`}
                      aria-expanded={openMenuId === friend.id}
                    >
                      <MoreVertical size={18} aria-hidden="true" />
                    </button>
                    {openMenuId === friend.id && (
                      <div className={styles.menuPopover}>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteFriend(friend.id)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          <span>削除</span>
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </main>
  );
}
