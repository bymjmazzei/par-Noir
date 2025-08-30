<?php
echo "<!DOCTYPE html>";
echo "<html>";
echo "<head>";
echo "<title>Server Configuration Test</title>";
echo "<style>";
echo "body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }";
echo ".info { background: white; padding: 20px; border-radius: 5px; margin: 10px 0; }";
echo ".success { color: green; font-weight: bold; }";
echo ".error { color: red; font-weight: bold; }";
echo "</style>";
echo "</head>";
echo "<body>";

echo "<h1>🔧 Server Configuration Test</h1>";

echo "<div class='info'>";
echo "<h2>Apache Configuration:</h2>";
echo "<p><strong>Server Software:</strong> " . $_SERVER['SERVER_SOFTWARE'] . "</p>";
echo "<p><strong>Document Root:</strong> " . $_SERVER['DOCUMENT_ROOT'] . "</p>";
echo "<p><strong>Current Directory:</strong> " . getcwd() . "</p>";
echo "</div>";

echo "<div class='info'>";
echo "<h2>.htaccess Support:</h2>";

// Test if .htaccess is being processed
if (function_exists('apache_get_modules')) {
    $modules = apache_get_modules();
    if (in_array('mod_rewrite', $modules)) {
        echo "<p class='success'>✅ mod_rewrite is enabled</p>";
    } else {
        echo "<p class='error'>❌ mod_rewrite is NOT enabled</p>";
    }
    
    if (in_array('mod_mime', $modules)) {
        echo "<p class='success'>✅ mod_mime is enabled</p>";
    } else {
        echo "<p class='error'>❌ mod_mime is NOT enabled</p>";
    }
} else {
    echo "<p class='error'>❌ Cannot check Apache modules (function not available)</p>";
}

// Check if .htaccess file exists and is readable
if (file_exists('.htaccess')) {
    echo "<p class='success'>✅ .htaccess file exists</p>";
    if (is_readable('.htaccess')) {
        echo "<p class='success'>✅ .htaccess file is readable</p>";
        echo "<p><strong>.htaccess content:</strong></p>";
        echo "<pre style='background: #f8f8f8; padding: 10px; border-radius: 3px;'>";
        echo htmlspecialchars(file_get_contents('.htaccess'));
        echo "</pre>";
    } else {
        echo "<p class='error'>❌ .htaccess file is NOT readable</p>";
    }
} else {
    echo "<p class='error'>❌ .htaccess file does NOT exist</p>";
}
echo "</div>";

echo "<div class='info'>";
echo "<h2>MIME Type Test:</h2>";
echo "<p>Testing if we can serve a JavaScript file with correct MIME type:</p>";

// Create a test JavaScript file
$test_js = "console.log('MIME type test successful');";
file_put_contents('test-mime.js', $test_js);

echo "<p><a href='test-mime.js' target='_blank'>Test JavaScript File</a></p>";
echo "<p><a href='assets/js/index-DdJ3gbP3.js' target='_blank'>Test React JS File</a></p>";
echo "</div>";

echo "<div class='info'>";
echo "<h2>Alternative Solutions:</h2>";
echo "<p>If .htaccess is not working, we can try:</p>";
echo "<ol>";
echo "<li><strong>Contact hosting support</strong> to enable .htaccess processing</li>";
echo "<li><strong>Use PHP headers</strong> to force MIME types (but this requires routing all requests through PHP)</li>";
echo "<li><strong>Switch to a different hosting provider</strong> that properly supports .htaccess</li>";
echo "<li><strong>Use a static site generator</strong> that doesn't require server configuration</li>";
echo "</ol>";
echo "</div>";

echo "</body>";
echo "</html>";
?>
