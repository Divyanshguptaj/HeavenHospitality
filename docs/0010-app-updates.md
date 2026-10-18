# 0010 — App updates

**Status:** Accepted · **Date:** 2026-10-19

The Android app is shared as an APK, not through the Play Store. Updates are hosted
in our own AWS account (S3, `ap-southeast-2`) and served through the API.

## Two kinds of update

| Change                                               | How it ships                | User action        |
| ---------------------------------------------------- | --------------------------- | ------------------ |
| JavaScript only (screens, logic, text, fixes)        | Over-the-air bundle         | None               |
| Native (new library, permission, plugin, Expo upgrade) | New APK                     | Tap **Install** once |

## What happens when the app opens

`UpdateGate` wraps the whole app and holds it closed until it knows it is current:

1. `GET /api/v1/app/version` returns the newest and the oldest allowed version code.
   If the installed build is older than the minimum, an **Update required** screen
   replaces the app. It downloads the APK and opens Android's installer.
2. Otherwise `expo-updates` asks `GET /api/v1/app/updates/manifest` for a newer
   bundle. If there is one it is downloaded and the app restarts into it. The wait
   is capped at six seconds; past that the app opens and applies it next launch.
3. If the server cannot be reached the app opens as it is. Nobody is locked out by
   an outage.

The gate is off in development builds.

## Bucket layout

`s3://heaven-hospitality-releases-140481250184`, public read, nothing secret in it.

```
release/android.json                    latest and minimum version code, APK link
apk/heaven-hospitality-<code>.apk       every published APK
updates/<runtime>/latest.json           the bundle devices are told about
updates/<runtime>/history.json          every published bundle, oldest first
updates/<runtime>/native.json           signature of the native code of the last APK
updates/<runtime>/<id>/...              one bundle: its JS, assets and update.json
```

The API reads these files over HTTPS (`APP_RELEASES_BASE_URL`) and caches them for
30 seconds. With the variable unset, nothing is blocked and no update is offered.

## Runtime version

`runtimeVersion` in `app.json` names the native code an APK contains. A bundle is
only sent to apps with the same runtime version, so a bundle can never reach an
app it was not built for. Bump it whenever native code changes, then publish a new
APK before publishing bundles.

`update` refuses to publish if the dependencies, app config or config plugins
differ from those of the last published APK (`native.json`). Pass `--force` to
override.

## Releasing

```
# a JavaScript-only fix
node scripts/release/release.mjs update --message "Fix rent screen"

# a native change: build, then publish the APK
cd apps/mobile && npx eas build --platform android --profile preview --non-interactive
node scripts/release/release.mjs apk --eas-build <build id> --notes "What is new"

# stop old builds opening at all
node scripts/release/release.mjs require <versionCode>

# undo the last bundle
node scripts/release/release.mjs rollback

node scripts/release/release.mjs status
```

Every APK must be signed with the same key (EAS manages it), otherwise Android
refuses to install it over the installed app.

## Keeping the API compatible

Old app builds keep running against the newest API until they update. Add fields,
do not rename or remove them, and raise the minimum version code only after the new
APK is published.
