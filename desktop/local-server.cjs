/**
 * Facet OS desktop: система клуба на этом компьютере — без Docker.
 * PocketBase (входит в установщик) + портал из экспорта, данные в папке пользователя.
 * Модуль не зависит от Electron: тестируется обычным Node.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_PORT = 8090;

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '');

class LocalServer {
  /**
   * @param {{ baseDir: string, pbBinary: string }} opts
   * baseDir/system — файлы системы (как папка портала на сервере), baseDir/backups — копии перед обновлениями.
   */
  constructor({ baseDir, pbBinary }) {
    this.baseDir = baseDir;
    this.pbBinary = pbBinary;
    this.systemDir = path.join(baseDir, 'system');
    this.backupsDir = path.join(baseDir, 'backups');
    this.settingsFile = path.join(baseDir, 'desktop.json');
    this.proc = null;
    this.port = null;
    this.logs = [];
  }

  settings() {
    try {
      return { port: DEFAULT_PORT, lan: false, ...JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')) };
    } catch {
      return { port: DEFAULT_PORT, lan: false };
    }
  }

  saveSettings(patch) {
    fs.mkdirSync(this.baseDir, { recursive: true });
    const next = { ...this.settings(), ...patch };
    fs.writeFileSync(this.settingsFile, JSON.stringify(next, null, 2));
    return next;
  }

  installed() {
    return fs.existsSync(path.join(this.systemDir, 'club-schema.json'));
  }

  env() {
    try {
      return parseEnv(fs.readFileSync(path.join(this.systemDir, '.env'), 'utf8'));
    } catch {
      return {};
    }
  }

  backups() {
    try {
      return fs.readdirSync(this.backupsDir).filter((d) => d.startsWith('update-')).sort().reverse();
    } catch {
      return [];
    }
  }

  info() {
    const settings = this.settings();
    const env = this.env();
    const running = !!this.proc && this.port !== null;
    const url = running ? `http://127.0.0.1:${this.port}` : null;
    return {
      installed: this.installed(),
      running,
      url,
      lanUrls: running && settings.lan ? lanAddresses().map((ip) => `http://${ip}:${this.port}`) : [],
      lan: settings.lan,
      schemaRaw: this.installed() ? fs.readFileSync(path.join(this.systemDir, 'club-schema.json'), 'utf8') : null,
      admin: env.PB_ADMIN_EMAIL ? { email: env.PB_ADMIN_EMAIL, password: env.PB_ADMIN_PASSWORD } : null,
      dataDir: this.baseDir,
      backups: this.backups(),
      logs: this.logs.slice(-40).join(''),
    };
  }

  /**
   * Применяет архив экспорта (как его собирает редактор): установку или обновление.
   * Перед обновлением делается полная копия папки системы (вместе с базой).
   * @param {{ kind: 'install'|'update', files: {path: string, content: string, encoding?: 'base64'}[] }} bundle
   */
  async apply(bundle) {
    await this.stop();
    if (bundle.kind === 'update') {
      if (!this.installed()) throw new Error('Система ещё не установлена на этом компьютере');
      fs.mkdirSync(this.backupsDir, { recursive: true });
      fs.cpSync(this.systemDir, path.join(this.backupsDir, `update-${stamp()}`), { recursive: true });
    } else if (this.installed()) {
      throw new Error('Система уже установлена — используйте обновление, чтобы не потерять данные');
    }

    if (bundle.kind === 'update') {
      // Файлы плагинов генерируются целиком — убираем прежние (в т.ч. отключённых плагинов).
      const hooks = path.join(this.systemDir, 'pocketbase', 'pb_hooks');
      for (const f of fs.existsSync(hooks) ? fs.readdirSync(hooks) : []) {
        if (/^plugin-.*\.pb\.js$/.test(f) || /^facet-registers\./.test(f)) fs.rmSync(path.join(hooks, f));
      }
      fs.rmSync(path.join(this.systemDir, 'web', 'plugins'), { recursive: true, force: true });
      const defaults = bundle.files.find((f) => f.path === 'env.defaults');
      if (defaults) this.upsertPluginSecrets(defaults.content);
    }

    for (const file of bundle.files) {
      let rel = file.path;
      if (bundle.kind === 'update') {
        if (!rel.startsWith('payload/')) continue; // скрипты обновления для сервера здесь не нужны
        rel = rel.slice('payload/'.length);
      }
      const target = path.join(this.systemDir, rel);
      if (!target.startsWith(this.systemDir + path.sep)) throw new Error(`Недопустимый путь: ${file.path}`);
      if (rel === '.env' && fs.existsSync(target)) continue; // пароль и настройки не трогаем
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content);
    }
    this.syncPublic();
    await this.start();
    return this.info();
  }

  /** Секреты плагинов из обновления заменяют прежние значения в .env (остальное в .env не трогаем). */
  upsertPluginSecrets(text) {
    const envFile = path.join(this.systemDir, '.env');
    const updates = parseEnv(text);
    const keys = Object.keys(updates).filter((k) => k.startsWith('FACET_PLUGIN_'));
    if (!keys.length) return;
    const lines = (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '').split(/\r?\n/).filter((l) => !keys.some((k) => l.startsWith(`${k}=`)));
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    fs.writeFileSync(envFile, `${lines.join('\n')}\n${keys.map((k) => `${k}=${updates[k]}`).join('\n')}\n`);
  }

  /** Портал отдаётся самим PocketBase: web/* + club-schema.json в pb_public. */
  syncPublic() {
    const pub = path.join(this.systemDir, 'pb_public');
    fs.rmSync(pub, { recursive: true, force: true });
    fs.cpSync(path.join(this.systemDir, 'web'), pub, { recursive: true });
    fs.copyFileSync(path.join(this.systemDir, 'club-schema.json'), path.join(pub, 'club-schema.json'));
  }

  async start() {
    if (this.proc) return this.info();
    if (!this.installed()) throw new Error('Система ещё не установлена на этом компьютере');
    if (!fs.existsSync(this.pbBinary)) throw new Error(`Не найден PocketBase: ${this.pbBinary}`);
    const settings = this.settings();
    const host = settings.lan ? '0.0.0.0' : '127.0.0.1';
    let port = settings.port;
    while (!(await portFree(port, host))) {
      port++;
      if (port > settings.port + 20) throw new Error(`Нет свободного порта рядом с ${settings.port}`);
    }

    let clubName = 'Facet OS';
    try {
      clubName = JSON.parse(fs.readFileSync(path.join(this.systemDir, 'club-schema.json'), 'utf8')).clubName || clubName;
    } catch {
      /* имя по умолчанию */
    }
    const env = { ...process.env, ...this.env(), FACET_CLUB_NAME: clubName };
    const pb = path.join(this.systemDir, 'pocketbase');
    this.logs = [];
    const proc = spawn(this.pbBinary, [
      'serve',
      `--http=${host}:${port}`,
      `--dir=${path.join(this.systemDir, 'pb_data')}`,
      `--migrationsDir=${path.join(pb, 'pb_migrations')}`,
      `--hooksDir=${path.join(pb, 'pb_hooks')}`,
      `--publicDir=${path.join(this.systemDir, 'pb_public')}`,
    ], { env, windowsHide: true });
    const collect = (chunk) => {
      this.logs.push(String(chunk));
      if (this.logs.length > 400) this.logs.splice(0, this.logs.length - 400);
    };
    proc.stdout.on('data', collect);
    proc.stderr.on('data', collect);
    this.proc = proc;
    let exited = null;
    proc.once('exit', (code) => {
      exited = code;
      if (this.proc === proc) {
        this.proc = null;
        this.port = null;
      }
    });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (exited !== null) throw new Error(`PocketBase завершился (код ${exited}):\n${this.logs.join('').slice(-2000)}`);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) {
          this.port = port;
          return this.info();
        }
      } catch {
        /* ещё стартует */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await this.stop();
    throw new Error(`PocketBase не ответил за 30 секунд:\n${this.logs.join('').slice(-2000)}`);
  }

  stop() {
    const proc = this.proc;
    if (!proc) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
      }, 5000);
      proc.once('exit', done);
      proc.kill();
    }).then(() => {
      this.proc = null;
      this.port = null;
    });
  }

  /** Откат последнего обновления: папка системы (с базой) возвращается из копии. */
  async rollback() {
    const [last] = this.backups();
    if (!last) throw new Error('Нет копий для отката');
    const wasRunning = !!this.proc;
    await this.stop();
    const src = path.join(this.backupsDir, last);
    fs.rmSync(this.systemDir, { recursive: true, force: true });
    fs.cpSync(src, this.systemDir, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
    if (wasRunning) await this.start();
    return this.info();
  }

  async setLan(lan) {
    this.saveSettings({ lan: !!lan });
    if (this.proc) {
      await this.stop();
      await this.start();
    }
    return this.info();
  }
}

module.exports = { LocalServer, parseEnv, lanAddresses };
