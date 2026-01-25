// app.config.js
// Variant-aware Expo config: dev/prod scheme + bundle/package suffix, exposed via extra.

module.exports = ({ config }) => {
  const appVariant = process.env.APP_VARIANT === 'dev' ? 'dev' : 'prod';
  const pickFirst = value => (Array.isArray(value) ? value[0] : value);
  const scheme = pickFirst(config.scheme) || 'footballcoach';
  const expoVersion = '1.0.1';
  const iosBuildNumber = '2';
  const androidVersionCode = 2;

  return {
    ...config,
    version: expoVersion,
    scheme,
    ios: {
      ...config.ios,
      buildNumber: iosBuildNumber,
    },
    android: {
      ...config.android,
      versionCode: androidVersionCode,
    },
    extra: {
      ...(config.extra ?? {}),
      appVariant,
      authRedirectScheme: scheme,
    },
  };
};
