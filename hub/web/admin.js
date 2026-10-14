'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const date = (iso) => (iso ? new Date(String(iso).replace(' ', 'T')).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const num = (n) => Number(n || 0).toLocaleString('ru-RU');
  const STATUS = { active: 'Работает', pending: 'Заявка', suspended: 'Приостановлен' };
  let data = null;
  let summary = null;

  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const out = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== '/hub/api/login') {
      showLogin();
      throw new Error(out.message || 'Нужно войти');
    }
    if (!res.ok) throw new Error(out.message || `Ошибка ${res.status}`);
    return out;
  }

  function flash(text, ok = true) {
    const el = $('flash');
    el.textContent = text;
    el.className = `alert ${ok ? 'ok' : 'error'}`;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => el.classList.add('hidden'), 6000);
  }

  function showLogin() {
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
  }

  async function load() {
    try {
      data = await api('GET', '/hub/api/admin/state');
    } catch {
      return;
    }
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('me').textContent = data.me;
    render();
  }

  function render() {
    const active = data.clubs.filter((c) => c.status !== 'pending');
    const pending = data.clubs.filter((c) => c.status === 'pending');
    const full = data.policy.universityAccess === 'full';
    $('req-count').textContent = pending.length ? `(${pending.length})` : '';
    $('clubs-body').innerHTML = active.length ? active.map((c) => `
      <tr data-slug="${esc(c.slug)}">
        <td><b>${esc(c.name)}</b><small><a href="/c/${esc(c.slug)}/" target="_blank" rel="noopener">/c/${esc(c.slug)}/</a></small></td>
        <td><span class="badge ${esc(c.status)}">${STATUS[c.status] ?? esc(c.status)}</span>${c.status === 'active' && !c.running ? '<small>не запущен</small>' : ''}</td>
        <td>${esc(c.chairEmail)}</td>
        <td>${date(c.updatedAt)}</td>
        <td class="actions">
          ${c.status === 'active' ? '<button class="btn small" data-act="suspend">Приостановить</button>' : '<button class="btn small" data-act="resume">Возобновить</button>'}
          ${c.backups.length ? '<button class="btn small" data-act="rollback" title="Вернуть систему к состоянию до последнего обновления">Откат</button>' : ''}
          <button class="btn small" data-act="token" title="Если председатель потерял ключ редактора">Новый ключ</button>
          ${full ? '<button class="btn small" data-act="credentials">База клуба</button>' : ''}
          <button class="btn small danger" data-act="delete">Удалить</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="5" class="muted">Клубов пока нет — создайте приглашение.</td></tr>';
    $('access-note').textContent = full
      ? 'Политика: вузу доступен полный вход в базы клубов («База клуба»). Каждое открытие записывается в журнал.'
      : 'Политика: вузу доступны только сводные отчёты. Данные клубов видит только их актив.';

    $('requests-body').innerHTML = pending.length ? pending.map((c) => `
      <tr data-slug="${esc(c.slug)}">
        <td><b>${esc(c.name)}</b><small>/c/${esc(c.slug)}/</small></td>
        <td>${esc(c.chairEmail)}</td>
        <td>${date(c.createdAt)}</td>
        <td class="actions"><button class="btn small primary" data-act="approve">Одобрить</button> <button class="btn small danger" data-act="reject">Отклонить</button></td>
      </tr>`).join('') : '<tr><td colspan="4" class="muted">Новых заявок нет.</td></tr>';

    const now = Date.now();
    $('invites-body').innerHTML = data.invites.length ? data.invites.map((i) => {
      const dead = i.uses >= i.maxUses || Date.parse(i.expiresAt) < now;
      return `<tr data-code="${esc(i.code)}">
        <td>${esc(i.note) || '—'}</td>
        <td><code>${esc(i.code)}</code></td>
        <td class="num">${i.uses} / ${i.maxUses}</td>
        <td>${date(i.expiresAt)}${dead ? '<small>не действует</small>' : ''}</td>
        <td class="actions">${dead ? '' : '<button class="btn small" data-act="copy-invite">Ссылка</button>'} <button class="btn small danger" data-act="revoke">Отозвать</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="muted">Приглашений нет.</td></tr>';

    $('admins-body').innerHTML = data.admins.map((a) => `
      <tr data-email="${esc(a.email)}"><td>${esc(a.email)}</td><td>${date(a.createdAt)}</td>
      <td>${a.email === data.me ? '<span class="muted">это вы</span>' : '<button class="btn small danger" data-act="remove-admin">Удалить</button>'}</td></tr>`).join('');

    $('audit-body').innerHTML = data.audit.map((a) => `<tr><td>${date(a.at)}</td><td>${esc(a.who)}</td><td>${esc(a.what)}</td><td>${esc(a.slug || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Пусто.</td></tr>';

    const form = $('policy-form');
    for (const el of form.elements) {
      if (!el.name) continue;
      const v = data.policy[el.name];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = Array.isArray(v) ? v.join(', ') : v;
    }
  }

  /* ---------------------------------- действия --------------------------------- */

  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
      document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab));
      if (tab.dataset.tab === 'summary' && !summary) loadSummary();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('tr');
    const slug = row?.dataset.slug;
    const club = data.clubs.find((c) => c.slug === slug);
    const act = btn.dataset.act;
    try {
      btn.disabled = true;
      if (act === 'approve') {
        await api('POST', `/hub/api/admin/clubs/${slug}/approve`, {});
        flash(`Клуб «${club.name}» подключён`);
      } else if (act === 'reject') {
        if (!confirm(`Отклонить заявку «${club.name}»?`)) return;
        await api('POST', `/hub/api/admin/clubs/${slug}/reject`, {});
        flash('Заявка отклонена');
      } else if (act === 'suspend') {
        if (!confirm(`Приостановить «${club.name}»? Система клуба станет недоступна, данные сохранятся.`)) return;
        await api('POST', `/hub/api/admin/clubs/${slug}/suspend`, {});
        flash('Клуб приостановлен');
      } else if (act === 'resume') {
        await api('POST', `/hub/api/admin/clubs/${slug}/resume`, {});
        flash('Клуб снова работает');
      } else if (act === 'rollback') {
        if (!confirm(`Откатить «${club.name}» к состоянию до последнего обновления? Записи, внесённые после обновления, пропадут.`)) return;
        await api('POST', `/hub/api/admin/clubs/${slug}/rollback`, {});
        flash('Последнее обновление отменено');
      } else if (act === 'token') {
        if (!confirm('Выдать новый ключ редактора? Старый перестанет работать.')) return;
        const { token } = await api('POST', `/hub/api/admin/clubs/${slug}/token`, {});
        prompt('Новый ключ для редактора Facet OS — передайте его председателю:', token);
      } else if (act === 'credentials') {
        const c = await api('POST', `/hub/api/admin/clubs/${slug}/credentials`, {});
        prompt(`Вход в базу клуба (${c.adminUrl}). Почта: ${c.email}. Пароль:`, c.password);
        window.open(c.adminUrl, '_blank', 'noopener');
      } else if (act === 'delete') {
        const typed = prompt(`Удалить «${club.name}» вместе со всеми данными? Это нельзя отменить.\nВведите адрес клуба (${slug}):`);
        if (typed !== slug) return;
        await api('POST', `/hub/api/admin/clubs/${slug}/delete`, { confirm: typed });
        flash('Клуб удалён');
      } else if (act === 'revoke') {
        await api('DELETE', `/hub/api/admin/invites/${row.dataset.code}`);
        flash('Приглашение отозвано');
      } else if (act === 'copy-invite') {
        const link = `${data.origin}/hub/join?invite=${row.dataset.code}`;
        await navigator.clipboard?.writeText(link).catch(() => {});
        flash(`Ссылка скопирована: ${link}`);
        return;
      } else if (act === 'remove-admin') {
        if (!confirm(`Удалить администратора ${row.dataset.email}?`)) return;
        await api('DELETE', `/hub/api/admin/admins/${encodeURIComponent(row.dataset.email)}`);
        flash('Администратор удалён');
      }
      summary = null;
      await load();
    } catch (err) {
      flash(err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').classList.add('hidden');
    try {
      await api('POST', '/hub/api/login', { email: $('login-email').value, password: $('login-password').value });
      $('login-password').value = '';
      await load();
    } catch (err) {
      $('login-error').textContent = err.message;
      $('login-error').classList.remove('hidden');
    }
  });

  $('logout').addEventListener('click', async () => {
    await api('POST', '/hub/api/logout', {}).catch(() => {});
    showLogin();
  });

  $('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const inv = await api('POST', '/hub/api/admin/invites', { note: $('inv-note').value, maxUses: $('inv-uses').value, days: $('inv-days').value });
      const box = $('invite-new');
      box.innerHTML = `<b>Приглашение создано</b><p class="hint">Отправьте ссылку председателю клуба:</p><p><code>${esc(inv.link)}</code></p>`;
      box.classList.remove('hidden');
      $('inv-note').value = '';
      await load();
    } catch (err) {
      flash(err.message, false);
    }
  });

  $('policy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = {};
    for (const el of e.target.elements) {
      if (!el.name) continue;
      patch[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    try {
      await api('PUT', '/hub/api/admin/policy', patch);
      flash('Настройки сохранены');
      await load();
    } catch (err) {
      flash(err.message, false);
    }
  });

  $('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/hub/api/admin/admins', { email: $('adm-email').value, password: $('adm-password').value });
      e.target.reset();
      flash('Администратор добавлен');
      await load();
    } catch (err) {
      flash(err.message, false);
    }
  });

  /* ----------------------------------- сводка ---------------------------------- */

  async function loadSummary() {
    $('sum-body').innerHTML = '<p class="muted">Считаю…</p>';
    try {
      summary = await api('GET', `/hub/api/admin/summary?days=${$('sum-days').value}`);
      renderSummary();
    } catch (err) {
      $('sum-body').innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
    }
  }

  function renderSummary() {
    const list = summary.clubs.filter((c) => c.status !== 'pending');
    const working = list.filter((c) => c.sections);
    const total = (fn) => working.reduce((n, c) => n + fn(c), 0);
    const records = total((c) => c.sections.reduce((n, s) => n + s.total, 0));
    const recent = total((c) => c.sections.reduce((n, s) => n + s.recent, 0));
    const quiet = working.filter((c) => !c.sections.some((s) => s.recent)).length;
    $('sum-cards').innerHTML = [
      ['Клубов работает', working.length],
      ['В активах', total((c) => c.staff)],
      ['Записей всего', records],
      [`Добавлено за ${summary.days} дн.`, recent],
      ['Без активности за период', quiet],
    ].map(([t, v]) => `<div class="card"><div class="stat">${num(v)}</div><div class="muted">${t}</div></div>`).join('');

    $('sum-body').innerHTML = list.map((c) => {
      if (!c.sections) return `<h2>${esc(c.name)}</h2><p class="muted">${c.error ? esc(c.error) : STATUS[c.status] ?? 'Нет данных'}</p>`;
      const regs = c.registers.map((r) => r.resources.map((x) => `<tr><td>${esc(r.name)} — ${esc(x.name)}</td><td class="num">${num(x.total)}</td><td class="num">${x.in ? `+${num(x.in)}` : '0'}</td><td class="num">${x.out ? `−${num(x.out)}` : '0'}</td></tr>`).join('')).join('');
      return `<h2>${esc(c.name)} <small>актив: ${num(c.staff)} · последняя запись: ${date(c.lastActivity)}</small></h2>
        <div class="table-wrap"><table><thead><tr><th>Раздел</th><th class="num">Всего</th><th class="num">За период</th></tr></thead><tbody>
        ${c.sections.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${num(s.total)}</td><td class="num">${num(s.recent)}</td></tr>`).join('')}
        </tbody></table></div>
        ${regs ? `<h3>Остатки и обороты</h3><div class="table-wrap"><table><thead><tr><th>Учёт</th><th class="num">Остаток</th><th class="num">Приход за период</th><th class="num">Расход за период</th></tr></thead><tbody>${regs}</tbody></table></div>` : ''}`;
    }).join('') || '<p class="muted">Клубов пока нет.</p>';
  }

  function csvCell(v) {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  $('sum-load').addEventListener('click', loadSummary);
  $('sum-days').addEventListener('change', loadSummary);
  $('sum-csv').addEventListener('click', () => {
    if (!summary) return;
    const rows = [['Клуб', 'Адрес', 'Статус', 'Актив', 'Раздел / учёт', 'Всего (остаток)', `За ${summary.days} дн. (+приход)`, 'Расход за период']];
    for (const c of summary.clubs) {
      if (!c.sections) { rows.push([c.name, c.slug, STATUS[c.status] ?? c.status, '', '', '', '', '']); continue; }
      for (const s of c.sections) rows.push([c.name, c.slug, STATUS[c.status], c.staff, s.name, s.total, s.recent, '']);
      for (const r of c.registers) for (const x of r.resources) rows.push([c.name, c.slug, STATUS[c.status], c.staff, `${r.name} — ${x.name}`, x.total, x.in, x.out]);
    }
    const blob = new Blob([`﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `svodka-klubov-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  load();
})();
