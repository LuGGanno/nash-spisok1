/* =========================================================================
   APP — рендер интерфейса и обработчики. Ничего не знает о том, ГДЕ
   хранятся данные (это скрыто внутри store.js) и КАК устроена ссылка
   в календарь (это скрыто внутри calendar.js).
   ========================================================================= */

// ?v=N — версия сборки, см. комментарий в index.html.
// При любом изменении кода увеличь число здесь и в index.html,
// иначе браузер может продолжить исполнять старую закэшированную версию.
import { CATEGORIES, DURATIONS } from './data/ideas.js?v=3';
import { CONFIG } from './config.js?v=3';
import { initSupabase } from './supabase.js?v=3';
import { store } from './store.js?v=3';
import { ideasStore } from './ideas-store.js?v=3';
import { ratingsStore } from './ratings-store.js?v=3';
import { getPerson, setPerson, otherPerson, personLabel, personEmoji, PERSON_KEYS } from './person.js?v=3';
import { googleCalendarUrl, downloadIcs } from './calendar.js?v=3';

const UNLOCK_KEY = 'date-ideas:unlocked';
const VOTE_ORDER = { null: 0, later: 1, yes: 2, no: 3 };

const els = {
  gateScreen: document.getElementById('screen-gate'),
  gateCard: document.querySelector('#screen-gate .card'),
  gateInput: document.getElementById('gateInput'),
  gateBtn: document.getElementById('gateBtn'),
  gateError: document.getElementById('gateError'),

  app: document.getElementById('app'),
  tabs: document.getElementById('tabs'),

  filterCategory: document.getElementById('filterCategory'),
  filterDuration: document.getElementById('filterDuration'),
  grid: document.getElementById('ideasGrid'),
  plansContent: document.getElementById('plansContent'),

  sheetOverlay: document.getElementById('sheetOverlay'),
  sheetClose: document.getElementById('sheetClose'),
  sheetHero: document.getElementById('sheetHero'),
  sheetBadges: document.getElementById('sheetBadges'),
  sheetTitle: document.getElementById('sheetTitle'),
  sheetDesc: document.getElementById('sheetDesc'),
  sheetPlace: document.getElementById('sheetPlace'),
  voteRow: document.getElementById('voteRow'),
  starBtn: document.getElementById('starBtn'),
  dateInput: document.getElementById('dateInput'),
  gcalBtn: document.getElementById('gcalBtn'),
  icsBtn: document.getElementById('icsBtn'),

  toast: document.getElementById('toast'),
  hearts: document.getElementById('hearts'),

  personScreen: document.getElementById('screen-person'),
  personChoice: document.getElementById('personChoice'),
  personChip: document.getElementById('personChip'),

  addIdeaBtn: document.getElementById('addIdeaBtn'),
  archiveBlock: document.getElementById('archiveBlock'),
  archiveToggle: document.getElementById('archiveToggle'),
  archiveList: document.getElementById('archiveList'),

  ratingBlock: document.getElementById('ratingBlock'),
  ratingWho: document.getElementById('ratingWho'),
  heartsRow: document.getElementById('heartsRow'),
  ratingNote: document.getElementById('ratingNote'),
  ratingTheirs: document.getElementById('ratingTheirs'),
  archiveBtn: document.getElementById('archiveBtn'),

  addOverlay: document.getElementById('addOverlay'),
  addClose: document.getElementById('addClose'),
  addName: document.getElementById('addName'),
  addCategory: document.getElementById('addCategory'),
  addDuration: document.getElementById('addDuration'),
  addDesc: document.getElementById('addDesc'),
  addPlace: document.getElementById('addPlace'),
  addError: document.getElementById('addError'),
  addSubmit: document.getElementById('addSubmit'),
};

/* Экранирование текста, который печатали люди.
   Раньше все идеи приходили из data/ideas.js и были заведомо безопасны.
   Теперь названия, описания, места и заметки лежат в открытой таблице,
   поэтому любой такой текст перед вставкой в разметку обязан экранироваться. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* Осветлённый оттенок цвета категории — второй стоп градиента у новых идей. */
