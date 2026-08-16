# Настройка «Наш список»

Один раз пройти шаги 1–3 — дальше приложение живёт само, добавление новых
идей это просто правка `data/ideas.js`.

## 1. Supabase (хранилище)

1. Зайди на **https://supabase.com**, зарегистрируйся, создай новый проект
   (бесплатного плана достаточно с большим запасом).
2. В проекте открой **SQL Editor → New query** и выполни:

   ```sql
   create table date_choices (
     id           text primary key,
     title        text,
     vote         text,
     starred      boolean default false,
     planned_date date,
     updated_at   timestamptz default now()
   );

   alter table date_choices enable row level security;

   create policy "anon can read" on date_choices
     for select using (true);

   create policy "anon can write" on date_choices
     for insert with check (true);

   create policy "anon can update" on date_choices
     for update using (true);
   ```

   > Эти политики открывают таблицу для anon-ключа целиком — так и задумано:
   > вы двое единственные пользователи, а пароль на входе в приложение уже
   > отсекает случайных людей со ссылкой. Это не защита от целенаправленной
   > атаки, но для личного приложения на двоих — достаточно.

3. **Project Settings → API** — скопируй `Project URL` и `anon public` ключ.
4. Открой [`config.js`](config.js) и вставь их:

   ```js
   supabaseUrl: 'https://xxxxxxxx.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi...',
   ```

   Пока не вставишь — приложение работает в демо-режиме: всё кликается,
   но ничего не сохраняется между устройствами (об этом будет предупреждение
   в консоли браузера).

## 2. Публикация на GitHub Pages

1. Создай публичный репозиторий на GitHub, залей туда всю папку `date-ideas/`.
2. **Settings → Pages** → Source: ветка `main`, папка `/ (root)` → Save.
3. Через минуту получишь ссылку вида `https://<логин>.github.io/<репозиторий>/`.
4. Отправь ссылку и код входа (`1902` по умолчанию, меняется в `config.js`).

## 3. Уведомления в Telegram через n8n

Хочешь получать сообщение в Telegram, когда она отвечает «да» или меняет дату:

1. В Supabase: **Database → Webhooks → Create a new webhook**.
   - Table: `date_choices`
   - Events: `Insert`, `Update`
   - Type: `HTTP Request`
   - URL: адрес твоего Webhook-узла в n8n (Production URL после активации воркфлоу)
2. В n8n создай воркфлоу:
   - **Webhook** node — принимает POST от Supabase.
   - **IF** node — фильтр: пропускать дальше, только если `body.record.vote === 'yes'`
     или `body.record.planned_date` изменилась (сравни с `body.old_record.planned_date`,
     это поле приходит в событии Update).
   - **Telegram** node — отправка сообщения тебе, например:
     `{{$json.body.record.title}} — {{$json.body.record.vote}}, дата: {{$json.body.record.planned_date}}`
3. Активируй воркфлоу, сделай тестовое изменение в приложении — проверь, что сообщение пришло.

## 4. Как добавлять новые идеи

Не трогай Supabase и не трогай остальные файлы — просто вернись в чат, где
собиралось это приложение, и попроси добавить идею. Новая запись появится
в [`data/ideas.js`](data/ideas.js), а строка в базе создастся сама при первом
её голосе.

## 5. Локальная проверка перед публикацией

ES-модули не открываются двойным кликом по `index.html` — нужен локальный
сервер:

```bash
cd date-ideas
py -m http.server 8777
```

→ http://127.0.0.1:8777
