<?php
echo "<!DOCTYPE html>";
echo "<html>";
echo "<head>";
echo "<title>PHP Test - parnoir.com</title>";
echo "<style>";
echo "body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }";
echo ".success { color: green; font-weight: bold; }";
echo ".info { background: white; padding: 20px; border-radius: 5px; margin: 10px 0; }";
echo "</style>";
echo "</head>";
echo "<body>";

echo "<h1 class='success'>✅ PHP Test - parnoir.com is working!</h1>";

echo "<div class='info'>";
echo "<h2>Server Information:</h2>";
echo "<p><strong>PHP Version:</strong> " . phpversion() . "</p>";
echo "<p><strong>Server Software:</strong> " . $_SERVER['SERVER_SOFTWARE'] . "</p>";
echo "<p><strong>Document Root:</strong> " . $_SERVER['DOCUMENT_ROOT'] . "</p>";
echo "<p><strong>Current Directory:</strong> " . getcwd() . "</p>";
echo "<p><strong>Domain:</strong> " . $_SERVER['HTTP_HOST'] . "</p>";
echo "<p><strong>Request URI:</strong> " . $_SERVER['REQUEST_URI'] . "</p>";
echo "</div>";

echo "<div class='info'>";
echo "<h2>PHP Extensions:</h2>";
echo "<p><strong>cURL:</strong> " . (extension_loaded('curl') ? '✅ Enabled' : '❌ Disabled') . "</p>";
echo "<p><strong>JSON:</strong> " . (extension_loaded('json') ? '✅ Enabled' : '❌ Disabled') . "</p>";
echo "<p><strong>OpenSSL:</strong> " . (extension_loaded('openssl') ? '✅ Enabled' : '❌ Disabled') . "</p>";
echo "<p><strong>ZIP:</strong> " . (extension_loaded('zip') ? '✅ Enabled' : '❌ Disabled') . "</p>";
echo "</div>";

echo "<div class='info'>";
echo "<h2>File System Test:</h2>";
$testFile = 'test-write.txt';
if (file_put_contents($testFile, 'Test write at ' . date('Y-m-d H:i:s'))) {
    echo "<p class='success'>✅ File write test: SUCCESS</p>";
    unlink($testFile); // Clean up
} else {
    echo "<p style='color: red;'>❌ File write test: FAILED</p>";
}

if (is_readable('index.html')) {
    echo "<p class='success'>✅ index.html is readable</p>";
} else {
    echo "<p style='color: red;'>❌ index.html is NOT readable</p>";
}

if (is_readable('assets/js/index-BH26mxB-.js')) {
    echo "<p class='success'>✅ React JS file is readable</p>";
} else {
    echo "<p style='color: red;'>❌ React JS file is NOT readable</p>";
}
echo "</div>";

echo "<div class='info'>";
echo "<h2>Directory Listing:</h2>";
echo "<p><strong>Current directory contents:</strong></p>";
echo "<ul>";
$files = scandir('.');
foreach ($files as $file) {
    if ($file != '.' && $file != '..') {
        $type = is_dir($file) ? '📁' : '📄';
        echo "<li>$type $file</li>";
    }
}
echo "</ul>";
echo "</div>";

echo "<div class='info'>";
echo "<h2>Test Links:</h2>";
echo "<p><a href='index.html' target='_blank'>Test index.html</a></p>";
echo "<p><a href='test-simple.html' target='_blank'>Test simple HTML</a></p>";
echo "<p><a href='assets/js/index-BH26mxB-.js' target='_blank'>Test React JS file</a></p>";
echo "</div>";

echo "</body>";
echo "</html>";
?>
