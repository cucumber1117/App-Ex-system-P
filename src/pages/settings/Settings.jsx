import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Settings.module.css';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Info, LogOut } from 'lucide-react';
import { auth } from '../../Firebase/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { loginWithGoogle } from '../../Firebase/auth/login';
import {
    getUserSettings,
    setUserSettings,
    updateUserName,
} from '../../Firebase/auth/users';
import { useTheme } from '../../contexts/ThemeContext';

const Settings = () => {
    const navigate = useNavigate();
    const toastTimerRef = useRef(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState('');
    const [profileName, setProfileName] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [nameMessage, setNameMessage] = useState('');
    const [nameError, setNameError] = useState('');

    // 通知設定
    const [notifications, setNotifications] = useState(false);
    const [reminderTime, setReminderTime] = useState('10');
    const [notifySound, setNotifySound] = useState(true);
    const [notifyVibrate, setNotifyVibrate] = useState(false);
    const [dailySummary, setDailySummary] = useState(false);
    const [dailySummaryTime, setDailySummaryTime] = useState('20:00');

    // 表示設定
    const [weekStart, setWeekStart] = useState('sunday');
    const [viewMode, setViewMode] = useState('month');
    const [showCompleted, setShowCompleted] = useState(true);

    // データ設定
    const [autoBackup, setAutoBackup] = useState(false);
    const [backupFreq, setBackupFreq] = useState('weekly');

    const { theme, setTheme: setThemeContext } = useTheme();

    const showToast = useCallback((text) => {
        setToast(text);
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => {
            setToast('');
        }, 2400);
    }, []);

    useEffect(() => () => {
        window.clearTimeout(toastTimerRef.current);
    }, []);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            setCurrentUser(u);
            setProfileName(u?.displayName || '');
            setNameMessage('');
            setNameError('');

            if (u) {
                setLoading(true);
                try {
                    const s = await getUserSettings(u.uid);

                    setNotifications(Boolean(s.notifications));
                    setReminderTime(s.reminderTime || '10');
                    setNotifySound(s.notifySound ?? true);
                    setNotifyVibrate(Boolean(s.notifyVibrate));
                    setDailySummary(Boolean(s.dailySummary));
                    setDailySummaryTime(s.dailySummaryTime || '20:00');

                    setWeekStart(s.weekStart || 'sunday');
                    setViewMode(s.viewMode || 'month');
                    setShowCompleted(s.showCompleted ?? true);

                    setAutoBackup(Boolean(s.autoBackup));
                    setBackupFreq(s.backupFreq || 'weekly');

                    if (s.theme) {
                        setThemeContext(s.theme);
                    }
                } catch (err) {
                    console.error(err);
                } finally {
                    setLoading(false);
                }
            } else {
                const raw = localStorage.getItem('settings');

                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);

                        setNotifications(Boolean(parsed.notifications));
                        setReminderTime(parsed.reminderTime || '10');
                        setNotifySound(parsed.notifySound ?? true);
                        setNotifyVibrate(Boolean(parsed.notifyVibrate));
                        setDailySummary(Boolean(parsed.dailySummary));
                        setDailySummaryTime(parsed.dailySummaryTime || '20:00');

                        setWeekStart(parsed.weekStart || 'sunday');
                        setViewMode(parsed.viewMode || 'month');
                        setShowCompleted(parsed.showCompleted ?? true);

                        setAutoBackup(Boolean(parsed.autoBackup));
                        setBackupFreq(parsed.backupFreq || 'weekly');

                        if (parsed.theme) {
                            setThemeContext(parsed.theme);
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        });

        return () => unsub();
    }, [setThemeContext]);

    const requestNotificationPermission = async () => {
        if (!('Notification' in window)) {
            alert('このブラウザは通知に対応していません。');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission === 'denied') {
            alert('通知がブロックされています。ブラウザの設定から通知を許可してください。');
            return false;
        }

        const permission = await Notification.requestPermission();
        return permission === 'granted';
    };

    const handleLogin = async () => {
        try {
            await loginWithGoogle();
        } catch (err) {
            console.error(err);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (err) {
            console.error(err);
        }
    };

    const handleNameSubmit = async (event) => {
        event.preventDefault();

        const normalizedName = profileName.trim();
        setNameMessage('');
        setNameError('');

        if (!normalizedName) {
            setNameError('名前を入力してください。');
            return;
        }

        if (normalizedName.length > 30) {
            setNameError('名前は30文字以内で入力してください。');
            return;
        }

        setSavingName(true);

        try {
            const savedName = await updateUserName(currentUser, normalizedName);
            setProfileName(savedName);
            setNameMessage('名前を変更しました。');
        } catch (err) {
            console.error(err);
            setNameError(err.message || '名前を変更できませんでした。');
        } finally {
            setSavingName(false);
        }
    };

    const saveSettings = async (newSettings) => {
        const settings = {
            notifications,
            reminderTime,
            notifySound,
            notifyVibrate,
            dailySummary,
            dailySummaryTime,

            weekStart,
            viewMode,
            showCompleted,

            autoBackup,
            backupFreq,

            theme,
            ...newSettings,
        };

        if ('notifications' in newSettings) setNotifications(newSettings.notifications);
        if ('reminderTime' in newSettings) setReminderTime(newSettings.reminderTime);
        if ('notifySound' in newSettings) setNotifySound(newSettings.notifySound);
        if ('notifyVibrate' in newSettings) setNotifyVibrate(newSettings.notifyVibrate);
        if ('dailySummary' in newSettings) setDailySummary(newSettings.dailySummary);
        if ('dailySummaryTime' in newSettings) setDailySummaryTime(newSettings.dailySummaryTime);

        if ('weekStart' in newSettings) setWeekStart(newSettings.weekStart);
        if ('viewMode' in newSettings) setViewMode(newSettings.viewMode);
        if ('showCompleted' in newSettings) setShowCompleted(newSettings.showCompleted);

        if ('autoBackup' in newSettings) setAutoBackup(newSettings.autoBackup);
        if ('backupFreq' in newSettings) setBackupFreq(newSettings.backupFreq);

        if ('theme' in newSettings) setThemeContext(newSettings.theme);

        localStorage.setItem('settings', JSON.stringify(settings));

        if (currentUser) {
            try {
                await setUserSettings(currentUser.uid, settings);
            } catch (err) {
                console.error(err);
            }
        }

        showToast('設定を保存しました');
    };

    const handleNotificationChange = async (checked) => {
        if (checked) {
            const allowed = await requestNotificationPermission();

            if (!allowed) {
                saveSettings({ notifications: false });
                return;
            }
        }

        saveSettings({ notifications: checked });
    };

    const resetSettings = () => {
        const ok = window.confirm(
            '設定を初期化しますか？\n\n表示設定や通知設定、データ同期設定を初期状態に戻します。予定やフレンドは削除されません。'
        );

        if (!ok) return;

        localStorage.removeItem('settings');

        setNotifications(false);
        setReminderTime('10');
        setNotifySound(true);
        setNotifyVibrate(false);
        setDailySummary(false);
        setDailySummaryTime('20:00');

        setWeekStart('sunday');
        setViewMode('month');
        setShowCompleted(true);

        setAutoBackup(false);
        setBackupFreq('weekly');

        setThemeContext('light');
        showToast('設定を初期化しました');
    };

    return (
        <div className={`${styles.container} ${styles[theme]}`}>
            <h1 className={styles.title}>設定</h1>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>アカウント</h2>

                {currentUser ? (
                    <>
                        <div className={styles.accountRow}>
                            <div className={styles.profileRow}>
                                {currentUser.photoURL ? (
                                    <img
                                        className={styles.avatar}
                                        src={currentUser.photoURL}
                                        alt={currentUser.displayName || 'avatar'}
                                    />
                                ) : (
                                    <span className={styles.avatarFallback} aria-hidden="true">
                                        {(profileName || currentUser.email || '?').slice(0, 1)}
                                    </span>
                                )}

                                <div className={styles.profileText}>
                                    <div className={styles.label}>
                                        {profileName || currentUser.email}
                                    </div>
                                    <p className={styles.description}>
                                        Googleアカウントでログイン中
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className={styles.menuArrow} size={20} aria-hidden="true" />
                        </div>

                        <div className={styles.row}>
                            <div>
                                <div className={styles.label}>名前</div>
                                <p className={styles.description}>
                                    フレンドなどに表示される名前を変更します。
                                </p>
                            </div>

                            <form className={styles.nameForm} onSubmit={handleNameSubmit}>
                                <div className={styles.nameInputRow}>
                                    <input
                                        className={styles.nameInput}
                                        type="text"
                                        value={profileName}
                                        maxLength={30}
                                        onChange={(event) => {
                                            setProfileName(event.target.value);
                                            setNameMessage('');
                                            setNameError('');
                                        }}
                                        placeholder="表示名"
                                        aria-label="表示名"
                                        disabled={savingName}
                                    />
                                    <button
                                        className={styles.btn}
                                        type="submit"
                                        disabled={savingName}
                                    >
                                        {savingName ? '保存中…' : '保存'}
                                    </button>
                                </div>
                                {nameMessage && (
                                    <p className={styles.successMessage}>{nameMessage}</p>
                                )}
                                {nameError && (
                                    <p className={styles.errorMessage}>{nameError}</p>
                                )}
                            </form>
                        </div>

                        <div className={styles.row}>
                            <button className={styles.logoutBtn} onClick={handleLogout} type="button">
                                <LogOut size={18} aria-hidden="true" />
                                <span>ログアウト</span>
                            </button>
                        </div>
                    </>
                ) : (
                    <div className={styles.row}>
                        <div>
                            <div className={styles.label}>ログイン</div>
                            <p className={styles.description}>
                                Googleアカウントでログインすると、設定を保存できます。
                            </p>
                        </div>

                        <button className={styles.btn} onClick={handleLogin} type="button">
                            Googleでログイン
                        </button>
                    </div>
                )}
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>通知設定</h2>

                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>通知</div>
                        <p className={styles.description}>
                            予定の前に通知を受け取るかを設定します。
                        </p>
                    </div>

                    <label className={styles.toggleLabel}>
                        <input
                            type="checkbox"
                            checked={notifications}
                            onChange={(e) =>
                                handleNotificationChange(e.target.checked)
                            }
                        />
                        <span className={styles.toggleText}></span>
                    </label>
                </div>

                {notifications && (
                    <>
                        <div className={styles.row}>
                            <div>
                                <div className={styles.label}>通知タイミング</div>
                                <p className={styles.description}>
                                    予定開始の何分前に通知するかを選択します。
                                </p>
                            </div>

                            <select
                                className={styles.select}
                                value={reminderTime}
                                onChange={(e) =>
                                    saveSettings({ reminderTime: e.target.value })
                                }
                            >
                                <option value="5">5分前</option>
                                <option value="10">10分前</option>
                                <option value="30">30分前</option>
                                <option value="60">1時間前</option>
                                <option value="1440">前日</option>
                            </select>
                        </div>

                        <div className={styles.row}>
                            <div>
                                <div className={styles.label}>通知サウンド</div>
                                <p className={styles.description}>
                                    通知時に音を鳴らす設定です。
                                </p>
                            </div>

                            <label className={styles.toggleLabel}>
                                <input
                                    type="checkbox"
                                    checked={notifySound}
                                    onChange={(e) =>
                                        saveSettings({ notifySound: e.target.checked })
                                    }
                                />
                                <span className={styles.toggleText}></span>
                            </label>
                        </div>

                        <div className={styles.row}>
                            <div>
                                <div className={styles.label}>バイブレーション</div>
                                <p className={styles.description}>
                                    対応端末で通知時に振動させます。
                                </p>
                            </div>

                            <label className={styles.toggleLabel}>
                                <input
                                    type="checkbox"
                                    checked={notifyVibrate}
                                    onChange={(e) =>
                                        saveSettings({ notifyVibrate: e.target.checked })
                                    }
                                />
                                <span className={styles.toggleText}></span>
                            </label>
                        </div>

                        <div className={styles.row}>
                            <div>
                                <div className={styles.label}>デイリーサマリー</div>
                                <p className={styles.description}>
                                    1日の予定をまとめて通知する設定です。
                                </p>
                            </div>

                            <label className={styles.toggleLabel}>
                                <input
                                    type="checkbox"
                                    checked={dailySummary}
                                    onChange={(e) =>
                                        saveSettings({ dailySummary: e.target.checked })
                                    }
                                />
                                <span className={styles.toggleText}></span>
                            </label>
                        </div>

                        {dailySummary && (
                            <div className={styles.row}>
                                <div>
                                    <div className={styles.label}>サマリー時刻</div>
                                    <p className={styles.description}>
                                        予定のまとめ通知を出す時刻です。
                                    </p>
                                </div>

                                <input
                                    className={styles.select}
                                    type="time"
                                    value={dailySummaryTime}
                                    onChange={(e) =>
                                        saveSettings({ dailySummaryTime: e.target.value })
                                    }
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>表示設定</h2>

                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>週の開始曜日</div>
                        <p className={styles.description}>
                            カレンダーの表示開始曜日を設定します。
                        </p>
                    </div>

                    <select
                        className={styles.select}
                        value={weekStart}
                        onChange={(e) =>
                            saveSettings({ weekStart: e.target.value })
                        }
                    >
                        <option value="sunday">日曜日</option>
                        <option value="monday">月曜日</option>
                    </select>
                </div>

                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>テーマ</div>
                        <p className={styles.description}>
                            画面の色合いを選択します。
                        </p>
                    </div>

                    <select
                        className={styles.select}
                        value={theme}
                        onChange={(e) =>
                            saveSettings({ theme: e.target.value })
                        }
                    >
                        <option value="light">ライト</option>
                        <option value="dark">ダーク</option>
                    </select>
                </div>

                

                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>完了済み予定を表示</div>
                        <p className={styles.description}>
                            終了した予定を一覧に表示するかを設定します。
                        </p>
                    </div>

                    <label className={styles.toggleLabel}>
                        <input
                            type="checkbox"
                            checked={showCompleted}
                            onChange={(e) =>
                                saveSettings({ showCompleted: e.target.checked })
                            }
                        />
                        <span className={styles.toggleText}></span>
                    </label>
                </div>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>データ設定</h2>

                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>データ同期</div>
                        <p className={styles.description}>
                            設定や予定データを定期的に保存・同期するための設定です。
                        </p>
                    </div>

                    <label className={styles.toggleLabel}>
                        <input
                            type="checkbox"
                            checked={autoBackup}
                            onChange={(e) =>
                                saveSettings({ autoBackup: e.target.checked })
                            }
                        />
                        <span className={styles.toggleText}></span>
                    </label>
                </div>

                {autoBackup && (
                    <div className={styles.row}>
                        <div>
                            <div className={styles.label}>同期頻度</div>
                            <p className={styles.description}>
                                データ同期の頻度を選択します。
                            </p>
                        </div>

                        <select
                            className={styles.select}
                            value={backupFreq}
                            onChange={(e) =>
                                saveSettings({ backupFreq: e.target.value })
                            }
                        >
                            <option value="daily">毎日</option>
                            <option value="weekly">毎週</option>
                            <option value="monthly">毎月</option>
                        </select>
                    </div>
                )}

                

                <div className={styles.dangerZone}>
                    <div>
                        <div className={styles.dangerLabel}>設定の初期化</div>
                        <p className={styles.description}>
                            表示設定や通知設定を初期状態に戻します。予定やフレンドは削除されません。
                        </p>
                    </div>
                    <button
                        className={`${styles.btn} ${styles.dangerBtn}`}
                        onClick={resetSettings}
                        type="button"
                    >
                        設定を初期化
                    </button>
                </div>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>サポート</h2>

                <button
                    className={styles.menuRow}
                    type="button"
                    onClick={() => navigate('/settings/app-info')}
                >
                    <span className={styles.menuIcon} aria-hidden="true">
                        <Info size={22} />
                    </span>
                    <span className={styles.menuContent}>
                        <span className={styles.menuLabel}>アプリ情報・お問い合わせ</span>
                        <span className={styles.menuDescription}>
                            開発者、アプリの説明、主要機能、連絡先を確認できます。
                        </span>
                    </span>
                    <ChevronRight className={styles.menuArrow} size={22} aria-hidden="true" />
                </button>
            </div>

            {loading && <p className={styles.note}>読み込み中…</p>}
            {toast && (
                <div className={styles.toast} role="status" aria-live="polite">
                    {toast}
                </div>
            )}
        </div>
    );
};

export default Settings;
