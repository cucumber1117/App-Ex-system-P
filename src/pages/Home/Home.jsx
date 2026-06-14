import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
const CALENDAR_MAX_RANGE_YEARS = 100;
const CALENDAR_EDGE_LOAD_MONTHS = 12;
const INITIAL_PAST_MONTHS = 3;
const INITIAL_FUTURE_MONTHS = 12;
const MIN_MONTH_OFFSET = -CALENDAR_MAX_RANGE_YEARS * 12;
const MAX_MONTH_OFFSET = CALENDAR_MAX_RANGE_YEARS * 12;

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

function formatMonthKey(year, month) {
  return `${year}-${pad(month + 1)}`;
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

function buildCalendarMonth(year, month, weekStartDay) {
  const firstDate = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0);
  const leadingEmptyCount = (firstDate.getDay() - weekStartDay + 7) % 7;
  const daysInMonth = lastDate.getDate();
  const cells = [];

  for (let i = 0; i < leadingEmptyCount; i++) {
    cells.push({ type: 'empty', key: `empty-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      type: 'day',
      key: formatDateKey(year, month, day),
      day,
      dateKey: formatDateKey(year, month, day),
    });
  }

  const trailingEmptyCount = (7 - (cells.length % 7)) % 7;

  for (let i = 0; i < trailingEmptyCount; i++) {
    cells.push({ type: 'empty', key: `trailing-empty-${i}` });
  }

  return {
    key: formatMonthKey(year, month),
    year,
    month,
    daysInMonth,
    leadingEmptyCount,
    cells,
  };
}


function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getWeekDates(baseDate, weekStartDay) {
  const dates = [];
  const startDate = new Date(baseDate);
  const diff = (startDate.getDay() - weekStartDay + 7) % 7;
  startDate.setDate(startDate.getDate() - diff);

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }

  return dates;
}

function formatHeaderDate(date) {
  const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}月${date.getDate()}日（${weekdayLabels[date.getDay()]}）`;
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
  const [now, setNow] = useState(new Date());
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
  const [monthRange, setMonthRange] = useState({
    startOffset: -INITIAL_PAST_MONTHS,
    endOffset: INITIAL_FUTURE_MONTHS,
  });
  const [calendarView, setCalendarView] = useState('month');

  const displayBaseDateRef = useRef(new Date());
  const hasScrolledToCurrentMonthRef = useRef(false);
  const monthSectionRefs = useRef({});
  const headerRef = useRef(null);
  const scrollRafRef = useRef(null);
  const activeMonthKeyRef = useRef(formatMonthKey(
    displayBaseDateRef.current.getFullYear(),
    displayBaseDateRef.current.getMonth(),
  ));
  const topLoadRef = useRef(null);
  const bottomLoadRef = useRef(null);
  const preserveScrollHeightRef = useRef(null);
  const pendingScrollMonthKeyRef = useRef(null);

  const year = currentDate.getFullYear();
  const weekStartDay = weekStart === 'monday' ? 1 : 0;
  const currentMonthLabel = `${currentDate.getMonth() + 1}月`;
  const currentDateLabel = useMemo(() => formatHeaderDate(currentDate), [currentDate]);
  const currentWeekDates = useMemo(
    () => getWeekDates(currentDate, weekStartDay),
    [currentDate, weekStartDay],
  );
  const currentWeekLabel = useMemo(() => {
    if (currentWeekDates.length === 0) return '';

    const first = currentWeekDates[0];
    const last = currentWeekDates[currentWeekDates.length - 1];
    return `${first.getMonth() + 1}月${first.getDate()}日〜${last.getMonth() + 1}月${last.getDate()}日`;
  }, [currentWeekDates]);
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const headerTitle = calendarView === 'day' || calendarView === 'week'
    ? currentMonthLabel
    : `${year}年`;
  const headerSubText = calendarView === 'day'
    ? currentDateLabel
    : calendarView === 'week'
      ? currentWeekLabel
      : calendarView === 'month'
        ? currentMonthLabel
        : '年間表示';

  const landingMonthKey = useMemo(() => {
    const landingDate = displayBaseDateRef.current;
    return formatMonthKey(landingDate.getFullYear(), landingDate.getMonth());
  }, []);

  const getMonthOffsetFromBase = useCallback((targetYear, targetMonth) => {
    const baseDate = displayBaseDateRef.current;
    return (targetYear - baseDate.getFullYear()) * 12 + (targetMonth - baseDate.getMonth());
  }, []);

  const ensureMonthLoaded = useCallback((targetYear, targetMonth) => {
    const targetOffset = getMonthOffsetFromBase(targetYear, targetMonth);

    setMonthRange((prev) => ({
      startOffset: Math.max(Math.min(prev.startOffset, targetOffset - 1), MIN_MONTH_OFFSET),
      endOffset: Math.min(Math.max(prev.endOffset, targetOffset + 1), MAX_MONTH_OFFSET),
    }));
  }, [getMonthOffsetFromBase]);

  const openMonthView = useCallback((targetYear, targetMonth) => {
    const targetKey = formatMonthKey(targetYear, targetMonth);

    pendingScrollMonthKeyRef.current = targetKey;
    activeMonthKeyRef.current = targetKey;
    ensureMonthLoaded(targetYear, targetMonth);
    setCalendarView('month');
  }, [ensureMonthLoaded]);

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
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timerId);
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

  const calendarMonths = useMemo(() => {
    const baseDate = displayBaseDateRef.current;
    const months = [];

    for (let offset = monthRange.startOffset; offset <= monthRange.endOffset; offset++) {
      const monthDate = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth() + offset,
        1,
      );

      months.push(
        buildCalendarMonth(
          monthDate.getFullYear(),
          monthDate.getMonth(),
          weekStartDay,
        ),
      );
    }

    return months;
  }, [monthRange, weekStartDay]);

  const loadPreviousMonths = useCallback(() => {
    setMonthRange((prev) => {
      if (prev.startOffset <= MIN_MONTH_OFFSET) return prev;

      if (typeof document !== 'undefined') {
        preserveScrollHeightRef.current = document.documentElement.scrollHeight;
      }

      return {
        ...prev,
        startOffset: Math.max(prev.startOffset - CALENDAR_EDGE_LOAD_MONTHS, MIN_MONTH_OFFSET),
      };
    });
  }, []);

  const loadNextMonths = useCallback(() => {
    setMonthRange((prev) => {
      if (prev.endOffset >= MAX_MONTH_OFFSET) return prev;

      return {
        ...prev,
        endOffset: Math.min(prev.endOffset + CALENDAR_EDGE_LOAD_MONTHS, MAX_MONTH_OFFSET),
      };
    });
  }, []);

  useEffect(() => {
    if (calendarView !== 'month') return undefined;

    const scrollKey = pendingScrollMonthKeyRef.current
      || (!hasScrolledToCurrentMonthRef.current ? landingMonthKey : null);

    if (!scrollKey) return undefined;

    const target = monthSectionRefs.current[scrollKey];
    if (!target) return undefined;

    const timerId = window.setTimeout(() => {
      target.scrollIntoView({ block: 'start' });

      if (scrollKey === landingMonthKey) {
        hasScrolledToCurrentMonthRef.current = true;
      }

      if (pendingScrollMonthKeyRef.current === scrollKey) {
        pendingScrollMonthKeyRef.current = null;
      }
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [calendarMonths, landingMonthKey, calendarView]);

  useLayoutEffect(() => {
    if (preserveScrollHeightRef.current === null) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const previousHeight = preserveScrollHeightRef.current;
    const currentHeight = document.documentElement.scrollHeight;
    const heightDiff = currentHeight - previousHeight;

    if (heightDiff > 0) {
      window.scrollBy(0, heightDiff);
    }

    preserveScrollHeightRef.current = null;
  }, [calendarMonths.length]);

  useEffect(() => {
    if (calendarView !== 'month') return undefined;

    const topTarget = topLoadRef.current;
    const bottomTarget = bottomLoadRef.current;

    if (!topTarget && !bottomTarget) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (!hasScrolledToCurrentMonthRef.current) return;

      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        if (entry.target === topTarget) {
          loadPreviousMonths();
        }

        if (entry.target === bottomTarget) {
          loadNextMonths();
        }
      });
    }, {
      root: null,
      rootMargin: '720px 0px',
      threshold: 0,
    });

    if (topTarget) observer.observe(topTarget);
    if (bottomTarget) observer.observe(bottomTarget);

    return () => observer.disconnect();
  }, [loadPreviousMonths, loadNextMonths, monthRange.startOffset, monthRange.endOffset, calendarView]);

  const syncCurrentMonthWithScroll = useCallback(() => {
    if (calendarView !== 'month') return;
    if (!hasScrolledToCurrentMonthRef.current) return;
    if (pendingScrollMonthKeyRef.current) return;
    if (typeof window === 'undefined') return;

    const headerHeight = headerRef.current?.getBoundingClientRect().height || 110;
    const anchorY = headerHeight + 8;
    let activeSection = null;
    let activeDistance = Number.POSITIVE_INFINITY;

    calendarMonths.forEach((monthData) => {
      const section = monthSectionRefs.current[monthData.key];
      if (!section) return;

      const rect = section.getBoundingClientRect();
      if (rect.height <= 0) return;

      const isRelevant = rect.bottom >= anchorY && rect.top <= window.innerHeight;
      if (!isRelevant) return;

      let distance = 0;
      if (rect.top <= anchorY && rect.bottom > anchorY) {
        distance = 0;
      } else if (rect.top > anchorY) {
        distance = rect.top - anchorY;
      } else {
        distance = anchorY - rect.bottom;
      }

      if (distance < activeDistance) {
        activeDistance = distance;
        activeSection = section;
      }
    });

    if (!activeSection) return;

    const targetYear = Number(activeSection.dataset.year);
    const targetMonth = Number(activeSection.dataset.month);

    if (Number.isNaN(targetYear) || Number.isNaN(targetMonth)) return;

    const activeKey = formatMonthKey(targetYear, targetMonth);
    if (activeMonthKeyRef.current === activeKey) return;

    activeMonthKeyRef.current = activeKey;

    setCurrentDate((prev) => {
      if (prev.getFullYear() === targetYear && prev.getMonth() === targetMonth) {
        return prev;
      }

      const nextDay = Math.min(prev.getDate(), getDaysInMonth(targetYear, targetMonth));
      return new Date(targetYear, targetMonth, nextDay);
    });
  }, [calendarMonths, calendarView]);

  useEffect(() => {
    if (calendarView !== 'month') return undefined;

    const handleScroll = () => {
      if (scrollRafRef.current !== null) return;

      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        syncCurrentMonthWithScroll();
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);

      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [syncCurrentMonthWithScroll, calendarView]);

  const eventsByDate = useMemo(() => {
    const grouped = {};

    calendarMonths.forEach((monthData) => {
      for (let day = 1; day <= monthData.daysInMonth; day++) {
        const dateKey = formatDateKey(monthData.year, monthData.month, day);
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
    });

    return grouped;
  }, [events, calendarMonths]);

  const currentDateKey = formatDateKey(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );

  const currentDayEvents = useMemo(() => {
    const dayEvents = events
      .filter((event) => isEventOnDate(event, currentDateKey))
      .map((event) => ({
        ...event,
        occurrenceDate: currentDateKey,
      }));

    dayEvents.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });

    return dayEvents;
  }, [events, currentDateKey]);

  const currentWeekEventsByDate = useMemo(() => {
    const grouped = {};

    currentWeekDates.forEach((date) => {
      const dateKey = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEvents = events
        .filter((event) => isEventOnDate(event, dateKey))
        .map((event) => ({
          ...event,
          occurrenceDate: dateKey,
        }));

      dayEvents.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return String(a.startTime || '').localeCompare(String(b.startTime || ''));
      });

      grouped[dateKey] = dayEvents;
    });

    return grouped;
  }, [events, currentWeekDates]);

  const isWeekendDate = (targetYear, targetMonth, day) => {
    const dayOfWeek = new Date(targetYear, targetMonth, day).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  const isTodayDate = (targetYear, targetMonth, day) => {
    const today = new Date();

    return (
      today.getFullYear() === targetYear &&
      today.getMonth() === targetMonth &&
      today.getDate() === day
    );
  };

  const formatWeekColumnTitle = (date) => {
    const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getMonth() + 1}月${date.getDate()}日・${weekdayLabels[date.getDay()]}`;
  };

  const openAddModal = (
    selectedDay = null,
    selectedYear = new Date().getFullYear(),
    selectedMonth = new Date().getMonth(),
  ) => {
    const baseDate = selectedDay
      ? new Date(selectedYear, selectedMonth, selectedDay)
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
    const startDate = calendarEvent.startDate || calendarEvent.occurrenceDate || formatDateInput(new Date());
    const endDate = calendarEvent.endDate || calendarEvent.startDate || calendarEvent.occurrenceDate || formatDateInput(new Date());
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

  const handleHeaderTitleClick = () => {
    if (calendarView === 'day' || calendarView === 'week') {
      openMonthView(currentDate.getFullYear(), currentDate.getMonth());
      return;
    }

    if (calendarView === 'month') {
      setCalendarView('year');
    }
  };

  const handleViewToggle = () => {
    setCalendarView((prev) => {
      if (prev === 'year') return 'month';
      if (prev === 'month') return 'week';
      if (prev === 'week') return 'month';
      return 'month';
    });
  };

  const handleYearMonthClick = (targetMonth) => {
    const selectedDay = Math.min(
      currentDate.getDate(),
      getDaysInMonth(year, targetMonth),
    );

    setCurrentDate(new Date(year, targetMonth, selectedDay));
    openMonthView(year, targetMonth);
  };

  const handleAddButtonClick = () => {
    openAddModal(
      currentDate.getDate(),
      currentDate.getFullYear(),
      currentDate.getMonth(),
    );
  };

  const handleDateStripClick = (date) => {
    setCurrentDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  };

  const handleDayClick = (day, targetYear, targetMonth) => {
    if (!day) return;
    setCurrentDate(new Date(targetYear, targetMonth, day));
    setCalendarView('week');
  };

  const handleDayKeyDown = (e, day, targetYear, targetMonth) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    e.preventDefault();
    handleDayClick(day, targetYear, targetMonth);
  };

  return (
    <div className={styles.home}>
      <div className={`${styles.calendarPage} ${styles[theme]} ${styles[`${calendarView}ViewPage`]}`}>
        <header ref={headerRef} className={styles.header}>
          <div className={styles.topRow}>
            <div className={styles.yearArea}>
              <button
                type="button"
                className={styles.headerTitleButton}
                onClick={handleHeaderTitleClick}
                disabled={calendarView === 'year'}
              >
                <span className={styles.headerTitleText}>{headerTitle}</span>
                <span className={styles.headerSubText}>{headerSubText}</span>
              </button>
            </div>

            <div className={styles.headerButtons}>
              <button
                className={styles.iconButton}
                type="button"
                aria-label="表示切替"
                onClick={handleViewToggle}
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
                className={`${styles.iconButton} ${styles.addIconButton}`}
                type="button"
                aria-label="追加"
                onClick={handleAddButtonClick}
              >
                ＋
              </button>
            </div>
          </div>

          {(calendarView === 'day' || calendarView === 'week') && (
            <div className={styles.dateStrip}>
              {currentWeekDates.map((date) => {
                const isSelected = (
                  date.getFullYear() === currentDate.getFullYear() &&
                  date.getMonth() === currentDate.getMonth() &&
                  date.getDate() === currentDate.getDate()
                );
                const isToday = isTodayDate(date.getFullYear(), date.getMonth(), date.getDate());
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const weekDayLabel = WEEK_DAYS.find((item) => item.day === date.getDay())?.label || '';

                return (
                  <button
                    key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                    type="button"
                    className={[
                      styles.dateStripItem,
                      calendarView === 'week' ? styles.weekDateStripItem : '',
                      isSelected ? styles.dateStripItemSelected : '',
                      isToday ? styles.dateStripItemToday : '',
                      isToday ? styles.weekDateStripItemToday : '',
                      isWeekend ? styles.dateStripWeekend : '',
                    ].join(' ')}
                    onClick={() => handleDateStripClick(date)}
                  >
                    <span className={styles.dateStripWeekday}>{weekDayLabel}</span>
                    <span
                      className={[
                        styles.dateStripNumber,
                        isSelected ? styles.weekDateStripNumberSelected : '',
                        isToday ? styles.weekDateStripNumberToday : '',
                        isWeekend ? styles.weekDateStripNumberWeekend : '',
                      ].join(' ')}
                    >
                      {date.getDate()}
                      {isToday && <span className={styles.weekTodayMarker} aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {calendarView === 'month' && (
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
          )}
        </header>

        <main className={styles.main}>
          {calendarView === 'year' && (
            <div className={styles.yearOverview}>
              {Array.from({ length: 12 }, (_, targetMonth) => {
                const miniMonth = buildCalendarMonth(year, targetMonth, weekStartDay);

                return (
                  <button
                    key={`${year}-${targetMonth}`}
                    type="button"
                    className={styles.yearMonthCard}
                    onClick={() => handleYearMonthClick(targetMonth)}
                  >
                    <h2 className={styles.yearMonthTitle}>{targetMonth + 1}月</h2>

                    <div className={styles.miniMonthGrid}>
                      {miniMonth.cells.map((cell, index) => {
                        if (cell.type === 'empty') {
                          return (
                            <span
                              key={`${miniMonth.key}-${cell.key}-${index}`}
                              className={styles.miniMonthEmpty}
                              aria-hidden="true"
                            />
                          );
                        }

                        const isSelected = (
                          currentDate.getFullYear() === year &&
                          currentDate.getMonth() === targetMonth &&
                          currentDate.getDate() === cell.day
                        );
                        const isToday = isTodayDate(year, targetMonth, cell.day);

                        return (
                          <span
                            key={cell.dateKey}
                            className={[
                              styles.miniMonthDay,
                              isSelected ? styles.miniMonthSelectedDay : '',
                              isToday ? styles.miniMonthToday : '',
                            ].join(' ')}
                          >
                            {cell.day}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {calendarView === 'week' && (
            <div className={styles.weekView}>
              <div className={styles.weekTimelineWrapper}>
                <div
                  className={styles.weekTimelineGrid}
                  style={{
                    gridTemplateColumns: `72px repeat(${currentWeekDates.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className={styles.weekTimelineCorner} />

                  {currentWeekDates.map((date) => {
                    const dateKey = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
                    const isSelected = (
                      date.getFullYear() === currentDate.getFullYear() &&
                      date.getMonth() === currentDate.getMonth() &&
                      date.getDate() === currentDate.getDate()
                    );
                    const allDayEvents = (currentWeekEventsByDate[dateKey] || []).filter((event) => event.allDay);

                    return (
                      <div
                        key={`week-header-${dateKey}`}
                        className={[
                          styles.weekDayHeader,
                          isSelected ? styles.weekDayHeaderSelected : '',
                        ].join(' ')}
                      >
                        <div className={styles.weekDayHeaderText}>{formatWeekColumnTitle(date)}</div>

                        {allDayEvents.length > 0 && (
                          <div className={styles.weekHeaderAllDayList}>
                            {allDayEvents.map((event) => (
                              <button
                                key={`week-all-day-${event.id}-${event.occurrenceDate}`}
                                type="button"
                                className={`${styles.dayEventItem} ${styles.weekEventItem}`}
                                style={getEventStyle(event)}
                                onClick={(e) => openEditModal(event, e)}
                              >
                                {event.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {Array.from({ length: 24 }, (_, hour) => (
                    <React.Fragment key={`week-hour-${hour}`}>
                      <div className={styles.weekTimeLabel}>{pad(hour)}:00</div>

                      {currentWeekDates.map((date) => {
                        const dateKey = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
                        const hourEvents = (currentWeekEventsByDate[dateKey] || []).filter((event) => {
                          if (event.allDay) return false;
                          const eventHour = Number(String(event.startTime || '00:00').split(':')[0]);
                          return eventHour === hour;
                        });

                        const isTodayColumn = isTodayDate(date.getFullYear(), date.getMonth(), date.getDate());

                        return (
                          <div key={`${dateKey}-${hour}`} className={styles.weekHourCell}>
                            {isTodayColumn && hour === currentHour && (
                              <div
                                className={styles.currentTimeLine}
                                style={{ top: `${(currentMinutes / 60) * 100}%` }}
                                aria-hidden="true"
                              >
                                <span className={styles.currentTimeDot} />
                              </div>
                            )}

                            {hourEvents.map((event) => (
                              <button
                                key={`${event.id}-${event.occurrenceDate}-${hour}`}
                                type="button"
                                className={`${styles.dayEventItem} ${styles.weekEventItem}`}
                                style={getEventStyle(event)}
                                onClick={(e) => openEditModal(event, e)}
                              >
                                <span className={styles.dayEventTime}>{getEventTimeLabel(event)}</span>
                                <span className={styles.dayEventTitle}>{event.title}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          {calendarView === 'month' && (
            <div className={styles.connectedCalendar}>
              <div ref={topLoadRef} className={styles.loadSentinel} aria-hidden="true" />

              {calendarMonths.map((monthData) => (
                <section
                  key={monthData.key}
                  ref={(element) => {
                    if (element) {
                      monthSectionRefs.current[monthData.key] = element;
                    }
                  }}
                  className={styles.monthSection}
                  data-year={monthData.year}
                  data-month={monthData.month}
                >
                  <div className={styles.monthSectionHeader}>
                    <div className={styles.monthSectionLabel}>{monthData.month + 1}月</div>
                  </div>

                  <div className={styles.calendarGrid}>
                    {monthData.cells.map((cell, index) => {
                      if (cell.type === 'empty') {
                        return (
                          <div
                            key={`${monthData.key}-${cell.key}-${index}`}
                            className={`${styles.dayCell} ${styles.emptyCell}`}
                            aria-hidden="true"
                          />
                        );
                      }

                      const dayEvents = eventsByDate[cell.dateKey] || [];
                      const weekend = isWeekendDate(monthData.year, monthData.month, cell.day);
                      const today = isTodayDate(monthData.year, monthData.month, cell.day);

                      return (
                        <div
                          key={cell.dateKey}
                          role="button"
                          tabIndex={0}
                          className={[
                            styles.dayCell,
                            weekend ? styles.weekendCell : '',
                            today ? styles.todayCell : '',
                          ].join(' ')}
                          onClick={() => handleDayClick(cell.day, monthData.year, monthData.month)}
                          onKeyDown={(e) => handleDayKeyDown(e, cell.day, monthData.year, monthData.month)}
                        >
                          <div className={styles.dayCellInner}>
                            <div className={styles.dayNumber}>{cell.day}</div>

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
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div ref={bottomLoadRef} className={styles.loadSentinel} aria-hidden="true" />
            </div>
          )}
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