function lighten(hex, amount = 0.45) {
  const n = parseInt(hex.replace('#', ''), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const filterState = { category: 'all', duration: 'all' };
let activeIdeaId = null;
let me = null;            // 'leo' | 'ksusha' — кто сейчас смотрит
let archiveOpen = false;

/* ---------- Вход по паролю ---------- */

function initGate() {
  if (localStorage.getItem(UNLOCK_KEY) === 'yes') {
    unlock();
    return;
  }
  els.gateBtn.addEventListener('click', tryUnlock);
  els.gateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryUnlock();
  });
  els.gateInput.focus();
}

function tryUnlock() {
  const value = els.gateInput.value.trim();
  if (value && value === CONFIG.passcode) {
    localStorage.setItem(UNLOCK_KEY, 'yes');
    unlock();
    return;
  }
  els.gateError.textContent = 'Неверный код, попробуй ещё раз';
  els.gateCard.classList.remove('shake');
  void els.gateCard.offsetWidth; // перезапуск анимации
  els.gateCard.classList.add('shake');
}

function unlock() {
  els.gateScreen.classList.remove('is-active');
  els.gateScreen.hidden = true;
  me = getPerson();
  if (!me) {
    showPersonScreen();
    return;
  }
  enterApp();
}

/* ---------- Кто смотрит ---------- */

function showPersonScreen() {
  els.personScreen.hidden = false;
  els.personScreen.classList.add('is-active');
  els.personChoice.innerHTML = '';
  PERSON_KEYS.forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'person-btn';
    btn.innerHTML = `<span class="person-btn-emoji">${personEmoji(key)}</span><span>${esc(personLabel(key))}</span>`;
    btn.addEventListener('click', () => {
      setPerson(key);
      me = key;
      els.personScreen.classList.remove('is-active');
      els.personScreen.hidden = true;
      enterApp();
    });
    els.personChoice.appendChild(btn);
  });
}

function enterApp() {
  els.app.hidden = false;
  renderPersonChip();
  renderGrid();
  renderArchive();
}

function renderPersonChip() {
  if (!me) return;
  els.personChip.textContent = `${personEmoji(me)} ${personLabel(me)}`;
}

function initPersonChip() {
  els.personChip.addEventListener('click', () => {
    me = otherPerson(me);
    setPerson(me);
    renderPersonChip();
    refreshSheetState();
  });
}

/* ---------- Вкладки ---------- */

function initTabs() {
  els.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === btn.dataset.tab));
    if (btn.dataset.tab === 'plans') renderPlans();
  });
}

function isPlansTabActive() {
  return document.querySelector('.tab-panel[data-panel="plans"]').classList.contains('is-active');
}

/* ---------- Фильтры ---------- */

function renderChips(container, chips, activeKey, onSelect) {
  container.innerHTML = '';
  chips.forEach((chip) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (chip.key === activeKey ? ' is-active' : '');
    btn.textContent = chip.emoji ? `${chip.emoji} ${chip.label}` : chip.label;
    btn.addEventListener('click', () => onSelect(chip.key));
    container.appendChild(btn);
  });
}

function initFilters() {
  const catChips = [
    { key: 'all', label: 'Все', emoji: '✨' },
    ...Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, emoji: c.emoji })),
  ];
  const durChips = [
    { key: 'all', label: 'Все', emoji: '⏱️' },
    ...Object.entries(DURATIONS).map(([key, d]) => ({ key, label: d.label })),
  ];

  const drawCat = () => renderChips(els.filterCategory, catChips, filterState.category, (key) => {
    filterState.category = key;
    drawCat();
    renderGrid();
  });
  const drawDur = () => renderChips(els.filterDuration, durChips, filterState.duration, (key) => {
    filterState.duration = key;
    drawDur();
    renderGrid();
  });

  drawCat();
  drawDur();
}

/* ---------- Сетка идей ---------- */

function visibleIdeas() {
  return ideasStore.active().filter((idea) => {
    if (filterState.category !== 'all' && idea.category !== filterState.category) return false;
    if (filterState.duration !== 'all' && idea.duration !== filterState.duration) return false;
    return true;
  });
}

