<?php
echo "<!DOCTYPE html>";
echo "<html>";
echo "<head>";
echo "<title>Router Test</title>";
echo "<style>";
echo "body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }";
echo ".info { background: white; padding: 20px; border-radius: 5px; margin: 10px 0; }";
echo "</style>";
echo "</head>";
echo "<body>";

echo "<h1>🔧 Router Test</h1>";

echo "<div class='info'>";
echo "<h2>Current Request:</h2>";
echo "<p><strong>Request URI:</strong> " . $_SERVER['REQUEST_URI'] . "</p>";
echo "<p><strong>Document Root:</strong> " . $_SERVER['DOCUMENT_ROOT'] . "</p>";
echo "<p><strong>Script Name:</strong> " . $_SERVER['SCRIPT_NAME'] . "</p>";
echo "<p><strong>PHP Self:</strong> " . $_SERVER['PHP_SELF'] . "</p>";
echo "</div>";

echo "<div class='info'>";
echo "<h2>Test Links:</h2>";
echo "<p><a href='router-debug.php' target='_blank'>Test Router Debug</a></p>";
echo "<p><a href='assets/js/index-DdJ3gbP3.js' target='_blank'>Test JS File</a></p>";
echo "<p><a href='assets/index-CJZN9kat.css' target='_blank'>Test CSS File</a></p>";
echo "<p><a href='index.html' target='_blank'>Test HTML File</a></p>";
echo "</div>";

echo "<div class='info'>";
echo "<h2>Server Logs:</h2>";
echo "<p>Check your server error logs for 'ROUTER DEBUG' messages to see if the router is being called.</p>";
echo "<p>If you don't see any router debug messages, the .htaccess is not working.</p>";
echo "</div>";

echo "</body>";
echo "</html>";
?>
