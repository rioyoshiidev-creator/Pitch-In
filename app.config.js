const { withPodfileProperties, withXcodeProject } = require('@expo/config-plugins')

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

  // Set CocoaPods platform deployment target
  cfg = withPodfileProperties(cfg, (mod) => {
    mod.modResults['ios.deploymentTarget'] = '26.1'
    return mod
  })

  // Set Xcode project deployment target for all build configurations
  cfg = withXcodeProject(cfg, (mod) => {
    const configs = mod.modResults.pbxXCBuildConfigurationSection()
    for (const key in configs) {
      const buildSettings = configs[key]?.buildSettings
      if (buildSettings) {
        buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '26.1'
      }
    }
    return mod
  })

  return cfg
}