function sortedIdeas(list) {
  return [...list].sort((a, b) => {
    const ea = store.get(a.id);
    const eb = store.get(b.id);
    const va = VOTE_ORDER[ea.vote ?? null];
    const vb = VOTE_ORDER[eb.vote ?? null];
    if (va !== vb) return va - vb;
    const sa = ea.starred ? 0 : 1;
    const sb = eb.starred ? 0 : 1;
    return sa - sb;
  });
}

function heroBackground(idea) {
  return idea.image
    ? `background-image: url('${idea.image}')`
    : `background-image: linear-gradient(135deg, ${idea.gradient[0]}, ${idea.gradient[1]})`;
}

function voteBadgeHtml(vote) {
  if (vote === 'yes') return '<span class="idea-vote-badge idea-vote-badge--yes">Да 💕</span>';
  if (vote === 'later') return '<span class="idea-vote-badge idea-vote-badge--later">Потом 🕒</span>';
  if (vote === 'no') return '<span class="idea-vote-badge idea-vote-badge--no">Нет</span>';
  return '';
}

function renderCard(idea) {
  const entry = store.get(idea.id);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'idea-card' + (entry.vote === 'no' ? ' is-declined' : '');
  card.style.setProperty('--cat-color', (CATEGORIES[idea.category] || {}).color || '#d98cae');
  card.addEventListener('click', () => openSheet(idea.id));

  card.innerHTML = `
    <div class="idea-hero" style="${heroBackground(idea)}">
      ${idea.image ? '' : `<span class="idea-hero-emoji">${esc(idea.emoji)}</span>`}
      ${voteBadgeHtml(entry.vote)}
      ${entry.starred ? '<span class="idea-star">⭐</span>' : ''}
    </div>
    <div class="idea-body">
      <span class="idea-cat-badge">${CATEGORIES[idea.category].emoji} ${CATEGORIES[idea.category].label}</span>
      <h3 class="idea-title">${esc(idea.title)}</h3>
      <span class="idea-duration">${DURATIONS[idea.duration].label}</span>
    </div>
  `;
  return card;
}

function renderGrid() {
  const list = sortedIdeas(visibleIdeas());
  els.grid.innerHTML = '';
  if (!list.length) {
    els.grid.innerHTML = '<p class="empty-state">Ничего не найдено под эти фильтры 🤔</p>';
    return;
  }
  list.forEach((idea) => els.grid.appendChild(renderCard(idea)));
}

/* ---------- Шторка карточки ---------- */

