# Portainer Deploy Action

GitHub Action для автоматического развертывания Docker Compose стеков в Portainer через API.

## Возможности

- ✅ Аутентификация через X-API-Key
- ✅ Обновление существующих стеков
- ✅ Поддержка шаблонов Handlebars
- ✅ Автоматический pull образов
- ✅ Прогрев неиспользуемых сервисов (prune)
- ✅ Русская локализация логов

## Использование

### Базовый пример (для production)

```yaml
- name: Развертывание в Portainer
  uses: xjl0/deploy-to-portainer-action@v1
  with:
    portainer-host: ${{ secrets.PROD_PORTAINER_HOST }}
    api-key: ${{ secrets.PROD_PORTAINER_API_KEY }}
    endpoint-id: ${{ secrets.PROD_PORTAINER_ENDPOINT_ID }}
    stack-name: ${{ secrets.PROD_STACK_NAME }}  # или используйте stack-id (быстрее)
    stack-definition: 'docker-compose.prod.yml'  # для dev используйте docker-compose.dev.yml
    image: 'ghcr.io/username/repo:main-latest'
    pullImage: true
    prune: true
```

### Пример с Stack ID (быстрее)

Если вы знаете ID стека, используйте его вместо имени - это быстрее (один API запрос вместо двух):

```yaml
- name: Развертывание в Portainer
  uses: xjl0/deploy-to-portainer-action@v1
  with:
    portainer-host: ${{ secrets.PROD_PORTAINER_HOST }}
    api-key: ${{ secrets.PROD_PORTAINER_API_KEY }}
    endpoint-id: ${{ secrets.PROD_PORTAINER_ENDPOINT_ID }}
    stack-id: 200  # ID стека из Portainer (найдите в Portainer → Stacks)
    stack-definition: 'docker-compose.prod.yml'
    image: 'ghcr.io/username/repo:main-latest'
    pullImage: true
    prune: true
```

> **💡 Как узнать Stack ID:** Portainer → Stacks → откройте стек → ID в URL (`/stacks/200`) или в деталях стека.

> **💡 Два файла compose для разных окружений:**
> - `docker-compose.dev.yml` — для staging/test окружения
> - `docker-compose.prod.yml` — для production окружения
> 
> В них разные настройки: порты, переменные окружения, image теги и т.д.

### Автодеплой с Pull Requests (рекомендуется)

**Как это работает:**

Workflow определяет окружение по **целевой ветке PR** (`github.base_ref`):

| Вы создаёте PR | `github.base_ref` | Compose файл | Secrets | Окружение |
|----------------|-------------------|--------------|---------|-----------|
| `feature` → `dev` | `"dev"` | `docker-compose.dev.yml` | `DEV_*` | staging |
| `dev` → `main` | `"main"` | `docker-compose.prod.yml` | `PROD_*` | production |

**Ключевой момент:** `${{ github.base_ref }}` — это ветка, **В КОТОРУЮ** вы делаете PR, а не **ИЗ КОТОРОЙ**!

**Пример:**
```bash
# Сценарий 1: Тестирование новой фичи
git checkout -b feature/new-login
# ... делаете изменения ...
# Создаёте PR: feature/new-login → dev
# ✅ Деплоится с docker-compose.dev.yml в staging Portainer

# Сценарий 2: Релиз в production
# Создаёте PR: dev → main
# ✅ Деплоится с docker-compose.prod.yml в production Portainer
```

Создайте `.github/workflows/deploy.yml` в вашем проекте:

