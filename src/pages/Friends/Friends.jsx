import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, MoreVertical, Search, Trash2, UserRound, UserRoundPlus } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../Firebase/firebaseConfig';
import {
  addFriend,
  deleteFriend,
  getOrCreateFriendId,
  listFriends,
} from '../../Firebase/auth/friends';
import { useTheme } from '../../contexts/ThemeContext';
import AccountProfile from '../../compornent/AccountProfile/AccountProfile';
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
  const [activeTab, setActiveTab] = useState('list');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [failedAvatarIds, setFailedAvatarIds] = useState({});
  const [copied, setCopied] = useState(false);
  const [openMenuId, setOpenMenuId] = useState('');
  const [selectedFriend, setSelectedFriend] = useState(null);
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
      setShowAddForm(false);
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
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    const nameA = a.name || a.displayName || a.email || '';
    const nameB = b.name || b.displayName || b.email || '';
    return nameA.localeCompare(nameB, 'ja');
  });

  if (selectedFriend) {
    return (
      <AccountProfile
        profile={selectedFriend}
        title="フレンド情報"
        onBack={() => setSelectedFriend(null)}
      />
    );
  }

  return (
    <main className={`${styles.container} ${styles[theme]}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>フレンド</h1>
        <div className={styles.countBadge} aria-label={`フレンド ${friends.length}人`}>
          <UserRound size={17} aria-hidden="true" />
          <span>{friends.length}人</span>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="フレンド画面の切り替え">
        <button
          className={`${styles.tabButton} ${activeTab === 'list' ? styles.activeTab : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'list'}
          onClick={() => setActiveTab('list')}
        >
          一覧
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'requests' ? styles.activeTab : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'requests'}
          onClick={() => setActiveTab('requests')}
        >
          申請
        </button>
      </div>

      <section className={styles.addSection}>
        {!currentUser ? (
          <div className={styles.emptyState}>
            <UserRoundPlus size={28} aria-hidden="true" />
            <p className={styles.note}>ログインするとフレンドを追加できます。</p>
          </div>
        ) : (
          <>
            <div className={styles.friendCode}>
              <div className={styles.friendCodeText}>
                <span className={styles.friendCodeLabel}>自分のID</span>
                <code className={styles.ownId}>{ownFriendId || '確認中...'}</code>
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

            <button
              className={styles.addBtn}
              type="button"
              onClick={() => setShowAddForm((current) => !current)}
              aria-expanded={showAddForm}
            >
              <UserRoundPlus size={18} aria-hidden="true" />
              <span>フレンドを追加</span>
            </button>

            {showAddForm && (
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
                <button className={styles.submitBtn} type="submit" disabled={adding}>
                  <UserRoundPlus size={18} aria-hidden="true" />
                  <span>{adding ? '追加中...' : '追加する'}</span>
                </button>
              </form>
            )}
          </>
        )}
        {message && <p className={styles.success}>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </section>

      {activeTab === 'requests' ? (
        <section className={styles.listSection} role="tabpanel">
          <div className={styles.requestEmpty}>
            <UserRoundPlus size={30} aria-hidden="true" />
            <p className={styles.note}>現在確認待ちの申請はありません。</p>
          </div>
        </section>
      ) : (
        <section className={styles.listSection} role="tabpanel">
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

          <div className={styles.listHeader}>
            <h2 className={styles.sectionTitle}>フレンド一覧（{friends.length}人）</h2>
            <button className={styles.sortButton} type="button" aria-label="名前順で表示">
              <span>名前順</span>
              <span aria-hidden="true">⌄</span>
            </button>
          </div>

          {!currentUser && <p className={styles.note}>ログインするとフレンドを確認できます。</p>}
          {currentUser && loading && <p className={styles.note}>読み込み中...</p>}
          {currentUser && !loading && friends.length === 0 && (
            <div className={styles.emptyState}>
              <UserRound size={30} aria-hidden="true" />
              <p className={styles.note}>
                まだフレンドがいません。フレンドIDを共有して友達を追加しましょう。
              </p>
            </div>
          )}
          {currentUser && !loading && friends.length > 0 && sortedFriends.length === 0 && (
            <div className={styles.emptyState}>
              <Search size={30} aria-hidden="true" />
              <p className={styles.note}>一致するフレンドはいません。</p>
            </div>
          )}
          {currentUser && !loading && sortedFriends.length > 0 && (
            <ul className={styles.friendList}>
              {sortedFriends.map((friend) => {
                const friendName = friend.name || friend.displayName || '名前未設定';
                const fallbackLabel = (friendName !== '名前未設定' ? friendName : friend.email || '').slice(0, 1);
                const canShowAvatar = friend.photoURL && !failedAvatarIds[friend.id];

                return (
                  <li key={friend.id} className={styles.friendItem}>
                    <button
                      className={styles.friendMain}
                      type="button"
                      onClick={() => setSelectedFriend(friend)}
                    >
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
                      <ChevronRight className={styles.friendArrow} size={20} aria-hidden="true" />
                    </button>
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
      )}

      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </main>
  );
}
