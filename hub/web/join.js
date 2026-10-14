'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  if (params.get('invite')) $('invite').value = params.get('invite');

  const translit = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
  const slugify = (s) => s.toLowerCase().split('').map((c) => translit[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  let slugTouched = false;
  const preview = () => { $('slug-preview').textContent = `/c/${$('slug').value || '…'}/`; };
  $('name').addEventListener('input', () => { if (!slugTouched) { $('slug').value = slugify($('name').value); preview(); } });
  $('slug').addEventListener('input', () => { slugTouched = true; $('slug').value = $('slug').value.toLowerCase().replace(/[^a-z0-9-]/g, ''); preview(); });

  fetch('/hub/api/catalog').then((r) => r.json()).then((data) => {
    const p = data.policy;
    $('access').textContent = p.universityAccess === 'full'
      ? 'В этом хабе вуз может открыть базу клуба целиком (каждое открытие записывается в журнал).'
      : 'Записи клуба видит только его актив. Вузу доступны только сводные цифры: сколько записей и итоги касс.';
    if (p.joinMode !== 'invite') $('invite-box').classList.add('hidden');
    if (!p.allowDraftData) { $('draft-box').classList.add('hidden'); $('draft').checked = false; }
    if (p.allowedEmailDomains.length) $('domains').textContent = `Почта на домене: ${p.allowedEmailDomains.join(', ')}`;
    if (p.joinMode === 'approve') $('submit').textContent = 'Отправить заявку';
    $('templates').innerHTML = '';
    data.templates.forEach((t, i) => {
      const l = document.createElement('label');
      l.innerHTML = `<input type="radio" name="template" value="${t.id}" ${i === 0 ? 'checked' : ''}/><b></b><small></small>`;
      l.querySelector('b').textContent = t.title;
      l.querySelector('small').textContent = t.description;
      $('templates').appendChild(l);
    });
    data.packs.forEach((pk) => {
      const l = document.createElement('label');
      l.className = 'check';
      l.innerHTML = `<input type="checkbox" name="pack" value="${pk.id}" checked /><span><span class="t"></span><small></small></span>`;
      l.querySelector('.t').textContent = pk.title;
      l.querySelector('small').textContent = pk.description;
      $('packs').appendChild(l);
    });
  });

  $('join').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('error').classList.add('hidden');
    $('submit').disabled = true;
    const body = {
      invite: $('invite').value.trim(),
      name: $('name').value.trim(),
      slug: $('slug').value.trim(),
      template: (document.querySelector('input[name=template]:checked') || {}).value,
      packs: Array.from(document.querySelectorAll('input[name=pack]:checked')).map((x) => x.value),
      draft: $('draft').checked,
      chair: { name: $('chair-name').value.trim(), email: $('chair-email').value.trim(), password: $('chair-password').value },
    };
    try {
      const res = await fetch('/hub/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message + (data.errors ? `: ${data.errors.join('; ')}` : ''));
      $('join').classList.add('hidden');
      $('done').classList.remove('hidden');
      $('token').textContent = data.token;
      $('open-club').href = data.url;
      $('done-text').textContent = data.status === 'pending'
        ? `Заявка клуба «${data.name}» отправлена. Когда вуз её одобрит, система откроется по адресу ${data.url}`
        : `Готово! Система клуба «${data.name}» работает. Войдите с почтой и паролем председателя.`;
      if (data.status === 'pending') $('open-club').classList.add('hidden');
    } catch (err) {
      $('error').textContent = err.message;
      $('error').classList.remove('hidden');
    } finally {
      $('submit').disabled = false;
    }
  });
  $('copy-token').addEventListener('click', () => navigator.clipboard.writeText($('token').textContent));
})();