```yaml
name: Сборка и деплой

on:
  pull_request:
    types: [opened, synchronize]  # reopened убран чтобы избежать лишних запусков
    branches:
      - dev   # ← срабатывает когда PR создан В dev
      - main  # ← срабатывает когда PR создан В main

env:
  REGISTRY: ghcr.io

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      pull-requests: write

    steps:
      # Определяем какой compose файл и какие secrets использовать в зависимости от целевой ветки PR
      - name: Определение окружения
        id: env
        run: |
          # Преобразуем имя репозитория в lowercase для Docker (ghcr.io требует lowercase)
          IMAGE_NAME=$(echo "${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          echo "image_name=${IMAGE_NAME}" >> $GITHUB_OUTPUT
          
          if [ "${{ github.base_ref }}" == "dev" ]; then
            echo "environment=staging" >> $GITHUB_OUTPUT
            echo "env_type=staging" >> $GITHUB_OUTPUT
            echo "compose_file=docker-compose.dev.yml" >> $GITHUB_OUTPUT
            echo "stack_name=${{ secrets.DEV_STACK_NAME }}" >> $GITHUB_OUTPUT
            echo "portainer_host=${{ secrets.DEV_PORTAINER_HOST }}" >> $GITHUB_OUTPUT
            echo "portainer_api_key=${{ secrets.DEV_PORTAINER_API_KEY }}" >> $GITHUB_OUTPUT
            echo "portainer_endpoint_id=${{ secrets.DEV_PORTAINER_ENDPOINT_ID }}" >> $GITHUB_OUTPUT
          elif [ "${{ github.base_ref }}" == "main" ]; then
            echo "environment=production" >> $GITHUB_OUTPUT
            echo "env_type=production" >> $GITHUB_OUTPUT
            echo "compose_file=docker-compose.prod.yml" >> $GITHUB_OUTPUT
            echo "stack_name=${{ secrets.PROD_STACK_NAME }}" >> $GITHUB_OUTPUT
            echo "portainer_host=${{ secrets.PROD_PORTAINER_HOST }}" >> $GITHUB_OUTPUT
            echo "portainer_api_key=${{ secrets.PROD_PORTAINER_API_KEY }}" >> $GITHUB_OUTPUT
            echo "portainer_endpoint_id=${{ secrets.PROD_PORTAINER_ENDPOINT_ID }}" >> $GITHUB_OUTPUT
          fi
          
          SHORT_SHA=$(echo "${{ github.event.pull_request.head.sha }}" | cut -c1-7)
          echo "image_tag=${{ github.base_ref }}-${SHORT_SHA}" >> $GITHUB_OUTPUT

      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - name: Настройка Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Вход в GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Сборка и отправка образа
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ steps.env.outputs.image_name }}:${{ steps.env.outputs.image_tag }}
            ${{ env.REGISTRY }}/${{ steps.env.outputs.image_name }}:${{ github.base_ref }}-latest
          build-args: |
            ENV_TYPE=${{ steps.env.outputs.env_type }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Развертывание в Portainer
        uses: xjl0/deploy-to-portainer-action@v1
        with:
          portainer-host: ${{ steps.env.outputs.portainer_host }}      # DEV_PORTAINER_HOST или PROD_PORTAINER_HOST
          api-key: ${{ steps.env.outputs.portainer_api_key }}          # DEV_PORTAINER_API_KEY или PROD_PORTAINER_API_KEY
          endpoint-id: ${{ steps.env.outputs.portainer_endpoint_id }}  # DEV_PORTAINER_ENDPOINT_ID или PROD_PORTAINER_ENDPOINT_ID
          stack-name: ${{ steps.env.outputs.stack_name }}              # DEV_STACK_NAME или PROD_STACK_NAME
          stack-definition: ${{ steps.env.outputs.compose_file }}      # docker-compose.dev.yml или docker-compose.prod.yml
          image: ${{ env.REGISTRY }}/${{ steps.env.outputs.image_name }}:${{ steps.env.outputs.image_tag }}
          pullImage: true
          prune: true
```

**Что происходит:**
- PR в `dev` → используются `DEV_*` secrets + `docker-compose.dev.yml` → деплой в staging Portainer
- PR в `main` → используются `PROD_*` secrets + `docker-compose.prod.yml` → деплой в production Portainer

## Входные параметры

