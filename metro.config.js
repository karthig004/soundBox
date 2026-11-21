const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Native build output and caches contain tens of thousands of files Metro never needs.
    // Crawling them on Windows made the watcher time out ("Failed to start watch mode").
    blockList: [/[\\/]android[\\/](app[\\/])?build[\\/].*/, /[\\/]android[\\/]\.gradle[\\/].*/, /[\\/]ios[\\/](build|Pods)[\\/].*/],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
