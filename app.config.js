// app.config.js
// Variant-aware Expo config: dev/prod scheme + bundle/package suffix, exposed via extra.

module.exports = ({ config }) => {
  const appVariant = process.env.APP_VARIANT === 'dev' ? 'dev' : 'prod';
  const pickFirst = value => (Array.isArray(value) ? value[0] : value);
  const scheme = pickFirst(config.scheme) || 'footballcoach';

  return {
    ...config,
    scheme,
    ios: {
      ...config.ios,
    },
    android: {
      ...config.android,
    },
    extra: {
      ...(config.extra ?? {}),
      appVariant,
      authRedirectScheme: scheme,
    },
  };
};
