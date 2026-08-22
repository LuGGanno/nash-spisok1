/* =========================================================================
   STORE — ответы на идеи: голос, звезда, выбранный день.
   Снаружи виден только этот интерфейс:

     store.init(config)
     store.registerIdeas(ideas)     // чтобы знать title для денормализации
     await store.load()
     store.get(id)                  -> {vote, starred, plannedDate}
     await store.setVote(id, vote)  // 'yes' | 'later' | 'no' | null
     await store.setStar(id, bool)
     await store.setDate(id, isoDate | null)
     store.onChange(cb)

   Запись оптимистичная: состояние в памяти обновляется мгновенно,
   запрос летит в фоне. При сбое сети — тихий повтор с растущей паузой,
   и наружу летит событие 'store:save-failed', чтобы интерфейс показал
   тост «не сохранилось, пробую ещё раз».

   Локальный кэш в localStorage — чтобы при обновлении страницы (или без
   интернета) состояние было видно сразу, не дожидаясь ответа сервера.
   ========================================================================= */

import { isConfigured, sbSelect, sbUpsert } from './supabase.js?v=3';

const CACHE_KEY = 'date-ideas:cache:v1';

const state = new Map();      // id -> {vote, starred, plannedDate}
const titles = new Map();     // id -> title (для денормализованной колонки)
const listeners = new Set();
const retryTimers = new Map();
const saveChains = new Map(); // id -> Promise: очередь записи, по одной на идею

let CFG = null;

function notify() {
  saveCache();
  listeners.forEach((cb) => cb());
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    Object.entries(JSON.parse(raw)).forEach(([id, entry]) => state.set(id, entry));
  } catch {
    // повреждённый кэш — игнорируем, дальше данные придут с сервера
  }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(state)));
  } catch {
    // например, localStorage недоступен в приватном режиме — не критично
  }
}

function emptyEntry() {
  return { vote: null, starred: false, plannedDate: null };
}

async function patch(id, partial) {
  const next = { ...store.get(id), ...partial };
  state.set(id, next);
  notify();
  await queueSave(id);
}

/* Очередь записи на каждую идею.
   Без неё два быстрых действия подряд (нажала «Да», сразу выбрала дату)
   уходят в сеть параллельно, и более старый ответ может перезаписать
   более новый — дата молча теряется. Здесь запросы по одной идее идут
   строго друг за другом. */
function queueSave(id) {
  const prev = saveChains.get(id) || Promise.resolve();
  const next = prev.then(() => sendSave(id)).catch(() => {});
  saveChains.set(id, next);
  return next;
}

async function sendSave(id, attempt = 0) {
  if (!isConfigured()) return; // демо-режим: Supabase не настроен, никуда не шлём

  // Берём АКТУАЛЬНОЕ состояние в момент отправки, а не снимок на момент клика:
  // если пока запрос стоял в очереди что-то поменялось, уедет свежая версия.
  const entry = store.get(id);
  try {
    await sbUpsert(CFG.supabaseTable, {
      id,
      title: titles.get(id) || id,
      vote: entry.vote,
      starred: entry.starred,
      planned_date: entry.plannedDate,
      updated_at: new Date().toISOString(),
    });
    clearRetry(id);
  } catch (err) {
    console.error('[store] не удалось сохранить', id, err);
    scheduleRetry(id, attempt);
  }
}

function scheduleRetry(id, attempt) {
  clearTimeout(retryTimers.get(id));
  const delay = Math.min(4000 * 1.6 ** attempt, 30000);
  window.dispatchEvent(new CustomEvent('store:save-failed', { detail: { id } }));
  // Повтор тоже идёт через очередь и тоже возьмёт актуальное состояние.
  const timer = setTimeout(() => {
    const prev = saveChains.get(id) || Promise.resolve();
    const next = prev.then(() => sendSave(id, attempt + 1)).catch(() => {});
    saveChains.set(id, next);
  }, delay);
  retryTimers.set(id, timer);
}

function clearRetry(id) {
  const timer = retryTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(id);
  }
  window.dispatchEvent(new CustomEvent('store:save-ok', { detail: { id } }));
}

export const store = {
  init(config) {
    CFG = config;
    loadCache();
  },

  registerIdeas(ideas) {
    ideas.forEach((idea) => titles.set(idea.id, idea.title));
  },

  async load() {
    if (!isConfigured()) {
      console.warn('[store] Supabase не настроен — демо-режим, ничего не сохраняется. См. SETUP.md.');
      notify();
      return;
    }
    try {
      const rows = await sbSelect(CFG.supabaseTable, 'select=*');
      rows.forEach((row) => {
        state.set(row.id, {
          vote: row.vote,
          starred: Boolean(row.starred),
          plannedDate: row.planned_date,
        });
      });
    } catch (err) {
      console.error('[store] не удалось загрузить данные, показываю локальный кэш', err);
    }
    notify();
  },

  get(id) {
    return state.get(id) || emptyEntry();
  },

  onChange(cb) {
    listeners.add(cb);
  },

  setVote(id, vote) {
    return patch(id, { vote });
  },

  setStar(id, starred) {
    return patch(id, { starred });
  },

  setDate(id, plannedDate) {
    return patch(id, { plannedDate });
  },
};
