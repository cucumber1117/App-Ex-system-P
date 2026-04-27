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

    const [notifications, setNotifications] = useState(false);
    const [reminderTime, setReminderTime] = useState('10');
    const [weekStart, setWeekStart] = useState('sunday');
    const [viewMode, setViewMode] = useState('month');
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
                    setWeekStart(s.weekStart || 'sunday');
                    setViewMode(s.viewMode || 'month');
                    if (s.theme) setThemeContext(s.theme);
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
                        setWeekStart(parsed.weekStart || 'sunday');
                        setViewMode(parsed.viewMode || 'month');
                        if (parsed.theme) setThemeContext(parsed.theme);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        });

        return () => unsub();
    }, []);

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
            weekStart,
            viewMode,
            theme,
            ...newSettings,
        };

        if ('notifications' in newSettings) setNotifications(newSettings.notifications);
        if ('reminderTime' in newSettings) setReminderTime(newSettings.reminderTime);
        if ('weekStart' in newSettings) setWeekStart(newSettings.weekStart);
        if ('viewMode' in newSettings) setViewMode(newSettings.viewMode);
        if ('theme' in newSettings) setThemeContext(newSettings.theme);

        if (currentUser) {
            try {
                await setUserSettings(currentUser.uid, settings);
            } catch (err) {
                console.error(err);
            }
        } else {
            localStorage.setItem('settings', JSON.stringify(settings));
        }
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
                                saveSettings({ notifications: e.target.checked })
                            }
                        />
                        <span className={styles.toggleText}>
                            {notifications ? 'オン' : 'オフ'}
                        </span>
                    </label>
                </div>

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
            </div>

            {loading && <p className={styles.note}>読み込み中…</p>}
        </div>
    );
};

export default Settings;