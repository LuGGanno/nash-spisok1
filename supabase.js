/* =========================================================================
   SUPABASE — тонкая обёртка над REST API.
   Единственное место в проекте, которое знает адреса, заголовки и формат
   ответов Supabase. Все три хранилища (store, ideasStore, ratingsStore)
   ходят в сеть только через неё — поэтому смена бэкенда затрагивает
   один файл, а не четыре.
   ========================================================================= */

const DEMO_PLACEHOLDER = 'YOUR-PROJECT';

let CFG = null;

export function initSupabase(config) {
  CFG = config;
}

/* Если ключи не прописаны — приложение работает в демо-режиме:
   всё кликается, но никуда не сохраняется. */
export function isConfigured() {
  return Boolean(CFG?.supabaseUrl) && !CFG.supabaseUrl.includes(DEMO_PLACEHOLDER);
}

function headers(extra) {
  return {
    apikey: CFG.supabaseAnonKey,
    Authorization: `Bearer ${CFG.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function restUrl(path) {
  return `${CFG.supabaseUrl}/rest/v1/${path}`;
}

export async function sbSelect(table, query = 'select=*') {
  const res = await fetch(restUrl(`${table}?${query}`), { headers: headers() });
  if (!res.ok) throw new Error(`Supabase select ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

/* Вставка-или-обновление по первичному ключу id.
   Принимает один объект или массив — Supabase съедает оба варианта. */
export async function sbUpsert(table, rows) {
  const res = await fetch(restUrl(`${table}?on_conflict=id`), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table}: ${res.status} ${await res.text()}`);
}
