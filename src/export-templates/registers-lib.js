// Facet OS: проведение операций по регистрам остатков (модуль для pb_hooks/facet-registers.pb.js).
// Сгенерировано из схемы клуба. Не редактируйте вручную — файл перезаписывается при обновлении.
// Тот же алгоритм, что в редакторе: src/utils/registers.ts.

var CONFIG = __FACET_REGISTERS__;

function registerOf(id) {
  for (var i = 0; i < CONFIG.registers.length; i++) if (CONFIG.registers[i].id === id) return CONFIG.registers[i];
  return null;
}

function sign(posting, record) {
  var d = posting.direction;
  if (d === "in") return 1;
  if (d === "out") return -1;
  var v = record.getString(d.field);
  if (d["in"].indexOf(v) >= 0) return 1;
  if (d.out.indexOf(v) >= 0) return -1;
  return 0;
}

function firstValue(record, field) {
  var v = record.get(field);
  if (v && typeof v === "object" && typeof v.length === "number" && typeof v !== "string") return v.length ? String(v[0]) : "";
  return record.getString(field);
}

/** Движения подтверждённой операции. */
function movements(record) {
  var collection = record.collection().name;
  var postings = CONFIG.operations[collection] || [];
  if (!record.getBool("posted")) return [];
  var out = [];
  for (var i = 0; i < postings.length; i++) {
    var p = postings[i];
    var reg = registerOf(p.register);
    if (!reg) continue;
    var s = sign(p, record);
    if (!s) continue;
    var dims = {};
    for (var d = 0; d < reg.dimensions.length; d++) dims[reg.dimensions[d].id] = firstValue(record, p.dimensions[reg.dimensions[d].id]);
    var res = {};
    for (var r = 0; r < reg.resources.length; r++) {
      var src = p.resources[reg.resources[r].id];
      res[reg.resources[r].id] = s * (src === "1" ? 1 : record.getFloat(src));
    }
    var period = (p.dateField && record.getString(p.dateField)) || record.getString("created");
    out.push({ register: reg, dims: dims, res: res, period: period });
  }
  return out;
}

/** Остаток по измерениям без движений указанной операции. */
function balanceWithout(app, reg, dims, opCollection, opId) {
  var filter = ["(op_collection != {:col} || op_id != {:op})"];
  var params = { col: opCollection, op: opId || "" };
  for (var d = 0; d < reg.dimensions.length; d++) {
    filter.push("d_" + reg.dimensions[d].id + " = {:d" + d + "}");
    params["d" + d] = dims[reg.dimensions[d].id];
  }
  var rows = app.findRecordsByFilter("reg_" + reg.id, filter.join(" && "), "", 0, 0, params);
  var sum = {};
  for (var r = 0; r < reg.resources.length; r++) sum[reg.resources[r].id] = 0;
  for (var i = 0; i < rows.length; i++)
    for (var k = 0; k < reg.resources.length; k++) sum[reg.resources[k].id] += rows[i].getFloat("r_" + reg.resources[k].id);
  return sum;
}

function dimsLabel(reg, dims) {
  var parts = [];
  for (var d = 0; d < reg.dimensions.length; d++) if (dims[reg.dimensions[d].id]) parts.push(reg.dimensions[d].name + ": " + dims[reg.dimensions[d].id]);
  return parts.length ? " (" + parts.join(", ") + ")" : "";
}

/**
 * Проверка «не уходить в минус» для регистров с noNegative.
 * `next` — движения после изменения (для удаления — пусто), остатки считаются без старых движений операции.
 */
function check(app, record, next, opId) {
  var collection = record.collection().name;
  var affected = [];
  // Сочетания измерений, которые затрагивает операция: новые движения + старые (при изменении/удалении).
  for (var i = 0; i < next.length; i++) affected.push({ reg: next[i].register, dims: next[i].dims });
  if (opId) {
    for (var r = 0; r < CONFIG.registers.length; r++) {
      var reg = CONFIG.registers[r];
      if (!reg.noNegative) continue;
      var old = app.findRecordsByFilter("reg_" + reg.id, "op_collection = {:col} && op_id = {:op}", "", 0, 0, { col: collection, op: opId });
      for (var o = 0; o < old.length; o++) {
        var od = {};
        for (var d = 0; d < reg.dimensions.length; d++) od[reg.dimensions[d].id] = old[o].getString("d_" + reg.dimensions[d].id);
        affected.push({ reg: reg, dims: od });
      }
    }
  }
  for (var a = 0; a < affected.length; a++) {
    var item = affected[a];
    if (!item.reg.noNegative) continue;
    var sum = balanceWithout(app, item.reg, item.dims, collection, opId);
    for (var m = 0; m < next.length; m++) {
      if (next[m].register.id !== item.reg.id) continue;
      var same = true;
      for (var dd = 0; dd < item.reg.dimensions.length; dd++) {
        var id = item.reg.dimensions[dd].id;
        if (next[m].dims[id] !== item.dims[id]) same = false;
      }
      if (!same) continue;
      for (var rr = 0; rr < item.reg.resources.length; rr++) sum[item.reg.resources[rr].id] += next[m].res[item.reg.resources[rr].id];
    }
    for (var x = 0; x < item.reg.resources.length; x++) {
      var res = item.reg.resources[x];
      if (sum[res.id] < -1e-9) {
        throw new BadRequestError("Недостаточно остатка в регистре «" + item.reg.name + "»" + dimsLabel(item.reg, item.dims) + ": «" + res.name + "» станет " + Math.round(sum[res.id] * 100) / 100);
      }
    }
  }
}

/** Перезаписывает движения операции. */
function write(app, record, next) {
  clear(app, record.collection().name, record.id);
  for (var i = 0; i < next.length; i++) {
    var m = next[i];
    var row = new Record(app.findCollectionByNameOrId("reg_" + m.register.id));
    row.set("op_collection", record.collection().name);
    row.set("op_id", record.id);
    row.set("period", m.period || record.getString("created"));
    for (var d in m.dims) row.set("d_" + d, m.dims[d]);
    for (var r in m.res) row.set("r_" + r, m.res[r]);
    app.save(row);
  }
}

function clear(app, collection, id) {
  for (var r = 0; r < CONFIG.registers.length; r++) {
    var rows = app.findRecordsByFilter("reg_" + CONFIG.registers[r].id, "op_collection = {:col} && op_id = {:op}", "", 0, 0, { col: collection, op: id });
    for (var i = 0; i < rows.length; i++) app.delete(rows[i]);
  }
}

/**
 * Сверка при запуске: подтверждённые операции без движений (например, начальные данные,
 * загруженные миграцией, когда хуки ещё не работают) проводятся.
 */
function reconcile(app) {
  var posted = 0;
  for (var collection in CONFIG.operations) {
    var ops;
    try {
      ops = app.findRecordsByFilter(collection, "posted = true", "", 0, 0);
    } catch (_) {
      continue;
    }
    for (var i = 0; i < ops.length; i++) {
      var has = false;
      for (var r = 0; r < CONFIG.registers.length && !has; r++) {
        try {
          app.findFirstRecordByFilter("reg_" + CONFIG.registers[r].id, "op_collection = {:col} && op_id = {:op}", { col: collection, op: ops[i].id });
          has = true;
        } catch (_) {}
      }
      if (has) continue;
      var next = movements(ops[i]);
      if (!next.length) continue;
      write(app, ops[i], next);
      posted++;
    }
  }
  if (posted) console.log("[facet] проведено операций при запуске: " + posted);
}

module.exports = { movements: movements, check: check, write: write, clear: clear, reconcile: reconcile };
