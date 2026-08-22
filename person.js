/* =========================================================================
   PERSON — кто из вас двоих сейчас смотрит приложение.
   Нужно только для того, чтобы оценки свиданий были раздельными: вы оба
   ставите свои сердечки и видите оба мнения рядом.
   Это НЕ авторизация и не защита — просто подпись под оценкой.
   ========================================================================= */

import { CONFIG } from './config.js?v=3';

const KEY = 'date-ideas:person';

export const PERSON_KEYS = ['leo', 'ksusha'];

export function personLabel(key) {
  return key === 'leo' ? CONFIG.hisName : CONFIG.herName;
}

export function personEmoji(key) {
  return key === 'leo' ? '🧔' : '👩';
}

export function getPerson() {
  const value = localStorage.getItem(KEY);
  return PERSON_KEYS.includes(value) ? value : null;
}

export function setPerson(key) {
  if (!PERSON_KEYS.includes(key)) return;
  localStorage.setItem(KEY, key);
}

export function otherPerson(key) {
  return key === 'leo' ? 'ksusha' : 'leo';
}
