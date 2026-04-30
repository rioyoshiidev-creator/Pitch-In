const { withAppJson } = require('@expo/config')

const isProduction = process.env.APP_ENV === 'production'

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
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
})
