import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs';

const preview = (page: Page) => page.getByTestId('portal-preview');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    // Экран приветствия проверяется отдельным тестом.
    localStorage.setItem('facet-os:settings', JSON.stringify({ state: { welcomeSeen: true }, version: 1 }));
  });
  await page.reload();
  await expect(preview(page).locator('.fx-shell')).toBeVisible();
  page.on('dialog', (d) => void d.accept());
});

async function zipFiles(path: string) {
  const zip = await JSZip.loadAsync(fs.readFileSync(path));
  return { zip, names: Object.keys(zip.files) };
}

const advanced = (page: Page) => page.getByRole('toolbar').getByRole('radio', { name: 'Расширенный' }).click();

async function exportMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Экспорт в Self-Host' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('экран приветствия при первом запуске', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Добро пожаловать в Facet OS' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать работу' }).click();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('превью: дашборд и все виды раздела', async ({ page }) => {
  await preview(page).getByRole('link', { name: 'Главная' }).click();
  await expect(preview(page).locator('.fx-stat')).toHaveCount(3);
  await preview(page).getByRole('link', { name: /Мероприятия/ }).first().click();
  for (const [tab, selector] of [['Таблица', '.fx-table'], ['Канбан', '.fx-kanban'], ['Календарь', '.fx-cal-grid'], ['Карточки', '.fx-grid']]) {
    await preview(page).getByRole('tab', { name: tab }).click();
    await expect(preview(page).locator(selector)).toBeVisible();
  }
  await preview(page).locator('.fx-card').first().click();
  await expect(preview(page).getByText('Реквизиты')).toBeVisible();
  await expect(preview(page).getByText('Связанные записи')).toBeVisible();
});

test('вид раздела из свойств применяется в превью', async ({ page }) => {
  await page.getByTestId('nav-entity-events').click();
  await page.getByRole('radiogroup', { name: 'Вид раздела' }).getByRole('radio', { name: /Канбан/ }).click();
  await expect(preview(page).locator('.fx-kanban')).toBeVisible();
});

test('удаление раздела отменяется', async ({ page }) => {
  await page.getByTestId('nav-entity-inventory').click();
  await page.getByRole('button', { name: 'Удалить раздел «Инвентарь / Реквизит»' }).click();
  await expect(preview(page).getByRole('link', { name: /Инвентарь/ })).toHaveCount(0);
  await expect(page.getByTestId('nav-entity-inventory')).toHaveCount(0);
  await page.keyboard.press('Control+KeyZ');
  await expect(preview(page).getByRole('link', { name: /Инвентарь/ })).toHaveCount(1);
});

test('новый раздел из заготовки появляется в превью и навигаторе', async ({ page }) => {
  await page.keyboard.press('Control+Shift+KeyM');
  await page.getByTestId('tpl-tasks').click();
  await expect(page.getByRole('navigation').getByRole('button', { name: /^Задачи/ })).toBeVisible();
  await expect(preview(page).getByRole('link', { name: /Задачи/ })).toBeVisible();
  await expect(preview(page).locator('.fx-kanban')).toBeVisible();
});

test('палитра команд выполняет команду', async ({ page }) => {
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('textbox', { name: 'Все команды…' }).fill('схема связей');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('schema-diagram')).toBeVisible();
});

test('импорт CSV попадает в превью и в архив', async ({ page }, info) => {
  // Файл передаётся буфером: путь в каталоге с кириллическим именем теста Chromium принимает не везде.
  const csv = { name: 'members.csv', mimeType: 'text/csv', buffer: Buffer.from('ФИО;Роль;Факультет\nОля Тестова;Медиа;ФКН\nПётр Проверкин;Участник;Физфак\n') };
  await advanced(page);
  await page.getByTestId('nav-entity-members').click();
  await page.getByRole('toolbar').getByRole('button', { name: 'Импорт' }).click();
  await page.locator('input[type=file][accept*=csv]').setInputFiles(csv);
  await page.getByRole('button', { name: 'Импортировать 2 строк' }).click();
  await expect(preview(page).getByText('Оля Тестова')).toBeVisible();

  await exportMenu(page, /новая установка/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Скачать .zip/ }).click()]);
  const path = info.outputPath('install.zip');
  await download.saveAs(path);
  const { zip, names } = await zipFiles(path);
  const migration = names.find((n) => n.endsWith('_facet_init.js'))!;
  const text = await zip.file(migration)!.async('string');
  expect(text).toContain('"op": "seed"');
  expect(text).toContain('Оля Тестова');
});

