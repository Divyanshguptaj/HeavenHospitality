// Metro bundler config, extending Expo's default.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle .riv files as opaque binary assets, the same way images are handled,
// so the intro animation can be loaded with a plain require().
config.resolver.assetExts.push('riv');

module.exports = config;
