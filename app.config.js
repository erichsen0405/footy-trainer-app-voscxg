// app.config.js
// Variant-aware Expo config: dev/prod scheme + bundle/package suffix, exposed via extra.

module.exports = ({ config }) => {
  const appVariant = process.env.APP_VARIANT === 'dev' ? 'dev' : 'prod';
  const pickFirst = value => (Array.isArray(value) ? value[0] : value);
  const scheme = pickFirst(config.scheme) || 'footballcoach';
  const expoVersion = '1.0.4';
  const iosBuildNumber = '5';
  const androidVersionCode = 5;

  // Ensure plugins array exists and contains datetimepicker only once
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  if (
    !plugins.some(
      (p) =>
        (typeof p === "string" && p === "@react-native-community/datetimepicker") ||
        (Array.isArray(p) && p[0] === "@react-native-community/datetimepicker")
    )
  ) {
    plugins.push("@react-native-community/datetimepicker");
  }

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
    plugins,
    extra: {
      ...(config.extra ?? {}),
      appVariant,
      authRedirectScheme: scheme,
    },
  };
};
