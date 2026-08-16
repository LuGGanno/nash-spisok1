# Настройка «Наш список»

Один раз пройти шаги 1–3 — дальше приложение живёт само, добавление новых
идей это просто правка `data/ideas.js`.

## 1. Supabase (хранилище) — ✅ уже сделано

Проект создан, таблица создана, ключи прописаны в [`config.js`](config.js),
запись и чтение проверены живыми запросами. Раздел ниже оставлен на случай,
если однажды придётся поднимать проект заново.

<details>
<summary>Развернуть исходную инструкцию</summary>

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

</details>

## 2. Публикация на GitHub Pages

1. Создай публичный репозиторий на GitHub, залей туда всю папку `date-ideas/`.
2. **Settings → Pages** → Source: ветка `main`, папка `/ (root)` → Save.
3. Через минуту получишь ссылку вида `https://<логин>.github.io/<репозиторий>/`.
4. Отправь ссылку и код входа (`1902`, меняется в `config.js`).

> Ссылку нигде не публикуй. Код `1902` лежит в исходниках страницы, а API
> базы можно вызвать напрямую в обход сайта — то есть защита здесь строится
> на том, что адрес никто не знает, а не на самом коде. Осознанное решение
> для приложения на двоих; если однажды захочется настоящей защиты, нужна
> авторизация Supabase Auth — менять придётся только `store.js`.

## 3. Уведомления в Telegram через n8n

Чтобы получать сообщение, когда она отвечает «да» или меняет дату.

**Бот:** напиши [@BotFather](https://t.me/BotFather) → `/newbot` → получишь токен.
Затем напиши своему боту любое сообщение (без этого он не сможет писать тебе первым)
и узнай свой chat id у [@userinfobot](https://t.me/userinfobot).

**n8n:**

1. Нода **Webhook**, метод POST. В ней обязательно включи
   **Authentication → Header Auth** и создай креденшл: имя заголовка, например
   `X-Signature`, значение — длинная случайная строка.

   > Без этого на твой вебхук сможет отправить запрос кто угодно, кто узнает URL.
   > Это единственное место во всей схеме, которое касается твоей инфраструктуры,
   > поэтому заголовок здесь не формальность.

   Скопируй **Production URL**.

2. Нода **IF** — пропускать дальше, только если есть что сообщать:
   - `{{ $json.body.record.vote }}` равно `yes`
   - **ИЛИ** `{{ $json.body.record.planned_date }}` не равно `{{ $json.body.old_record.planned_date }}`

3. Нода **Telegram** → Send Message, твой chat id, текст:

   ```
   {{ $json.body.record.title }} — {{ $json.body.record.vote }}{{ $json.body.record.planned_date ? ' · ' + $json.body.record.planned_date : '' }}
   ```

4. Активируй воркфлоу.

**Supabase:** Database → Webhooks → Create a new webhook.
- Table: `date_choices`
- Events: `Insert`, `Update`
- Type: `HTTP Request`, метод `POST`
- URL: Production URL из шага 1
- HTTP Headers: добавь `X-Signature` с тем же значением, что в n8n

Supabase присылает объект вида `{type, table, record, old_record}` — отсюда
`record` и `old_record` в выражениях выше. Сделай тестовое изменение
в приложении и проверь, что сообщение пришло.

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
