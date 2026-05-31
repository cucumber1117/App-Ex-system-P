import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const EVENT_STORAGE_KEY = 'calendarEvents';

const EVENT_CATEGORIES = [
  { id: 'default', name: '予定', color: '#ff453a' },
  { id: 'school', name: '授業', color: '#2f80ed' },
  { id: 'club', name: '部活', color: '#34c759' },
  { id: 'parttime', name: 'バイト', color: '#ff9500' },
  { id: 'private', name: '個人', color: '#af52de' },
  { id: 'important', name: '重要', color: '#ff2d55' },
];

const CUSTOM_CATEGORY = {
  id: 'custom',
  name: 'その他',
  color: '#8e8e93',
};

const REPEAT_OPTIONS = [
  { value: 'none', label: 'しない' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
  { value: 'yearly', label: '毎年' },
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function parseDateOnly(dateText) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTodayKey() {
  return formatDateInput(new Date());
}

function getDefaultCategory() {
  return EVENT_CATEGORIES[0];
}

function getDefaultEventForm(baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setMinutes(0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const startDate = formatDateInput(start);
  const endDate = formatDateInput(end);
  const defaultCategory = getDefaultCategory();

  return {
    title: '',
    location: '',
    allDay: false,
    useToday: startDate === getTodayKey() && endDate === getTodayKey(),
    startDate,
    startTime: `${pad(start.getHours())}:00`,
    endDate,
    endTime: `${pad(end.getHours())}:00`,
    categoryId: defaultCategory.id,
    categoryName: defaultCategory.name,
    categoryColor: defaultCategory.color,
    repeat: 'none',
    notes: '',
  };
}

function getEventTimeLabel(event) {
  if (event.allDay) return '終日';
  if (event.startTime && event.endTime) return `${event.startTime}〜${event.endTime}`;
  if (event.startTime) return event.startTime;
  return '';
}

function getRepeatLabel(repeat) {
  return REPEAT_OPTIONS.find((option) => option.value === repeat)?.label || 'しない';
}

function getEventDateTimeValue(date, time, allDay, isEnd = false) {
  const fallbackTime = isEnd ? '23:59' : '00:00';
  const safeTime = allDay ? fallbackTime : time || fallbackTime;
  return new Date(`${date}T${safeTime}`);
}

function normalizeColor(color) {
  if (typeof color !== 'string') return getDefaultCategory().color;
  return color.startsWith('#') ? color : getDefaultCategory().color;
}

function hexToRgba(hex, alpha) {
  const safeHex = normalizeColor(hex).replace('#', '');
  const fullHex = safeHex.length === 3
    ? safeHex.split('').map((char) => char + char).join('')
    : safeHex;

  const value = Number.parseInt(fullHex, 16);
  if (Number.isNaN(value)) {
    return `rgba(255, 69, 58, ${alpha})`;
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getEventColor(event) {
  return normalizeColor(event.categoryColor || getDefaultCategory().color);
}

function getEventStyle(event) {
  const color = getEventColor(event);

  return {
    '--event-color': color,
    '--event-bg': hexToRgba(color, 0.16),
    '--event-hover-bg': hexToRgba(color, 0.24),
  };
}

function isEventOnDate(event, dateKey) {
  if (!event?.startDate || !dateKey) return false;

  const repeat = event.repeat || 'none';

  if (repeat === 'none') {
    return event.startDate === dateKey;
  }

  if (dateKey < event.startDate) return false;

  const startDate = parseDateOnly(event.startDate);
  const targetDate = parseDateOnly(dateKey);

  if (!startDate || !targetDate) return false;

  if (repeat === 'daily') {
    return true;
  }

  if (repeat === 'weekly') {
    return startDate.getDay() === targetDate.getDay();
  }

  if (repeat === 'yearly') {
    return (
      startDate.getMonth() === targetDate.getMonth() &&
      startDate.getDate() === targetDate.getDate()
    );
  }

  return event.startDate === dateKey;
}

export default function Home() {
  const { theme } = useTheme();

  const [weekStart, setWeekStart] = useState('sunday');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState(getDefaultEventForm());
  const [modalMode, setModalMode] = useState('add');
  const [editingEventId, setEditingEventId] = useState(null);

  const lastMonthChangeRef = useRef(0);
  const touchStartYRef = useRef(null);
  const touchStartXRef = useRef(null);
  const isSwipeChangingMonthRef = useRef(false);

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EVENT_STORAGE_KEY);
      if (saved) {
        const parsedEvents = JSON.parse(saved);
        setEvents(Array.isArray(parsedEvents) ? parsedEvents : []);
      }
    } catch (error) {
      console.error('failed to load events', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error('failed to save events', error);
    }
  }, [events]);

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

  const eventsByDate = useMemo(() => {
    const grouped = {};
    const lastDate = new Date(year, month + 1, 0);
    const daysInMonth = lastDate.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = formatDateKey(year, month, day);
      grouped[dateKey] = [];

      events.forEach((event) => {
        if (!isEventOnDate(event, dateKey)) return;

        grouped[dateKey].push({
          ...event,
          occurrenceDate: dateKey,
        });
      });

      grouped[dateKey].sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return String(a.startTime || '').localeCompare(String(b.startTime || ''));
      });
    }

    return grouped;
  }, [events, year, month]);

  const changeMonth = (offset) => {
    setCurrentDate((prev) => {
      return new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
    });
  };

  const canChangeMonth = () => {
    const now = Date.now();

    if (now - lastMonthChangeRef.current < 650) {
      return false;
    }

    lastMonthChangeRef.current = now;
    return true;
  };

  const handleCalendarWheel = (e) => {
    if (isModalOpen) return;
    if (Math.abs(e.deltaY) < 40) return;
    if (!canChangeMonth()) return;

    if (e.deltaY > 0) {
      changeMonth(1);
    } else {
      changeMonth(-1);
    }
  };

  const handleTouchStart = (e) => {
    if (isModalOpen) return;

    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (isModalOpen) return;
    if (touchStartYRef.current === null || touchStartXRef.current === null) return;

    const endY = e.changedTouches[0].clientY;
    const endX = e.changedTouches[0].clientX;

    const diffY = touchStartYRef.current - endY;
    const diffX = touchStartXRef.current - endX;

    touchStartYRef.current = null;
    touchStartXRef.current = null;

    if (Math.abs(diffY) < 70) return;
    if (Math.abs(diffY) < Math.abs(diffX)) return;
    if (!canChangeMonth()) return;

    isSwipeChangingMonthRef.current = true;

    if (diffY > 0) {
      changeMonth(1);
    } else {
      changeMonth(-1);
    }

    setTimeout(() => {
      isSwipeChangingMonthRef.current = false;
    }, 250);
  };

  const isWeekend = (day) => {
    if (day === null) return false;

    const dayOfWeek = new Date(year, month, day).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  const isToday = (day) => {
    if (day === null) return false;

    const today = new Date();

    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  const openAddModal = (selectedDay = null) => {
    const baseDate = selectedDay
      ? new Date(year, month, selectedDay)
      : new Date();

    setModalMode('add');
    setEditingEventId(null);
    setEventForm(getDefaultEventForm(baseDate));
    setIsModalOpen(true);
  };

  const openEditModal = (calendarEvent, clickEvent) => {
    clickEvent.stopPropagation();

    const defaultCategory = getDefaultCategory();
    const startDate = calendarEvent.startDate || formatDateInput(new Date());
    const endDate = calendarEvent.endDate || calendarEvent.startDate || formatDateInput(new Date());

    setModalMode('edit');
    setEditingEventId(calendarEvent.id);
    setEventForm({
      title: calendarEvent.title || '',
      location: calendarEvent.location || '',
      allDay: Boolean(calendarEvent.allDay),
      useToday: startDate === getTodayKey() && endDate === getTodayKey(),
      startDate,
      startTime: calendarEvent.startTime || '09:00',
      endDate,
      endTime: calendarEvent.endTime || calendarEvent.startTime || '10:00',
      categoryId: calendarEvent.categoryId || defaultCategory.id,
      categoryName: calendarEvent.categoryName || defaultCategory.name,
      categoryColor: calendarEvent.categoryColor || defaultCategory.color,
      repeat: calendarEvent.repeat || 'none',
      notes: calendarEvent.notes || '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalMode('add');
    setEditingEventId(null);
  };

  const handleFormChange = (key, value) => {
    setEventForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'startDate' || key === 'endDate' ? { useToday: false } : {}),
    }));
  };

  const handleTodayToggle = (checked) => {
    const today = getTodayKey();

    setEventForm((prev) => ({
      ...prev,
      useToday: checked,
      ...(checked
        ? {
            startDate: today,
            endDate: today,
          }
        : {}),
    }));
  };

  const handleTimeToggle = (checked) => {
    setEventForm((prev) => ({
      ...prev,
      allDay: !checked,
      startTime: prev.startTime || '09:00',
      endTime: prev.endTime || '10:00',
    }));
  };

  const handleCategorySelect = (category) => {
    setEventForm((prev) => ({
      ...prev,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
    }));
  };

  const validateEventForm = () => {
    if (!eventForm.title.trim()) {
      alert('タイトルを入力してください。');
      return false;
    }

    if (!eventForm.startDate || !eventForm.endDate) {
      alert('開始日と終了日を入力してください。');
      return false;
    }

    if (!eventForm.allDay && (!eventForm.startTime || !eventForm.endTime)) {
      alert('開始時間と終了時間を入力してください。');
      return false;
    }

    if (!eventForm.categoryName.trim()) {
      alert('用事の名前を入力してください。');
      return false;
    }

    const startDateTime = getEventDateTimeValue(
      eventForm.startDate,
      eventForm.startTime,
      eventForm.allDay,
      false,
    );
    const endDateTime = getEventDateTimeValue(
      eventForm.endDate,
      eventForm.endTime,
      eventForm.allDay,
      true,
    );

    if (startDateTime > endDateTime) {
      alert('終了日時は開始日時より後にしてください。');
      return false;
    }

    return true;
  };

  const buildEventFromForm = (id) => ({
    id,
    title: eventForm.title.trim(),
    location: eventForm.location.trim(),
    allDay: eventForm.allDay,
    startDate: eventForm.startDate,
    startTime: eventForm.allDay ? '' : eventForm.startTime,
    endDate: eventForm.endDate,
    endTime: eventForm.allDay ? '' : eventForm.endTime,
    categoryId: eventForm.categoryId,
    categoryName: eventForm.categoryName.trim(),
    categoryColor: normalizeColor(eventForm.categoryColor),
    repeat: eventForm.repeat || 'none',
    notes: eventForm.notes.trim(),
  });

  const handleSaveEvent = () => {
    if (!validateEventForm()) {
      return;
    }

    if (modalMode === 'edit' && editingEventId !== null) {
      const updatedEvent = buildEventFromForm(editingEventId);

      setEvents((prev) => (
        prev.map((event) => (event.id === editingEventId ? updatedEvent : event))
      ));
      closeModal();
      return;
    }

    const newEvent = buildEventFromForm(Date.now());
    setEvents((prev) => [...prev, newEvent]);
    closeModal();
  };

  const handleDeleteEvent = () => {
    if (editingEventId === null) return;

    const ok = window.confirm('この予定を削除しますか？\n繰り返し予定の場合は、同じ予定がすべて削除されます。');
    if (!ok) return;

    setEvents((prev) => prev.filter((event) => event.id !== editingEventId));
    closeModal();
  };

  const handleDayClick = (day) => {
    if (!day) return;

    if (isSwipeChangingMonthRef.current) {
      return;
    }

    openAddModal(day);
  };

  const handleDayKeyDown = (e, day) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    e.preventDefault();
    handleDayClick(day);
  };

  return (
    <div className={styles.home}>
      <div
        className={`${styles.calendarPage} ${styles[theme]}`}
        onWheel={handleCalendarWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <header className={styles.header}>
          <div className={styles.topRow}>
            <div className={styles.yearArea}>
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
                onClick={() => openAddModal()}
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
          <div className={styles.calendarGrid}>
            {calendarDays.map((day, index) => {
              const dateKey = day ? formatDateKey(year, month, day) : null;
              const dayEvents = dateKey ? eventsByDate[dateKey] || [] : [];

              return (
                <div
                  key={`${day}-${index}`}
                  role={day === null ? undefined : 'button'}
                  tabIndex={day === null ? -1 : 0}
                  aria-disabled={day === null}
                  className={[
                    styles.dayCell,
                    day === null ? styles.emptyCell : '',
                    isWeekend(day) ? styles.weekendCell : '',
                    isToday(day) ? styles.todayCell : '',
                  ].join(' ')}
                  onClick={() => handleDayClick(day)}
                  onKeyDown={(e) => handleDayKeyDown(e, day)}
                >
                  {day !== null && (
                    <div className={styles.dayCellInner}>
                      <div className={styles.dayNumber}>{day}</div>

                      <div className={styles.eventList}>
                        {dayEvents.map((event) => {
                          const timeLabel = getEventTimeLabel(event);
                          const repeatLabel = getRepeatLabel(event.repeat);

                          return (
                            <button
                              key={`${event.id}-${event.occurrenceDate}`}
                              type="button"
                              className={styles.eventItem}
                              style={getEventStyle(event)}
                              onClick={(e) => openEditModal(event, e)}
                              aria-label={`${event.title}を編集`}
                            >
                              <span className={styles.eventMetaRow}>
                                {timeLabel && (
                                  <span className={styles.eventTime}>{timeLabel}</span>
                                )}
                                {event.repeat && event.repeat !== 'none' && (
                                  <span className={styles.eventRepeat}>{repeatLabel}</span>
                                )}
                              </span>
                              <span className={styles.eventTitle}>{event.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {isModalOpen && (
          <div className={styles.modalOverlay} onClick={closeModal}>
            <div
              className={styles.modal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <button
                  type="button"
                  className={styles.modalTextButton}
                  onClick={closeModal}
                >
                  キャンセル
                </button>

                <h2 className={styles.modalTitle}>
                  {modalMode === 'edit' ? '予定を編集' : '新規予定'}
                </h2>

                <button
                  type="button"
                  className={styles.modalPrimaryButton}
                  onClick={handleSaveEvent}
                >
                  {modalMode === 'edit' ? '保存' : '追加'}
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.formCard}>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="タイトル"
                    value={eventForm.title}
                    onChange={(e) => handleFormChange('title', e.target.value)}
                  />

                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="場所"
                    value={eventForm.location}
                    onChange={(e) => handleFormChange('location', e.target.value)}
                  />
                </div>

                <div className={styles.formCard}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>予定の色</span>
                    <span className={styles.sectionSubText}>{eventForm.categoryName}</span>
                  </div>

                  <div className={styles.categoryList}>
                    {[...EVENT_CATEGORIES, CUSTOM_CATEGORY].map((category) => {
                      const isSelected = eventForm.categoryId === category.id;

                      return (
                        <button
                          key={category.id}
                          type="button"
                          className={`${styles.categoryOption} ${
                            isSelected ? styles.categoryOptionSelected : ''
                          }`}
                          onClick={() => handleCategorySelect(category)}
                        >
                          <span
                            className={styles.categoryColorDot}
                            style={{ backgroundColor: category.color }}
                          />
                          <span className={styles.categoryName}>{category.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {eventForm.categoryId === 'custom' && (
                    <div className={styles.customCategoryRow}>
                      <input
                        type="text"
                        className={styles.textInput}
                        placeholder="用事の名前"
                        value={eventForm.categoryName}
                        onChange={(e) => handleFormChange('categoryName', e.target.value)}
                      />

                      <label className={styles.colorPickerLabel}>
                        <span>色</span>
                        <input
                          type="color"
                          className={styles.colorPicker}
                          value={eventForm.categoryColor}
                          onChange={(e) => handleFormChange('categoryColor', e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className={styles.formCard}>
                  <label className={styles.switchRow}>
                    <span className={styles.switchTextGroup}>
                      <span className={styles.switchTitle}>今日の予定にする</span>
                      <span className={styles.switchDescription}>オンにすると日付を今日にします</span>
                    </span>

                    <span className={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={eventForm.useToday}
                        onChange={(e) => handleTodayToggle(e.target.checked)}
                      />
                      <span className={styles.toggleTrack} />
                    </span>
                  </label>

                  <label className={styles.switchRow}>
                    <span className={styles.switchTextGroup}>
                      <span className={styles.switchTitle}>時刻を設定</span>
                      <span className={styles.switchDescription}>
                        オフの場合は終日予定になります
                      </span>
                    </span>

                    <span className={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={!eventForm.allDay}
                        onChange={(e) => handleTimeToggle(e.target.checked)}
                      />
                      <span className={styles.toggleTrack} />
                    </span>
                  </label>

                  <div className={styles.dateTimeRow}>
                    <span className={styles.dateTimeLabel}>開始</span>
                    <div className={styles.dateTimeInputs}>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={eventForm.startDate}
                        onChange={(e) => handleFormChange('startDate', e.target.value)}
                      />

                      {!eventForm.allDay && (
                        <input
                          type="time"
                          className={styles.timeInput}
                          value={eventForm.startTime}
                          onChange={(e) => handleFormChange('startTime', e.target.value)}
                        />
                      )}
                    </div>
                  </div>

                  <div className={styles.dateTimeRow}>
                    <span className={styles.dateTimeLabel}>終了</span>
                    <div className={styles.dateTimeInputs}>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={eventForm.endDate}
                        onChange={(e) => handleFormChange('endDate', e.target.value)}
                      />

                      {!eventForm.allDay && (
                        <input
                          type="time"
                          className={styles.timeInput}
                          value={eventForm.endTime}
                          onChange={(e) => handleFormChange('endTime', e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.formCard}>
                  <div className={styles.selectRow}>
                    <div className={styles.selectTextGroup}>
                      <span className={styles.sectionTitle}>繰り返し</span>
                      <span className={styles.sectionSubText}>毎日・毎週・毎年から選択</span>
                    </div>

                    <select
                      className={styles.selectInput}
                      value={eventForm.repeat}
                      onChange={(e) => handleFormChange('repeat', e.target.value)}
                    >
                      {REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {eventForm.repeat !== 'none' && (
                    <p className={styles.repeatHelpText}>
                      繰り返し予定は開始日以降の同じ条件の日に表示されます。
                    </p>
                  )}
                </div>

                <div className={styles.formCard}>
                  <textarea
                    className={styles.textArea}
                    placeholder="メモ"
                    rows="4"
                    value={eventForm.notes}
                    onChange={(e) => handleFormChange('notes', e.target.value)}
                  />
                </div>

                {modalMode === 'edit' && (
                  <div className={styles.modalFooter}>
                    <button
                      type="button"
                      className={styles.modalDangerButton}
                      onClick={handleDeleteEvent}
                    >
                      この予定を削除
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
