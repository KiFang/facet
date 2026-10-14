/// <reference path="../pb_data/types.d.ts" />
// Facet OS: настройки сервера из .env — применяются при каждом старте,
// поэтому достаточно поменять .env и выполнить `docker compose up -d`.
onBootstrap((e) => {
  e.next();

  const env = (key, fallback) => {
    const v = $os.getenv(key);
    return v === "" ? fallback : v;
  };
  const settings = e.app.settings();

  settings.meta.appName = env("FACET_CLUB_NAME", settings.meta.appName);
  const domain = env("DOMAIN", "");
  if (domain && domain !== "localhost") settings.meta.appURL = "https://" + domain;

  // Клиентский IP приходит от Nginx — нужен для логов и лимитов PocketBase.
  settings.trustedProxy.headers = ["X-Real-IP"];

  // Автоматические резервные копии (хранятся в pb_data/backups, видны в /_/ → Settings → Backups).
  settings.backups.cron = env("BACKUP_CRON", "0 3 * * *");
  settings.backups.cronMaxKeep = parseInt(env("BACKUP_KEEP", "14"), 10) || 14;

  const bucket = env("BACKUP_S3_BUCKET", "");
  settings.backups.s3.enabled = !!bucket;
  if (bucket) {
    settings.backups.s3.bucket = bucket;
    settings.backups.s3.region = env("BACKUP_S3_REGION", "us-east-1");
    settings.backups.s3.endpoint = env("BACKUP_S3_ENDPOINT", "");
    settings.backups.s3.accessKey = env("BACKUP_S3_ACCESS_KEY", "");
    settings.backups.s3.secret = env("BACKUP_S3_SECRET", "");
    settings.backups.s3.forcePathStyle = true;
  }

  e.app.save(settings);
  console.log("[facet] настройки применены: бэкапы " + settings.backups.cron + (bucket ? " → S3 " + bucket : ""));
});
