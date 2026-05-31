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
const EVENT_CATEGORY_STORAGE_KEY = 'calendarEventCategories';

const DEFAULT_EVENT_CATEGORIES = [
  { id: 'default', name: '予定', color: '#5ac8fa' },
];

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

function getDefaultCategory() {
  return DEFAULT_EVENT_CATEGORIES[0];
}

function getDefaultEventForm(baseDate = new Date(), category = getDefaultCategory()) {
  const start = new Date(baseDate);
  start.setMinutes(0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    title: '',
    location: '',
    allDay: false,
    startDate: formatDateInput(start),
    startTime: `${pad(start.getHours())}:00`,
    endDate: formatDateInput(end),
    endTime: `${pad(end.getHours())}:00`,
    categoryId: category.id,
    categoryName: category.name,
    categoryColor: category.color,
    repeat: 'none',
    isShared: false,
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

function getEventDateTimeValue(date, time, isEnd = false) {
  const fallbackTime = isEnd ? '23:59' : '00:00';
  const safeTime = time || fallbackTime;
  return new Date(`${date}T${safeTime}`);
}

function normalizeColor(color) {
  if (typeof color !== 'string') return getDefaultCategory().color;
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : getDefaultCategory().color;
}

function hexToRgba(hex, alpha) {
  const safeHex = normalizeColor(hex).replace('#', '');
  const value = Number.parseInt(safeHex, 16);

  if (Number.isNaN(value)) {
    return `rgba(90, 200, 250, ${alpha})`;
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

function readStoredCategories() {
  try {
    const saved = localStorage.getItem(EVENT_CATEGORY_STORAGE_KEY);
    if (!saved) return DEFAULT_EVENT_CATEGORIES;

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_EVENT_CATEGORIES;

    const cleaned = parsed
      .filter((category) => category?.id && category?.name && category?.color)
      .map((category) => ({
        id: String(category.id),
        name: String(category.name),
        color: normalizeColor(category.color),
      }));

    return cleaned.length > 0 ? cleaned : DEFAULT_EVENT_CATEGORIES;
  } catch (error) {
    console.error('failed to load categories', error);
    return DEFAULT_EVENT_CATEGORIES;
  }
}

export default function Home() {
  const { theme } = useTheme();

  const [weekStart, setWeekStart] = useState('sunday');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [eventCategories, setEventCategories] = useState(DEFAULT_EVENT_CATEGORIES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState(() => getDefaultEventForm());
  const [modalMode, setModalMode] = useState('add');
  const [editingEventId, setEditingEventId] = useState(null);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [categoryDraftMode, setCategoryDraftMode] = useState('add');
  const [categoryDraft, setCategoryDraft] = useState({
    id: null,
    name: '',
    color: '#5ac8fa',
  });

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
    setEventCategories(readStoredCategories());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error('failed to save events', error);
    }
  }, [events]);

  useEffect(() => {
    try {
      localStorage.setItem(EVENT_CATEGORY_STORAGE_KEY, JSON.stringify(eventCategories));
    } catch (error) {
      console.error('failed to save categories', error);
    }
  }, [eventCategories]);

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
    const defaultCategory = eventCategories[0] || getDefaultCategory();

    setModalMode('add');
    setEditingEventId(null);
    setIsCategoryFormOpen(false);
    setCategoryDraftMode('add');
    setCategoryDraft({ id: null, name: '', color: defaultCategory.color });
    setEventForm(getDefaultEventForm(baseDate, defaultCategory));
    setIsModalOpen(true);
  };

  const openEditModal = (calendarEvent, clickEvent) => {
    clickEvent.stopPropagation();

    const defaultCategory = eventCategories[0] || getDefaultCategory();
    const startDate = calendarEvent.startDate || formatDateInput(new Date());
    const endDate = calendarEvent.endDate || calendarEvent.startDate || formatDateInput(new Date());
    const startTime = calendarEvent.startTime || '09:00';
    const endTime = calendarEvent.endTime || calendarEvent.startTime || '10:00';
    const categoryColor = calendarEvent.categoryColor || defaultCategory.color;

    setModalMode('edit');
    setEditingEventId(calendarEvent.id);
    setIsCategoryFormOpen(false);
    setCategoryDraftMode('add');
    setCategoryDraft({ id: null, name: '', color: defaultCategory.color });
    setEventForm({
      title: calendarEvent.title || '',
      location: calendarEvent.location || '',
      allDay: false,
      startDate,
      startTime,
      endDate,
      endTime,
      categoryId: calendarEvent.categoryId || defaultCategory.id,
      categoryName: calendarEvent.categoryName || defaultCategory.name,
      categoryColor,
      repeat: calendarEvent.repeat || 'none',
      isShared: Boolean(calendarEvent.isShared),
      notes: calendarEvent.notes || '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalMode('add');
    setEditingEventId(null);
    setIsCategoryFormOpen(false);
    setCategoryDraftMode('add');
  };

  const handleFormChange = (key, value) => {
    setEventForm((prev) => ({
      ...prev,
      [key]: value,
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

  const openAddCategoryForm = () => {
    setCategoryDraftMode('add');
    setCategoryDraft({ id: null, name: '', color: '#5ac8fa' });
    setIsCategoryFormOpen(true);
  };

  const openEditCategoryForm = (category, e) => {
    e.stopPropagation();
    setCategoryDraftMode('edit');
    setCategoryDraft({
      id: category.id,
      name: category.name,
      color: category.color,
    });
    setIsCategoryFormOpen(true);
  };

  const cancelCategoryForm = () => {
    setIsCategoryFormOpen(false);
    setCategoryDraftMode('add');
    setCategoryDraft({ id: null, name: '', color: '#5ac8fa' });
  };

  const handleCategoryDraftChange = (key, value) => {
    setCategoryDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveCategory = () => {
    const name = categoryDraft.name.trim();
    const color = normalizeColor(categoryDraft.color);

    if (!name) {
      alert('用事の名前を入力してください。');
      return;
    }

    if (categoryDraftMode === 'edit' && categoryDraft.id) {
      const updatedCategory = { id: categoryDraft.id, name, color };

      setEventCategories((prev) => (
        prev.map((category) => (
          category.id === categoryDraft.id ? updatedCategory : category
        ))
      ));

      setEvents((prev) => (
        prev.map((event) => (
          event.categoryId === categoryDraft.id
            ? {
                ...event,
                categoryName: name,
                categoryColor: color,
              }
            : event
        ))
      ));

      if (eventForm.categoryId === categoryDraft.id) {
        handleCategorySelect(updatedCategory);
      }

      cancelCategoryForm();
      return;
    }

    const newCategory = {
      id: `custom-${Date.now()}`,
      name,
      color,
    };

    setEventCategories((prev) => [...prev, newCategory]);
    handleCategorySelect(newCategory);
    cancelCategoryForm();
  };

  const handleDeleteCategory = (category, e) => {
    e.stopPropagation();

    if (category.id === 'default') {
      alert('最初の「予定」は削除できません。');
      return;
    }

    const ok = window.confirm(`「${category.name}」を削除しますか？\nこの用事を使っている予定は「予定」に戻ります。`);
    if (!ok) return;

    const defaultCategory = eventCategories[0] || getDefaultCategory();

    setEventCategories((prev) => prev.filter((item) => item.id !== category.id));
    setEvents((prev) => (
      prev.map((event) => (
        event.categoryId === category.id
          ? {
              ...event,
              categoryId: defaultCategory.id,
              categoryName: defaultCategory.name,
              categoryColor: defaultCategory.color,
            }
          : event
      ))
    ));

    if (eventForm.categoryId === category.id) {
      handleCategorySelect(defaultCategory);
    }
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

    if (!eventForm.startTime || !eventForm.endTime) {
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
      false,
    );
    const endDateTime = getEventDateTimeValue(
      eventForm.endDate,
      eventForm.endTime,
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
    allDay: false,
    startDate: eventForm.startDate,
    startTime: eventForm.startTime,
    endDate: eventForm.endDate,
    endTime: eventForm.endTime,
    categoryId: eventForm.categoryId,
    categoryName: eventForm.categoryName.trim(),
    categoryColor: normalizeColor(eventForm.categoryColor),
    repeat: eventForm.repeat || 'none',
    isShared: Boolean(eventForm.isShared),
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
                                {event.isShared && (
                                  <span className={styles.eventShared}>共有</span>
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
                  <div className={styles.dateTimeRow}>
                    <span className={styles.dateTimeLabel}>開始</span>
                    <div className={styles.dateTimeInputs}>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={eventForm.startDate}
                        onChange={(e) => handleFormChange('startDate', e.target.value)}
                      />

                      <input
                        type="time"
                        className={styles.timeInput}
                        value={eventForm.startTime}
                        onChange={(e) => handleFormChange('startTime', e.target.value)}
                      />
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

                      <input
                        type="time"
                        className={styles.timeInput}
                        value={eventForm.endTime}
                        onChange={(e) => handleFormChange('endTime', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.formCard}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>用事を追加</span>
                    <span className={styles.sectionSubText}>{eventForm.categoryName}</span>
                  </div>

                  <div className={styles.categoryList}>
                    {eventCategories.map((category) => {
                      const isSelected = eventForm.categoryId === category.id;

                      return (
                        <div
                          key={category.id}
                          role="button"
                          tabIndex={0}
                          className={`${styles.categoryOption} ${
                            isSelected ? styles.categoryOptionSelected : ''
                          }`}
                          onClick={() => handleCategorySelect(category)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCategorySelect(category);
                            }
                          }}
                        >
                          <span
                            className={styles.categoryColorDot}
                            style={{ backgroundColor: category.color }}
                          />
                          <span className={styles.categoryName}>{category.name}</span>

                          <span className={styles.categoryActions}>
                            <button
                              type="button"
                              className={styles.categoryActionButton}
                              onClick={(e) => openEditCategoryForm(category, e)}
                            >
                              編集
                            </button>

                            {category.id !== 'default' && (
                              <button
                                type="button"
                                className={styles.categoryDeleteButton}
                                onClick={(e) => handleDeleteCategory(category, e)}
                              >
                                削除
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {isCategoryFormOpen ? (
                    <div className={styles.categoryEditor}>
                      <input
                        type="text"
                        className={styles.textInput}
                        placeholder="用事の名前"
                        value={categoryDraft.name}
                        onChange={(e) => handleCategoryDraftChange('name', e.target.value)}
                      />

                      <label className={styles.colorPickerLabel}>
                        <span>色</span>
                        <input
                          type="color"
                          className={styles.colorPicker}
                          value={categoryDraft.color}
                          onChange={(e) => handleCategoryDraftChange('color', e.target.value)}
                        />
                      </label>

                      <div className={styles.categoryEditorButtons}>
                        <button
                          type="button"
                          className={styles.categoryCancelButton}
                          onClick={cancelCategoryForm}
                        >
                          やめる
                        </button>

                        <button
                          type="button"
                          className={styles.categorySaveButton}
                          onClick={handleSaveCategory}
                        >
                          {categoryDraftMode === 'edit' ? '更新' : '追加'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.addCategoryButton}
                      onClick={openAddCategoryForm}
                    >
                      ＋ 用事を追加
                    </button>
                  )}
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

                  <label className={styles.switchRow}>
                    <span className={styles.switchTextGroup}>
                      <span className={styles.switchTitle}>共有する</span>
                      <span className={styles.switchDescription}>
                        オンにすると共有予定として保存します
                      </span>
                    </span>

                    <span className={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={eventForm.isShared}
                        onChange={(e) => handleFormChange('isShared', e.target.checked)}
                      />
                      <span className={styles.toggleTrack} />
                    </span>
                  </label>
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
