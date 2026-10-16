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

test('рабочее место в превью: роли, форма записи, сотрудники', async ({ page }) => {
  const pv = preview(page);
  // Председатель: создаёт запись через форму, обязательные поля проверяются.
  await pv.locator('[data-nav="/members"]').first().click();
  await pv.getByTestId('fx-add').click();
  await pv.getByRole('button', { name: 'Сохранить' }).click();
  await expect(pv.locator('.fx-field-error')).toHaveCount(2);
  await pv.locator('input[name=full_name]').fill('Новый Участник');
  await pv.locator('select[name=role]').selectOption({ index: 1 });
  await pv.getByRole('button', { name: 'Сохранить' }).click();
  await expect(pv.locator('.fx-detail h2')).toHaveText('Новый Участник');
  await pv.getByTestId('fx-edit').click();
  await pv.locator('input[name=faculty]').fill('ФКН');
  await pv.getByRole('button', { name: 'Сохранить' }).click();
  await expect(pv.locator('.fx-detail')).toContainText('ФКН');

  // Казначей: инвентарь только просмотр — кнопки «Добавить» нет.
  await page.getByTestId('preview-view-as').selectOption('treasurer');
  await pv.locator('[data-nav="/inventory"]').first().click();
  await expect(pv.locator('.fx-toolbar h2')).toContainText('Инвентарь');
  await expect(pv.getByTestId('fx-add')).toHaveCount(0);
  await expect(pv.locator('[data-nav="/staff"]')).toHaveCount(0);

  // Права из конфигуратора сразу действуют: даём казначею изменение инвентаря.
  await page.getByTestId('nav-roles').click();
  await page.getByTestId('access-inventory').locator('[data-level]').nth(1).click();
  await expect(pv.getByTestId('fx-add')).toBeVisible();

  // Гость видит только вход.
  await page.getByTestId('preview-view-as').selectOption('');
  await expect(pv.locator('form[data-login]')).toBeVisible();

  // Председатель управляет составом.
  await page.getByTestId('preview-view-as').selectOption('chair');
  await pv.locator('[data-nav="/staff"]').first().click();
  await expect(pv.locator('[data-staff-row]')).toHaveCount(4);
  await pv.locator('#fx-staff-name').fill('Катя');
  await pv.locator('#fx-staff-email').fill('katya@club.test');
  await pv.locator('#fx-staff-password').fill('katya-pass-123');
  await pv.locator('form[data-staff-form] button[type=submit]').click();
  await expect(pv.locator('[data-staff-row]')).toHaveCount(5);
});

test('учёт: касса и выдача инвентаря, остатки и подтверждение', async ({ page }, info) => {
  await page.getByTestId('nav-add-accounting').click();
  await page.getByTestId('pack-cash').click();
  await expect(page.getByTestId('nav-register-cash')).toBeVisible();
  await page.getByTestId('nav-add-accounting').click();
  await page.getByTestId('pack-equipment').click();
  await expect(page.getByTestId('nav-register-on_hand')).toBeVisible();
  await expect(page.getByText('Схема в порядке')).toBeVisible();

  const pv = preview(page);
  // Новая операция: приход 1000 по статье «Взносы» — сразу в остатках.
  await pv.locator('[data-nav="/balances"]').first().click();
  const before = await pv.locator('[data-balance="cash"] tfoot .fx-num').textContent();
  await pv.locator('[data-nav="/cash_ops"]').first().click();
  await pv.getByTestId('fx-add').click();
  await pv.locator('input[name=title]').fill('Взносы октябрь');
  await pv.locator('input[name=date]').fill('2026-10-01T12:00');
  await pv.locator('select[name=type]').selectOption('Поступление');
  await pv.locator('input[name=amount]').fill('1000');
  await pv.locator('select[name=article]').selectOption('Взносы');
  await expect(pv.locator('input[name=posted]')).toBeChecked();
  await pv.getByRole('button', { name: 'Сохранить' }).click();
  await expect(pv.locator('.fx-posted-badge')).toBeVisible();
  await pv.locator('[data-nav="/balances"]').first().click();
  const toNum = (s: string | null) => Number((s ?? '0').replace(/\s/g, '').replace(',', '.'));
  await expect.poll(async () => toNum(await pv.locator('[data-balance="cash"] tfoot .fx-num').textContent())).toBe(toNum(before) + 1000);

  // Отмена подтверждения убирает операцию из остатков.
  await pv.locator('[data-nav="/cash_ops"]').first().click();
  await pv.getByRole('link', { name: 'Взносы октябрь' }).click();
  await pv.getByRole('button', { name: 'Отменить подтверждение' }).click();
  await expect(pv.locator('.fx-draft')).toBeVisible();
  await pv.locator('[data-nav="/balances"]').first().click();
  await expect.poll(async () => toNum(await pv.locator('[data-balance="cash"] tfoot .fx-num').textContent())).toBe(toNum(before));

  // Ввод на основании: из выдачи — «Оформить возврат» с теми же предметом и человеком.
  await pv.locator('[data-nav="/issues"]').first().click();
  await pv.locator('.fx-table tbody tr').first().click();
  await pv.getByRole('button', { name: 'Оформить возврат' }).click();
  await expect(pv.locator('select[name=type]')).toHaveValue('Возврат');
  await expect(pv.locator('select[name=item]')).not.toHaveValue('');

  // Печатная форма акта и отчёты.
  await pv.locator('[data-nav="/issues"]').first().click();
  await pv.locator('.fx-table tbody tr').first().click();
  await pv.locator('[data-print-link="act"]').click();
  await expect(pv.locator('.fx-pf-page h1')).toContainText('Акт №');
  await expect(pv.locator('.fx-pf-table')).toBeVisible();
  await pv.locator('[data-nav="/reports"]').first().click();
  await expect(pv.locator('[data-report-table="turnover"]')).toBeVisible();
  await pv.locator('[data-report-tab="summary"]').click();
  await pv.locator('[data-report="entity"]').selectOption('cash_ops');
  await pv.locator('[data-report="groupBy"]').selectOption('article');
  await expect(pv.locator('[data-report-table="summary"] tbody tr').first()).toBeVisible();

  // Главная: что требует внимания и итоги регистров.
  await pv.locator('[data-nav="/"]').first().click();
  await expect(pv.locator('.fx-attention')).toContainText('Движения денег');
  await expect(pv.locator('[data-reg-total="cash"]')).toBeVisible();

  // В архиве — хук проведения и коллекции регистров.
  await page.keyboard.press('Control+KeyE');
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Скачать .zip/ }).click()]);
  await d.saveAs(info.outputPath('accounting.zip'));
  const { zip, names } = await zipFiles(info.outputPath('accounting.zip'));
  expect(names.some((n) => n.endsWith('pb_hooks/facet-registers.pb.js'))).toBe(true);
  const init = await zip.file(names.find((n) => n.endsWith('_facet_init.js'))!)!.async('string');
  expect(init).toContain('"reg_cash"');
  expect(init).toContain('"reg_on_hand"');
});