| Параметр | Обязательный | Описание | По умолчанию |
|----------|--------------|----------|--------------|
| `portainer-host` | Да | URL Portainer | - |
| `api-key` | Да | API ключ Portainer | - |
| `endpoint-id` | Да | ID endpoint | - |
| `stack-name` | Нет* | Имя стека (должен существовать) | - |
| `stack-id` | Нет* | ID стека (быстрее чем по имени) | - |
| `stack-definition` | Да | Путь к docker-compose.yml | - |
| `template-variables` | Нет | JSON переменные для Handlebars | - |
| `image` | Нет | URI образа для обновления | - |
| `prune` | Нет | Удалить отсутствующие сервисы | `false` |
| `pullImage` | Нет | Принудительно скачать образ | `true` |

**\* Примечание:** Требуется указать **либо** `stack-name`, **либо** `stack-id`. Если указан `stack-id`, он имеет приоритет и работает быстрее (один API запрос вместо двух).

## Настройка

### 1. Получение API ключа Portainer

1. Portainer → User settings → Access tokens
2. Add access token → скопируйте токен
3. Добавьте в GitHub Secrets как `PORTAINER_API_KEY`

### 2. Узнать Endpoint ID

1. Portainer → Endpoints
2. ID отображается в первой колонке (число)

### 3. GitHub Secrets

**Где добавлять:** Ваш проект → Settings → Secrets and variables → Actions → New repository secret

#### Секреты для DEV окружения (staging/test)

| Имя секрета | Пример значения | Описание |
|-------------|-----------------|----------|
| `DEV_PORTAINER_HOST` | `https://dev.portainer.example.com` | URL вашего dev Portainer |
| `DEV_PORTAINER_API_KEY` | `ptr_dev_abc123xyz...` | API ключ для dev Portainer |
| `DEV_PORTAINER_ENDPOINT_ID` | `14` | ID endpoint в dev Portainer (число) |
| `DEV_STACK_NAME` | `myapp-dev` | Имя стека в dev Portainer |

#### Секреты для PRODUCTION окружения

| Имя секрета | Пример значения | Описание |
|-------------|-----------------|----------|
| `PROD_PORTAINER_HOST` | `https://portainer.example.com` | URL вашего prod Portainer |
| `PROD_PORTAINER_API_KEY` | `ptr_prod_xyz789abc...` | API ключ для prod Portainer |
| `PROD_PORTAINER_ENDPOINT_ID` | `15` | ID endpoint в prod Portainer (число) |
| `PROD_STACK_NAME` | `myapp-prod` | Имя стека в prod Portainer |

**✅ Всего: 8 секретов**

> **Примечание:** `GITHUB_TOKEN` создаётся автоматически, не добавляйте его вручную.

#### Пример для проекта `my-awesome-app`:

```bash
# Dev Portainer
DEV_PORTAINER_HOST = https://dev.portainer.mycompany.com
DEV_PORTAINER_API_KEY = ptr_dev_AbCdEf123456...
DEV_PORTAINER_ENDPOINT_ID = 1
DEV_STACK_NAME = my-awesome-app-dev

# Prod Portainer  
PROD_PORTAINER_HOST = https://portainer.mycompany.com
PROD_PORTAINER_API_KEY = ptr_prod_XyZ789Uvw456...
PROD_PORTAINER_ENDPOINT_ID = 2
PROD_STACK_NAME = my-awesome-app-prod
```

### 4. Подготовка проекта

**Dockerfile** (принимает ENV_TYPE):

```dockerfile
FROM node:20-alpine
ARG ENV_TYPE=production
ENV NODE_ENV=${ENV_TYPE}

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**docker-compose.dev.yml:**

```yaml
version: '3.8'
services:
  app:
    image: ghcr.io/username/repo:dev-latest
    container_name: app-dev
    ports:
      - "8080:3000"
    environment:
      - NODE_ENV=staging
    env_file:
      - stack.env
```

**docker-compose.prod.yml:**

```yaml
version: '3.8'
services:
  app:
    image: ghcr.io/username/repo:main-latest
    container_name: app-prod
    ports:
      - "80:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - stack.env
