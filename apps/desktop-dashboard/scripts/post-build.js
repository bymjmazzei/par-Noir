const fs = require('fs');
const path = require('path');

const distRoot = path.join(__dirname, '..', 'dist-electron');
const projectRoot = path.join(__dirname, '..');
const rendererDist = path.join(projectRoot, 'dist');

const pickFirstExisting = (candidates) => candidates.find((candidate) => candidate && fs.existsSync(candidate));

const copyIfExists = (sources, target) => {
  const source = Array.isArray(sources) ? pickFirstExisting(sources) : sources;
  if (!source || !fs.existsSync(source)) {
    return;
  }
  if (path.resolve(source) === path.resolve(target)) {
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`[post-build] Copied ${source} -> ${target}`);
};

const copyDirectory = (sources, targetDir) => {
  const source = Array.isArray(sources) ? pickFirstExisting(sources) : sources;
  if (!source || !fs.existsSync(source)) {
    return;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(source, targetDir, { recursive: true, force: true });
  console.log(`[post-build] Mirrored directory ${source} -> ${targetDir}`);
};

console.log('[post-build] Running post-build adjustments');

copyIfExists([
  path.join(distRoot, 'main', 'main', 'main.js'),
  path.join(distRoot, 'main', 'main', 'index.js'),
  path.join(distRoot, 'main', 'main.js')
], path.join(distRoot, 'main', 'main.js'));

copyIfExists([
  path.join(distRoot, 'preload', 'preload', 'preload.js'),
  path.join(distRoot, 'preload', 'preload.js'),
  path.join(distRoot, 'preload.js')
], path.join(distRoot, 'preload', 'preload.js'));

copyIfExists([
  path.join(distRoot, 'preload', 'preload', 'preload.d.ts'),
  path.join(distRoot, 'preload', 'preload.d.ts'),
  path.join(distRoot, 'preload.d.ts')
], path.join(distRoot, 'preload', 'preload.d.ts'));

copyIfExists([
  path.join(distRoot, 'main', 'shared', 'ipcChannels.js'),
  path.join(distRoot, 'shared', 'ipcChannels.js')
], path.join(distRoot, 'shared', 'ipcChannels.js'));

copyIfExists([
  path.join(distRoot, 'main', 'shared', 'ipcChannels.d.ts'),
  path.join(distRoot, 'shared', 'ipcChannels.d.ts')
], path.join(distRoot, 'shared', 'ipcChannels.d.ts'));

copyDirectory([
  path.join(distRoot, 'main', 'main', 'secureVolume'),
  path.join(distRoot, 'main', 'secureVolume')
], path.join(distRoot, 'main', 'secureVolume'));

copyDirectory(
  path.join(projectRoot, 'public', 'branding'),
  path.join(rendererDist, 'branding')
);
