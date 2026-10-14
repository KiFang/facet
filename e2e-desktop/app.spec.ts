import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-desktop-'));

test.beforeAll(async () => {
  const bin = process.env.FACET_ELECTRON_BIN;
  app = await electron.launch({
    ...(bin ? { executablePath: bin, args: ['--no-sandbox'] } : { args: ['--no-sandbox', '.'] }),
    env: { ...process.env, FACET_USER_DATA: userData, LANG: 'ru_RU.UTF-8' },
  });
  page = await app.firstWindow();
  await expect(page.getByTestId('portal-preview').locator('.fx-shell')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.setItem('facet-os:ui', JSON.stringify({ state: { locale: 'ru' }, version: 0 })));
  await page.reload();
  await expect(page.getByTestId('portal-preview').locator('.fx-shell')).toBeVisible({ timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

const info = () => page.evaluate(() => window.facetDesktop!.localServer.info());

test('система клуба ставится, обновляется без потери данных и откатывается на этом ПК', async () => {
  expect(await app.evaluate(({ app: a }) => a.getName())).toBeTruthy();
  expect(await page.title()).toContain('Facet OS');

  // Установка
  await page.getByRole('button', { name: /Экспорт в Self-Host/ }).click();
  await expect(page.getByRole('radio', { name: /На этом ПК/ })).toHaveAttribute('data-state', 'on');
  await expect(page.getByText('Ещё не установлена')).toBeVisible();
  await page.getByRole('button', { name: 'Установить и запустить' }).click();
  await expect(page.getByText('Работает', { exact: true })).toBeVisible({ timeout: 60_000 });

  const installed = await info();
  expect(installed.running).toBe(true);
  const base = installed.url!;
  expect(await (await fetch(`${base}/`)).text()).toContain('/portal.js');
  expect((await (await fetch(`${base}/club-schema.json`)).json()).clubName).toBe('Гильдия Северного кампуса');

  // Данные через API (как это сделал бы администратор в панели)
  const auth = await (await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: installed.admin!.email, password: installed.admin!.password }),
  })).json();
  expect(auth.token).toBeTruthy();
  const created = await (await fetch(`${base}/api/collections/members/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: auth.token },
    body: JSON.stringify({ full_name: 'Аня', role: 'Президент' }),
  })).json();
  expect(created.id).toBeTruthy();
  await expect(page.getByText('На этом ПК уже установлена текущая версия')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Применить изменения' })).toBeDisabled();
  await page.keyboard.press('Escape');

  // Только тема: структура не меняется, но применить нужно (файлы портала)
  await page.getByRole('radio', { name: /Advanced/ }).click();
  await page.getByRole('tab', { name: /Клуб/ }).click();
  await page.getByLabel('Девиз').fill('Новый девиз');
  await page.getByRole('button', { name: /Экспорт в Self-Host/ }).click();
  await page.getByRole('button', { name: 'Применить изменения' }).click();
  // Сервер перезапускается при применении — опрашиваем, пока не поднимется с новой схемой.
  await expect.poll(async () => {
    try {
      return (await (await fetch(`${(await info()).url}/club-schema.json`)).json()).motto;
    } catch {
      return null;
    }
  }, { timeout: 30_000 }).toBe('Новый девиз');
  await page.keyboard.press('Escape');

  // Изменение структуры в редакторе
  await page.getByRole('tab', { name: /Модули/ }).click();
  await page.getByRole('button', { name: /^Активисты/ }).click();
  await page.getByRole('button', { name: 'Добавить поле' }).click();

  // Обновление
  await page.getByRole('button', { name: /Экспорт в Self-Host/ }).click();
  await expect(page.getByText(/members: новое поле «field»/)).toBeVisible();
  await page.getByRole('button', { name: 'Применить изменения' }).click();
  // Две копии: перед обновлением темы и перед обновлением структуры.
  await expect.poll(async () => {
    const i = await info();
    return i.running && i.backups.length;
  }, { timeout: 60_000 }).toBe(2);
  const updated = await info();
  const members = await (await fetch(`${updated.url}/api/collections/members/records`)).json();
  expect(members.items).toHaveLength(1);
  expect(members.items[0]).toMatchObject({ full_name: 'Аня', field: '' });

  // Откат
  await page.getByRole('button', { name: 'Откатить последнее обновление' }).click();
  await expect.poll(async () => {
    const i = await info();
    return i.running && i.backups.length;
  }, { timeout: 60_000 }).toBe(1);
  const rolled = await info();
  expect((await (await fetch(`${rolled.url}/club-schema.json`)).json()).motto).toBe('Новый девиз');
  const after = await (await fetch(`${rolled.url}/api/collections/members/records`)).json();
  expect(after.items[0].full_name).toBe('Аня');
  expect('field' in after.items[0]).toBe(false);

  // Выход из приложения останавливает PocketBase
  const url = rolled.url!;
  await app.close();
  await expect(fetch(`${url}/api/health`)).rejects.toThrow();
});