test('экспорт: установка, затем обновление только с изменениями', async ({ page }, info) => {
  await page.keyboard.press('Control+KeyE');
  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Скачать .zip/ }).click()]);
  await d1.saveAs(info.outputPath('install.zip'));
  const install = await zipFiles(info.outputPath('install.zip'));
  for (const f of ['docker-compose.yml', 'install.sh', 'backup.sh', 'restore.sh', 'caddy/Caddyfile', 'pocketbase/pb_hooks/facet.pb.js', 'nginx/snippets/facet-csp.conf', 'web/portal.js', '.env']) {
    expect(install.names.some((n) => n.endsWith(`/${f}`)), f).toBe(true);
  }
  const installSh = install.zip.file(install.names.find((n) => n.endsWith('/install.sh'))!)!;
  expect(installSh.unixPermissions && (Number(installSh.unixPermissions) & 0o111)).toBeTruthy();
  await page.keyboard.press('Escape');

  await advanced(page);
  await page.getByTestId('nav-entity-members').click();
  await page.getByTestId('field-faculty').getByRole('button', { name: 'Удалить поле' }).click();
  await expect(page.getByTestId('field-faculty')).toHaveCount(0);
  await exportMenu(page, /обновление сервера/);
  await expect(page.getByText('Версия на сервере: Гильдия Северного кампуса')).toBeVisible();
  await expect(page.getByText('members: поле «faculty» будет удалено вместе с данными', { exact: true })).toBeVisible();
  const download = page.getByRole('button', { name: /Скачать обновление/ });
  await expect(download).toBeDisabled();
  await page.getByText(/Я понимаю/).click();
  const [d2] = await Promise.all([page.waitForEvent('download'), download.click()]);
  await d2.saveAs(info.outputPath('update.zip'));
  const update = await zipFiles(info.outputPath('update.zip'));
  expect(update.names.some((n) => n.endsWith('/apply-update.sh'))).toBe(true);
  expect(update.names.some((n) => n.endsWith('/.env'))).toBe(false);
  expect(update.names.some((n) => /payload\/pocketbase\/pb_migrations\/\d+_facet_update\.js$/.test(n))).toBe(true);
  expect(update.names.some((n) => n.includes('_facet_init.js'))).toBe(false);
});

test('ссылка «Поделиться» открывает схему', async ({ page, context }) => {
  await page.getByTestId('nav-club').click();
  await page.getByRole('textbox', { name: /^Название \d/ }).fill('Клуб по ссылке');
  await page.getByTestId('nav-publish').click();
  await page.getByRole('button', { name: 'Копировать ссылку', exact: true }).click();
  await expect(page.getByText(/Ссылка скопирована/)).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('#s=');

  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() => localStorage.clear());
  await other.goto(url);
  await expect(other.getByTestId('portal-preview').getByRole('heading', { name: 'Клуб по ссылке' })).toBeVisible();
  await expect(other.getByText(/Открыта схема «Клуб по ссылке»/)).toBeVisible();
});

