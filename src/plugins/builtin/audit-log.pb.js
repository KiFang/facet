// Facet OS plugin «Журнал изменений»: кто, когда и что изменил — в разделе «Журнал изменений» (коллекция audit_log).
// Записываются изменения через API и панель управления.
(function () {
  const collections = (__FACET_SETTINGS__.collections || []).filter((c) => c !== "audit_log");
  if (!collections.length) return;

  onRecordCreateRequest((e) => {
    e.next();
    const cfg = __FACET_SETTINGS__;
    try {
      const name = e.collection.name;
      const r = new Record(e.app.findCollectionByNameOrId("audit_log"));
      r.set("action", "Создание");
      r.set("section", cfg.labels[name] || name);
      r.set("record", e.record.getString(cfg.titles[name] || "id"));
      r.set("record_id", e.record.id);
      r.set("author", e.auth ? e.auth.email() : "—");
      e.app.save(r);
    } catch (err) {
      console.log("[facet:audit] " + err);
    }
  }, ...collections);

  onRecordUpdateRequest((e) => {
    const cfg = __FACET_SETTINGS__;
    const changed = [];
    try {
      const before = e.record.original();
      for (const f of e.collection.fields) {
        const n = f.getName();
        if (n === "updated" || n === "created" || n === "id") continue;
        if (JSON.stringify(before.get(n)) !== JSON.stringify(e.record.get(n))) changed.push(n);
      }
    } catch (_) {
      // если сравнить не удалось — пишем без списка полей
    }
    e.next();
    try {
      const name = e.collection.name;
      const r = new Record(e.app.findCollectionByNameOrId("audit_log"));
      r.set("action", "Изменение");
      r.set("section", cfg.labels[name] || name);
      r.set("record", e.record.getString(cfg.titles[name] || "id"));
      r.set("record_id", e.record.id);
      r.set("author", e.auth ? e.auth.email() : "—");
      r.set("changes", changed.map((n) => (cfg.fieldLabels[name] || {})[n] || n).join(", "));
      e.app.save(r);
    } catch (err) {
      console.log("[facet:audit] " + err);
    }
  }, ...collections);

  onRecordDeleteRequest((e) => {
    const cfg = __FACET_SETTINGS__;
    const name = e.collection.name;
    const title = e.record.getString(cfg.titles[name] || "id");
    const id = e.record.id;
    e.next();
    try {
      const r = new Record(e.app.findCollectionByNameOrId("audit_log"));
      r.set("action", "Удаление");
      r.set("section", cfg.labels[name] || name);
      r.set("record", title);
      r.set("record_id", id);
      r.set("author", e.auth ? e.auth.email() : "—");
      e.app.save(r);
    } catch (err) {
      console.log("[facet:audit] " + err);
    }
  }, ...collections);
})();
