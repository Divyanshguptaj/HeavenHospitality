const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Declares the external apps this app checks for and opens — dialer, mail,
 * WhatsApp, a browser/maps app — in the Android manifest's `<queries>` block.
 *
 * Android 11+ hides every other app from `Linking.canOpenURL`/`openURL`
 * unless the target is declared here or matches one of Android's own
 * automatically-visible signatures (which `tel:` and WhatsApp's package are
 * not). Without this, those buttons silently report "not installed" even
 * when the app is right there on the phone.
 */
module.exports = function withExternalAppQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    manifest.queries = [
      {
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
            data: [{ $: { 'android:scheme': 'tel' } }],
          },
          {
            action: [{ $: { 'android:name': 'android.intent.action.SENDTO' } }],
            data: [{ $: { 'android:scheme': 'mailto' } }],
          },
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
            data: [{ $: { 'android:scheme': 'https' } }],
          },
        ],
        package: [{ $: { 'android:name': 'com.whatsapp' } }],
      },
    ];

    return config;
  });
};
