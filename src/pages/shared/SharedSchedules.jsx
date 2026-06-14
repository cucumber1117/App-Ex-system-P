import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Clock3, Send, UserRound, UsersRound, X } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../Firebase/firebaseConfig';
import { listFriends } from '../../Firebase/auth/friends';
import { listJoinedGroups } from '../../Firebase/auth/groups';
import {
  acceptSharedSchedule,
  declineSharedSchedule,
  listReceivedSchedules,
  listSentSchedules,
  markSharedScheduleImported,
  shareSchedule,
  shareScheduleToGroup,
} from '../../Firebase/auth/sharedSchedules';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './SharedSchedules.module.css';

const EVENT_STORAGE_KEY = 'calendarEvents';

function readLocalEvents() {
  try {
    const saved = localStorage.getItem(EVENT_STORAGE_KEY);
    const events = saved ? JSON.parse(saved) : [];
    return Array.isArray(events) ? events : [];
  } catch (error) {
    console.error('read local events', error);
    return [];
  }
}

function formatScheduleDate(schedule = {}) {
  if (!schedule.startDate) return '日時未設定';

  const start = schedule.startTime ? ` ${schedule.startTime}` : '';
  const endDate = schedule.endDate && schedule.endDate !== schedule.startDate
    ? ` - ${schedule.endDate}`
    : '';
  const endTime = schedule.endTime ? ` ${schedule.endTime}` : '';

  return `${schedule.startDate}${start}${endDate}${endTime}`;
}

function formatSharedAt(timestamp) {
  if (!timestamp?.toDate) return '';
  return timestamp.toDate().toLocaleString('ja-JP');
}

function statusLabel(status) {
  if (status === 'accepted') return '追加済み';
  if (status === 'declined') return '辞退';
  return '確認待ち';
}

