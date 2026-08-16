/* =========================================================================
   CALENDAR — ссылка на добавление события в Google Календарь и генерация
   .ics файла. Событие всегда на весь день (время не выбирается — см. план).
   ========================================================================= */

function pad(n) {
  return String(n).padStart(2, '0');
}

function toCompact(isoDate) {
  return isoDate.replaceAll('-', '');
}

function addDaysCompact(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function googleCalendarUrl(idea, isoDate) {
  const start = toCompact(isoDate);
  const end = addDaysCompact(isoDate, 1); // all-day: конец = следующий день
  const details = idea.place ? `${idea.description}\n\nМесто: ${idea.place}` : idea.description;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: idea.title,
    dates: `${start}/${end}`,
    details,
    location: idea.place || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value) {
  return (value || '')
    .replace(/\\/g, '\\\\')
    .replace(/[,;]/g, (m) => `\\${m}`)
    .replace(/\n/g, '\\n');
}

export function icsContent(idea, isoDate) {
  const start = toCompact(isoDate);
  const end = addDaysCompact(isoDate, 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `${idea.id}-${isoDate}@nash-spisok`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//nash-spisok//ru',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText(idea.title)}`,
    `DESCRIPTION:${escapeIcsText(idea.description)}`,
    `LOCATION:${escapeIcsText(idea.place || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(idea, isoDate) {
  const blob = new Blob([icsContent(idea, isoDate)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${idea.id}-${isoDate}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
