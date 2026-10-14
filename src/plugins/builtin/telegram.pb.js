// Facet OS plugin «Уведомления в Telegram»: сообщение в чат при изменениях в выбранных разделах.
// Токен бота — секрет: FACET_PLUGIN_TELEGRAM_BOT_TOKEN в .env сервера.
(function () {
  const collections = __FACET_SETTINGS__.entities || [];
  if (!collections.length) return;

  if (__FACET_SETTINGS__.onCreate) {
    onRecordAfterCreateSuccess((e) => {
      e.next();
      const cfg = __FACET_SETTINGS__;
      const name = e.record.collection().name;
      const title = e.record.getString(cfg.titles[name] || "id");
      const status = cfg.statuses[name] ? e.record.getString(cfg.statuses[name]) : "";
      const text = "🆕 " + (cfg.labels[name] || name) + ": " + title + (status ? " — " + status : "");
      const token = $os.getenv("FACET_PLUGIN_TELEGRAM_BOT_TOKEN");
      if (!token || !cfg.chatId) return console.log("[facet:telegram] не настроены токен или чат");
      try {
        const res = $http.send({
          url: "https://api.telegram.org/bot" + token + "/sendMessage",
          method: "POST",
          body: JSON.stringify({ chat_id: cfg.chatId, text: text }),
          headers: { "content-type": "application/json" },
          timeout: 10,
        });
        if (res.statusCode !== 200) console.log("[facet:telegram] HTTP " + res.statusCode + ": " + res.raw);
      } catch (err) {
        console.log("[facet:telegram] " + err);
      }
    }, ...collections);
  }

  if (__FACET_SETTINGS__.onUpdate) {
    onRecordAfterUpdateSuccess((e) => {
      e.next();
      const cfg = __FACET_SETTINGS__;
      const name = e.record.collection().name;
      const title = e.record.getString(cfg.titles[name] || "id");
      const statusField = cfg.statuses[name];
      const before = e.record.original();
      let text = "✏️ " + (cfg.labels[name] || name) + ": " + title;
      if (statusField && before && before.getString(statusField) !== e.record.getString(statusField)) {
        text += " — " + before.getString(statusField) + " → " + e.record.getString(statusField);
      }
      const token = $os.getenv("FACET_PLUGIN_TELEGRAM_BOT_TOKEN");
      if (!token || !cfg.chatId) return console.log("[facet:telegram] не настроены токен или чат");
      try {
        $http.send({
          url: "https://api.telegram.org/bot" + token + "/sendMessage",
          method: "POST",
          body: JSON.stringify({ chat_id: cfg.chatId, text: text }),
          headers: { "content-type": "application/json" },
          timeout: 10,
        });
      } catch (err) {
        console.log("[facet:telegram] " + err);
      }
    }, ...collections);
  }

  if (__FACET_SETTINGS__.onDelete) {
    onRecordAfterDeleteSuccess((e) => {
      e.next();
      const cfg = __FACET_SETTINGS__;
      const name = e.record.collection().name;
      const text = "🗑 " + (cfg.labels[name] || name) + ": " + e.record.getString(cfg.titles[name] || "id");
      const token = $os.getenv("FACET_PLUGIN_TELEGRAM_BOT_TOKEN");
      if (!token || !cfg.chatId) return;
      try {
        $http.send({
          url: "https://api.telegram.org/bot" + token + "/sendMessage",
          method: "POST",
          body: JSON.stringify({ chat_id: cfg.chatId, text: text }),
          headers: { "content-type": "application/json" },
          timeout: 10,
        });
      } catch (err) {
        console.log("[facet:telegram] " + err);
      }
    }, ...collections);
  }
})();
