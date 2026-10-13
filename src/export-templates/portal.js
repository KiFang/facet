/* Facet OS — клиентский портал клуба.
 * Читает /club-schema.json и показывает записи из PocketBase (/api/...).
 * Без сборки и зависимостей: можно править прямо на сервере.
 */
(function () {
  "use strict";

  var root = document.getElementById("app");
  var state = { schema: null, active: null, query: "", records: {}, counts: {} };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function entityById(id) {
    return state.schema.entities.find(function (e) { return e.id === id; });
  }

  // Тот же алгоритм, что и src/utils/relations.ts в редакторе.
  function resolveRelations(entity) {
    var existing = {};
    state.schema.entities.forEach(function (e) { existing[e.id] = true; });
    var taken = {};
    entity.fields.forEach(function (f) { taken[f.id] = true; });
    var out = [];
    entity.fields.forEach(function (f) {
      if (f.type === "relation" && f.targetEntityId && existing[f.targetEntityId]) {
        out.push({ name: f.id, label: f.name, target: f.targetEntityId, multiple: false });
      }
    });
    entity.relations.forEach(function (r) {
      if (!existing[r.targetEntityId]) return;
      var name = taken[r.targetEntityId] ? r.targetEntityId + "_rel" : r.targetEntityId;
      taken[name] = true;
      out.push({ name: name, label: entityById(r.targetEntityId).pluralName, target: r.targetEntityId, multiple: r.type === "many-to-many" });
    });
    return out;
  }

  function titleField(entity) {
    return entity.fields.find(function (f) { return f.type === "text"; }) || entity.fields[0];
  }

  function labelOf(entityId, record) {
    var entity = entityById(entityId);
    var tf = entity && titleField(entity);
    return tf && record[tf.id] ? record[tf.id] : record.id;
  }

  function formatValue(field, record) {
    var value = record[field.id];
    if (value === "" || value == null || (Array.isArray(value) && !value.length)) return null;
    if (field.type === "date") {
      var d = new Date(String(value).replace(" ", "T"));
      return isNaN(d) ? esc(value) : esc(d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }));
    }
    if (field.type === "file") {
      var files = Array.isArray(value) ? value : [value];
      return files.map(function (name) {
        return '<a href="' + fileUrl(record, name) + '" target="_blank" rel="noopener">' + esc(name) + "</a>";
      }).join(", ");
    }
    if (field.type === "number") return esc(Number(value).toLocaleString("ru-RU"));
    return esc(value);
  }

  function fileUrl(record, name) {
    return "/api/files/" + encodeURIComponent(record.collectionId) + "/" + encodeURIComponent(record.id) + "/" + encodeURIComponent(name);
  }

  function isImage(name) {
    return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name || "");
  }

  function api(path) {
    return fetch(path, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function loadRecords(entity) {
    var rels = resolveRelations(entity).map(function (r) { return r.name; });
    var url = "/api/collections/" + encodeURIComponent(entity.id) + "/records?perPage=200&sort=-created";
    if (rels.length) url += "&expand=" + encodeURIComponent(rels.join(","));
    return api(url).then(function (data) {
      state.records[entity.id] = data.items || [];
      state.counts[entity.id] = data.totalItems || 0;
    }).catch(function (err) {
      state.records[entity.id] = { error: err.message };
    });
  }

  function loadCounts() {
    return Promise.all(state.schema.entities.map(function (e) {
      return api("/api/collections/" + encodeURIComponent(e.id) + "/records?perPage=1&skipTotal=0&fields=id")
        .then(function (data) { state.counts[e.id] = data.totalItems || 0; })
        .catch(function () { state.counts[e.id] = 0; });
    }));
  }

  function renderCard(entity, record) {
    var tf = titleField(entity);
    var status = entity.fields.find(function (f) { return f.type === "status"; });
    var image = entity.fields.find(function (f) {
      if (f.type !== "file") return false;
      var v = record[f.id];
      return isImage(Array.isArray(v) ? v[0] : v);
    });
    var html = '<article class="fx-card">';
    if (image) {
      var file = Array.isArray(record[image.id]) ? record[image.id][0] : record[image.id];
      html += '<div class="fx-card-media" style="background-image:url(\'' + fileUrl(record, file) + '\')"></div>';
    }
    html += '<div class="fx-card-head"><h3>' + esc(tf ? record[tf.id] || "Без названия" : record.id) + "</h3>";
    if (status && record[status.id]) html += '<span class="fx-badge">' + esc(record[status.id]) + "</span>";
    html += '</div><hr class="fx-divider"><dl class="fx-rows">';
    entity.fields.forEach(function (f) {
      if (f === tf || f === status || f === image || f.type === "relation") return;
      var v = formatValue(f, record);
      if (v) html += '<div class="fx-row"><dt>' + esc(f.name) + "</dt><dd>" + v + "</dd></div>";
    });
    resolveRelations(entity).forEach(function (r) {
      var expanded = record.expand && record.expand[r.name];
      if (!expanded) return;
      var list = Array.isArray(expanded) ? expanded : [expanded];
      if (!list.length) return;
      html += '<div class="fx-row"><dt>' + esc(r.label) + "</dt><dd>" +
        list.map(function (x) { return '<span class="fx-chip">' + esc(labelOf(r.target, x)) + "</span>"; }).join("") +
        "</dd></div>";
    });
    return html + "</dl></article>";
  }

  function matches(entity, record, q) {
    if (!q) return true;
    var hay = entity.fields.map(function (f) { return record[f.id]; }).join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function render() {
    var s = state.schema;
    var entity = entityById(state.active) || s.entities[0];
    var html = '<div class="fx-shell">';
    html += '<header class="fx-hero"><div><h1>' + esc(s.clubName) + "</h1><p>" + esc(s.motto) + "</p></div>" +
      '<a class="fx-btn" href="/_/" target="_blank" rel="noopener">Панель управления</a></header>';
    html += '<nav class="fx-nav">' + s.entities.map(function (e) {
      return '<a class="fx-tab" href="#/' + esc(e.id) + '"' + (entity && e.id === entity.id ? ' aria-current="page"' : "") + ">" +
        esc(e.pluralName) + '<span class="fx-count">' + (state.counts[e.id] || 0) + "</span></a>";
    }).join("") + "</nav>";

    if (!entity) {
      html += '<div class="fx-empty"><strong>В схеме нет сущностей</strong>Добавьте их в Facet OS и экспортируйте заново.</div>';
    } else {
      html += '<div class="fx-toolbar"><h2>' + esc(entity.pluralName) + "</h2>" +
        '<input class="fx-search" type="search" placeholder="Поиск…" value="' + esc(state.query) + '" aria-label="Поиск"></div>';
      html += '<hr class="fx-divider">';
      var records = state.records[entity.id];
      if (records === undefined) {
        html += '<div class="fx-empty">Загрузка…</div>';
      } else if (records.error) {
        html += '<div class="fx-empty"><strong>Не удалось загрузить данные</strong>' + esc(records.error) +
          ". Проверьте, что контейнер pocketbase запущен: <code>docker compose ps</code></div>";
      } else {
        var q = state.query.trim().toLowerCase();
        var list = records.filter(function (r) { return matches(entity, r, q); });
        if (!list.length) {
          html += '<div class="fx-empty"><strong>' + (q ? "Ничего не найдено" : "Пока пусто") + "</strong>" +
            (q ? "Попробуйте другой запрос." : "Добавьте первую запись «" + esc(entity.name) + "» через панель управления.") +
            (q ? "" : '<br><a class="fx-btn" href="/_/#/collections?collection=' + encodeURIComponent(entity.id) + '" target="_blank" rel="noopener">Открыть коллекцию</a>') +
            "</div>";
        } else {
          html += '<section class="fx-grid">' + list.map(function (r) { return renderCard(entity, r); }).join("") + "</section>";
        }
      }
    }
    html += '<footer class="fx-footer">Портал собран в Facet OS · данные хранятся на вашем сервере</footer></div>';
    root.innerHTML = html;

    var search = root.querySelector(".fx-search");
    if (search) {
      search.addEventListener("input", function (e) {
        state.query = e.target.value;
        var pos = e.target.selectionStart;
        render();
        var again = root.querySelector(".fx-search");
        again.focus();
        again.setSelectionRange(pos, pos);
      });
    }
  }

  function route() {
    var id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    state.active = entityById(id) ? id : (state.schema.entities[0] && state.schema.entities[0].id);
    state.query = "";
    render();
    var entity = entityById(state.active);
    if (entity) loadRecords(entity).then(render);
  }

  fetch("/club-schema.json", { cache: "no-cache" })
    .then(function (res) { return res.json(); })
    .then(function (schema) {
      state.schema = schema;
      document.title = schema.clubName;
      window.addEventListener("hashchange", route);
      route();
      loadCounts().then(render);
    })
    .catch(function (err) {
      root.innerHTML = '<div class="fx-shell"><div class="fx-empty"><strong>club-schema.json не найден</strong>' + esc(err.message) + "</div></div>";
    });
})();