export default function SharedSchedules() {
  const { theme } = useTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [localEvents, setLocalEvents] = useState(() => readLocalEvents());
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [processingId, setProcessingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshData = useCallback(async (uid) => {
    if (!uid) {
      setFriends([]);
      setGroups([]);
      setReceived([]);
      setSent([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [friendItems, groupItems, receivedItems, sentItems] = await Promise.all([
        listFriends(uid),
        listJoinedGroups(uid),
        listReceivedSchedules(uid),
        listSentSchedules(uid),
      ]);
      setFriends(friendItems);
      setGroups(groupItems);
      setReceived(receivedItems);
      setSent(sentItems);
    } catch (err) {
      console.error(err);
      setError('共有予定を読み込めませんでした');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLocalEvents(readLocalEvents());
      refreshData(user?.uid);
    });

    return () => unsubscribe();
  }, [refreshData]);

  const selectedEvent = useMemo(
    () => localEvents.find((event) => String(event.id) === selectedEventId),
    [localEvents, selectedEventId]
  );
  const selectedFriend = useMemo(
    () => {
      if (!selectedTarget.startsWith('friend:')) return null;
      const friendId = selectedTarget.slice('friend:'.length);
      return friends.find((friend) => friend.id === friendId) || null;
    },
    [friends, selectedTarget]
  );
  const selectedGroup = useMemo(
    () => {
      if (!selectedTarget.startsWith('group:')) return null;
      const groupId = selectedTarget.slice('group:'.length);
      return groups.find((group) => group.id === groupId) || null;
    },
    [groups, selectedTarget]
  );

  const handleShare = async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    setSending(true);
    setMessage('');
    setError('');

    try {
      if (selectedGroup) {
        const recipientCount = await shareScheduleToGroup({
          sender: currentUser,
          group: selectedGroup,
          event: selectedEvent,
        });
        setMessage(`${selectedGroup.name}のメンバー${recipientCount}人に予定を共有しました`);
      } else {
        await shareSchedule({
          sender: currentUser,
          recipient: selectedFriend,
          event: selectedEvent,
        });
        setMessage('フレンドに予定を共有しました');
      }
      setSelectedEventId('');
      setSelectedTarget('');
      await refreshData(currentUser.uid);
    } catch (err) {
      console.error(err);
      setError(err.message || '予定を共有できませんでした');
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (share) => {
    if (!currentUser) return;

    setProcessingId(share.id);
    setMessage('');
    setError('');

    try {
      const events = readLocalEvents();
      const alreadyImported = events.some(
        (event) => event.sharedScheduleId === share.id
      );

      if (!alreadyImported) {
        const importedEvent = {
          ...share.schedule,
          id: `shared-${share.id}`,
          isShared: true,
          sharedScheduleId: share.id,
          sharedByUid: share.senderUid,
          sharedByName: share.senderName,
        };
        localStorage.setItem(
          EVENT_STORAGE_KEY,
          JSON.stringify([...events, importedEvent])
        );
      }

      await acceptSharedSchedule(currentUser.uid, share);
      await markSharedScheduleImported(currentUser.uid, share.id);
      setLocalEvents(readLocalEvents());
      setMessage(alreadyImported ? 'この予定は追加済みです' : '予定表に追加しました');
      await refreshData(currentUser.uid);
    } catch (err) {
      console.error(err);
      setError(err.message || '予定を追加できませんでした');
    } finally {
      setProcessingId('');
    }
  };

  const handleDecline = async (share) => {
    if (!currentUser) return;

    setProcessingId(share.id);
    setMessage('');
    setError('');

    try {
      await declineSharedSchedule(currentUser.uid, share);
      setMessage('共有予定を辞退しました');
      await refreshData(currentUser.uid);
    } catch (err) {
      console.error(err);
      setError(err.message || '共有予定を辞退できませんでした');
    } finally {
      setProcessingId('');
    }
  };

  return (
    <main className={`${styles.container} ${styles[theme]}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SCHEDULE SHARING</p>
          <h1 className={styles.title}>予定共有</h1>
          <p className={styles.lead}>フレンドや参加中のグループへ予定を送り、受け取った予定を自分のカレンダーへ追加できます。</p>
        </div>
      </header>

      {!currentUser ? (
        <section className={styles.emptyCard}>
          <UserRound size={32} />
          <p>予定を共有するにはログインしてください。</p>
        </section>
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div className={styles.panelIcon}><Send size={20} /></div>
              <div>
                <h2>予定を送る</h2>
                <p>端末に保存されている予定をフレンドまたはグループへ共有します。</p>
              </div>
            </div>

            <form className={styles.shareForm} onSubmit={handleShare}>
              <label className={styles.field}>
                <span>共有する予定</span>
                <select
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  required
                >
                  <option value="">予定を選択</option>
                  {localEvents.map((event) => (
                    <option key={event.id} value={String(event.id)}>
                      {event.startDate || '日付なし'} {event.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>共有する相手</span>
                <select
                  value={selectedTarget}
                  onChange={(event) => setSelectedTarget(event.target.value)}
                  required
                >
                  <option value="">共有先を選択</option>
                  {friends.length > 0 && (
                    <optgroup label="フレンド">
                      {friends.map((friend) => (
                        <option key={friend.id} value={`friend:${friend.id}`}>
                          {friend.name || friend.email || '名前未設定'}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {groups.length > 0 && (
                    <optgroup label="グループ">
                      {groups.map((group) => (
                        <option key={group.id} value={`group:${group.id}`}>
                          {group.name || '名前未設定のグループ'}（{Math.max((group.memberCount || 1) - 1, 0)}人へ共有）
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>

              <button
                className={styles.sendButton}
                type="submit"
                disabled={
                  sending
                  || localEvents.length === 0
                  || (friends.length === 0 && groups.length === 0)
                }
              >
                <Send size={18} />
                {sending ? '送信中...' : '共有する'}
              </button>
            </form>

            {localEvents.length === 0 && (
              <p className={styles.helper}>共有できる予定がありません。ホームで予定を作成してください。</p>
            )}
            {friends.length === 0 && groups.length === 0 && (
              <p className={styles.helper}>共有できるフレンドまたは参加中のグループがありません。</p>
            )}
          </section>

          {message && <p className={styles.success}>{message}</p>}
          {error && <p className={styles.error}>{error}</p>}
          {loading && <p className={styles.loading}>読み込み中...</p>}

          <div className={styles.columns}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div className={styles.panelIcon}><CalendarPlus size={20} /></div>
                <div>
                  <h2>受け取った予定</h2>
                  <p>内容を確認して予定表へ追加できます。</p>
                </div>
              </div>

              {!loading && received.length === 0 ? (
                <p className={styles.emptyText}>受け取った予定はありません。</p>
              ) : (
                <ul className={styles.scheduleList}>
                  {received.map((share) => (
                    <li key={share.id} className={styles.scheduleCard}>
                      <div className={styles.scheduleTop}>
                        <span className={`${styles.status} ${styles[share.status || 'pending']}`}>
                          {statusLabel(share.status)}
                        </span>
                        <span className={styles.sharedAt}>{formatSharedAt(share.sharedAt)}</span>
                      </div>
                      <h3>{share.schedule?.title || 'タイトルなし'}</h3>
                      <p className={styles.dateLine}>
                        <Clock3 size={15} />
                        {formatScheduleDate(share.schedule)}
                      </p>
                      {share.schedule?.location && (
                        <p className={styles.detailLine}>場所: {share.schedule.location}</p>
                      )}
                      <p className={styles.owner}>共有者: {share.senderName}</p>
                      {share.targetType === 'group' && (
                        <p className={styles.groupLine}>
                          <UsersRound size={14} />
                          {share.groupName}
                        </p>
                      )}

                      {share.status === 'pending' && (
                        <div className={styles.cardActions}>
                          <button
                            className={styles.acceptButton}
                            type="button"
                            disabled={processingId === share.id}
                            onClick={() => handleAccept(share)}
                          >
                            <Check size={17} />
                            予定表に追加
                          </button>
                          <button
                            className={styles.declineButton}
                            type="button"
                            disabled={processingId === share.id}
                            onClick={() => handleDecline(share)}
                          >
                            <X size={17} />
                            辞退
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div className={styles.panelIcon}><Send size={20} /></div>
                <div>
                  <h2>送信履歴</h2>
                  <p>共有した予定の確認状況を表示します。</p>
                </div>
              </div>

              {!loading && sent.length === 0 ? (
                <p className={styles.emptyText}>共有した予定はありません。</p>
              ) : (
                <ul className={styles.scheduleList}>
                  {sent.map((share) => (
                    <li key={share.id} className={styles.scheduleCard}>
                      <div className={styles.scheduleTop}>
                        <span className={`${styles.status} ${styles[share.status || 'pending']}`}>
                          {statusLabel(share.status)}
                        </span>
                        <span className={styles.sharedAt}>{formatSharedAt(share.sharedAt)}</span>
                      </div>
                      <h3>{share.schedule?.title || 'タイトルなし'}</h3>
                      <p className={styles.dateLine}>
                        <Clock3 size={15} />
                        {formatScheduleDate(share.schedule)}
                      </p>
                      <p className={styles.owner}>
                        共有先: {share.targetType === 'group' ? `グループ「${share.groupName}」` : share.recipientName}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
