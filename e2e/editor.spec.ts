import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs';

const preview = (page: Page) => page.getByTestId('portal-preview');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(preview(page).locator('.fx-shell')).toBeVisible();
});

async function zipFiles(path: string) {
  const zip = await JSZip.loadAsync(fs.readFileSync(path));
  return { zip, names: Object.keys(zip.files) };
}

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

test('вид раздела из редактора применяется в превью', async ({ page }) => {
  await page.getByRole('radio', { name: /Advanced/ }).click();
  await page.getByRole('button', { name: /^Мероприятия/ }).click();
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  await expect(preview(page).locator('.fx-kanban')).toBeVisible();
});

test('удаление модуля отменяется', async ({ page }) => {
  await page.getByRole('button', { name: 'Удалить модуль «Инвентарь / Реквизит»' }).click();
  await expect(preview(page).getByRole('link', { name: /Инвентарь/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменить' }).first().click();
  await expect(preview(page).getByRole('link', { name: /Инвентарь/ })).toHaveCount(1);
});

test('новый модуль из заготовки появляется в превью', async ({ page }) => {
  await page.getByRole('radio', { name: /Advanced/ }).click();
  await page.getByRole('button', { name: 'Новый модуль' }).click();
  await page.getByRole('button', { name: /^Задачи/ }).click();
  await expect(preview(page).getByRole('link', { name: /Задачи/ })).toBeVisible();
  await expect(preview(page).locator('.fx-kanban')).toBeVisible();
});

test('импорт CSV попадает в превью и в архив', async ({ page }, info) => {
  // Файл передаётся буфером: путь в каталоге с кириллическим именем теста Chromium принимает не везде.
  const csv = { name: 'members.csv', mimeType: 'text/csv', buffer: Buffer.from('ФИО;Роль;Факультет\nОля Тестова;Медиа;ФКН\nПётр Проверкин;Участник;Физфак\n') };
  await page.getByRole('radio', { name: /Advanced/ }).click();
  await page.getByRole('button', { name: /^Активисты/ }).click();
  await page.getByRole('button', { name: 'Импорт из таблицы' }).click();
  await page.locator('input[type=file][accept*=csv]').setInputFiles(csv);
  await page.getByRole('button', { name: 'Импортировать 2 строк' }).click();
  await expect(page.getByText('импортированные данные')).toBeVisible();
  await expect(preview(page).getByText('Оля Тестова')).toBeVisible();

  await page.getByRole('button', { name: /Экспорт в Self-Host/ }).click();
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
  await page.getByRole('button', { name: /Экспорт в Self-Host/ }).click();
  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Скачать .zip/ }).click()]);
  await d1.saveAs(info.outputPath('install.zip'));
  const install = await zipFiles(info.outputPath('install.zip'));
  for (const f of ['docker-compose.yml', 'install.sh', 'backup.sh', 'restore.sh', 'caddy/Caddyfile', 'pocketbase/pb_hooks/facet.pb.js', 'nginx/snippets/facet-csp.conf', 'web/portal.js', '.env']) {
    expect(install.names.some((n) => n.endsWith(`/${f}`)), f).toBe(true);
  }
  const installSh = install.zip.file(install.names.find((n) => n.endsWith('/install.sh'))!)!;
  expect(installSh.unixPermissions && (Number(installSh.unixPermissions) & 0o111)).toBeTruthy();

  await page.getByRole('radio', { name: /Advanced/ }).click();
  await page.getByRole('button', { name: /^Активисты/ }).click();
  await page.getByRole('button', { name: 'Удалить поле' }).nth(2).click();
  await page.getByRole('button', { name: /Экспорт в Self-Host/ }).click();
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
  await page.getByRole('radio', { name: /Advanced/ }).click();
  await page.getByRole('tab', { name: /Клуб/ }).click();
  await page.getByLabel('Название').fill('Клуб по ссылке');
  await page.getByRole('button', { name: 'Скопировать ссылку на схему' }).click();
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

test('английский интерфейс и портал', async ({ page }) => {
  await page.getByRole('button', { name: /Язык интерфейса/ }).click();
  await expect(page.getByRole('button', { name: /Export to self-host/ })).toBeVisible();
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(preview(page).getByRole('link', { name: 'Home' })).toBeVisible();
});

test('шаблон сообщества применяется и отменяется', async ({ page }) => {
  await page.getByRole('button', { name: /Хакатон-клуб/ }).click();
  await expect(preview(page).getByRole('heading', { name: /Коммит/ })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить' }).first().click();
  await expect(preview(page).getByRole('heading', { name: 'Гильдия Северного кампуса' })).toBeVisible();
});
