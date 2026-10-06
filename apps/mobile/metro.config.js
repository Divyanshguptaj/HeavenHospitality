// Metro bundler config, extending Expo's default.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// pnpm workspace: watch the whole monorepo, and resolve packages from both
// this app's node_modules and the workspace root's.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), monorepoRoot])];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Bundle .riv files as opaque binary assets, the same way images are handled,
// so the intro animation can be loaded with a plain require().
config.resolver.assetExts.push('riv');

module.exports = config;
