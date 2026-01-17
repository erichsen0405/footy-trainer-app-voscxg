const baseConfig = require('./app.json');

module.exports = ({ config } = { config: {} }) => {
  const mergedExpo = {
    ...(baseConfig.expo || {}),
    ...(config?.expo || {}),
    jsEngine: 'hermes',
  };

  return {
    ...baseConfig,
    ...config,
    expo: mergedExpo,
  };
};
