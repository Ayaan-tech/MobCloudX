const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// __dirname = mobCloudX/sdk/expo-app
// workspaceRoot = mobCloudX/sdk  (one level up, not two)
const workspaceRoot = path.resolve(__dirname, '..');

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force axios to use browser/RN build
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'axios') {
    return context.resolveRequest(
      context, 'axios/dist/browser/axios.cjs', platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Watch ONLY what Metro needs — app source + hoisted deps
config.watchFolders = [
  path.resolve(__dirname, 'src'),              // expo-app/src
  path.resolve(workspaceRoot, 'node_modules'), // sdk/node_modules (hoisted)
];

function escapeForBlockList(absPath) {
  return absPath.replace(/[/\\]/g, '[/\\\\]');
}

config.resolver.blockList = [
  // Python inference server
  new RegExp(
    escapeForBlockList(path.resolve(workspaceRoot, '..', 'inference')) + '[/\\\\].*'
  ),

  // Gradle build outputs
  new RegExp(
    escapeForBlockList(path.resolve(__dirname, 'android', 'build')) + '[/\\\\].*'
  ),
  new RegExp(
    escapeForBlockList(path.resolve(__dirname, 'android', 'app', 'build')) + '[/\\\\].*'
  ),
  new RegExp(
    escapeForBlockList(path.resolve(__dirname, 'android', '.gradle')) + '[/\\\\].*'
  ),

  // Python / cache / git
  /.*[/\\]__pycache__[/\\].*/,
  /.*[/\\]\.pytest_cache[/\\].*/,
  /.*[/\\]\.venv[/\\].*/,
  /.*[/\\]venv[/\\].*/,
  /.*[/\\]\.git[/\\].*/,
  /.*\.py$/,
];

module.exports = config;