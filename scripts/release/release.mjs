#!/usr/bin/env node
/**
 * Publishes app releases to the S3 releases bucket.
 *
 *   node scripts/release/release.mjs update  [--message "what changed"] [--force]
 *   node scripts/release/release.mjs apk     --eas-build <id> [--notes "..."] [--min <code>]
 *   node scripts/release/release.mjs apk     --apk <file> --version-code <n> [--notes "..."] [--min <code>]
 *   node scripts/release/release.mjs require <versionCode>
 *   node scripts/release/release.mjs rollback [updateId]
 *   node scripts/release/release.mjs status
 *
 * `update` ships a JavaScript-only change to every installed app without a new APK.
 * `apk` uploads a new build and makes it the one the update screen downloads.
 * `require` blocks every app build older than the given version code.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOBILE = path.join(ROOT, 'apps', 'mobile');
const BUCKET = process.env.RELEASES_BUCKET ?? 'heaven-hospitality-releases-140481250184';
const REGION = process.env.RELEASES_REGION ?? 'ap-southeast-2';
const BASE_URL = `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
const IS_WINDOWS = process.platform === 'win32';

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  json: 'application/json',
  riv: 'application/octet-stream',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
};

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    shell: IS_WINDOWS && command !== 'aws',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

/** Reads the AWS keys from the repo's .env when the standard variables are unset. */
function loadAwsCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) return;
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^(access_key|secret_key)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, '').trim();
  }
  if (values.access_key && values.secret_key) {
    process.env.AWS_ACCESS_KEY_ID = values.access_key;
    process.env.AWS_SECRET_ACCESS_KEY = values.secret_key;
  }
}

function aws(args) {
  return run('aws', [...args, '--region', REGION], {
    env: { ...process.env, AWS_PAGER: '', AWS_DEFAULT_REGION: REGION },
  });
}

function putFile(localPath, key, { contentType, cacheControl }) {
  aws([
    's3',
    'cp',
    localPath,
    `s3://${BUCKET}/${key}`,
    '--only-show-errors',
    ...(contentType ? ['--content-type', contentType] : []),
    ...(cacheControl ? ['--cache-control', cacheControl] : []),
  ]);
}

function putJson(key, value, cacheControl = 'no-cache') {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'hh-release-')), 'file.json');
  writeFileSync(file, JSON.stringify(value, null, 2));
  try {
    putFile(file, key, { contentType: 'application/json', cacheControl });
  } finally {
    rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

async function getJson(key) {
  const response = await fetch(`${BASE_URL}/${key}?t=${Date.now()}`);
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) fail(`Could not read ${key}: HTTP ${response.status}`);
  return response.json();
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith('--')) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) flags[value.slice(2)] = true;
      else {
        flags[value.slice(2)] = next;
        index += 1;
      }
    } else positional.push(value);
  }
  return { flags, positional };
}

function withoutApiOverride() {
  const { API_BASE_URL: _unused, ...rest } = process.env;
  return rest;
}

function appConfig() {
  const output = run('npx', ['expo', 'config', '--json', '--type', 'public'], {
    cwd: MOBILE,
    env: withoutApiOverride(),
  });
  return JSON.parse(output.slice(output.indexOf('{')));
}

/** A hash of everything compiled into the APK: dependencies, app config and plugins. */
function nativeSignature(config) {
  const pkg = JSON.parse(readFileSync(path.join(MOBILE, 'package.json'), 'utf8'));
  const { extra: _extra, ...nativeConfig } = config;
  const plugins = path.join(MOBILE, 'plugins');
  const pluginSources = existsSync(plugins)
    ? readdirSync(plugins).sort().map((name) => readFileSync(path.join(plugins, name), 'utf8'))
    : [];
  return createHash('sha256')
    .update(JSON.stringify({ dependencies: pkg.dependencies, config: nativeConfig, pluginSources }))
    .digest('hex');
}

