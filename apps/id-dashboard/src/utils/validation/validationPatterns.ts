import { cryptoWorkerManager } from './cryptoWorkerManager';
// Validation Patterns - Regex patterns and constants for validation
export class ValidationPatterns {
  // DID format validation
  static readonly DID_PATTERN = /^did:key:[a-zA-Z0-9]{32,}$/;
  
  // Username validation
  static readonly USERNAME_PATTERN = /^[a-zA-Z0-9-]{3,20}$/;
  static readonly RESERVED_USERNAMES = [
    'admin', 'root', 'system', 'test', 'guest', 'anonymous', 'null', 'undefined',
    'api', 'oauth', 'auth', 'login', 'logout', 'register', 'signup', 'signin'
  ];

  // Email validation
  static readonly EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // Phone validation (international format)
  static readonly PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;

  // Public key validation
  static readonly PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{100,}$/;

  // Signature validation
  static readonly SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{50,}$/;

  // Challenge validation
  static readonly CHALLENGE_PATTERN = /^[A-Za-z0-9+/]{20,}$/;

  // XSS patterns to detect
  static readonly XSS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /onmouseover\s*=/gi,
    /<iframe\b[^>]*>/gi,
    /<object\b[^>]*>/gi,
    /<embed\b[^>]*>/gi
  ];

  // SQL injection patterns to detect
  static readonly SQL_INJECTION_PATTERNS = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /(--|\/\*|\*\/|;)/g,
    /(\b(and|or)\b\s+\d+\s*=\s*\d+)/gi,
    /(\b(and|or)\b\s+['"]\w+['"]\s*=\s*['"]\w+['"])/gi
  ];

  // Path traversal patterns to detect
  static readonly PATH_TRAVERSAL_PATTERNS = [
    /\.\.\//g,
    /\.\.\\/g,
    /\/etc\/passwd/gi,
    /\/proc\/version/gi,
    /\/sys\/class\/net/gi
  ];

  // Weak passcode patterns
  static readonly WEAK_PASSCODE_PATTERNS = [
    'password', '123456', 'qwerty', 'admin', 'letmein', 'welcome',
    'monkey', 'dragon', 'master', 'football', 'baseball', 'shadow'
  ];

  // Keyboard patterns
  static readonly KEYBOARD_PATTERNS = ['qwerty', 'asdfgh', 'zxcvbn', '1234567890'];

  // File validation constants
  static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  static readonly MAX_JSON_SIZE = 1024 * 1024; // 1MB
  static readonly ALLOWED_FILE_TYPES = [
    'application/json',
    'text/plain',
    'application/octet-stream'
  ];
  static readonly ALLOWED_FILE_EXTENSIONS = ['.pn', '.id', '.json', '.identity'];
}
