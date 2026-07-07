import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LogOut, UserRound } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './AccountProfile.module.css';

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return '未登録';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}/${month}/${day}/${hour}:${minute}`;
};

const AccountProfile = ({
  profile,
  title = 'アカウント情報',
  backLabel = '戻る',
  editable = false,
  saving = false,
  onBack,
  onSave,
  onLogout,
}) => {
  const { theme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const displayName = profile?.name || profile?.displayName || profile?.email || '名前未設定';
  const displayStatus = profile?.status || 'ステータス未設定';
  const userId = profile?.uid || profile?.id || '未登録';
  const createdAt = profile?.createdAt || profile?.metadata?.creationTime;
  const avatarLabel = (displayName || profile?.email || '?').slice(0, 1);

  useEffect(() => {
    setName(displayName === '名前未設定' ? '' : displayName);
    setStatus(profile?.status || '');
    setMessage('');
    setError('');
    setEditing(false);
  }, [displayName, profile?.status, userId]);

  const createdAtText = useMemo(() => formatDateTime(createdAt), [createdAt]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    try {
      await onSave({ name, status });
      setEditing(false);
      setMessage('保存しました');
    } catch (err) {
      setError(err.message || '保存できませんでした');
    }
  };

  return (
    <main className={`${styles.container} ${styles[theme]}`}>
      <header className={styles.header}>
        <button className={styles.backButton} type="button" onClick={onBack}>
          <ArrowLeft size={20} aria-hidden="true" />
          <span>{backLabel}</span>
        </button>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <section className={styles.card}>
        <div className={styles.avatarWrap}>
          {profile?.photoURL ? (
            <img
              className={styles.avatar}
              src={profile.photoURL}
              alt={`${displayName}のアイコン`}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={styles.avatarFallback} aria-label={`${displayName}のアイコン`}>
              {avatarLabel || <UserRound size={42} strokeWidth={2.2} />}
            </div>
          )}
        </div>

        {editing ? (
          <form className={styles.editForm} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>ユーザー名</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={30}
                placeholder="ユーザー名"
                disabled={saving}
              />
            </label>
            <label className={styles.field}>
              <span>ステータス</span>
              <textarea
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                maxLength={80}
                rows={3}
                placeholder="ステータス"
                disabled={saving}
              />
            </label>
            <div className={styles.editActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  setName(displayName === '名前未設定' ? '' : displayName);
                  setStatus(profile?.status || '');
                  setEditing(false);
                  setError('');
                }}
                disabled={saving}
              >
                キャンセル
              </button>
              <button className={styles.primaryButton} type="submit" disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.infoList}>
            <div className={styles.infoGroup}>
              <h2>ユーザー名</h2>
              <p>{displayName}</p>
            </div>
            <div className={styles.infoGroup}>
              <h2>ユーザーID</h2>
              <p>{userId}</p>
            </div>
            <div className={styles.infoGroup}>
              <h2>アカウント作成日</h2>
              <p>{createdAtText}</p>
            </div>
            <div className={styles.statusHeader}>
              <h2>ステータス</h2>
              {editable && (
                <button className={styles.editButton} type="button" onClick={() => setEditing(true)}>
                  編集
                </button>
              )}
            </div>
            <p className={styles.statusText}>{displayStatus}</p>
          </div>
        )}

        {(message || error) && (
          <p className={error ? styles.error : styles.success}>{error || message}</p>
        )}

        {editable && !editing && onLogout && (
          <>
            <div className={styles.divider} />
            <button className={styles.logoutButton} type="button" onClick={onLogout}>
              <LogOut size={20} aria-hidden="true" />
              <span>ログアウト</span>
            </button>
          </>
        )}
      </section>
    </main>
  );
};

export default AccountProfile;
