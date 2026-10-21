# BIUniversity — рабочий проект

Ветки одного репозитория хранят разные части проекта:

- `master_main` — workspace, настройки pnpm и планы работ.
- `master2` — исходники frontend, подключённые как submodule `frontend`.
- `main` — production-сборка для GitHub Pages.

## Первый запуск

Проверенная среда: Node.js 24 и Corepack с pnpm 12.14.0.

```powershell
git clone --branch master_main --recurse-submodules https://github.com/111111N/BIUniversity.git
cd BIUniversity
corepack pnpm install --frozen-lockfile
corepack pnpm run dev
```

Для уже существующего клона:

```powershell
git submodule update --init --recursive
corepack pnpm install --frozen-lockfile
```

## Проверки и сборка

```powershell
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
```

Сборка для текущего адреса GitHub Pages:

```powershell
corepack pnpm run build --base=/BIUniversity/
```

Результат находится в `frontend/dist`. В ветку `main` публикуются содержимое
этой папки и копия `index.html` под именем `404.html` для прямых ссылок SPA.
Исходники и настройки workspace публикуются в свои ветки отдельно.

На 21 октября 2026 года все 210 тестов и production-сборка проходят.
Полный ESLint сохраняет 13 исходных ошибок, воспроизводимых на предыдущем
коммите; новых ошибок текущие изменения не добавляют.