```

### 5. Создание стеков в Portainer

**Важно:** Стеки должны быть созданы вручную перед первым деплоем!

1. Portainer → Stacks → Add stack
2. Имя: `myapp-dev` (совпадает с `DEV_STACK_NAME`)
3. Web editor → вставьте `docker-compose.dev.yml`
4. Deploy

Повторите для production стека.

## Процесс работы

```
1. Создаёте feature ветку: git checkout -b feature/my-feature

2. Делаете PR: feature/my-feature → dev
   ├─ github.base_ref = "dev"
   ├─ Используется: docker-compose.dev.yml
   ├─ ENV_TYPE=staging
   ├─ Image tag: dev-abc1234
   └─ Деплой в DEV_PORTAINER_HOST (staging окружение)

3. Тестируете в staging, всё OK

4. Мерджите PR в dev

5. Создаёте PR: dev → main
   ├─ github.base_ref = "main"
   ├─ Используется: docker-compose.prod.yml
   ├─ ENV_TYPE=production
   ├─ Image tag: main-def5678
   └─ Деплой в PROD_PORTAINER_HOST (production окружение)

6. Мерджите PR в main - релиз готов!
```

**Важно:** Workflow срабатывает на создание PR, а не на мердж!  
Каждый push в PR автоматически пересобирает и передеплоивает стек.

## Prune параметр

`prune: true` удаляет сервисы, которых **нет в новом docker-compose.yml**.

**Пример:**

Было:
```yaml
services:
  app:
    ...
  redis:
    ...
```

Стало:
```yaml
services:
  app:
    ...
  # redis удалён
```

- `prune: false` → `redis` продолжит работать
- `prune: true` → `redis` будет удалён

## Примеры

### С обновлением образа

```yaml
- uses: xjl0/deploy-to-portainer-action@v1
  with:
    portainer-host: ${{ secrets.PORTAINER_HOST }}
    api-key: ${{ secrets.PORTAINER_API_KEY }}
    endpoint-id: ${{ secrets.PORTAINER_ENDPOINT_ID }}
    stack-name: 'my-app'
    stack-definition: 'docker-compose.yml'
    image: 'ghcr.io/username/repo:latest'
    pullImage: true
```

### С Handlebars шаблонами

**docker-compose.yml:**
```yaml
services:
  app:
    image: myapp:{{VERSION}}
    environment:
      - DATABASE_URL={{DB_URL}}
```

**GitHub Action:**
```yaml
- uses: xjl0/deploy-to-portainer-action@v1
  with:
    portainer-host: ${{ secrets.PORTAINER_HOST }}
    api-key: ${{ secrets.PORTAINER_API_KEY }}
    endpoint-id: ${{ secrets.PORTAINER_ENDPOINT_ID }}
    stack-name: 'my-app'
    stack-definition: 'docker-compose.yml'
    template-variables: |
      {
        "VERSION": "${{ github.sha }}",
        "DB_URL": "${{ secrets.DATABASE_URL }}"
      }
```

## Версионирование

Action использует семантическое версионирование через Git теги:

### Как работает `@v1`

- **`@v1.0.0`** - конкретная версия (не изменяется)
- **`@v1`** - плавающий тег, указывает на последнюю версию 1.x.x

**Пример:** При выпуске версии `v1.0.5`, тег `v1` автоматически переместится на `v1.0.5`

### Как создать релиз (для автора action)

```bash
# 1. Соберите dist/
npm run build

# 2. Закоммитьте изменения
git add .
git commit -m "Release v1.0.0"

# 3. Создайте теги (точную версию и мажорную)
git tag v1.0.0
git tag v1 -f  # -f для перемещения существующего тега

# 4. Запушьте с тегами
git push origin main --tags

