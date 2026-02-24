// app.config.js
// Variant-aware Expo config: dev/prod scheme + bundle/package suffix, exposed via extra.

module.exports = ({ config }) => {
  const appVariant = process.env.APP_VARIANT === 'dev' ? 'dev' : 'prod';
  const pickFirst = value => (Array.isArray(value) ? value[0] : value);
  const scheme = pickFirst(config.scheme) || 'footballcoach';
  const expoVersion = '1.0.5';
  const iosBuildNumber = '6';
  const androidVersionCode = 6;
  const easProjectId =
    config?.extra?.eas?.projectId || '56add269-43c8-4368-9edc-3913dac2f57c';
  const updatesUrl = `https://u.expo.dev/${easProjectId}`;

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
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      ...(config.updates ?? {}),
      enabled: true,
      url: updatesUrl,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
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
      eas: {
        ...(config.extra?.eas ?? {}),
        projectId: easProjectId,
      },
      appVariant,
      authRedirectScheme: scheme,
    },
  };
};
