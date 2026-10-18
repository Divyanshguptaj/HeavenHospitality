// On EAS the Firebase client config arrives as a file secret (GOOGLE_SERVICES_JSON);
// locally it is read from the git-ignored apps/mobile/google-services.json.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.API_BASE_URL ?? config.extra?.apiBaseUrl,
  },
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
