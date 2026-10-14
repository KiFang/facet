/// <reference path="../pb_data/types.d.ts" />
// Facet OS: проведение операций по регистрам остатков. Сгенерировано из схемы клуба.
// Подтверждённая операция (поле posted) пишет движения в reg_*; изменение и удаление их пересчитывают.

onRecordCreate((e) => {
  const lib = require(`${__hooks}/facet-registers.lib.js`);
  const next = lib.movements(e.record);
  lib.check(e.app, e.record, next, "");
  e.next();
  lib.write(e.app, e.record, lib.movements(e.record));
}, __FACET_OPERATIONS__);

onRecordUpdate((e) => {
  const lib = require(`${__hooks}/facet-registers.lib.js`);
  lib.check(e.app, e.record, lib.movements(e.record), e.record.id);
  e.next();
  lib.write(e.app, e.record, lib.movements(e.record));
}, __FACET_OPERATIONS__);

onRecordDelete((e) => {
  const lib = require(`${__hooks}/facet-registers.lib.js`);
  lib.check(e.app, e.record, [], e.record.id);
  const collection = e.record.collection().name;
  const id = e.record.id;
  e.next();
  lib.clear(e.app, collection, id);
}, __FACET_OPERATIONS__);

// Сверка: подтверждённые операции без движений (начальные данные из миграции) проводятся
// при запуске и затем раз в 10 минут — на случай, если миграции применились позже.
onBootstrap((e) => {
  e.next();
  try {
    require(`${__hooks}/facet-registers.lib.js`).reconcile(e.app);
  } catch (err) {
    console.log("[facet] сверка остатков отложена: " + err);
  }
});

cronAdd("facet_registers_reconcile", "*/10 * * * *", () => {
  require(`${__hooks}/facet-registers.lib.js`).reconcile($app);
});
