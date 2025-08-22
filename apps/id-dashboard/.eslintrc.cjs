module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: [
    'react',
    '@typescript-eslint',
  ],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off', // Disable any warnings for now
    'no-console': 'off', // Disable console warnings for development
    'no-undef': 'warn',
    'no-empty': 'warn',
    'no-useless-catch': 'warn',
    'no-useless-escape': 'warn',
    'no-control-regex': 'warn',
    'react/no-unescaped-entities': 'warn',
    'react-hooks/exhaustive-deps': 'off', // Disable exhaustive deps for now
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  globals: {
    NodeJS: 'readonly',
    PublicKeyCredential: 'readonly',
    CredentialCreationOptions: 'readonly',
    AuthenticatorAttestationResponse: 'readonly',
    AuthenticatorTransport: 'readonly',
    CredentialRequestOptions: 'readonly',
    FileSystemDirectoryHandle: 'readonly',
    FileSystemFileHandle: 'readonly',
    IDBTransactionMode: 'readonly',
    React: 'readonly',
  },
};
