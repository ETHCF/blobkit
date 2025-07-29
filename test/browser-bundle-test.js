// Test that browser bundle can be imported without errors
const fs = require('fs');
const path = require('path');

console.log('Testing browser bundle imports...');

// Check that browser files exist
const browserFiles = [
  'dist/browser.js',
  'dist/init-browser.js', 
  'dist/utils/environment-browser.js',
  'dist/kzg/setup-browser.js'
];

let allFilesExist = true;
for (const file of browserFiles) {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing browser file: ${file}`);
    allFilesExist = false;
  } else {
    console.log(`✅ Found browser file: ${file}`);
    
    // Check file doesn't contain fs imports
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('require("fs")') || content.includes('require("fs/promises")') || 
        content.includes("require('fs')") || content.includes("require('fs/promises')") ||
        content.includes('from "fs"') || content.includes("from 'fs'")) {
      console.error(`❌ File ${file} contains fs imports!`);
      allFilesExist = false;
    }
  }
}

if (!allFilesExist) {
  process.exit(1);
}

console.log('\n✅ All browser files exist and contain no fs imports!');