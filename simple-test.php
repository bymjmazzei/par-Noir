<?php
echo "PHP is working!";
echo "<br>Current time: " . date('Y-m-d H:i:s');
echo "<br>Server: " . $_SERVER['SERVER_SOFTWARE'];
echo "<br>Document root: " . $_SERVER['DOCUMENT_ROOT'];
echo "<br>Current directory: " . getcwd();
?>
