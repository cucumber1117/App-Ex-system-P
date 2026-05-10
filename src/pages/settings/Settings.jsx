import React, { useEffect, useState } from 'react';
import styles from './Settings.module.css';
import { auth } from '../../Firebase/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { loginWithGoogle } from '../../Firebase/auth/login';
import { getUserSettings, setUserSettings } from '../../Firebase/auth/users';
import { useTheme } from '../../contexts/ThemeContext';

const Settings = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(false);

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

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            setCurrentUser(u);

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
        const ok = window.confirm('設定を初期化しますか？');

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
    };

    return (
        <div className={`${styles.container} ${styles[theme]}`}>
            <h1 className={styles.title}>設定</h1>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>アカウント</h2>

                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>ログイン</div>
                        <p className={styles.description}>
                            Googleアカウントでログインすると、設定を保存できます。
                        </p>
                    </div>

                    <div>
                        {currentUser ? (
                            <div className={styles.profileRow}>
                                {currentUser.photoURL && (
                                    <img
                                        className={styles.avatar}
                                        src={currentUser.photoURL}
                                        alt={currentUser.displayName || 'avatar'}
                                    />
                                )}

                                <div className={styles.userName}>
                                    {currentUser.displayName || currentUser.email}
                                </div>

                                <button className={styles.btn} onClick={handleLogout}>
                                    ログアウト
                                </button>
                            </div>
                        ) : (
                            <button className={styles.btn} onClick={handleLogin}>
                                Googleでログイン
                            </button>
                        )}
                    </div>
                </div>
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
                                <div className={styles.label}>リマインダー時間</div>
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
                        <div className={styles.label}>初期表示</div>
                        <p className={styles.description}>
                            アプリを開いたときのカレンダー表示を設定します。
                        </p>
                    </div>

                    <select
                        className={styles.select}
                        value={viewMode}
                        onChange={(e) =>
                            saveSettings({ viewMode: e.target.value })
                        }
                    >
                        <option value="month">月表示</option>
                        <option value="week">週表示</option>
                        <option value="day">日表示</option>
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
                        <option value="green">グリーン</option>
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
                        <div className={styles.label}>自動バックアップ</div>
                        <p className={styles.description}>
                            設定や予定データを定期的に保存するための設定です。
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
                            <div className={styles.label}>バックアップ頻度</div>
                            <p className={styles.description}>
                                自動バックアップの頻度を選択します。
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

                

                <div className={styles.actionRow}>
                    <button
                        className={`${styles.btn} ${styles.dangerBtn}`}
                        onClick={resetSettings}
                    >
                        設定を初期化
                    </button>
                </div>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>このアプリについて</h2>

                <div className={styles.row}>
                    <div>
                        <div className={styles.label}>バージョン</div>
                        <p className={styles.description}>
                            スケジュール管理アプリ
                        </p>
                    </div>

                    <div className={styles.version}>0.1.0</div>
                </div>
            </div>

            {loading && <p className={styles.note}>読み込み中…</p>}
        </div>
    );
};

export default Settings;