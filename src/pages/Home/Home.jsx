import React, { useEffect, useMemo, useState } from 'react';
import styles from './Home.module.css';
import { useTheme } from '../../contexts/ThemeContext';
import { auth } from '../../Firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserSettings } from '../../Firebase/auth/users';

const WEEK_DAYS = [
  { label: '日', day: 0 },
  { label: '月', day: 1 },
  { label: '火', day: 2 },
  { label: '水', day: 3 },
  { label: '木', day: 4 },
  { label: '金', day: 5 },
  { label: '土', day: 6 },
];

export default function Home() {
  const { theme } = useTheme();
  const [weekStart, setWeekStart] = useState('sunday');
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const weekStartDay = weekStart === 'monday' ? 1 : 0;

  useEffect(() => {
    const readLocalWeekStart = () => {
      try {
        const raw = localStorage.getItem('settings');
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed.weekStart || 'sunday';
      } catch (error) {
        console.error('read local settings', error);
        return 'sunday';
      }
    };

    setWeekStart(readLocalWeekStart());

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setWeekStart(readLocalWeekStart());
        return;
      }

      try {
        const settings = await getUserSettings(user.uid);
        setWeekStart(settings.weekStart || readLocalWeekStart());
      } catch (err) {
        console.error('load week start', err);
      }
    });

    const handleFocus = () => setWeekStart(readLocalWeekStart());
    window.addEventListener('focus', handleFocus);

    return () => {
      unsub();
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const orderedWeekDays = useMemo(() => {
    const startIndex = WEEK_DAYS.findIndex((day) => day.day === weekStartDay);

    return [
      ...WEEK_DAYS.slice(startIndex),
      ...WEEK_DAYS.slice(0, startIndex),
    ];
  }, [weekStartDay]);

  const calendarDays = useMemo(() => {
    const firstDate = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0);

    const firstDayOfWeek = (firstDate.getDay() - weekStartDay + 7) % 7;
    const daysInMonth = lastDate.getDate();

    const days = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  }, [year, month, weekStartDay]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const isWeekend = (day) => {
    if (day === null) return false;

    const dayOfWeek = new Date(year, month, day).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  return (
    <div className={styles.home}>
      <div className={`${styles.calendarPage} ${styles[theme]}`}>
        <header className={styles.header}>
          <div className={styles.topRow}>
            <div className={styles.yearArea}>
              <button
                className={styles.backButton}
                type="button"
                onClick={handlePrevMonth}
                aria-label="前の月"
              >
                ‹
              </button>

              <span className={styles.yearText}>{year}年</span>
            </div>

            <div className={styles.headerButtons}>
              <button
                className={styles.iconButton}
                type="button"
                aria-label="表示切替"
              >
                ▤
              </button>

              <button
                className={styles.iconButton}
                type="button"
                aria-label="検索"
              >
                ⌕
              </button>

              <button
                className={styles.iconButton}
                type="button"
                aria-label="追加"
              >
                ＋
              </button>
            </div>
          </div>

          <div className={styles.monthTitleRow}>
            <h1 className={styles.monthTitle}>{month + 1}月</h1>
          </div>

          <div className={styles.weekRow}>
            {orderedWeekDays.map((day) => (
              <div
                key={day.day}
                className={`${styles.weekDay} ${
                  day.day === 0 || day.day === 6 ? styles.weekendDay : ''
                }`}
              >
                {day.label}
              </div>
            ))}
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.innerMonthTitleRow}>
            <div className={styles.innerMonthTitle}>{month + 1}月</div>

            <button
              className={styles.nextButton}
              type="button"
              onClick={handleNextMonth}
              aria-label="次の月"
            >
              ›
            </button>
          </div>

          <div className={styles.calendarGrid}>
            {calendarDays.map((day, index) => (
              <button
                key={`${day}-${index}`}
                type="button"
                className={[
                  styles.dayCell,
                  day === null ? styles.emptyCell : '',
                  isWeekend(day) ? styles.weekendCell : '',
                ].join(' ')}
                disabled={day === null}
              >
                {day}
              </button>
            ))}
          </div>
        </main>

        <div className={styles.bottomActions}>
          <button type="button" onClick={handleToday}>
            今日
          </button>

          <button type="button">
            カレンダー
          </button>

          <button type="button">
            参加依頼
          </button>
        </div>
      </div>
    </div>
  );
}