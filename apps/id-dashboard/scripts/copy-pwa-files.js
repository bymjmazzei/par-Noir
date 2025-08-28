import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📁 Starting PWA file copy...');

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');

// Function to copy file
function copyFile(src, dest) {
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`✅ Copied ${path.basename(src)} to dist`);
      return true;
    } else {
      console.error(`❌ Source file not found: ${src}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error copying ${path.basename(src)}:`, error.message);
    return false;
  }
}

// Function to copy directory recursively
function copyDir(src, dest) {
  try {
    if (fs.existsSync(src)) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      
      const files = fs.readdirSync(src);
      files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          copyFile(srcPath, destPath);
        }
      });
      
      console.log(`✅ Copied directory: ${path.basename(src)}`);
      return true;
    } else {
      console.error(`❌ Source directory not found: ${src}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error copying directory ${path.basename(src)}:`, error.message);
    return false;
  }
}

// Copy PWA files
console.log('🔧 Copying PWA files...');

const filesToCopy = [
  { src: path.join(publicDir, 'sw.js'), dest: path.join(distDir, 'sw.js') },
  { src: path.join(publicDir, 'manifest.json'), dest: path.join(distDir, 'manifest.json') }
];

let successCount = 0;
filesToCopy.forEach(file => {
  if (copyFile(file.src, file.dest)) {
    successCount++;
  }
});

// Copy icons directory
const iconsSrc = path.join(publicDir, 'icons');
const iconsDest = path.join(distDir, 'icons');
if (copyDir(iconsSrc, iconsDest)) {
  successCount++;
}

console.log(`🎉 PWA file copy complete! ${successCount}/${filesToCopy.length + 1} operations successful`);
