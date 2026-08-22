/* =========================================================================
   IDEAS-STORE — каталог идей.

   Раньше идеи жили только в data/ideas.js. Теперь их можно добавлять и
   убирать прямо из приложения, поэтому каталог переехал в базу:

     await ideasStore.load()
     ideasStore.active()          -> идеи, видимые в списке
     ideasStore.archived()        -> убранные в архив
     ideasStore.byId(id)
     await ideasStore.add({title, category, duration, description, place})
     await ideasStore.setArchived(id, bool)
     ideasStore.onChange(cb)

   data/ideas.js остался в репозитории как ПЕРВОИСТОЧНИК: если таблица
   ideas пуста (новый проект, или кто-то её вычистил), приложение при
   загрузке засевает её этими 25 идеями обратно. Поэтому базовый список
   невозможно потерять насовсем — он лежит в git.

   Удаления как такового нет: идея уходит в архив (archived = true) и
   возвращается одним нажатием. Оценки и история свиданий при этом целы.
   ========================================================================= */

import { IDEAS } from './data/ideas.js?v=3';
import { isConfigured, sbSelect, sbUpsert } from './supabase.js?v=3';

const CACHE_KEY = 'date-ideas:catalog:v1';
const TABLE = 'ideas';

let catalog = [];
const listeners = new Set();

/* ---------- Перевод между строкой БД и объектом идеи ---------- */

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    duration: row.duration,
    description: row.description || '',
    place: row.place || null,
    mapQuery: row.map_query || null,
    emoji: row.emoji || '💫',
    gradient: [row.gradient_from || '#ffd3e0', row.gradient_to || '#cfe3ff'],
    image: row.image || null,
    archived: Boolean(row.archived),
  };
}

function toRow(idea) {
  return {
    id: idea.id,
    title: idea.title,
    category: idea.category,
    duration: idea.duration,
    description: idea.description || null,
    place: idea.place || null,
    map_query: idea.mapQuery || null,
    emoji: idea.emoji || null,
    gradient_from: idea.gradient?.[0] || null,
    gradient_to: idea.gradient?.[1] || null,
    image: idea.image || null,
    archived: Boolean(idea.archived),
  };
}

/* ---------- Кэш, чтобы список появлялся мгновенно и без сети ---------- */

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) catalog = JSON.parse(raw);
  } catch {
    // повреждённый кэш игнорируем — данные придут с сервера
  }
  if (!catalog.length) catalog = IDEAS.map((i) => ({ ...i, archived: false }));
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // приватный режим — не критично
  }
}

function notify() {
  saveCache();
  listeners.forEach((cb) => cb());
}

function newId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const ideasStore = {
  async load() {
    loadCache();
    if (!isConfigured()) {
      notify();
      return;
    }
    try {
      let rows = await sbSelect(TABLE, 'select=*');

      // Таблица пуста — засеваем первоисточником из репозитория.
      // Upsert по id, поэтому одновременный запуск с двух устройств безопасен.
      if (!rows.length) {
        await sbUpsert(TABLE, IDEAS.map((i) => toRow({ ...i, archived: false })));
        rows = await sbSelect(TABLE, 'select=*');
      }

      catalog = rows.map(fromRow);
    } catch (err) {
      console.error('[ideas] не удалось загрузить каталог, показываю кэш', err);
    }
    notify();
  },

  active() {
    return catalog.filter((i) => !i.archived);
  },

  archived() {
    return catalog.filter((i) => i.archived);
  },

  all() {
    return catalog;
  },

  byId(id) {
    return catalog.find((i) => i.id === id) || null;
  },

  async add(draft) {
    const idea = {
      id: newId(),
      title: draft.title,
      category: draft.category,
      duration: draft.duration,
      description: draft.description || '',
      place: draft.place || null,
      mapQuery: draft.place || null,
      emoji: draft.emoji,
      gradient: draft.gradient,
      image: null,
      archived: false,
    };
    catalog = [...catalog, idea];   // сразу видно в списке, не дожидаясь сети
    notify();
    if (isConfigured()) {
      try {
        await sbUpsert(TABLE, toRow(idea));
      } catch (err) {
        console.error('[ideas] не удалось сохранить новую идею', err);
        window.dispatchEvent(new CustomEvent('store:save-failed', { detail: { id: idea.id } }));
      }
    }
    return idea;
  },

  async setArchived(id, archived) {
    const idea = this.byId(id);
    if (!idea) return;
    idea.archived = archived;
    catalog = [...catalog];
    notify();
    if (isConfigured()) {
      try {
        await sbUpsert(TABLE, toRow(idea));
      } catch (err) {
        console.error('[ideas] не удалось сохранить архив', err);
        window.dispatchEvent(new CustomEvent('store:save-failed', { detail: { id } }));
      }
    }
  },

  onChange(cb) {
    listeners.add(cb);
  },
};
