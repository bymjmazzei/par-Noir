<?php
// Nuclear option: PHP router to force correct MIME types
// This will intercept ALL requests and serve files with proper MIME types

// Get the requested URI
$request_uri = $_SERVER['REQUEST_URI'];

// Remove query parameters
$request_uri = strtok($request_uri, '?');

// Get the file path
$file_path = $_SERVER['DOCUMENT_ROOT'] . $request_uri;

// If it's the root, serve index.html
if ($request_uri === '/' || $request_uri === '') {
    $file_path = $_SERVER['DOCUMENT_ROOT'] . '/index.html';
}

// Check if file exists
if (!file_exists($file_path)) {
    // For React Router - serve index.html for any non-file request
    if (!is_file($file_path)) {
        $file_path = $_SERVER['DOCUMENT_ROOT'] . '/index.html';
        if (!file_exists($file_path)) {
            http_response_code(404);
            exit('File not found');
        }
    } else {
        http_response_code(404);
        exit('File not found');
    }
}

// Get file extension
$extension = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));

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
    header('Content-Type: ' . $mime_types[$extension]);
} else {
    header('Content-Type: application/octet-stream');
}

// Set cache headers
header('Cache-Control: public, max-age=31536000');
header('X-Content-Type-Options: nosniff');

// Output the file
readfile($file_path);
?>
