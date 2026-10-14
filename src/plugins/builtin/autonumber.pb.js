// Facet OS plugin «Автонумерация»: присваивает записям номер вида «ДОК-2026-00042», как документам в 1С.
// Номер ставится при создании, если поле пустое; нумерация продолжается от последнего номера с тем же префиксом.
(function () {
  if (!__FACET_SETTINGS__.entity || !__FACET_SETTINGS__.field) return;

  onRecordCreate((e) => {
    const cfg = __FACET_SETTINGS__;
    if (!e.record.getString(cfg.field)) {
      const prefix = String(cfg.prefix || "").replace("{YYYY}", String(new Date().getFullYear()));
      let next = 1;
      try {
        const last = e.app.findRecordsByFilter(cfg.entity, cfg.field + " ~ {:p}", "-created", 1, 0, { p: prefix });
        if (last.length) {
          const m = /(\d+)$/.exec(last[0].getString(cfg.field));
          if (m) next = parseInt(m[1], 10) + 1;
        }
      } catch (err) {
        console.log("[facet:autonumber] " + err);
      }
      e.record.set(cfg.field, prefix + String(next).padStart(Number(cfg.digits) || 5, "0"));
    }
    e.next();
  }, __FACET_SETTINGS__.entity);
})();