# 5. Создайте GitHub Release
# GitHub → Releases → Create release → выберите тег v1.0.0
```

### Обновление минорных версий

```bash
# Для v1.0.1
git tag v1.0.1
git tag v1 -f         # Переместить v1 на новую версию
git push origin v1.0.1
git push origin v1 -f # Перезаписать удалённый v1
```

Пользователи с `@v1` автоматически получат обновления `v1.x.x` без изменения workflow.

## Почему workflow запускается дважды?

**Проблема:** При мердже одного PR, другой открытый PR тоже запускает workflow.

**Причина:** После мерджа PR в `dev`/`main`, GitHub автоматически обновляет другие открытые PR в ту же ветку, что вызывает событие `synchronize`.

**Решение (уже в шаблоне):**

1. Убран `reopened` из триггеров - он срабатывает редко
2. Добавлена проверка автообновлений от GitHub Actions bot
3. Workflow пропускается если это только обновление базовой ветки

Это нормальное поведение GitHub - workflow запускается чтобы проверить что PR всё ещё совместим с обновлённой базовой веткой.

**Отключить автообновление PR:**

Settings → General → Pull Requests → снять галочку "Always suggest updating pull request branches"

## Отладка

### ❌ Error: Input required and not supplied: portainer-host

**Причина:** Не передаются параметры в action, потому что условие `if` не сработало.

**Решения:**

1. **Проверьте целевую ветку PR:**
   ```
   GitHub → Pull Request → смотрите на "base: ???"
   Должно быть: base: dev или base: main
   НЕ: base: master, base: develop
   ```

2. **Проверьте секреты:**
   - Settings → Secrets and variables → Actions
   - Для PR в `main`: нужны `PROD_*` секреты (4 штуки)
   - Для PR в `dev`: нужны `DEV_*` секреты (4 штуки)

3. **Смотрите логи шага "Определение окружения":**
   - Должно быть: `🔍 Целевая ветка PR (base_ref): dev` или `main`
   - Если пустое или другое значение - это причина ошибки

### ❌ Error: invalid tag "ghcr.io/Username/repo": repository name must be lowercase

**Причина:** Имя репозитория содержит заглавные буквы.

**Решение:** Обновите action до версии `@v1` (исправлено в v1.0.0)

### ❌ Error: yaml: line X: mapping values are not allowed in this context

**Причина:** Некорректная замена образа в docker-compose.yml с кавычками.

**Решение:** Обновите action до версии `@v1` (исправлено в v1.0.0)

Теперь поддерживаются оба формата:
```yaml
# С кавычками - OK
image: "ghcr.io/username/repo:latest"

# Без кавычек - OK
image: ghcr.io/username/repo:latest
```

**Примечание:** `version: '3.8'` deprecated в Docker Compose v2. Можно убрать из файла.

### Workflow не запускается
- Проверьте что PR создан в ветку `dev` или `main`
- Проверьте наличие файла `.github/workflows/deploy.yml`

### Сборка образа падает
- Проверьте `Dockerfile` на ошибки
- Убедитесь что `ENV_TYPE` принимается как `ARG`

### Деплой падает
- Проверьте что стек создан в Portainer
- Проверьте валидность API ключа
- Проверьте правильность Endpoint ID

### Образ не обновляется
- Используйте `pullImage: true`
- Проверьте права доступа Portainer к registry

### API ключ должен иметь права администратора
- Portainer → User settings → Access tokens
- При создании токена убедитесь что у пользователя роль **Administrator**

## Очистка старых образов

**Важно:** Portainer не удаляет старые образы автоматически! Они накапливаются на диске.

### Ручная очистка

SSH на Docker хост:

```bash
# Удалить dangling образы (без тегов)
docker image prune -f

# Удалить неиспользуемые образы старше 7 дней
docker image prune -a -f --filter "until=168h"

# Полная очистка всего неиспользуемого
docker system prune -a -f
```

### Автоматическая очистка (рекомендуется)

Создайте cron job на Docker хосте:

```bash
# Открыть crontab
crontab -e

# Добавить (запуск каждое воскресенье в 3:00)
0 3 * * 0 docker image prune -a -f --filter "until=168h"
```

Это удалит образы старше 7 дней (168 часов).

### Мониторинг места на диске

```bash
# Проверить занятое место Docker
docker system df

# Подробная информация
docker system df -v
```

## Лицензия

MIT

## Автор

xjl0
