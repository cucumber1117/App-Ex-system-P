import React, { useMemo, useState } from 'react';
import styles from './CalendarPage.module.css';
import { useTheme } from '../../contexts/ThemeContext';

const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function CalendarPage() {
  const { theme } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDate = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0);

    const firstDayOfWeek = firstDate.getDay();
    const daysInMonth = lastDate.getDate();

    const days = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  }, [year, month]);

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

  const isWeekend = (index) => {
    const dayOfWeek = index % 7;
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  return (
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
            <button className={styles.iconButton} type="button" aria-label="表示切替">
              ▤
            </button>
            <button className={styles.iconButton} type="button" aria-label="検索">
              ⌕
            </button>
            <button className={styles.iconButton} type="button" aria-label="追加">
              ＋
            </button>
          </div>
        </div>

        <div className={styles.monthTitleRow}>
          <h1 className={styles.monthTitle}>{month + 1}月</h1>
        </div>

        <div className={styles.weekRow}>
          {WEEK_DAYS.map((day) => (
            <div key={day} className={styles.weekDay}>
              {day}
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
                isWeekend(index) ? styles.weekendCell : '',
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
  );
}