test('хаб вуза: подключение клуба и обновление из редактора', async ({ page }) => {
  const HUB = 'https://clubs.uni.test';
  const info = { hub: 'facet-hub', version: '0.3.0', name: 'Клубы университета', university: 'Северный кампус', joinMode: 'invite', universityAccess: 'reports', allowEditorUpload: true, allowDraftData: true, allowCustomPlugins: false, allowedEmailDomains: [] };
  let joinBody: Record<string, unknown> | null = null;
  const updates: Record<string, unknown>[] = [];
  await page.route(`${HUB}/hub/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/hub/api/info') return json(info);
    if (url.pathname === '/hub/api/join') {
      joinBody = route.request().postDataJSON();
      return json({ slug: 'guild', name: 'Гильдия', status: 'active', token: 'fct_test', url: `${HUB}/c/guild/` });
    }
    if (url.pathname === '/hub/api/club') {
      expect(route.request().headers().authorization).toBe('Bearer fct_test');
      return json({ slug: 'guild', name: 'Гильдия', status: 'active', url: `${HUB}/c/guild/`, schema: null });
    }
    if (url.pathname === '/hub/api/club/update') {
      const body = route.request().postDataJSON();
      updates.push(body);
      return json({ changes: [{ severity: 'danger', text: 'events: поле «location» будет удалено' }], danger: true, seeded: 0, same: false, applied: !body.dryRun });
    }
    return json({ message: 'нет' }, 404);
  });

  await page.getByTestId('nav-publish').click();
  await page.getByTestId('publish-hub').click();
  const dialog = page.getByRole('dialog', { name: 'Хаб вуза' });
  await dialog.getByTestId('hub-url').fill('clubs.uni.test');
  await dialog.getByTestId('hub-check').click();
  await expect(dialog).toContainText('Клубы университета');
  await expect(dialog).toContainText('только сводные цифры');
  await expect(dialog.getByTestId('hub-join')).toBeDisabled();
  await dialog.getByTestId('hub-invite').fill('inv_abc');
  await dialog.getByTestId('hub-slug').fill('guild');
  await dialog.getByTestId('hub-email').fill('chair@uni.test');
  await dialog.getByTestId('hub-password').fill('chair-password');
  await dialog.getByTestId('hub-join').click();
  await expect(dialog.getByTestId('hub-status')).toHaveText('работает');
  expect(joinBody).toMatchObject({ invite: 'inv_abc', slug: 'guild', chair: { email: 'chair@uni.test', password: 'chair-password' } });
  expect((joinBody as unknown as { schema: { entities: unknown[] } }).schema.entities.length).toBeGreaterThan(0);

  // Ключ клуба не попадает в схему.
  const stored = await page.evaluate(() => localStorage.getItem('facet-os:schema') ?? '');
  expect(stored).not.toContain('fct_test');

  await dialog.getByTestId('hub-preview').click();
  await expect(dialog.getByTestId('hub-changes')).toContainText('будет удалено');
  await expect(dialog.getByTestId('hub-apply')).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByTestId('hub-apply').click();
  await expect(dialog.getByTestId('hub-changes')).toContainText('обновлена');
  expect(updates.map((u) => [u.dryRun, u.accept])).toEqual([[true, undefined], [false, true]]);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('publish-hub')).toContainText('Обновить в хабе');
});

test('экранирование: разметка из схемы и данных не попадает в DOM портала', async ({ page }) => {
  // Безобидный маркер: если его разметка где-то не экранирована, в DOM появится элемент [data-xss-probe].
  const PROBE = `"'><i data-xss-probe>probe</i>`;
  await page.getByTestId('nav-add-accounting').click();
  await page.getByTestId('pack-cash').click();
  await page.getByTestId('nav-add-accounting').click();
  await page.getByTestId('pack-equipment').click();
  await expect(page.getByTestId('nav-register-on_hand')).toBeVisible();

  await page.evaluate((P) => {
    type Field = { id: string; name: string; type: string; options?: string[]; target?: string };
    type Entity = { id: string; name: string; pluralName: string; fields: Field[]; printForms?: { name: string; body: string }[]; basedOn?: { label: string }[] };
    const stored = JSON.parse(localStorage.getItem('facet-os:schema')!);
    const s = stored.state.schema;
    s.clubName += P;
    s.motto = `${s.motto ?? ''}${P}`;
    for (const r of s.roles ?? []) r.name += P;
    for (const reg of s.registers ?? []) {
      reg.name += P;
      for (const d of reg.dimensions) d.name += P;
      for (const x of reg.resources) x.name += P;
    }
    const seeds: Record<string, unknown> = {};
    for (const e of s.entities as Entity[]) {
      e.name += P;
      e.pluralName += P;
      for (const f of e.fields) {
        f.name += P;
        if (f.options) f.options.push(P);
      }
      for (const pf of e.printForms ?? []) {
        pf.name += P;
        pf.body += `\n${P} **${P}**\n| ${P} | {{${e.fields[0].name}}} |`;
      }
      for (const b of e.basedOn ?? []) b.label += P;
      const rows = [0, 1, 2].map((i) => Object.fromEntries(e.fields.map((f) => {
        if (f.type === 'number') return [f.id, String(i + 5)];
        if (f.type === 'date') return [f.id, '2026-10-0' + (i + 1)];
        if (f.type === 'select' || f.type === 'status') return [f.id, i === 0 ? P : f.options![0]];
        if (f.type === 'relation') return [f.id, `${P}0`];
        return [f.id, `${P}${i}`];
      })));
      seeds[e.id] = { entityId: e.id, rows, source: 'probe', importedAt: new Date().toISOString() };
    }
    stored.state.seeds = seeds;
    localStorage.setItem('facet-os:schema', JSON.stringify(stored));
  }, PROBE);
  await page.reload();

  const pv = preview(page);
  await expect(pv.locator('.fx-shell')).toBeVisible();
  const clean = async (where: string) => expect(await page.locator('[data-xss-probe]').count(), where).toBe(0);
  // Маркер действительно показан — как текст.
  await expect(pv.locator('.fx-hero')).toContainText('data-xss-probe');
  await clean('главная');

  const tabs = await pv.locator('a.fx-tab[data-nav]').evaluateAll((els) => els.map((el) => el.getAttribute('data-nav')!));
  expect(tabs.length).toBeGreaterThan(5);
  for (const tab of tabs) {
    await pv.locator(`a.fx-tab[data-nav="${tab}"]`).first().click();
    await clean(tab);
    for (const view of await pv.locator('[data-view]').evaluateAll((els) => els.map((el) => el.getAttribute('data-view')!))) {
      await pv.locator(`[data-view="${view}"]`).click();
      await clean(`${tab} · ${view}`);
    }
    for (const t of await pv.locator('[data-report-tab]').evaluateAll((els) => els.map((el) => el.getAttribute('data-report-tab')!))) {
      await pv.locator(`[data-report-tab="${t}"]`).click();
      await clean(`${tab} · отчёт ${t}`);
    }
    const record = pv.locator(`a[data-nav^="${tab}/"]`).first();
    if (tab !== '/' && (await record.count())) {
      await record.click();
      await clean(`${tab} · карточка`);
      if (await pv.locator('[data-print-link]').count()) {
        await pv.locator('[data-print-link]').first().click();
        await clean(`${tab} · печатная форма`);
        await page.goBack();
      }
      if (await pv.getByTestId('fx-edit').count()) {
        await pv.getByTestId('fx-edit').click();
        await clean(`${tab} · форма правки`);
      }
    }
  }
});
