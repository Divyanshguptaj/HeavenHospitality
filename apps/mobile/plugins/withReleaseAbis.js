const { withGradleProperties } = require('@expo/config-plugins');

const PHONE_ABIS = 'armeabi-v7a,arm64-v8a';

/**
 * Builds only the ARM architectures real phones use, which roughly halves the
 * APK. The x86 builds exist for emulators and are left in for local and
 * development builds.
 */
module.exports = function withReleaseAbis(config) {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile !== 'preview' && profile !== 'production') return config;

  return withGradleProperties(config, (modConfig) => {
    const properties = modConfig.modResults;
    const existing = properties.find(
      (item) => item.type === 'property' && item.key === 'reactNativeArchitectures',
    );
    if (existing) existing.value = PHONE_ABIS;
    else properties.push({ type: 'property', key: 'reactNativeArchitectures', value: PHONE_ABIS });
    return modConfig;
  });
};
