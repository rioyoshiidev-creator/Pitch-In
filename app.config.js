const { withPodfileProperties } = require('@expo/config-plugins')

const isProduction = process.env.APP_ENV === 'production'

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  let cfg = {
    ...config,
    plugins: [
      [
        'expo-notifications',
        {
          mode: isProduction ? 'production' : 'development',
        },
      ],
      'expo-dev-client',
      'expo-router',
    ],
  }

  cfg = withPodfileProperties(cfg, (mod) => {
    mod.modResults['ios.deploymentTarget'] = '26.1'
    return mod
  })

  return cfg
}