function renderPlace(idea) {
  if (!idea.place) return '📍 Место выберем вместе';
  if (!idea.mapQuery) return `📍 ${esc(idea.place)}`;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(idea.mapQuery)}`;
  return `📍 ${esc(idea.place)} · <a href="${esc(url)}" target="_blank" rel="noopener">открыть в картах</a>`;
}

function openSheet(id) {
  const idea = ideasStore.byId(id);
  if (!idea) return;               // идею успели убрать в архив с другого устройства
  activeIdeaId = id;

  const cat = CATEGORIES[idea.category] || { emoji: '💫', label: 'Идея' };
  const dur = DURATIONS[idea.duration] || { label: '' };

  els.sheetHero.setAttribute('style', heroBackground(idea));
  els.sheetHero.innerHTML = idea.image ? '' : `<span class="sheet-hero-emoji">${esc(idea.emoji)}</span>`;
  els.sheetBadges.innerHTML = `
    <span class="idea-cat-badge">${cat.emoji} ${cat.label}</span>
    <span class="idea-duration">${dur.label}</span>
  `;
  els.sheetTitle.textContent = idea.title;
  els.sheetDesc.textContent = idea.description;
  els.sheetPlace.innerHTML = renderPlace(idea);

  refreshSheetState();

  els.sheetOverlay.hidden = false;
  // Форсируем пересчёт стилей, чтобы браузер зафиксировал закрытое состояние
  // до добавления класса — тогда анимация стартует гарантированно.
  // Через requestAnimationFrame это ненадёжно: он не срабатывает, когда
  // страница не отрисовывает кадры (фоновая вкладка, экономия энергии),
  // и шторка молча остаётся уехавшей за экран.
  void els.sheetOverlay.offsetWidth;
  els.sheetOverlay.classList.add('is-open');
}

function closeSheet() {
  els.sheetOverlay.classList.remove('is-open');
  setTimeout(() => {
    els.sheetOverlay.hidden = true;
  }, 220);
  activeIdeaId = null;
}

function refreshSheetState() {
  if (!activeIdeaId) return;
  const idea = ideasStore.byId(activeIdeaId);
  if (!idea) return;
  const entry = store.get(activeIdeaId);

  els.voteRow.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.vote === entry.vote);
  });
  els.starBtn.classList.toggle('is-active', Boolean(entry.starred));
  els.dateInput.value = entry.plannedDate || '';
  updateCalendarButtons(idea, entry.plannedDate);
  renderRating(idea, entry);
}

/* ---------- Оценка прошедшего свидания ---------- */

function renderRating(idea, entry) {
  // Оценивать можно только то, что уже случилось.
  const isPast = Boolean(entry.plannedDate) && entry.plannedDate < todayIso();
  els.ratingBlock.hidden = !isPast;
  if (!isPast || !me) return;

  const mine = ratingsStore.get(idea.id, me);
  els.ratingWho.textContent = `${personEmoji(me)} ${personLabel(me)}`;

  els.heartsRow.innerHTML = '';
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'heart-btn' + (n <= mine.hearts ? ' is-on' : '');
    b.textContent = n <= mine.hearts ? '💖' : '🤍';
    b.dataset.n = String(n);
    b.setAttribute('aria-label', `${n} из 5`);
    els.heartsRow.appendChild(b);
  }

  // Не затираем текст, пока в поле печатают.
  if (document.activeElement !== els.ratingNote) els.ratingNote.value = mine.note || '';

  const other = otherPerson(me);
  const theirs = ratingsStore.get(idea.id, other);
  const whoLabel = `${personEmoji(other)} ${esc(personLabel(other))}`;
  els.ratingTheirs.innerHTML = theirs.hearts
    ? `<span class="rating-who">${whoLabel}</span>
       <span class="rating-theirs-hearts">${'💖'.repeat(theirs.hearts)}</span>
       ${theirs.note ? `<span class="rating-theirs-note">«${esc(theirs.note)}»</span>` : ''}`
    : `<span class="rating-theirs-empty">${whoLabel} пока не оценил${other === 'ksusha' ? 'а' : ''}</span>`;
}

function updateCalendarButtons(idea, isoDate) {
  const has = Boolean(isoDate);
  els.gcalBtn.disabled = !has;
  els.icsBtn.disabled = !has;
  els.gcalBtn.onclick = has ? () => window.open(googleCalendarUrl(idea, isoDate), '_blank', 'noopener') : null;
  els.icsBtn.onclick = has ? () => downloadIcs(idea, isoDate) : null;
}

function initSheet() {
  els.sheetClose.addEventListener('click', closeSheet);
  els.sheetOverlay.addEventListener('click', (e) => {
    if (e.target === els.sheetOverlay) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.sheetOverlay.hidden) closeSheet();
  });

  els.voteRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.vote-btn');
    if (!btn || !activeIdeaId) return;
    const entry = store.get(activeIdeaId);
    const newVote = entry.vote === btn.dataset.vote ? null : btn.dataset.vote; // повторный клик снимает выбор
    store.setVote(activeIdeaId, newVote);
  });

  els.starBtn.addEventListener('click', () => {
    if (!activeIdeaId) return;
    const entry = store.get(activeIdeaId);
    store.setStar(activeIdeaId, !entry.starred);
  });

  els.dateInput.addEventListener('change', () => {
    if (!activeIdeaId) return;
    store.setDate(activeIdeaId, els.dateInput.value || null);
  });

  els.heartsRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.heart-btn');
    if (!btn || !activeIdeaId || !me) return;
    const n = Number(btn.dataset.n);
    const mine = ratingsStore.get(activeIdeaId, me);
    // Повторное нажатие по той же оценке снимает её.
    ratingsStore.set(activeIdeaId, me, { hearts: mine.hearts === n ? 0 : n });
  });

  els.ratingNote.addEventListener('change', () => {
    if (!activeIdeaId || !me) return;
    ratingsStore.set(activeIdeaId, me, { note: els.ratingNote.value.trim() });
  });

  els.archiveBtn.addEventListener('click', () => {
    if (!activeIdeaId) return;
    const id = activeIdeaId;
    closeSheet();
    ideasStore.setArchived(id, true);
  });
}

/* ---------- Архив ---------- */

function renderArchive() {
  const list = ideasStore.archived();
  els.archiveBlock.hidden = list.length === 0;
  if (!list.length) {
    archiveOpen = false;
    els.archiveList.hidden = true;
    return;
  }
  els.archiveToggle.textContent = `${archiveOpen ? '▾' : '▸'} Архив (${list.length})`;
  els.archiveList.hidden = !archiveOpen;
  els.archiveList.innerHTML = '';
  list.forEach((idea) => {
    const row = document.createElement('div');
    row.className = 'archive-row';
    row.innerHTML = `
      <span class="archive-emoji">${esc(idea.emoji)}</span>
      <span class="archive-title">${esc(idea.title)}</span>
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'archive-restore';
    btn.textContent = 'Вернуть';
    btn.addEventListener('click', () => ideasStore.setArchived(idea.id, false));
    row.appendChild(btn);
    els.archiveList.appendChild(row);
  });
}

