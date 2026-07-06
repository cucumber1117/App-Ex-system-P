import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './Home.module.css';
import { useTheme } from '../../contexts/ThemeContext';
import { auth } from '../../Firebase/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserSettings } from '../../Firebase/auth/users';
import { listJoinedGroups } from '../../Firebase/auth/groups';
import { listGroupSharedSchedules, listReceivedSchedules, shareScheduleToGroup } from '../../Firebase/auth/sharedSchedules';
import {
  deleteCalendarEvent,
  listCalendarEvents,
  saveCalendarEvent,
  saveCalendarEvents,
} from '../../Firebase/auth/calendarEvents';

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
    shareTargetGroupId: '',
    notes: '',
  };
}

function getEventTimeLabel(event) {
  if (event.allDay) return '終日';

  const startTime = event.occurrenceStartTime || event.startTime;
  const endTime = event.occurrenceEndTime || event.endTime;

  if (startTime && endTime) return `${startTime}〜${endTime}`;
  if (startTime) return startTime;
  return '';
}

function getTimeInMinutes(timeText, fallback = 0) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeText || ''));
  if (!match) return fallback;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return fallback;
  }

  return hours * 60 + minutes;
}

function getEventDurationMinutes(event) {
  if (event.allDay) return 0;

  if (Number.isFinite(event.occurrenceDurationMinutes)) {
    return Math.min(Math.max(event.occurrenceDurationMinutes, 15), 1440);
  }

  const startMinutes = getTimeInMinutes(event.startTime, 0);
  const endMinutes = getTimeInMinutes(event.endTime, startMinutes + 60);
  const startDate = parseDateOnly(event.startDate || event.occurrenceDate);
  const endDate = parseDateOnly(event.endDate || event.startDate || event.occurrenceDate);
  const dayOffset = startDate && endDate
    ? Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
    : 0;

  let duration = dayOffset * 1440 + endMinutes - startMinutes;

  if (!Number.isFinite(duration) || duration <= 0) {
    duration = endMinutes - startMinutes;
  }

  if (duration <= 0) {
    duration += 1440;
  }

  return Math.min(Math.max(duration, 15), 1440);
}

