/// <reference path="../pb_data/types.d.ts" />
// Facet OS: создаёт (или обновляет) суперпользователя из переменных окружения .env
migrate((app) => {
  const email = $os.getenv("PB_ADMIN_EMAIL");
  const password = $os.getenv("PB_ADMIN_PASSWORD");
  if (!email || !password) {
    console.log("[facet] PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD не заданы — суперпользователь не создан");
    return;
  }

  let record;
  try {
    record = app.findAuthRecordByEmail("_superusers", email);
  } catch (_) {
    record = new Record(app.findCollectionByNameOrId("_superusers"));
  }

  record.set("email", email);
  record.set("password", password);
  app.save(record);
}, (app) => {
  const email = $os.getenv("PB_ADMIN_EMAIL");
  if (!email) return;
  try {
    app.delete(app.findAuthRecordByEmail("_superusers", email));
  } catch (_) {
    // уже удалён
  }
});