function initArchive() {
  els.archiveToggle.addEventListener('click', () => {
    archiveOpen = !archiveOpen;
    renderArchive();
  });
}

/* ---------- Добавление идеи ---------- */

function initAddForm() {
  const fill = (select, entries) => {
    select.innerHTML = '';
    entries.forEach(([key, value]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = value.emoji ? `${value.emoji} ${value.label}` : value.label;
      select.appendChild(option);
    });
  };
  fill(els.addCategory, Object.entries(CATEGORIES));
  fill(els.addDuration, Object.entries(DURATIONS));

  els.addIdeaBtn.addEventListener('click', openAdd);
  els.addClose.addEventListener('click', closeAdd);
  els.addOverlay.addEventListener('click', (e) => {
    if (e.target === els.addOverlay) closeAdd();
  });
  els.addSubmit.addEventListener('click', submitAdd);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.addOverlay.hidden) closeAdd();
  });
}

function openAdd() {
  els.addName.value = '';
  els.addDesc.value = '';
  els.addPlace.value = '';
  els.addError.textContent = '';
  els.addOverlay.hidden = false;
  void els.addOverlay.offsetWidth;   // тот же приём, что и в шторке идеи
  els.addOverlay.classList.add('is-open');
}

function closeAdd() {
  els.addOverlay.classList.remove('is-open');
  setTimeout(() => {
    els.addOverlay.hidden = true;
  }, 220);
}

function submitAdd() {
  const title = els.addName.value.trim();
  if (!title) {
    els.addError.textContent = 'Придумай название — без него идея не добавится';
    return;
  }
  const category = els.addCategory.value;
  const cat = CATEGORIES[category];
  ideasStore.add({
    title,
    category,
    duration: els.addDuration.value,
    description: els.addDesc.value.trim() || 'Наша идея — детали придумаем вместе.',
    place: els.addPlace.value.trim() || null,
    emoji: cat.emoji,
    gradient: [cat.color, lighten(cat.color)],
  });
  closeAdd();
}

