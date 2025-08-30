<?php
// Force correct MIME types for React app assets
// This script should be placed in the root directory

// Get the requested file path
$request_uri = $_SERVER['REQUEST_URI'];

// Remove any query parameters
$request_uri = strtok($request_uri, '?');

// Get the file path relative to document root
$file_path = $_SERVER['DOCUMENT_ROOT'] . $request_uri;

// Debug: Log the request
error_log("Request URI: " . $request_uri);
error_log("File path: " . $file_path);
error_log("Document root: " . $_SERVER['DOCUMENT_ROOT']);

// Check if the file exists
if (!file_exists($file_path)) {
    error_log("File not found: " . $file_path);
    http_response_code(404);
    exit('File not found: ' . $request_uri);
}

// Get file extension
$extension = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));

// Set correct MIME types
$mime_types = [
    'js' => 'application/javascript',
    'mjs' => 'application/javascript',
    'jsx' => 'application/javascript',
    'css' => 'text/css',
    'json' => 'application/json',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'ico' => 'image/x-icon',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf' => 'font/ttf',
    'otf' => 'font/otf',
    'eot' => 'application/vnd.ms-fontobject',
    'xml' => 'application/xml',
    'html' => 'text/html',
    'htm' => 'text/html'
];

// Set the correct MIME type
if (isset($mime_types[$extension])) {
    header('Content-Type: ' . $mime_types[$extension]);
} else {
    // Default to octet-stream for unknown types
    header('Content-Type: application/octet-stream');
}

// Set additional headers for better performance
header('Cache-Control: public, max-age=31536000'); // 1 year cache
header('X-Content-Type-Options: nosniff');

// Output the file content
readfile($file_path);
?>