const base64url = (buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function describeFile(localPath) {
  const data = readFileSync(localPath);
  return {
    hash: base64url(createHash('sha256').update(data).digest()),
    key: createHash('md5').update(data).digest('hex'),
  };
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

async function publishUpdate(flags) {
  const config = appConfig();
  const runtimeVersion = config.runtimeVersion;
  if (typeof runtimeVersion !== 'string') fail('app.json needs a "runtimeVersion" string.');

  const signature = nativeSignature(config);
  const known = await getJson(`updates/${runtimeVersion}/native.json`);
  if (known === null) {
    fail(
      `No APK has been published for runtime version "${runtimeVersion}" yet.\n` +
        'Publish the APK first with: node scripts/release/release.mjs apk ...',
    );
  }
  if (known.signature !== signature && flags.force !== true) {
    fail(
      'Native code changed since the last published APK (dependencies, app.json or plugins).\n' +
        'An over-the-air update would crash apps that have the old native code.\n' +
        'Build and publish a new APK instead, or pass --force if you are sure.',
    );
  }

  const outDir = mkdtempSync(path.join(tmpdir(), 'hh-export-'));
  try {
    console.log('Building the JavaScript bundle…');
    run('npx', ['expo', 'export', '--platform', 'android', '--output-dir', outDir], {
      cwd: MOBILE,
      env: withoutApiOverride(),
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    const metadata = JSON.parse(readFileSync(path.join(outDir, 'metadata.json'), 'utf8'));
    const android = metadata.fileMetadata.android;
    const updateId = randomUUID();
    const prefix = `updates/${runtimeVersion}/${updateId}`;

    const upload = (exportedPath, contentType) => {
      const relativePath = exportedPath.split(path.sep).join('/');
      putFile(path.join(outDir, relativePath), `${prefix}/${relativePath}`, {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      });
      return { ...describeFile(path.join(outDir, relativePath)), contentType, url: `${BASE_URL}/${prefix}/${relativePath}` };
    };

    console.log('Uploading…');
    const launchAsset = upload(android.bundle, 'application/javascript');
    const assets = android.assets.map((asset) => ({
      ...upload(asset.path, MIME[asset.ext] ?? 'application/octet-stream'),
      fileExtension: `.${asset.ext}`,
    }));

    const record = {
      id: updateId,
      createdAt: new Date().toISOString(),
      runtimeVersion,
      message: typeof flags.message === 'string' ? flags.message : null,
      launchAsset,
      assets,
      extra: { expoClient: config },
    };

    putJson(`${prefix}/update.json`, record);
    await pushLatest(runtimeVersion, record);
    console.log(`\nPublished update ${updateId} (runtime ${runtimeVersion}, ${assets.length} assets).`);
    console.log('Installed apps will pick it up the next time they open.');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

async function pushLatest(runtimeVersion, record) {
  const history = (await getJson(`updates/${runtimeVersion}/history.json`)) ?? [];
  putJson(`updates/${runtimeVersion}/history.json`, [...history, { id: record.id, createdAt: record.createdAt, message: record.message ?? null }]);
  putJson(`updates/${runtimeVersion}/latest.json`, record);
}

async function rollback(positional) {
  const config = appConfig();
  const runtimeVersion = config.runtimeVersion;
  const history = (await getJson(`updates/${runtimeVersion}/history.json`)) ?? [];
  if (history.length < 2 && positional[0] === undefined) fail('There is no earlier update to go back to.');

  const targetId = positional[0] ?? history[history.length - 2].id;
  const target = await getJson(`updates/${runtimeVersion}/${targetId}/update.json`);
  if (target === null) fail(`Update ${targetId} was not found.`);

  const record = { ...target, id: randomUUID(), createdAt: new Date().toISOString(), message: `Rollback to ${targetId}` };
  putJson(`updates/${runtimeVersion}/${record.id}/update.json`, record);
  await pushLatest(runtimeVersion, record);
  console.log(`Rolled back: devices will now receive the content of update ${targetId}.`);
}

async function publishApk(flags) {
  let apkPath = typeof flags.apk === 'string' ? path.resolve(flags.apk) : null;
  let versionCode = flags['version-code'] === undefined ? null : Number(flags['version-code']);
  let downloadDir = null;

  if (typeof flags['eas-build'] === 'string') {
    const build = JSON.parse(run('npx', ['eas', 'build:view', flags['eas-build'], '--json'], { cwd: MOBILE }));
    if (build.status !== 'FINISHED') fail(`That EAS build is ${build.status}, not FINISHED.`);
    versionCode = Number(build.appBuildVersion);
    const url = build.artifacts?.buildUrl ?? build.artifacts?.applicationArchiveUrl;
    if (!url) fail('That EAS build has no downloadable file.');
    downloadDir = mkdtempSync(path.join(tmpdir(), 'hh-apk-'));
    apkPath = path.join(downloadDir, 'app.apk');
    console.log(`Downloading build ${flags['eas-build']} (version code ${versionCode})…`);
    const response = await fetch(url);
    if (!response.ok) fail(`Download failed: HTTP ${response.status}`);
    writeFileSync(apkPath, Buffer.from(await response.arrayBuffer()));
  }

  if (apkPath === null || !existsSync(apkPath)) fail('Give --eas-build <id>, or --apk <file> with --version-code <n>.');
  if (!Number.isInteger(versionCode) || versionCode < 1) fail('The version code must be a whole number from 1.');

  try {
    const config = appConfig();
    const previous = (await getJson('release/android.json')) ?? {};
    const key = `apk/heaven-hospitality-${versionCode}.apk`;
    console.log('Uploading the APK…');
    putFile(apkPath, key, {
      contentType: 'application/vnd.android.package-archive',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const release = {
      latestVersionCode: versionCode,
      minVersionCode: flags.min === undefined ? previous.minVersionCode ?? 0 : Number(flags.min),
      apkUrl: `${BASE_URL}/${key}`,
      notes: typeof flags.notes === 'string' ? flags.notes : null,
    };
    putJson('release/android.json', release);
    putJson(`updates/${config.runtimeVersion}/native.json`, { signature: nativeSignature(config), versionCode });

    console.log(`\nPublished APK version code ${versionCode}.`);
    console.log(`Download link: ${release.apkUrl}`);
    console.log(`Apps below version code ${release.minVersionCode} are ${release.minVersionCode > 0 ? 'blocked until they update' : 'not blocked'}.`);
  } finally {
    if (downloadDir !== null) rmSync(downloadDir, { recursive: true, force: true });
  }
}

async function requireVersion(positional) {
  const minimum = Number(positional[0]);
  if (!Number.isInteger(minimum) || minimum < 0) fail('Usage: release.mjs require <versionCode>');
  const current = await getJson('release/android.json');
  if (current === null) fail('No APK has been published yet.');
  if (minimum > current.latestVersionCode) fail(`The newest published APK is ${current.latestVersionCode}; cannot require ${minimum}.`);
  putJson('release/android.json', { ...current, minVersionCode: minimum });
  console.log(`Apps below version code ${minimum} are now blocked until they update.`);
}

async function status() {
  const config = appConfig();
  const release = await getJson('release/android.json');
  const latest = await getJson(`updates/${config.runtimeVersion}/latest.json`);
  console.log(`Runtime version: ${config.runtimeVersion}`);
  console.log(release === null ? 'APK: none published' : `APK: latest ${release.latestVersionCode}, minimum ${release.minVersionCode}\n     ${release.apkUrl}`);
  console.log(latest === null ? 'Update: none published' : `Update: ${latest.id} from ${latest.createdAt}${latest.message ? ` — ${latest.message}` : ''}`);
}

const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);
loadAwsCredentials();

const commands = {
  update: () => publishUpdate(flags),
  apk: () => publishApk(flags),
  require: () => requireVersion(positional),
  rollback: () => rollback(positional),
  status,
};

if (commands[command] === undefined) fail(`Usage: node scripts/release/release.mjs <${Object.keys(commands).join('|')}>`);
await commands[command]();
