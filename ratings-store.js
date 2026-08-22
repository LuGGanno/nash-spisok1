/* =========================================================================
   RATINGS-STORE — оценки прошедших свиданий.

     await ratingsStore.load()
     ratingsStore.get(ideaId, person)   -> {hearts, note}
     await ratingsStore.set(ideaId, person, {hearts, note})
     ratingsStore.onChange(cb)

   Оценка раздельная: у каждой идеи может быть до двух записей, по одной
   на человека. Ключ строки — '<ideaId>:<person>', поэтому обычный upsert
   по id работает без составных ограничений.

   Одна оценка на идею, а не на каждое посещение: если сходите в кино
   второй раз, оценка обновится. Историю каждого раза мы сознательно не
   ведём — это удвоило бы модель данных ради редкого случая.
   ========================================================================= */

import { isConfigured, sbSelect, sbUpsert } from './supabase.js?v=3';

const CACHE_KEY = 'date-ideas:ratings:v1';
const TABLE = 'ratings';

const state = new Map();      // '<ideaId>:<person>' -> {hearts, note}
const listeners = new Set();
const saveChains = new Map();

const EMPTY = { hearts: 0, note: '' };

function key(ideaId, person) {
  return `${ideaId}:${person}`;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    Object.entries(JSON.parse(raw)).forEach(([k, v]) => state.set(k, v));
  } catch {
    // повреждённый кэш игнорируем
  }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(state)));
  } catch {
    // приватный режим — не критично
  }
}

function notify() {
  saveCache();
  listeners.forEach((cb) => cb());
}

/* Очередь записи на каждую оценку — та же защита от гонки, что и в store.js:
   поставила сердечки и сразу дописала заметку, два запроса ушли параллельно,
   и более старый затёр более новый. */
function queueSave(k) {
  const prev = saveChains.get(k) || Promise.resolve();
  const next = prev.then(() => sendSave(k)).catch(() => {});
  saveChains.set(k, next);
  return next;
}

async function sendSave(k) {
  if (!isConfigured()) return;
  const [ideaId, person] = k.split(':');
  const entry = state.get(k) || EMPTY;   // актуальное состояние на момент отправки
  try {
    await sbUpsert(TABLE, {
      id: k,
      idea_id: ideaId,
      person,
      hearts: entry.hearts || null,
      note: entry.note || null,
      updated_at: new Date().toISOString(),
    });
    window.dispatchEvent(new CustomEvent('store:save-ok', { detail: { id: k } }));
  } catch (err) {
    console.error('[ratings] не удалось сохранить оценку', k, err);
    window.dispatchEvent(new CustomEvent('store:save-failed', { detail: { id: k } }));
  }
}

export const ratingsStore = {
  async load() {
    loadCache();
    if (!isConfigured()) {
      notify();
      return;
    }
    try {
      const rows = await sbSelect(TABLE, 'select=*');
      rows.forEach((row) => {
        state.set(key(row.idea_id, row.person), {
          hearts: row.hearts || 0,
          note: row.note || '',
        });
      });
    } catch (err) {
      console.error('[ratings] не удалось загрузить оценки, показываю кэш', err);
    }
    notify();
  },

  get(ideaId, person) {
    return state.get(key(ideaId, person)) || EMPTY;
  },

  /* Есть ли у идеи хоть одна оценка — чтобы показать её в «Уже было». */
  any(ideaId) {
    return this.get(ideaId, 'leo').hearts > 0 || this.get(ideaId, 'ksusha').hearts > 0;
  },

  async set(ideaId, person, partial) {
    const k = key(ideaId, person);
    state.set(k, { ...this.get(ideaId, person), ...partial });
    notify();
    await queueSave(k);
  },

  onChange(cb) {
    listeners.add(cb);
  },
};