function getWeekEventPositionStyle(event) {
  const startMinutes = Number.isFinite(event.occurrenceStartMinutes)
    ? event.occurrenceStartMinutes
    : getTimeInMinutes(event.startTime, 0);
  const minuteOffset = startMinutes % 60;
  const durationMinutes = getEventDurationMinutes(event);

  return {
    '--week-event-top': `${(minuteOffset / 60) * 100}%`,
    '--week-event-height': `${(durationMinutes / 60) * 100}%`,
  };
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

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatMinutesAsTime(totalMinutes) {
  const safeMinutes = Math.max(0, Math.min(1440, Math.round(totalMinutes)));
  if (safeMinutes === 1440) return '24:00';

  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

function doesEventStartOnDate(event, dateKey) {
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

function getEventRangeDurationMs(event) {
  if (!event?.startDate) return null;

  const endDate = event.endDate || event.startDate;
  const startDateTime = getEventDateTimeValue(event.startDate, event.startTime, false);
  const endDateTime = getEventDateTimeValue(endDate, event.endTime, true);

  if (
    Number.isNaN(startDateTime.getTime()) ||
    Number.isNaN(endDateTime.getTime())
  ) {
    return null;
  }

  let durationMs = endDateTime.getTime() - startDateTime.getTime();

  // 既存データで同日かつ終了時刻が開始時刻以前の場合は、翌日終了として扱う。
  if (durationMs <= 0 && endDate === event.startDate) {
    durationMs += DAY_IN_MS;
  }

  return durationMs > 0 ? durationMs : null;
}

function getEventOccurrenceSegments(event, dateKey) {
  if (!event?.startDate || !dateKey) return [];

  const targetDate = parseDateOnly(dateKey);
  const durationMs = getEventRangeDurationMs(event);

  if (!targetDate || !durationMs) return [];

  const targetStartMs = targetDate.getTime();
  const targetEndMs = targetStartMs + DAY_IN_MS;
  const repeat = event.repeat || 'none';
  const candidateStartDateKeys = [];

  if (repeat === 'none') {
    candidateStartDateKeys.push(event.startDate);
  } else {
    // 日をまたぐ繰り返し予定では、前日に始まった回も対象日に続くため遡って確認する。
    const lookbackDays = Math.min(Math.max(Math.ceil(durationMs / DAY_IN_MS), 1), 370);

    for (let dayOffset = 0; dayOffset <= lookbackDays; dayOffset += 1) {
      const candidateDate = new Date(targetDate);
      candidateDate.setDate(candidateDate.getDate() - dayOffset);
      candidateStartDateKeys.push(formatDateInput(candidateDate));
    }
  }

  return candidateStartDateKeys.flatMap((candidateDateKey) => {
    if (!doesEventStartOnDate(event, candidateDateKey)) return [];

    const occurrenceStart = getEventDateTimeValue(
      candidateDateKey,
      event.startTime,
      false,
    );

    if (Number.isNaN(occurrenceStart.getTime())) return [];

    const occurrenceStartMs = occurrenceStart.getTime();
    const occurrenceEndMs = occurrenceStartMs + durationMs;
    const overlapStartMs = Math.max(occurrenceStartMs, targetStartMs);
    const overlapEndMs = Math.min(occurrenceEndMs, targetEndMs);

    // 終了がちょうど0:00の場合、翌日側には0分の予定を作らない。
    if (overlapStartMs >= overlapEndMs) return [];

    const occurrenceStartMinutes = (overlapStartMs - targetStartMs) / 60000;
    const occurrenceEndMinutes = (overlapEndMs - targetStartMs) / 60000;
    const occurrenceDurationMinutes = occurrenceEndMinutes - occurrenceStartMinutes;

    return [{
      ...event,
      occurrenceDate: dateKey,
      occurrenceStartDate: candidateDateKey,
      occurrenceStartMinutes,
      occurrenceEndMinutes,
      occurrenceDurationMinutes,
      occurrenceStartTime: formatMinutesAsTime(occurrenceStartMinutes),
      occurrenceEndTime: formatMinutesAsTime(occurrenceEndMinutes),
      occurrenceContinuesFromPreviousDay: occurrenceStartMs < targetStartMs,
      occurrenceContinuesToNextDay: occurrenceEndMs > targetEndMs,
      occurrenceSegmentKey: [
        candidateDateKey,
        dateKey,
        Math.round(occurrenceStartMinutes),
        Math.round(occurrenceEndMinutes),
      ].join('-'),
    }];
  });
}

function isEventOnDate(event, dateKey) {
  return getEventOccurrenceSegments(event, dateKey).length > 0;
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


const DATE_PICKER_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const TIME_PICKER_HOURS = Array.from({ length: 24 }, (_, index) => index);
const TIME_PICKER_MINUTES = Array.from({ length: 60 }, (_, index) => index);

function formatDatePickerLabel(dateText) {
  const date = parseDateOnly(dateText);
  if (!date) return '日付を選択';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function parseTimeParts(timeText) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeText || ''));
  if (!match) return { hour: 0, minute: 0 };

  const hour = Math.min(Math.max(Number(match[1]) || 0, 0), 23);
  const minute = Math.min(Math.max(Number(match[2]) || 0, 0), 59);
  return { hour, minute };
}

function getDatePickerCells(year, month) {
  const firstDate = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDate.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      date,
      key: formatDateInput(date),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function CalendarFieldIcon() {
  return (
    <svg className={styles.dateTimeFieldIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function ClockFieldIcon() {
  return (
    <svg className={styles.dateTimeFieldIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}

function DatePickerField({
  value,
  isOpen,
  pickerView,
  onToggle,
  onSelect,
  onMoveMonth,
  onSelectToday,
}) {
  const selectedDate = parseDateOnly(value);
  const today = new Date();
  const cells = getDatePickerCells(pickerView.year, pickerView.month);

  return (
    <div className={`${styles.dateTimePickerControl} ${styles.dateTimePickerDateControl}`}>
      <button
        type="button"
        className={`${styles.dateTimePickerButton} ${isOpen ? styles.dateTimePickerButtonOpen : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span className={styles.dateTimePickerValue}>{formatDatePickerLabel(value)}</span>
        <CalendarFieldIcon />
      </button>

      {isOpen && (
        <div className={styles.datePickerPopover} role="dialog" aria-label="日付を選択">
          <div className={styles.datePickerHeader}>
            <button
              type="button"
              className={styles.datePickerNavButton}
              aria-label="前の月"
              onClick={() => onMoveMonth(-1)}
            >
              ‹
            </button>
            <span className={styles.datePickerMonthLabel}>
              {pickerView.year}年{pickerView.month + 1}月
            </span>
            <button
              type="button"
              className={styles.datePickerNavButton}
              aria-label="次の月"
              onClick={() => onMoveMonth(1)}
            >
              ›
            </button>
          </div>

          <div className={styles.datePickerWeekdays} aria-hidden="true">
            {DATE_PICKER_WEEKDAYS.map((weekday, index) => (
              <span
                key={weekday}
                className={`${styles.datePickerWeekday} ${
                  index === 0
                    ? styles.datePickerSunday
                    : index === 6
                      ? styles.datePickerSaturday
                      : ''
                }`}
              >
                {weekday}
              </span>
            ))}
          </div>

          <div className={styles.datePickerGrid}>
            {cells.map(({ date, key, isCurrentMonth }) => {
              const isSelected = selectedDate && formatDateInput(selectedDate) === key;
              const isToday = formatDateInput(today) === key;
              const dayOfWeek = date.getDay();

              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.datePickerDay} ${
                    !isCurrentMonth ? styles.datePickerDayOutside : ''
                  } ${isToday ? styles.datePickerDayToday : ''} ${
                    isSelected ? styles.datePickerDaySelected : ''
                  } ${dayOfWeek === 0 ? styles.datePickerSunday : ''} ${
                    dayOfWeek === 6 ? styles.datePickerSaturday : ''
                  }`}
                  aria-pressed={Boolean(isSelected)}
                  onClick={() => onSelect(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className={styles.datePickerFooter}>
            <button
              type="button"
              className={styles.datePickerTodayButton}
              onClick={onSelectToday}
            >
              今日
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimePickerField({ value, isOpen, onToggle, onChange, onClose }) {
  const { hour, minute } = parseTimeParts(value);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      const centerSelectedOption = (listElement, selectedValue) => {
        if (!listElement) return;
        const selectedOption = listElement.querySelector(`[data-value="${selectedValue}"]`);
        if (!selectedOption) return;

        listElement.scrollTop = Math.max(
          0,
          selectedOption.offsetTop - (listElement.clientHeight - selectedOption.offsetHeight) / 2,
        );
      };

      centerSelectedOption(hourListRef.current, hour);
      centerSelectedOption(minuteListRef.current, minute);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [hour, isOpen, minute]);

  const updateTime = (nextHour, nextMinute) => {
    onChange(`${pad(nextHour)}:${pad(nextMinute)}`);
  };

  return (
    <div className={`${styles.dateTimePickerControl} ${styles.dateTimePickerTimeControl}`}>
      <button
        type="button"
        className={`${styles.dateTimePickerButton} ${isOpen ? styles.dateTimePickerButtonOpen : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span className={styles.dateTimePickerValue}>{`${pad(hour)}:${pad(minute)}`}</span>
        <ClockFieldIcon />
      </button>

      {isOpen && (
        <div className={`${styles.datePickerPopover} ${styles.timePickerPopover}`} role="dialog" aria-label="時刻を選択">
          <div className={styles.timePickerHeader}>時刻を選択</div>
          <div className={styles.timePickerColumns}>
            <div className={styles.timePickerColumnBlock}>
              <span className={styles.timePickerColumnLabel}>時</span>
              <div ref={hourListRef} className={styles.timePickerList} role="listbox" aria-label="時">
                {TIME_PICKER_HOURS.map((hourValue) => (
                  <button
                    key={hourValue}
                    type="button"
                    data-value={hourValue}
                    role="option"
                    aria-selected={hourValue === hour}
                    className={`${styles.timePickerOption} ${
                      hourValue === hour ? styles.timePickerOptionSelected : ''
                    }`}
                    onClick={() => updateTime(hourValue, minute)}
                  >
                    {pad(hourValue)}
                  </button>
                ))}
              </div>
            </div>

            <span className={styles.timePickerSeparator}>:</span>

            <div className={styles.timePickerColumnBlock}>
              <span className={styles.timePickerColumnLabel}>分</span>
              <div ref={minuteListRef} className={styles.timePickerList} role="listbox" aria-label="分">
                {TIME_PICKER_MINUTES.map((minuteValue) => (
                  <button
                    key={minuteValue}
                    type="button"
                    data-value={minuteValue}
                    role="option"
                    aria-selected={minuteValue === minute}
                    className={`${styles.timePickerOption} ${
                      minuteValue === minute ? styles.timePickerOptionSelected : ''
                    }`}
                    onClick={() => updateTime(hour, minuteValue)}
                  >
                    {pad(minuteValue)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.timePickerFooter}>
            <button type="button" className={styles.timePickerDoneButton} onClick={onClose}>
              完了
            </button>
          </div>
        </div>
      )}
    </div>
  );
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

function readStoredEvents() {
  try {
    const saved = localStorage.getItem(EVENT_STORAGE_KEY);
    if (!saved) return [];

    const parsedEvents = JSON.parse(saved);
    return Array.isArray(parsedEvents) ? parsedEvents : [];
  } catch (error) {
    console.error('failed to load events', error);
    return [];
  }
}

function buildEventFromGroupShare(share) {
  return {
    ...(share.schedule || {}),
    id: `received-${share.id}`,
    isShared: true,
    isReceivedShared: true,
    sharedScheduleId: share.id,
    sharedByUid: share.senderUid,
    sharedByName: share.senderName,
    shareTargetGroupId: share.groupId || '',
    shareTargetGroupName: share.groupName || '',
  };
}

function getSharedScheduleKey(share) {
  const schedule = share.schedule || {};
  const sourceId = share.sourceEventId || schedule.id || '';

  if (sourceId) {
    return `${share.groupId || ''}:${share.senderUid || ''}:${sourceId}`;
  }

  return [
    share.groupId || '',
    share.senderUid || '',
    schedule.title || '',
    schedule.startDate || '',
    schedule.startTime || '',
    schedule.endDate || '',
    schedule.endTime || '',
  ].join('|');
}

function dedupeSharedSchedules(shares) {
  const sharesByKey = new Map();

  shares.forEach((share) => {
    sharesByKey.set(getSharedScheduleKey(share), share);
  });

  return [...sharesByKey.values()];
}

export default function Home() {
  const { theme } = useTheme();

  const [weekStart, setWeekStart] = useState('sunday');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [events, setEvents] = useState(() => readStoredEvents());
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
  const [yearRange, setYearRange] = useState(() => {
    const baseYear = new Date().getFullYear();
    return {
      startYear: baseYear - 2,
      endYear: baseYear + 3,
    };
  });
  const [calendarView, setCalendarView] = useState('month');
  const [currentUser, setCurrentUser] = useState(null);
  const [joinedGroups, setJoinedGroups] = useState([]);
  const [receivedGroupShares, setReceivedGroupShares] = useState([]);
  const [selectedSharedGroupId, setSelectedSharedGroupId] = useState('');
  const [isLoadingShareGroups, setIsLoadingShareGroups] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isGroupFilterOpen, setIsGroupFilterOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileWeekLayout, setIsMobileWeekLayout] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 600px)').matches
      : false
  ));
  const [activeDateTimePicker, setActiveDateTimePicker] = useState(null);
  const [datePickerView, setDatePickerView] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  const displayBaseDateRef = useRef(new Date());
  const hasScrolledToCurrentMonthRef = useRef(false);
  const monthSectionRefs = useRef({});
  const calendarPageRef = useRef(null);
  const headerRef = useRef(null);
  const groupFilterRef = useRef(null);
  const searchPanelRef = useRef(null);
  const searchInputRef = useRef(null);
  const dateTimePickerAreaRef = useRef(null);
  const scrollRafRef = useRef(null);
  const activeMonthKeyRef = useRef(formatMonthKey(
    displayBaseDateRef.current.getFullYear(),
    displayBaseDateRef.current.getMonth(),
  ));
  const topLoadRef = useRef(null);
  const bottomLoadRef = useRef(null);
  const preserveScrollHeightRef = useRef(null);
  const pendingScrollMonthKeyRef = useRef(null);
  const monthTransitionLockRef = useRef(false);
  const monthTransitionTimerRef = useRef(null);
  const weekTouchStartRef = useRef({ x: 0, y: 0, moved: false });
  const weekPointerStartRef = useRef({ x: 0, y: 0, active: false, moved: false });
  const weekNavigateLockRef = useRef(false);
  const weekTimelineWrapperRef = useRef(null);
  const yearTouchStartRef = useRef({ x: 0, y: 0, moved: false });
  const yearNavigateLockRef = useRef(false);
  const yearSectionRefs = useRef({});
  const yearTopLoadRef = useRef(null);
  const yearBottomLoadRef = useRef(null);
  const preserveYearScrollHeightRef = useRef(null);
  const hasScrolledToCurrentYearRef = useRef(false);
  const yearScrollRafRef = useRef(null);
  const activeYearRef = useRef(new Date().getFullYear());
  const pendingYearScrollRef = useRef(null);
  const yearTransitionLockRef = useRef(false);
  const yearTransitionTimerRef = useRef(null);
  const yearTransitionRafRef = useRef(null);
  const yearTransitionStableFramesRef = useRef(0);

  const year = currentDate.getFullYear();
  const weekStartDay = weekStart === 'monday' ? 1 : 0;
  const currentMonthLabel = `${currentDate.getMonth() + 1}月`;
  const currentDateLabel = useMemo(() => formatHeaderDate(currentDate), [currentDate]);
  const currentWeekDates = useMemo(
    () => getWeekDates(currentDate, weekStartDay),
    [currentDate, weekStartDay],
  );
  const weekTimelineDates = useMemo(() => {
    if (!isMobileWeekLayout) return currentWeekDates;

    const firstDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
    );
    const nextDate = new Date(firstDate);
    nextDate.setDate(nextDate.getDate() + 1);

    return [firstDate, nextDate];
  }, [currentDate, currentWeekDates, isMobileWeekLayout]);
  const currentWeekLabel = useMemo(() => {
    if (currentWeekDates.length === 0) return '';

    const first = currentWeekDates[0];
    const last = currentWeekDates[currentWeekDates.length - 1];
    return `${first.getMonth() + 1}月${first.getDate()}日〜${last.getMonth() + 1}月${last.getDate()}日`;
  }, [currentWeekDates]);
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const calendarYears = useMemo(() => {
    const years = [];

    for (let targetYear = yearRange.startYear; targetYear <= yearRange.endYear; targetYear++) {
      years.push(targetYear);
    }

    return years;
  }, [yearRange]);
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

    if (monthTransitionTimerRef.current !== null) {
      window.clearTimeout(monthTransitionTimerRef.current);
      monthTransitionTimerRef.current = null;
    }

    monthTransitionLockRef.current = true;
    hasScrolledToCurrentMonthRef.current = false;
    pendingScrollMonthKeyRef.current = targetKey;
    activeMonthKeyRef.current = targetKey;

    setCurrentDate((prev) => {
      const nextDay = Math.min(prev.getDate(), getDaysInMonth(targetYear, targetMonth));
      if (
        prev.getFullYear() === targetYear &&
        prev.getMonth() === targetMonth &&
        prev.getDate() === nextDay
      ) {
        return prev;
      }
      return new Date(targetYear, targetMonth, nextDay);
    });

    ensureMonthLoaded(targetYear, targetMonth);
    setCalendarView('month');
  }, [ensureMonthLoaded]);

  useEffect(() => () => {
    if (monthTransitionTimerRef.current !== null) {
      window.clearTimeout(monthTransitionTimerRef.current);
    }
    if (yearTransitionTimerRef.current !== null) {
      window.clearTimeout(yearTransitionTimerRef.current);
    }
  }, []);

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
      setCurrentUser(user);

      if (!user) {
        setWeekStart(readLocalWeekStart());
        setJoinedGroups([]);
        setReceivedGroupShares([]);
        setSelectedSharedGroupId('');
        setIsLoadingShareGroups(false);
        setEvents(readStoredEvents());
        return;
      }

      try {
        setIsLoadingShareGroups(true);
        const [settings, groupItems, firebaseEvents, receivedSchedules] = await Promise.all([
          getUserSettings(user.uid),
          listJoinedGroups(user.uid),
          listCalendarEvents(user.uid),
          listReceivedSchedules(user.uid),
        ]);
        const localEvents = readStoredEvents();
        const localEventsToMigrate = localEvents.filter((localEvent) => (
          localEvent?.id && !firebaseEvents.some((event) => String(event.id) === String(localEvent.id))
        ));

        if (localEventsToMigrate.length > 0) {
          await saveCalendarEvents(user.uid, localEventsToMigrate);
        }

        const groupStoredShares = (await Promise.all(
          groupItems.map((group) => listGroupSharedSchedules(group.id, user.uid))
        )).flat();
        const groupSharesById = new Map();

        [...receivedSchedules, ...groupStoredShares]
          .filter((share) => share.targetType === 'group')
          .forEach((share) => {
            groupSharesById.set(share.id, share);
          });

        setWeekStart(settings.weekStart || readLocalWeekStart());
        setJoinedGroups(groupItems);
        setReceivedGroupShares([...groupSharesById.values()]);
        setEvents([...firebaseEvents, ...localEventsToMigrate]);
        localStorage.removeItem(EVENT_STORAGE_KEY);
      } catch (err) {
        console.error('load home data', err);
        setJoinedGroups([]);
        setReceivedGroupShares([]);
        setEvents(readStoredEvents());
      } finally {
        setIsLoadingShareGroups(false);
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
    if (!selectedSharedGroupId) return;
    if (joinedGroups.some((group) => group.id === selectedSharedGroupId)) return;
    setSelectedSharedGroupId('');
  }, [joinedGroups, selectedSharedGroupId]);

  useEffect(() => {
    if (!isSearchOpen) return undefined;

    const focusTimerId = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimerId);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isGroupFilterOpen && !isSearchOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        isGroupFilterOpen &&
        groupFilterRef.current &&
        !groupFilterRef.current.contains(event.target)
      ) {
        setIsGroupFilterOpen(false);
      }

      if (
        isSearchOpen &&
        searchPanelRef.current &&
        !searchPanelRef.current.contains(event.target)
      ) {
        setIsSearchOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setIsGroupFilterOpen(false);
      setIsSearchOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGroupFilterOpen, isSearchOpen]);

  useEffect(() => {
    if (!activeDateTimePicker) return undefined;

    const handlePointerDown = (event) => {
      if (
        dateTimePickerAreaRef.current &&
        !dateTimePickerAreaRef.current.contains(event.target)
      ) {
        setActiveDateTimePicker(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveDateTimePicker(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDateTimePicker]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timerId);
  }, []);

  useLayoutEffect(() => {
    const calendarPage = calendarPageRef.current;
    const header = headerRef.current;

    if (!calendarPage || !header) return undefined;

    const syncHeaderHeight = () => {
      const nextHeight = Math.ceil(header.getBoundingClientRect().height);
      if (nextHeight > 0) {
        calendarPage.style.setProperty('--calendar-header-height', `${nextHeight}px`);
      }
    };

    const frameId = window.requestAnimationFrame(syncHeaderHeight);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncHeaderHeight)
      : null;

    resizeObserver?.observe(header);
    window.addEventListener('resize', syncHeaderHeight);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncHeaderHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 600px)');
    const syncMobileWeekLayout = () => {
      setIsMobileWeekLayout(mediaQuery.matches);
    };

    syncMobileWeekLayout();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncMobileWeekLayout);
      return () => mediaQuery.removeEventListener('change', syncMobileWeekLayout);
    }

    mediaQuery.addListener(syncMobileWeekLayout);
    return () => mediaQuery.removeListener(syncMobileWeekLayout);
  }, []);

  useLayoutEffect(() => {
    if (calendarView !== 'week') return;
    if (!weekTimelineWrapperRef.current) return;

    weekTimelineWrapperRef.current.scrollLeft = 0;
  }, [calendarView, currentDate, isMobileWeekLayout]);

  useEffect(() => {
    setEventCategories(readStoredCategories());
  }, []);

  useEffect(() => {
    if (currentUser) return;

    try {
      localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error('failed to save events', error);
    }
  }, [currentUser, events]);

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

    monthTransitionLockRef.current = true;
    activeMonthKeyRef.current = scrollKey;

    let secondFrameId = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
        const targetTop = window.scrollY + target.getBoundingClientRect().top - headerHeight - 2;

        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'auto',
        });

        hasScrolledToCurrentMonthRef.current = true;

        if (monthTransitionTimerRef.current !== null) {
          window.clearTimeout(monthTransitionTimerRef.current);
        }

        monthTransitionTimerRef.current = window.setTimeout(() => {
          if (pendingScrollMonthKeyRef.current === scrollKey) {
            pendingScrollMonthKeyRef.current = null;
          }
          monthTransitionLockRef.current = false;
          monthTransitionTimerRef.current = null;
        }, 360);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) window.cancelAnimationFrame(secondFrameId);
    };
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
      if (monthTransitionLockRef.current) return;

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
    if (monthTransitionLockRef.current) return;
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

  const loadPreviousYears = useCallback(() => {
    setYearRange((prev) => {
      if (typeof document !== 'undefined') {
        preserveYearScrollHeightRef.current = document.documentElement.scrollHeight;
      }

      return {
        ...prev,
        startYear: prev.startYear - 3,
      };
    });
  }, []);

  const loadNextYears = useCallback(() => {
    setYearRange((prev) => ({
      ...prev,
      endYear: prev.endYear + 3,
    }));
  }, []);

  useEffect(() => {
    if (calendarView !== 'year') {
      hasScrolledToCurrentYearRef.current = false;
      yearTransitionLockRef.current = false;
      pendingYearScrollRef.current = null;
      yearTransitionStableFramesRef.current = 0;

      if (yearTransitionTimerRef.current !== null) {
        window.clearTimeout(yearTransitionTimerRef.current);
        yearTransitionTimerRef.current = null;
      }

      if (yearTransitionRafRef.current !== null) {
        window.cancelAnimationFrame(yearTransitionRafRef.current);
        yearTransitionRafRef.current = null;
      }

      return undefined;
    }

    const targetYear = pendingYearScrollRef.current ?? currentDate.getFullYear();
    const target = yearSectionRefs.current[targetYear];
    if (!target || hasScrolledToCurrentYearRef.current) return undefined;

    yearTransitionLockRef.current = true;
    activeYearRef.current = targetYear;
    yearTransitionStableFramesRef.current = 0;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 45;

    const alignAndCheck = () => {
      if (cancelled) return;

      const latestTarget = yearSectionRefs.current[targetYear];
      if (!latestTarget) {
        yearTransitionRafRef.current = window.requestAnimationFrame(alignAndCheck);
        return;
      }

      const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
      const desiredTop = headerHeight + 2;
      const rect = latestTarget.getBoundingClientRect();
      const distance = rect.top - desiredTop;

      if (Math.abs(distance) > 1.5) {
        window.scrollBy({ top: distance, behavior: 'auto' });
        yearTransitionStableFramesRef.current = 0;
      } else {
        yearTransitionStableFramesRef.current += 1;
      }

      attempts += 1;

      if (yearTransitionStableFramesRef.current >= 4 || attempts >= maxAttempts) {
        hasScrolledToCurrentYearRef.current = true;
        pendingYearScrollRef.current = null;
        yearTransitionLockRef.current = false;
        yearTransitionRafRef.current = null;
        return;
      }

      yearTransitionRafRef.current = window.requestAnimationFrame(alignAndCheck);
    };

    yearTransitionRafRef.current = window.requestAnimationFrame(() => {
      yearTransitionRafRef.current = window.requestAnimationFrame(alignAndCheck);
    });

    return () => {
      cancelled = true;

      if (yearTransitionRafRef.current !== null) {
        window.cancelAnimationFrame(yearTransitionRafRef.current);
        yearTransitionRafRef.current = null;
      }
    };
  }, [calendarView, calendarYears, currentDate]);

  useLayoutEffect(() => {
    if (preserveYearScrollHeightRef.current === null) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const previousHeight = preserveYearScrollHeightRef.current;
    const currentHeight = document.documentElement.scrollHeight;
    const heightDiff = currentHeight - previousHeight;

    if (heightDiff > 0) {
      window.scrollBy(0, heightDiff);
    }

    preserveYearScrollHeightRef.current = null;
  }, [calendarYears.length]);

  useEffect(() => {
    if (calendarView !== 'year') return undefined;

    const topTarget = yearTopLoadRef.current;
    const bottomTarget = yearBottomLoadRef.current;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (
          !entry.isIntersecting ||
          !hasScrolledToCurrentYearRef.current ||
          yearTransitionLockRef.current
        ) return;

        if (entry.target === topTarget) {
          loadPreviousYears();
        }

        if (entry.target === bottomTarget) {
          loadNextYears();
        }
      });
    }, {
      root: null,
      rootMargin: '700px 0px',
      threshold: 0,
    });

    if (topTarget) observer.observe(topTarget);
    if (bottomTarget) observer.observe(bottomTarget);

    return () => observer.disconnect();
  }, [calendarView, yearRange.startYear, yearRange.endYear, loadPreviousYears, loadNextYears]);

  const syncCurrentYearWithScroll = useCallback(() => {
    if (calendarView !== 'year') return;
    if (!hasScrolledToCurrentYearRef.current) return;
    if (yearTransitionLockRef.current) return;

    const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
    const anchorY = headerHeight + 8;
    const sections = calendarYears
      .map((targetYear) => yearSectionRefs.current[targetYear])
      .filter(Boolean);

    if (sections.length === 0) return;

    let selectedSection = sections[0];

    for (const section of sections) {
      const rect = section.getBoundingClientRect();

      if (rect.top <= anchorY) {
        selectedSection = section;
      }

      if (rect.top <= anchorY && rect.bottom > anchorY) {
        selectedSection = section;
        break;
      }

      if (rect.top > anchorY) {
        break;
      }
    }

    const targetYear = Number(selectedSection.dataset.year);
    if (Number.isNaN(targetYear) || activeYearRef.current === targetYear) return;

    activeYearRef.current = targetYear;

    setCurrentDate((prev) => {
      if (prev.getFullYear() === targetYear) return prev;

      const nextDay = Math.min(
        prev.getDate(),
        getDaysInMonth(targetYear, prev.getMonth()),
      );

      return new Date(targetYear, prev.getMonth(), nextDay);
    });
  }, [calendarView, calendarYears]);

  useEffect(() => {
    if (calendarView !== 'year') return undefined;

    const handleScroll = () => {
      if (yearScrollRafRef.current !== null) return;

      yearScrollRafRef.current = window.requestAnimationFrame(() => {
        yearScrollRafRef.current = null;
        syncCurrentYearWithScroll();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);

      if (yearScrollRafRef.current !== null) {
        window.cancelAnimationFrame(yearScrollRafRef.current);
        yearScrollRafRef.current = null;
      }
    };
  }, [calendarView, calendarYears, syncCurrentYearWithScroll]);

  const selectedGroupFilterLabel = useMemo(() => {
    if (!selectedSharedGroupId) return 'すべての予定';

    const selectedGroup = joinedGroups.find((group) => group.id === selectedSharedGroupId);
    return selectedGroup
      ? `${selectedGroup.name || '名前未設定のグループ'}の共有予定`
      : 'すべての予定';
  }, [joinedGroups, selectedSharedGroupId]);

  const visibleEvents = useMemo(() => {
    const targetGroupShares = selectedSharedGroupId
      ? receivedGroupShares.filter((share) => share.groupId === selectedSharedGroupId)
      : receivedGroupShares;
    const selectedGroupShares = dedupeSharedSchedules(targetGroupShares);
    const selectedShareIds = new Set(selectedGroupShares.map((share) => share.id));
    const ownSharedEvents = selectedSharedGroupId
      ? events.filter((event) => (
        event.isShared && event.shareTargetGroupId === selectedSharedGroupId
      ) || (
        event.sharedScheduleId && selectedShareIds.has(event.sharedScheduleId)
      ))
      : events;
    const importedShareIds = new Set(
      events
        .map((event) => event.sharedScheduleId)
        .filter(Boolean)
    );
    const receivedSharedEvents = selectedGroupShares
      .filter((share) => share.senderUid !== currentUser?.uid)
      .filter((share) => !importedShareIds.has(share.id))
      .map(buildEventFromGroupShare);

    return [...ownSharedEvents, ...receivedSharedEvents];
  }, [currentUser, events, receivedGroupShares, selectedSharedGroupId]);

  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ja-JP');
    if (!normalizedQuery) return [];

    const groupNameById = new Map(
      joinedGroups.map((group) => [String(group.id), String(group.name || '名前未設定のグループ')])
    );
    const matchingEvents = new Map();

    visibleEvents.forEach((event, index) => {
      const title = String(event.title || '');
      const groupName = String(
        event.shareTargetGroupName ||
        groupNameById.get(String(event.shareTargetGroupId || '')) ||
        ''
      );
      const matchesTitle = title.toLocaleLowerCase('ja-JP').includes(normalizedQuery);
      const matchesGroupName = groupName.toLocaleLowerCase('ja-JP').includes(normalizedQuery);

      if (!matchesTitle && !matchesGroupName) return;

      const resultKey = String(
        event.sharedScheduleId ||
        event.id ||
        `${event.startDate || ''}-${event.startTime || ''}-${title}-${index}`
      );
      const searchResultEvent = groupName && !event.shareTargetGroupName
        ? { ...event, shareTargetGroupName: groupName }
        : event;

      if (!matchingEvents.has(resultKey)) {
        matchingEvents.set(resultKey, searchResultEvent);
      }
    });

    return [...matchingEvents.values()]
      .sort((a, b) => {
        const dateCompare = String(a.startDate || '').localeCompare(String(b.startDate || ''));
        if (dateCompare !== 0) return dateCompare;

        const timeCompare = String(a.startTime || '').localeCompare(String(b.startTime || ''));
        if (timeCompare !== 0) return timeCompare;

        return String(a.title || '').localeCompare(String(b.title || ''), 'ja');
      })
      .slice(0, 50);
  }, [joinedGroups, searchQuery, visibleEvents]);

  const eventsByDate = useMemo(() => {
    const grouped = {};

    calendarMonths.forEach((monthData) => {
      for (let day = 1; day <= monthData.daysInMonth; day++) {
        const dateKey = formatDateKey(monthData.year, monthData.month, day);
        grouped[dateKey] = [];

        visibleEvents.forEach((event) => {
          grouped[dateKey].push(...getEventOccurrenceSegments(event, dateKey));
        });

        grouped[dateKey].sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
          return (a.occurrenceStartMinutes ?? getTimeInMinutes(a.startTime, 0))
            - (b.occurrenceStartMinutes ?? getTimeInMinutes(b.startTime, 0));
        });
      }
    });

    return grouped;
  }, [visibleEvents, calendarMonths]);

  const currentDateKey = formatDateKey(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );

  const currentDayEvents = useMemo(() => {
    const dayEvents = visibleEvents.flatMap((event) => (
      getEventOccurrenceSegments(event, currentDateKey)
    ));

    dayEvents.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.occurrenceStartMinutes ?? getTimeInMinutes(a.startTime, 0))
        - (b.occurrenceStartMinutes ?? getTimeInMinutes(b.startTime, 0));
    });

    return dayEvents;
  }, [visibleEvents, currentDateKey]);

  const currentWeekEventsByDate = useMemo(() => {
    const grouped = {};

    weekTimelineDates.forEach((date) => {
      const dateKey = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEvents = visibleEvents.flatMap((event) => (
        getEventOccurrenceSegments(event, dateKey)
      ));

      dayEvents.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.occurrenceStartMinutes ?? getTimeInMinutes(a.startTime, 0))
          - (b.occurrenceStartMinutes ?? getTimeInMinutes(b.startTime, 0));
      });

      grouped[dateKey] = dayEvents;
    });

    return grouped;
  }, [visibleEvents, weekTimelineDates]);

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
    setActiveDateTimePicker(null);
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
    setActiveDateTimePicker(null);
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
      shareTargetGroupId: calendarEvent.shareTargetGroupId || '',
      shareTargetGroupName: calendarEvent.shareTargetGroupName || '',
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
    setActiveDateTimePicker(null);
  };

  const handleFormChange = (key, value) => {
    setEventForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleDateTimePicker = (pickerKey) => {
    if (activeDateTimePicker === pickerKey) {
      setActiveDateTimePicker(null);
      return;
    }

    if (pickerKey === 'startDate' || pickerKey === 'endDate') {
      const selectedDate = parseDateOnly(eventForm[pickerKey]) || new Date();
      setDatePickerView({
        year: selectedDate.getFullYear(),
        month: selectedDate.getMonth(),
      });
    }

    setActiveDateTimePicker(pickerKey);
  };

  const moveDatePickerMonth = (amount) => {
    setDatePickerView((prev) => {
      const nextDate = new Date(prev.year, prev.month + amount, 1);
      return { year: nextDate.getFullYear(), month: nextDate.getMonth() };
    });
  };

  const selectDateFromPicker = (field, date) => {
    handleFormChange(field, formatDateInput(date));
    setActiveDateTimePicker(null);
  };

  const selectTodayFromPicker = (field) => {
    selectDateFromPicker(field, new Date());
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

  const handleSaveCategory = async () => {
    const name = categoryDraft.name.trim();
    const color = normalizeColor(categoryDraft.color);

    if (!name) {
      alert('用事の名前を入力してください。');
      return;
    }

    if (categoryDraftMode === 'edit' && categoryDraft.id) {
      const updatedCategory = { id: categoryDraft.id, name, color };
      const updatedEvents = events.map((event) => (
        event.categoryId === categoryDraft.id
          ? {
              ...event,
              categoryName: name,
              categoryColor: color,
            }
          : event
      ));

      if (currentUser) {
        try {
          await saveCalendarEvents(currentUser.uid, updatedEvents);
        } catch (err) {
          console.error(err);
          alert('予定の更新を保存できませんでした。');
          return;
        }
      }

      setEventCategories((prev) => (
        prev.map((category) => (
          category.id === categoryDraft.id ? updatedCategory : category
        ))
      ));

      setEvents(updatedEvents);

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

  const handleDeleteCategory = async (category, e) => {
    e.stopPropagation();

    if (category.id === 'default') {
      alert('最初の「予定」は削除できません。');
      return;
    }

    const ok = window.confirm(`「${category.name}」を削除しますか？\nこの用事を使っている予定は「予定」に戻ります。`);
    if (!ok) return;

    const defaultCategory = eventCategories[0] || getDefaultCategory();
    const updatedEvents = events.map((event) => (
      event.categoryId === category.id
        ? {
            ...event,
            categoryId: defaultCategory.id,
            categoryName: defaultCategory.name,
            categoryColor: defaultCategory.color,
          }
        : event
    ));

    if (currentUser) {
      try {
        await saveCalendarEvents(currentUser.uid, updatedEvents);
      } catch (err) {
        console.error(err);
        alert('予定の更新を保存できませんでした。');
        return;
      }
    }

    setEventCategories((prev) => prev.filter((item) => item.id !== category.id));
    setEvents(updatedEvents);

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

    if (eventForm.isShared) {
      if (!currentUser) {
        alert('予定を共有するにはログインしてください。');
        return false;
      }

      if (!eventForm.shareTargetGroupId) {
        alert('共有するグループを選択してください。');
        return false;
      }

      const selectedGroup = joinedGroups.find(
        (group) => String(group.id) === String(eventForm.shareTargetGroupId)
      );

      if (!selectedGroup) {
        alert('選択したグループを確認してください。');
        return false;
      }
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

  const buildEventFromForm = (id) => {
    const selectedGroup = joinedGroups.find((group) => group.id === eventForm.shareTargetGroupId);

    return {
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
      shareTargetGroupId: eventForm.isShared ? eventForm.shareTargetGroupId : '',
      shareTargetGroupName: eventForm.isShared ? (selectedGroup?.name || '') : '',
      notes: eventForm.notes.trim(),
    };
  };

  const shareEventToSelectedGroup = async (calendarEvent) => {
    if (!calendarEvent.isShared || !eventForm.shareTargetGroupId) return;

    const selectedGroup = joinedGroups.find((group) => group.id === eventForm.shareTargetGroupId);
    if (!selectedGroup) {
      throw new Error('共有するグループを選択してください。');
    }

    const recipientCount = await shareScheduleToGroup({
      sender: currentUser,
      group: selectedGroup,
      event: calendarEvent,
    });

    if (recipientCount > 0) {
      window.alert(`${selectedGroup.name || 'グループ'}のメンバー${recipientCount}人に予定を共有しました。`);
      return;
    }

    window.alert(`${selectedGroup.name || 'グループ'}に予定を共有しました。後から参加したメンバーにも表示されます。`);
  };

  const handleSaveEvent = async () => {
    if (!validateEventForm()) {
      return;
    }

    setIsSavingEvent(true);

    try {
      if (modalMode === 'edit' && editingEventId !== null) {
        const updatedEvent = buildEventFromForm(editingEventId);

        if (currentUser) {
          await saveCalendarEvent(currentUser.uid, updatedEvent);
        }
        setEvents((prev) => (
          prev.map((event) => (event.id === editingEventId ? updatedEvent : event))
        ));
        await shareEventToSelectedGroup(updatedEvent);
        closeModal();
        return;
      }

      const newEvent = buildEventFromForm(Date.now());
      await shareEventToSelectedGroup(newEvent);
      if (currentUser) {
        await saveCalendarEvent(currentUser.uid, newEvent);
      }
      setEvents((prev) => [...prev, newEvent]);
      closeModal();
    } catch (err) {
      console.error(err);
      alert(err.message || '予定を共有できませんでした。');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (editingEventId === null) return;

    const ok = window.confirm('この予定を削除しますか？\n繰り返し予定の場合は、同じ予定がすべて削除されます。');
    if (!ok) return;

    try {
      if (currentUser) {
        await deleteCalendarEvent(currentUser.uid, editingEventId);
      }
      setEvents((prev) => prev.filter((event) => event.id !== editingEventId));
      closeModal();
    } catch (err) {
      console.error(err);
      alert(err.message || '予定を削除できませんでした。');
    }
  };

  const handleHeaderTitleClick = () => {
    if (calendarView === 'day' || calendarView === 'week') {
      openMonthView(currentDate.getFullYear(), currentDate.getMonth());
      return;
    }

    if (calendarView === 'month') {
      const targetYear = currentDate.getFullYear();

      if (yearScrollRafRef.current !== null) {
        window.cancelAnimationFrame(yearScrollRafRef.current);
        yearScrollRafRef.current = null;
      }

      if (yearTransitionRafRef.current !== null) {
        window.cancelAnimationFrame(yearTransitionRafRef.current);
        yearTransitionRafRef.current = null;
      }

      pendingYearScrollRef.current = targetYear;
      activeYearRef.current = targetYear;
      hasScrolledToCurrentYearRef.current = false;
      yearTransitionStableFramesRef.current = 0;
      yearTransitionLockRef.current = true;
      setCalendarView('year');
    }
  };

  const moveWeekBy = useCallback((weekOffset) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + weekOffset * 7);
      return next;
    });
  }, []);

  const moveDayBy = useCallback((dayOffset) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + dayOffset);
      return next;
    });
  }, []);

  const unlockWeekNavigation = useCallback(() => {
    window.setTimeout(() => {
      weekNavigateLockRef.current = false;
    }, 220);
  }, []);

  const handleWeekSwipeNavigate = useCallback((direction) => {
    if (weekNavigateLockRef.current) return;

    weekNavigateLockRef.current = true;
    const offset = direction === 'next' ? 1 : -1;

    if (isMobileWeekLayout) {
      moveDayBy(offset);
    } else {
      moveWeekBy(offset);
    }

    unlockWeekNavigation();
  }, [isMobileWeekLayout, moveDayBy, moveWeekBy, unlockWeekNavigation]);

  const handleWeekWheel = useCallback((event) => {
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : (event.shiftKey ? event.deltaY : 0);

    if (Math.abs(dominantDelta) < 32) return;

    event.preventDefault();
    handleWeekSwipeNavigate(dominantDelta > 0 ? 'next' : 'prev');
  }, [handleWeekSwipeNavigate]);

  const handleWeekTouchStart = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    weekTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      moved: false,
    };
  }, []);

  const handleWeekTouchMove = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    const diffX = touch.clientX - weekTouchStartRef.current.x;
    const diffY = touch.clientY - weekTouchStartRef.current.y;

    if (weekTouchStartRef.current.moved) return;
    if (Math.abs(diffX) < 56 || Math.abs(diffX) <= Math.abs(diffY)) return;

    weekTouchStartRef.current.moved = true;
    handleWeekSwipeNavigate(diffX < 0 ? 'next' : 'prev');
  }, [handleWeekSwipeNavigate]);

  const handleWeekTouchEnd = useCallback(() => {
    weekTouchStartRef.current = { x: 0, y: 0, moved: false };
  }, []);

  const handleWeekPointerDown = useCallback((event) => {
    if (event.pointerType === 'touch') return;

    weekPointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      active: true,
      moved: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const handleWeekPointerMove = useCallback((event) => {
    const start = weekPointerStartRef.current;
    if (!start.active || start.moved) return;

    const diffX = event.clientX - start.x;
    const diffY = event.clientY - start.y;

    if (Math.abs(diffX) < 64 || Math.abs(diffX) <= Math.abs(diffY)) return;

    weekPointerStartRef.current = {
      ...start,
      moved: true,
    };

    handleWeekSwipeNavigate(diffX < 0 ? 'next' : 'prev');
  }, [handleWeekSwipeNavigate]);

  const handleWeekPointerEnd = useCallback((event) => {
    weekPointerStartRef.current = { x: 0, y: 0, active: false, moved: false };

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    if (calendarView !== 'week') return undefined;

    const target = weekTimelineWrapperRef.current;
    if (!target) return undefined;

    const handleNativeWheel = (event) => {
      const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : (event.shiftKey ? event.deltaY : 0);

      if (Math.abs(horizontalDelta) < 32) return;

      event.preventDefault();
      handleWeekSwipeNavigate(horizontalDelta > 0 ? 'next' : 'prev');
    };

    target.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => {
      target.removeEventListener('wheel', handleNativeWheel);
    };
  }, [calendarView, handleWeekSwipeNavigate]);

  const moveYearBy = useCallback((yearOffset) => {
    setCurrentDate((prev) => {
      const nextYear = prev.getFullYear() + yearOffset;
      const nextMonth = prev.getMonth();
      const nextDay = Math.min(prev.getDate(), getDaysInMonth(nextYear, nextMonth));
      return new Date(nextYear, nextMonth, nextDay);
    });
  }, []);

  const unlockYearNavigation = useCallback(() => {
    window.setTimeout(() => {
      yearNavigateLockRef.current = false;
    }, 220);
  }, []);

  const handleYearSwipeNavigate = useCallback((direction) => {
    if (yearNavigateLockRef.current) return;

    yearNavigateLockRef.current = true;
    moveYearBy(direction === 'next' ? 1 : -1);
    unlockYearNavigation();
  }, [moveYearBy, unlockYearNavigation]);

  const handleYearWheel = useCallback((event) => {
    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;

    if (Math.abs(dominantDelta) < 36) return;

    event.preventDefault();
    handleYearSwipeNavigate(dominantDelta > 0 ? 'next' : 'prev');
  }, [handleYearSwipeNavigate]);

  const handleYearTouchStart = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    yearTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      moved: false,
    };
  }, []);

  const handleYearTouchMove = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    const diffX = touch.clientX - yearTouchStartRef.current.x;
    const diffY = touch.clientY - yearTouchStartRef.current.y;

    if (yearTouchStartRef.current.moved) return;
    if (Math.abs(diffY) < 56 || Math.abs(diffY) <= Math.abs(diffX)) return;

    yearTouchStartRef.current.moved = true;
    handleYearSwipeNavigate(diffY < 0 ? 'next' : 'prev');
  }, [handleYearSwipeNavigate]);

  const handleYearTouchEnd = useCallback(() => {
    yearTouchStartRef.current = { x: 0, y: 0, moved: false };
  }, []);

  const handleYearMonthClick = (targetYear, targetMonth) => {
    yearTransitionLockRef.current = true;
    activeYearRef.current = targetYear;

    const selectedDay = Math.min(
      currentDate.getDate(),
      getDaysInMonth(targetYear, targetMonth),
    );

    setCurrentDate(new Date(targetYear, targetMonth, selectedDay));
    openMonthView(targetYear, targetMonth);
  };

  const handleAddButtonClick = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setIsGroupFilterOpen(false);

    openAddModal(
      currentDate.getDate(),
      currentDate.getFullYear(),
      currentDate.getMonth(),
    );
  };

  const handleSearchToggle = () => {
    setIsGroupFilterOpen(false);
    setIsSearchOpen((prev) => !prev);
  };

  const handleSearchResultClick = (calendarEvent) => {
    const targetDate = parseDateOnly(calendarEvent.startDate || calendarEvent.occurrenceDate);

    if (targetDate) {
      setCurrentDate(new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
      ));
      setCalendarView('day');
    }

    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleGroupFilterSelect = (groupId) => {
    setSelectedSharedGroupId(groupId);
    setIsGroupFilterOpen(false);
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
      <div
        ref={calendarPageRef}
        className={`${styles.calendarPage} ${styles[theme]} ${styles[`${calendarView}ViewPage`]}`}
      >
        <header ref={headerRef} className={styles.header}>
          <div className={styles.topRow}>
            <div className={styles.yearArea}>
              <button
                type="button"
                className={styles.headerTitleButton}
                onClick={handleHeaderTitleClick}
                disabled={calendarView === 'year'}
              >
                <span className={styles.headerTitleText}>
                  {(calendarView === 'week' || calendarView === 'month') && (
                    <span aria-hidden="true">＜</span>
                  )}
                  {headerTitle}
                </span>
                <span className={styles.headerSubText}>
                  {headerSubText}
                </span>
              </button>
            </div>

            <div ref={searchPanelRef} className={styles.headerButtons}>
              <button
                className={styles.iconButton}
                type="button"
                aria-label="予定を検索"
                aria-expanded={isSearchOpen}
                onClick={handleSearchToggle}
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

              {isSearchOpen && (
                <div className={styles.searchPanel} role="search">
                  <div className={styles.searchInputRow}>
                    <span className={styles.searchInputIcon} aria-hidden="true">⌕</span>
                    <input
                      ref={searchInputRef}
                      className={styles.searchInput}
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="予定名・グループ名を検索"
                      aria-label="予定名またはグループ名を検索"
                    />
                    {searchQuery && (
                      <button
                        className={styles.searchClearButton}
                        type="button"
                        aria-label="検索文字を消去"
                        onClick={() => {
                          setSearchQuery('');
                          searchInputRef.current?.focus();
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className={styles.searchResults} aria-live="polite">
                    {!searchQuery.trim() && (
                      <p className={styles.searchMessage}>予定名またはグループ名を入力してください。</p>
                    )}

                    {searchQuery.trim() && searchResults.length === 0 && (
                      <p className={styles.searchMessage}>一致する予定またはグループはありません。</p>
                    )}

                    {searchResults.map((calendarEvent, searchIndex) => (
                      <button
                        key={`search-${calendarEvent.sharedScheduleId || calendarEvent.id || `${calendarEvent.startDate}-${calendarEvent.title}-${searchIndex}`}`}
                        className={styles.searchResultItem}
                        type="button"
                        onClick={() => handleSearchResultClick(calendarEvent)}
                      >
                        <span className={styles.searchResultTitle}>{calendarEvent.title}</span>
                        <span className={styles.searchResultMeta}>
                          {calendarEvent.startDate || '日付未設定'}
                          {getEventTimeLabel(calendarEvent) && ` ${getEventTimeLabel(calendarEvent)}`}
                          {calendarEvent.shareTargetGroupName && `・${calendarEvent.shareTargetGroupName}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {currentUser && joinedGroups.length > 0 && (
            <div className={styles.groupFilterBar}>
              <div ref={groupFilterRef} className={styles.groupFilterControl}>
                <button
                  className={styles.groupFilterSelect}
                  type="button"
                  aria-label="表示するグループ共有予定"
                  aria-haspopup="listbox"
                  aria-expanded={isGroupFilterOpen}
                  onClick={() => {
                    setIsSearchOpen(false);
                    setIsGroupFilterOpen((prev) => !prev);
                  }}
                >
                  <span className={styles.groupFilterLabel}>{selectedGroupFilterLabel}</span>
                  <span
                    className={`${styles.groupFilterArrow} ${isGroupFilterOpen ? styles.groupFilterArrowOpen : ''}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>

                {isGroupFilterOpen && (
                  <div className={styles.groupFilterMenu} role="listbox">
                    <button
                      className={`${styles.groupFilterOption} ${!selectedSharedGroupId ? styles.groupFilterOptionSelected : ''}`}
                      type="button"
                      role="option"
                      aria-selected={!selectedSharedGroupId}
                      onClick={() => handleGroupFilterSelect('')}
                    >
                      すべての予定
                    </button>

                    {joinedGroups.map((group) => {
                      const isSelected = group.id === selectedSharedGroupId;

                      return (
                        <button
                          key={group.id}
                          className={`${styles.groupFilterOption} ${isSelected ? styles.groupFilterOptionSelected : ''}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleGroupFilterSelect(group.id)}
                        >
                          {group.name || '名前未設定のグループ'}の共有予定
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

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
            <div
              className={styles.connectedYearOverview}
              onWheel={handleYearWheel}
              onTouchStart={handleYearTouchStart}
              onTouchMove={handleYearTouchMove}
              onTouchEnd={handleYearTouchEnd}
            >
              <div ref={yearTopLoadRef} className={styles.yearLoadSentinel} aria-hidden="true" />

              {calendarYears.map((targetYear) => (
                <section
                  key={targetYear}
                  ref={(element) => {
                    if (element) {
                      yearSectionRefs.current[targetYear] = element;
                    }
                  }}
                  className={styles.yearSection}
                  data-year={targetYear}
                >
                  <div className={styles.yearSectionTitle}>{targetYear}年</div>

                  <div className={styles.yearOverview}>
                    {Array.from({ length: 12 }, (_, targetMonth) => {
                      const miniMonth = buildCalendarMonth(targetYear, targetMonth, weekStartDay);

                      return (
                        <button
                          key={`${targetYear}-${targetMonth}`}
                          type="button"
                          className={styles.yearMonthCard}
                          onClick={() => handleYearMonthClick(targetYear, targetMonth)}
                        >
                          <h2 className={styles.yearMonthTitle}>
                            {targetMonth + 1}月
                          </h2>

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

                              const isToday = isTodayDate(targetYear, targetMonth, cell.day);

                              return (
                                <span
                                  key={cell.dateKey}
                                  className={[
                                    styles.miniMonthDay,
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
                </section>
              ))}

              <div ref={yearBottomLoadRef} className={styles.yearLoadSentinel} aria-hidden="true" />
            </div>
          )}

          {calendarView === 'week' && (
            <div className={styles.weekView}>
              <div
                ref={weekTimelineWrapperRef}
                className={styles.weekTimelineWrapper}
                onTouchStart={handleWeekTouchStart}
                onTouchMove={handleWeekTouchMove}
                onTouchEnd={handleWeekTouchEnd}
                onPointerDown={handleWeekPointerDown}
                onPointerMove={handleWeekPointerMove}
                onPointerUp={handleWeekPointerEnd}
                onPointerCancel={handleWeekPointerEnd}
              >
                <div
                  className={styles.weekTimelineGrid}
                  style={{ '--week-column-count': weekTimelineDates.length }}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <React.Fragment key={`week-hour-${hour}`}>
                      <div className={styles.weekTimeLabel}>{pad(hour)}:00</div>

                      {weekTimelineDates.map((date) => {
                        const dateKey = formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
                        const hourEvents = (currentWeekEventsByDate[dateKey] || []).filter((event) => {
                          if (event.allDay) return false;
                          const startMinutes = Number.isFinite(event.occurrenceStartMinutes)
                            ? event.occurrenceStartMinutes
                            : getTimeInMinutes(event.startTime, 0);
                          return Math.floor(startMinutes / 60) === hour;
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
                                key={`${event.id}-${event.occurrenceSegmentKey || event.occurrenceDate}-${hour}`}
                                type="button"
                                className={`${styles.dayEventItem} ${styles.weekEventItem}`}
                                style={{
                                  ...getEventStyle(event),
                                  ...getWeekEventPositionStyle(event),
                                }}
                                onClick={(e) => {
                                  if (event.isReceivedShared) return;
                                  openEditModal(event, e);
                                }}
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
                                    key={`${event.id}-${event.occurrenceSegmentKey || event.occurrenceDate}`}
                                    type="button"
                                    className={styles.eventItem}
                                    style={getEventStyle(event)}
                                    onClick={(e) => openEditModal(event, e)}
                                    aria-label={`${event.title}を編集`}
                                    disabled={event.isReceivedShared}
                                  >
                                    <span className={styles.eventMetaRow}>
                                      {timeLabel && (
                                        <span className={styles.eventTime}>{timeLabel}</span>
                                      )}
                                      {event.repeat && event.repeat !== 'none' && (
                                        <span className={styles.eventRepeat}>{repeatLabel}</span>
                                      )}
                                      {event.isShared && (
                                        <span className={styles.eventShared}>
                                          {event.shareTargetGroupName || '共有'}
                                        </span>
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
                  disabled={isSavingEvent}
                >
                  {isSavingEvent ? '保存中...' : modalMode === 'edit' ? '保存' : '追加'}
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

                <div ref={dateTimePickerAreaRef} className={`${styles.formCard} ${styles.dateTimeFormCard}`}>
                  <div className={styles.dateTimeRow}>
                    <span className={styles.dateTimeLabel}>開始</span>
                    <div className={styles.dateTimeInputs}>
                      <DatePickerField
                        value={eventForm.startDate}
                        isOpen={activeDateTimePicker === 'startDate'}
                        pickerView={datePickerView}
                        onToggle={() => toggleDateTimePicker('startDate')}
                        onSelect={(date) => selectDateFromPicker('startDate', date)}
                        onMoveMonth={moveDatePickerMonth}
                        onSelectToday={() => selectTodayFromPicker('startDate')}
                      />

                      <TimePickerField
                        value={eventForm.startTime}
                        isOpen={activeDateTimePicker === 'startTime'}
                        onToggle={() => toggleDateTimePicker('startTime')}
                        onChange={(value) => handleFormChange('startTime', value)}
                        onClose={() => setActiveDateTimePicker(null)}
                      />
                    </div>
                  </div>

                  <div className={styles.dateTimeRow}>
                    <span className={styles.dateTimeLabel}>終了</span>
                    <div className={styles.dateTimeInputs}>
                      <DatePickerField
                        value={eventForm.endDate}
                        isOpen={activeDateTimePicker === 'endDate'}
                        pickerView={datePickerView}
                        onToggle={() => toggleDateTimePicker('endDate')}
                        onSelect={(date) => selectDateFromPicker('endDate', date)}
                        onMoveMonth={moveDatePickerMonth}
                        onSelectToday={() => selectTodayFromPicker('endDate')}
                      />

                      <TimePickerField
                        value={eventForm.endTime}
                        isOpen={activeDateTimePicker === 'endTime'}
                        onToggle={() => toggleDateTimePicker('endTime')}
                        onChange={(value) => handleFormChange('endTime', value)}
                        onClose={() => setActiveDateTimePicker(null)}
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
                        オンにすると参加中のグループへ共有できます
                      </span>
                    </span>

                    <span className={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={eventForm.isShared}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEventForm((prev) => ({
                            ...prev,
                            isShared: checked,
                            shareTargetGroupId: checked ? prev.shareTargetGroupId : '',
                          }));
                        }}
                      />
                      <span className={styles.toggleTrack} />
                    </span>
                  </label>

                  {eventForm.isShared && (
                    <div className={styles.shareTargetBlock}>
                      <label className={styles.shareTargetLabel} htmlFor="shareTargetGroup">
                        共有するグループ
                      </label>

                      <select
                        id="shareTargetGroup"
                        className={`${styles.selectInput} ${styles.shareTargetSelect}`}
                        value={eventForm.shareTargetGroupId}
                        onChange={(e) => handleFormChange('shareTargetGroupId', e.target.value)}
                        disabled={!currentUser || isLoadingShareGroups}
                      >
                        <option value="">
                          {currentUser
                            ? isLoadingShareGroups
                              ? '読み込み中...'
                              : 'グループを選択'
                            : 'ログインしてください'}
                        </option>
                        {joinedGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name || '名前未設定のグループ'}（{Math.max((group.memberCount || 1) - 1, 0)}人へ共有）
                          </option>
                        ))}
                      </select>

                      {currentUser && !isLoadingShareGroups && joinedGroups.length === 0 && (
                        <p className={styles.repeatHelpText}>
                          参加中のグループがありません。
                        </p>
                      )}
                    </div>
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
