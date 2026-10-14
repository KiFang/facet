// ---- Facet OS migration runtime (общий для всех миграций Facet OS) ----
// Применяет декларативные операции к базе PocketBase. Порядок операций уже рассчитан редактором.

function facetField(def, app) {
  var base = { name: def.name, required: !!def.required };
  switch (def.type) {
    case "text":
      return new TextField(Object.assign(base, { max: 5000 }));
    case "number":
      return new NumberField(base);
    case "date":
      return new DateField(base);
    case "select":
      return new SelectField(Object.assign(base, { values: def.values || [], maxSelect: def.maxSelect || 1 }));
    case "file":
      return new FileField(Object.assign(base, { maxSelect: def.maxSelect || 1, maxSize: 10485760, thumbs: ["480x270"] }));
    case "relation":
      return new RelationField(Object.assign(base, {
        collectionId: app.findCollectionByNameOrId(def.target).id,
        maxSelect: def.maxSelect || 1,
        cascadeDelete: false,
      }));
  }
  throw new Error("[facet] неизвестный тип поля: " + def.type);
}

function facetApply(app, ops) {
  var col = function (name) { return app.findCollectionByNameOrId(name); };
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    switch (op.op) {
      case "createCollection": {
        // Правила доступа приходят отдельной операцией setRules в конце миграции.
        // Без неё (миграции старых версий) — прежняя модель: чтение публичное.
        var c = new Collection({
          type: op.auth ? "auth" : "base",
          name: op.name,
          listRule: op.auth ? null : "",
          viewRule: op.auth ? null : "",
          createRule: null,
          updateRule: null,
          deleteRule: null,
        });
        for (var j = 0; j < op.fields.length; j++) c.fields.add(facetField(op.fields[j], app));
        c.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
        c.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
        app.save(c);
        break;
      }
      case "deleteCollection":
        app.delete(col(op.name));
        break;
      case "renameCollection": {
        var rc = col(op.from);
        rc.name = op.to;
        app.save(rc);
        break;
      }
      case "addField": {
        var ac = col(op.collection);
        ac.fields.add(facetField(op.field, app));
        app.save(ac);
        break;
      }
      case "removeField": {
        var dc = col(op.collection);
        dc.fields.removeByName(op.name);
        app.save(dc);
        break;
      }
      case "renameField": {
        var nc = col(op.collection);
        nc.fields.getByName(op.from).name = op.to;
        app.save(nc);
        break;
      }
      case "updateField": {
        var uc = col(op.collection);
        var f = uc.fields.getByName(op.name);
        if (op.patch.required !== undefined) f.required = op.patch.required;
        if (op.patch.values !== undefined) f.values = op.patch.values;
        if (op.patch.maxSelect !== undefined) f.maxSelect = op.patch.maxSelect;
        app.save(uc);
        break;
      }
      case "setRules": {
        var sc = col(op.collection);
        sc.listRule = op.rules.listRule;
        sc.viewRule = op.rules.viewRule;
        sc.createRule = op.rules.createRule;
        sc.updateRule = op.rules.updateRule;
        sc.deleteRule = op.rules.deleteRule;
        app.save(sc);
        break;
      }
      case "bootstrapStaff": {
        var email = $os.getenv("PB_ADMIN_EMAIL");
        var password = $os.getenv("PB_ADMIN_PASSWORD");
        var staff = col(op.collection);
        if (!email || !password) {
          console.log("[facet] PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD не заданы — первая учётная запись актива не создана");
          break;
        }
        try {
          app.findAuthRecordByEmail(op.collection, email);
          break; // уже есть
        } catch (_) {}
        var chair = new Record(staff);
        chair.setEmail(email);
        chair.setPassword(password);
        chair.setVerified(true);
        chair.set("name", "Председатель");
        chair.set("role", op.role);
        app.save(chair);
        console.log("[facet] учётная запись председателя: " + email);
        break;
      }
      case "seed":
        facetSeed(app, op);
        break;
      default:
        throw new Error("[facet] неизвестная операция: " + op.op);
    }
  }
}

function facetSeed(app, op) {
  var collection = app.findCollectionByNameOrId(op.collection);
  var saved = 0;
  for (var i = 0; i < op.rows.length; i++) {
    var row = op.rows[i];
    var record = new Record(collection);
    for (var key in row.values) record.set(key, row.values[key]);
    for (var r = 0; r < op.relations.length; r++) {
      var rel = op.relations[r];
      var labels = row.links[rel.field] || [];
      var ids = [];
      for (var l = 0; l < labels.length; l++) {
        try {
          ids.push(app.findFirstRecordByData(rel.target, rel.titleField, labels[l]).id);
        } catch (_) {
          console.log("[facet] " + op.collection + ": не найдена связанная запись «" + labels[l] + "» в " + rel.target);
        }
      }
      if (ids.length) record.set(rel.field, rel.multiple ? ids : ids[0]);
    }
    try {
      app.save(record);
      saved++;
    } catch (err) {
      console.log("[facet] " + op.collection + ": строка " + (i + 1) + " пропущена — " + err);
    }
  }
  console.log("[facet] " + op.collection + ": импортировано " + saved + " из " + op.rows.length);
}
// ---- /runtime ----