/* ---------- Наши планы ---------- */

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function plansSection(title, items, showDate) {
  const section = document.createElement('div');
  section.className = 'plans-section';

  if (!items.length) {
    section.innerHTML = `<h3 class="plans-heading">${title}</h3><p class="plans-empty">Пока пусто</p>`;
    return section;
  }

  section.innerHTML = `<h3 class="plans-heading">${title}</h3>`;
  const list = document.createElement('div');
  list.className = 'plans-list';

  items.forEach(({ idea, entry }) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'plans-row';
    row.addEventListener('click', () => openSheet(idea.id));
    const mine = me ? ratingsStore.get(idea.id, me) : { hearts: 0 };
    const theirs = me ? ratingsStore.get(idea.id, otherPerson(me)) : { hearts: 0 };
    const ratingLine = (mine.hearts || theirs.hearts)
      ? `<span class="plans-rating">${'💖'.repeat(mine.hearts)}${mine.hearts && theirs.hearts ? ' · ' : ''}${'💖'.repeat(theirs.hearts)}</span>`
      : '';

    row.innerHTML = `
      <span class="plans-emoji">${esc(idea.emoji)}</span>
      <span class="plans-info">
        <span class="plans-title">${esc(idea.title)}</span>
        ${showDate && entry.plannedDate ? `<span class="plans-date">${formatDate(entry.plannedDate)}</span>` : ''}
        ${ratingLine}
      </span>
      ${entry.starred ? '<span class="plans-star">⭐</span>' : ''}
    `;
    list.appendChild(row);
  });

  section.appendChild(list);
  return section;
}

function renderPlans() {
  const today = todayIso();
  const planned = [];
  const wantNoDate = [];
  const past = [];

  ideasStore.active().forEach((idea) => {
    const entry = store.get(idea.id);
    if (entry.plannedDate) {
      (entry.plannedDate < today ? past : planned).push({ idea, entry });
    } else if (entry.vote === 'yes') {
      wantNoDate.push({ idea, entry });
    }
  });

  planned.sort((a, b) => a.entry.plannedDate.localeCompare(b.entry.plannedDate));
  past.sort((a, b) => b.entry.plannedDate.localeCompare(a.entry.plannedDate));

  els.plansContent.innerHTML = '';
  els.plansContent.appendChild(plansSection('Запланировано', planned, true));
  els.plansContent.appendChild(plansSection('Хотим, но пока без даты', wantNoDate, false));
  els.plansContent.appendChild(plansSection('Уже было', past, true));
}

/* ---------- Тост при сбоях сохранения ---------- */

function initToast() {
  const failing = new Set();
  window.addEventListener('store:save-failed', (e) => {
    failing.add(e.detail.id);
    els.toast.textContent = 'Не сохранилось, пробую ещё раз…';
    els.toast.hidden = false;
  });
  window.addEventListener('store:save-ok', (e) => {
    failing.delete(e.detail.id);
    if (failing.size === 0) els.toast.hidden = true;
  });
}

/* ---------- Фоновые сердечки ---------- */

function initHearts() {
  const glyphs = ['💗', '💕', '💖', '🩷', '💞'];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const s = document.createElement('span');
    s.textContent = glyphs[i % glyphs.length];
    s.style.setProperty('--x', `${Math.random() * 100}%`);
    s.style.setProperty('--sz', `${14 + Math.random() * 22}px`);
    s.style.setProperty('--dur', `${10 + Math.random() * 12}s`);
    s.style.setProperty('--delay', `${-Math.random() * 15}s`);
    els.hearts.appendChild(s);
  }
}

/* ---------- Запуск ---------- */

function handleStoreChange() {
  renderGrid();
  renderArchive();
  if (isPlansTabActive()) renderPlans();
  refreshSheetState();
}

async function main() {
  initSupabase(CONFIG);

  initHearts();
  initTabs();
  initFilters();
  initSheet();
  initToast();
  initPersonChip();
  initArchive();
  initAddForm();

  store.init(CONFIG);
  store.onChange(handleStoreChange);
  ideasStore.onChange(handleStoreChange);
  ratingsStore.onChange(handleStoreChange);

  initGate();   // после инициализации — внутри может сразу показаться приложение

  renderGrid(); // мгновенно показываем локальный кэш, не дожидаясь сети

  // Каталог первым: остальное опирается на список идей.
  await ideasStore.load();
  store.registerIdeas(ideasStore.all());
  await Promise.all([store.load(), ratingsStore.load()]);
}

main();