test('настройки: английский интерфейс, тёмная тема, язык портала', async ({ page }) => {
  await page.keyboard.press('Control+Comma');
  const dialog = page.getByRole('dialog', { name: 'Настройки' });
  await dialog.getByRole('radio', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dialog.getByRole('radio', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Export to self-host' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('nav-club').click();
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(preview(page).getByRole('link', { name: 'Home' })).toBeVisible();
});

test('шаблон сообщества применяется и отменяется', async ({ page }) => {
  await page.getByRole('menuitem', { name: 'Файл' }).click();
  await page.getByRole('menuitem', { name: /Создать клуб из шаблона/ }).click();
  await page.getByRole('button', { name: /Хакатон-клуб/ }).click();
  await expect(preview(page).getByRole('heading', { name: /Коммит/ })).toBeVisible();
  await page.keyboard.press('Control+KeyZ');
  await expect(preview(page).getByRole('heading', { name: 'Гильдия Северного кампуса' })).toBeVisible();
});

test('плагины: установка, настройка и экспорт', async ({ page }, info) => {
  await page.keyboard.press('Control+Shift+KeyP');
  const dialog = page.getByRole('dialog', { name: 'Управление плагинами' });
  await dialog.getByTestId('plugin-portal-tools').click();
  await dialog.getByRole('button', { name: 'Установить', exact: true }).click();
  await dialog.getByTestId('plugin-audit-log').click();
  await dialog.getByRole('button', { name: 'Установить', exact: true }).click();
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(preview(page).locator('[data-csv]')).toBeVisible();
  await expect(page.getByTestId('nav-entity-audit_log')).toBeVisible();

  await page.keyboard.press('Control+KeyE');
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Скачать .zip/ }).click()]);
  await d.saveAs(info.outputPath('plugins.zip'));
  const { names } = await zipFiles(info.outputPath('plugins.zip'));
  expect(names.some((n) => n.endsWith('pb_hooks/plugin-audit-log.pb.js'))).toBe(true);
});

test('сторонний плагин из файла', async ({ page }) => {
  await page.keyboard.press('Control+Shift+KeyP');
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'plugin.json',
    mimeType: 'application/json',
    buffer: fs.readFileSync('examples/plugins/deadline-badge.json'),
  });
  await expect(page.getByText('Установить сторонний плагин?')).toBeVisible();
  await page.getByRole('button', { name: 'Установить', exact: true }).last().click();
  await expect(page.getByText(/Плагин «Метка «скоро»» установлен/)).toBeVisible();
  await expect(page.getByTestId('plugin-deadline-badge')).toBeVisible();
});

test('справка открывается в отдельном окне по F1 и ищет', async ({ page }) => {
  const [help] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('F1')]);
  await expect(help.getByTestId('help-article').getByRole('heading', { level: 1 })).toHaveText(/Начало работы/);
  await help.getByTestId('help-search').fill('канбан');
  await help.getByRole('button', { name: /Представления/ }).click();
  await expect(help.getByTestId('help-article').getByRole('heading', { level: 1 })).toHaveText(/Представления/);

  // Кнопка «?» в свойствах переключает уже открытое окно на нужный раздел.
  await page.getByTestId('nav-plugins').click();
  await page.getByRole('button', { name: 'Справка по этому разделу' }).click();
  await expect(help.getByTestId('help-article').getByRole('heading', { level: 1 })).toHaveText(/Плагины/);
});

test('редактор данных: вставка из Excel, правка и сохранение в черновик', async ({ page }) => {
  const [data] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Control+Shift+KeyD')]);
  data.on('dialog', (d) => void d.accept());
  await data.getByTestId('table-members').click();
  const grid = data.getByTestId('data-grid');
  await grid.click();
  await data.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Оля Тестова\tПрезидент\tФКН\nПётр Проверкин\tПрезидент\tФизфак\n');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  });
  await expect(data.locator('[data-row]')).toHaveCount(2);
  await expect(data.locator('[data-status="new"]')).toHaveCount(2);

  // Правка ячейки с клавиатуры
  await data.locator('[data-cell="1:2"]').click();
  await data.keyboard.press('F2');
  await data.getByTestId('cell-editor').fill('Мехмат');
  await data.keyboard.press('Enter');
  await expect(data.locator('[data-cell="1:2"]')).toHaveText('Мехмат');

  // Ошибка: неверный вариант не даёт сохранить
  await data.locator('[data-cell="0:1"]').click();
  await data.keyboard.press('Delete');
  await data.keyboard.press('Control+KeyS');
  await expect(data.getByText(/Исправьте ошибки/)).toBeVisible();
  await data.keyboard.press('Enter');
  await data.getByTestId('choice-editor').getByRole('option').first().click();

  await data.keyboard.press('Control+KeyS');
  await expect(data.getByText(/Сохранено в черновик: 2/)).toBeVisible();
  await expect(data.locator('[data-status="new"]')).toHaveCount(0);

  // Черновик виден в основном окне: в превью портала
  await page.bringToFront();
  await expect(preview(page).getByText('Оля Тестова').first()).toBeVisible();
});
