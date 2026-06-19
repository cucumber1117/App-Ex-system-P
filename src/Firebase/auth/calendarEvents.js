import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

const EVENT_FIELDS = [
  'title',
  'location',
  'allDay',
  'startDate',
  'startTime',
  'endDate',
  'endTime',
  'categoryId',
  'categoryName',
  'categoryColor',
  'repeat',
  'isShared',
  'shareTargetGroupId',
  'shareTargetGroupName',
  'notes',
  'sharedScheduleId',
  'sharedByUid',
  'sharedByName',
];

function normalizeCalendarEvent(event = {}) {
  const normalized = EVENT_FIELDS.reduce((result, field) => {
    if (event[field] !== undefined) {
      result[field] = event[field];
    }
    return result;
  }, {});

  return {
    ...normalized,
    id: String(event.id),
  };
}

export async function listCalendarEvents(uid) {
  if (!uid) return [];

  const snapshot = await getDocs(collection(db, 'users', uid, 'calendarEvents'));
  return snapshot.docs.map((eventDoc) => ({
    id: eventDoc.id,
    ...eventDoc.data(),
  }));
}

export async function saveCalendarEvent(uid, event) {
  if (!uid) throw new Error('ログインが必要です');
  if (!event?.id) throw new Error('予定の情報が不足しています');

  const normalized = normalizeCalendarEvent(event);
  await setDoc(
    doc(db, 'users', uid, 'calendarEvents', normalized.id),
    {
      ...normalized,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return normalized;
}

export async function saveCalendarEvents(uid, events) {
  if (!uid) throw new Error('ログインが必要です');
  if (!Array.isArray(events) || events.length === 0) return [];

  const batch = writeBatch(db);
  const normalizedEvents = events
    .filter((event) => event?.id)
    .map(normalizeCalendarEvent);

  normalizedEvents.forEach((event) => {
    batch.set(
      doc(db, 'users', uid, 'calendarEvents', event.id),
      {
        ...event,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();
  return normalizedEvents;
}

export async function deleteCalendarEvent(uid, eventId) {
  if (!uid) throw new Error('ログインが必要です');
  if (!eventId) throw new Error('削除する予定を選択してください');

  await deleteDoc(doc(db, 'users', uid, 'calendarEvents', String(eventId)));
}
