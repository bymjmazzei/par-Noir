<?php
// Debug router to see what's happening
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Log the request
error_log("ROUTER DEBUG: Request URI = " . $_SERVER['REQUEST_URI']);
error_log("ROUTER DEBUG: Document Root = " . $_SERVER['DOCUMENT_ROOT']);

// Get the requested URI
$request_uri = $_SERVER['REQUEST_URI'];

// Remove query parameters
$request_uri = strtok($request_uri, '?');

// Get the file path
$file_path = $_SERVER['DOCUMENT_ROOT'] . $request_uri;

error_log("ROUTER DEBUG: File path = " . $file_path);

// If it's the root, serve index.html
if ($request_uri === '/' || $request_uri === '') {
    $file_path = $_SERVER['DOCUMENT_ROOT'] . '/index.html';
    error_log("ROUTER DEBUG: Serving index.html");
}

// Check if file exists
if (!file_exists($file_path)) {
    error_log("ROUTER DEBUG: File not found = " . $file_path);
    // For React Router - serve index.html for any non-file request
    if (!is_file($file_path)) {
        $file_path = $_SERVER['DOCUMENT_ROOT'] . '/index.html';
        error_log("ROUTER DEBUG: Trying index.html = " . $file_path);
        if (!file_exists($file_path)) {
            error_log("ROUTER DEBUG: index.html not found either");
            http_response_code(404);
            exit('File not found: ' . $request_uri);
        }
    } else {
        http_response_code(404);
        exit('File not found: ' . $request_uri);
    }
}

error_log("ROUTER DEBUG: Serving file = " . $file_path);

// Get file extension
$extension = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));
error_log("ROUTER DEBUG: Extension = " . $extension);

// MIME type mapping
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
    $mime_type = $mime_types[$extension];
    error_log("ROUTER DEBUG: Setting MIME type = " . $mime_type);
    header('Content-Type: ' . $mime_type);
} else {
    error_log("ROUTER DEBUG: Unknown extension, using octet-stream");
    header('Content-Type: application/octet-stream');
}

// Set cache headers
header('Cache-Control: public, max-age=31536000');
header('X-Content-Type-Options: nosniff');

error_log("ROUTER DEBUG: About to output file");

// Output the file
readfile($file_path);

error_log("ROUTER DEBUG: File output complete");
?>
