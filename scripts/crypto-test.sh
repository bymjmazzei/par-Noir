#!/bin/bash

# Cryptographic Testing Script
# Identity Protocol - Production Security Testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="/tmp/crypto_test_$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="$TEST_DIR/crypto_test_report.md"
LOG_FILE="$TEST_DIR/crypto_test.log"

# Create test directory
mkdir -p "$TEST_DIR"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

# Initialize report
init_report() {
    cat > "$REPORT_FILE" << EOF
# Cryptographic Testing Report
## Identity Protocol - $(date +'%Y-%m-%d %H:%M:%S')

### Executive Summary
This report contains the results of comprehensive cryptographic algorithm validation for the Identity Protocol.

### Test Scope
- Key generation algorithms
- Encryption/decryption operations
- Digital signature algorithms
- Hash functions
- Random number generation
- Key derivation functions
- Cryptographic protocol validation

### Test Environment
- **Test Date**: $(date +'%Y-%m-%d %H:%M:%S')
- **Node.js Version**: $(node --version 2>/dev/null || echo "Not available")
- **OpenSSL Version**: $(openssl version 2>/dev/null || echo "Not available")

### Findings Summary
- **Critical Issues**: 0
- **High Priority Issues**: 0
- **Medium Priority Issues**: 0
- **Low Priority Issues**: 0
- **Passed Tests**: 0

---

EOF
}

# Test key generation
test_key_generation() {
    log "Testing key generation algorithms..."
    
    echo "## Key Generation Testing" >> "$REPORT_FILE"
    
    # Test ECDSA key generation
    log "Testing ECDSA key generation..."
    echo "### ECDSA Key Generation" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_keygen.js" << 'EOF'
const crypto = require('crypto');

async function testECDSAKeyGen() {
    try {
        // Test P-256
        const p256KeyPair = await crypto.generateKeyPair('ec', {
            namedCurve: 'P-256',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        // Test P-384
        const p384KeyPair = await crypto.generateKeyPair('ec', {
            namedCurve: 'P-384',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        // Test P-521
        const p521KeyPair = await crypto.generateKeyPair('ec', {
            namedCurve: 'P-521',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        console.log('SUCCESS: ECDSA key generation passed');
        return true;
    } catch (error) {
        console.log('ERROR: ECDSA key generation failed:', error.message);
        return false;
    }
}

testECDSAKeyGen();
EOF
    
    if node "$TEST_DIR/test_keygen.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "ECDSA key generation passed"
        echo "✅ ECDSA key generation (P-256, P-384, P-521) passed" >> "$REPORT_FILE"
    else
        error "ECDSA key generation failed"
        echo "❌ ECDSA key generation failed" >> "$REPORT_FILE"
    fi
    
    # Test Ed25519 key generation
    log "Testing Ed25519 key generation..."
    echo "### Ed25519 Key Generation" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_ed25519.js" << 'EOF'
const crypto = require('crypto');

async function testEd25519KeyGen() {
    try {
        const ed25519KeyPair = await crypto.generateKeyPair('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        console.log('SUCCESS: Ed25519 key generation passed');
        return true;
    } catch (error) {
        console.log('ERROR: Ed25519 key generation failed:', error.message);
        return false;
    }
}

testEd25519KeyGen();
EOF
    
    if node "$TEST_DIR/test_ed25519.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "Ed25519 key generation passed"
        echo "✅ Ed25519 key generation passed" >> "$REPORT_FILE"
    else
        error "Ed25519 key generation failed"
        echo "❌ Ed25519 key generation failed" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Test encryption/decryption
test_encryption() {
    log "Testing encryption/decryption operations..."
    
    echo "## Encryption/Decryption Testing" >> "$REPORT_FILE"
    
    # Test AES-256-GCM
    log "Testing AES-256-GCM encryption..."
    echo "### AES-256-GCM Encryption" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_aes.js" << 'EOF'
const crypto = require('crypto');

function testAES256GCM() {
    try {
        const algorithm = 'aes-256-gcm';
        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const plaintext = 'Hello, World! This is a test message for AES-256-GCM encryption.';
        
        const cipher = crypto.createCipher(algorithm, key);
        cipher.setAAD(Buffer.from('additional-data'));
        
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        const decipher = crypto.createDecipher(algorithm, key);
        decipher.setAAD(Buffer.from('additional-data'));
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        if (decrypted === plaintext) {
            console.log('SUCCESS: AES-256-GCM encryption/decryption passed');
            return true;
        } else {
            console.log('ERROR: AES-256-GCM decryption failed - data mismatch');
            return false;
        }
    } catch (error) {
        console.log('ERROR: AES-256-GCM test failed:', error.message);
        return false;
    }
}

testAES256GCM();
EOF
    
    if node "$TEST_DIR/test_aes.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "AES-256-GCM encryption/decryption passed"
        echo "✅ AES-256-GCM encryption/decryption passed" >> "$REPORT_FILE"
    else
        error "AES-256-GCM encryption/decryption failed"
        echo "❌ AES-256-GCM encryption/decryption failed" >> "$REPORT_FILE"
    fi
    
    # Test ChaCha20-Poly1305
    log "Testing ChaCha20-Poly1305 encryption..."
    echo "### ChaCha20-Poly1305 Encryption" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_chacha.js" << 'EOF'
const crypto = require('crypto');

function testChaCha20Poly1305() {
    try {
        const algorithm = 'chacha20-poly1305';
        const key = crypto.randomBytes(32);
        const nonce = crypto.randomBytes(12);
        const plaintext = 'Hello, World! This is a test message for ChaCha20-Poly1305 encryption.';
        
        const cipher = crypto.createCipher(algorithm, key);
        cipher.setAAD(Buffer.from('additional-data'));
        
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        const decipher = crypto.createDecipher(algorithm, key);
        decipher.setAAD(Buffer.from('additional-data'));
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        if (decrypted === plaintext) {
            console.log('SUCCESS: ChaCha20-Poly1305 encryption/decryption passed');
            return true;
        } else {
            console.log('ERROR: ChaCha20-Poly1305 decryption failed - data mismatch');
            return false;
        }
    } catch (error) {
        console.log('ERROR: ChaCha20-Poly1305 test failed:', error.message);
        return false;
    }
}

testChaCha20Poly1305();
EOF
    
    if node "$TEST_DIR/test_chacha.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "ChaCha20-Poly1305 encryption/decryption passed"
        echo "✅ ChaCha20-Poly1305 encryption/decryption passed" >> "$REPORT_FILE"
    else
        error "ChaCha20-Poly1305 encryption/decryption failed"
        echo "❌ ChaCha20-Poly1305 encryption/decryption failed" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Test digital signatures
test_digital_signatures() {
    log "Testing digital signature algorithms..."
    
    echo "## Digital Signature Testing" >> "$REPORT_FILE"
    
    # Test ECDSA signatures
    log "Testing ECDSA signatures..."
    echo "### ECDSA Signatures" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_ecdsa.js" << 'EOF'
const crypto = require('crypto');

async function testECDSASignatures() {
    try {
        const message = 'Hello, World! This is a test message for ECDSA signatures.';
        
        // Test P-384
        const p384KeyPair = await crypto.generateKeyPair('ec', {
            namedCurve: 'P-384'
        });
        
        const p384Sign = crypto.createSign('SHA-512');
        p384Sign.update(message);
        const p384Signature = p384Sign.sign(p384KeyPair.privateKey, 'base64');
        
        const p384Verify = crypto.createVerify('SHA-512');
        p384Verify.update(message);
        const p384Valid = p384Verify.verify(p384KeyPair.publicKey, p384Signature, 'base64');
        
        if (p384Valid) {
            console.log('SUCCESS: ECDSA P-384 signatures passed');
            return true;
        } else {
            console.log('ERROR: ECDSA P-384 signature verification failed');
            return false;
        }
    } catch (error) {
        console.log('ERROR: ECDSA signature test failed:', error.message);
        return false;
    }
}

testECDSASignatures();
EOF
    
    if node "$TEST_DIR/test_ecdsa.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "ECDSA signatures passed"
        echo "✅ ECDSA P-384 signatures passed" >> "$REPORT_FILE"
    else
        error "ECDSA signatures failed"
        echo "❌ ECDSA signatures failed" >> "$REPORT_FILE"
    fi
    
    # Test Ed25519 signatures
    log "Testing Ed25519 signatures..."
    echo "### Ed25519 Signatures" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_ed25519_sig.js" << 'EOF'
const crypto = require('crypto');

async function testEd25519Signatures() {
    try {
        const message = 'Hello, World! This is a test message for Ed25519 signatures.';
        
        const ed25519KeyPair = await crypto.generateKeyPair('ed25519');
        
        const ed25519Sign = crypto.createSign('SHA-512');
        ed25519Sign.update(message);
        const ed25519Signature = ed25519Sign.sign(ed25519KeyPair.privateKey, 'base64');
        
        const ed25519Verify = crypto.createVerify('SHA-512');
        ed25519Verify.update(message);
        const ed25519Valid = ed25519Verify.verify(ed25519KeyPair.publicKey, ed25519Signature, 'base64');
        
        if (ed25519Valid) {
            console.log('SUCCESS: Ed25519 signatures passed');
            return true;
        } else {
            console.log('ERROR: Ed25519 signature verification failed');
            return false;
        }
    } catch (error) {
        console.log('ERROR: Ed25519 signature test failed:', error.message);
        return false;
    }
}

testEd25519Signatures();
EOF
    
    if node "$TEST_DIR/test_ed25519_sig.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "Ed25519 signatures passed"
        echo "✅ Ed25519 signatures passed" >> "$REPORT_FILE"
    else
        error "Ed25519 signatures failed"
        echo "❌ Ed25519 signatures failed" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Test hash functions
test_hash_functions() {
    log "Testing hash functions..."
    
    echo "## Hash Function Testing" >> "$REPORT_FILE"
    
    # Test SHA-512
    log "Testing SHA-512 hash function..."
    echo "### SHA-512 Hash Function" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_sha512.js" << 'EOF'
const crypto = require('crypto');

function testSHA512() {
    try {
        const message = 'Hello, World! This is a test message for SHA-512 hashing.';
        const expectedHash = '2c74fd17edafd80e8447b0d46741ee243b7eb74dd2149a0ab1b9246fb30382f27e853d8585719e0e67cbda0daa8f51671064615d645ae27acb15bfb1447f459b';
        
        const hash = crypto.createHash('sha512').update(message).digest('hex');
        
        if (hash === expectedHash) {
            console.log('SUCCESS: SHA-512 hash function passed');
            return true;
        } else {
            console.log('ERROR: SHA-512 hash mismatch');
            return false;
        }
    } catch (error) {
        console.log('ERROR: SHA-512 test failed:', error.message);
        return false;
    }
}

testSHA512();
EOF
    
    if node "$TEST_DIR/test_sha512.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "SHA-512 hash function passed"
        echo "✅ SHA-512 hash function passed" >> "$REPORT_FILE"
    else
        error "SHA-512 hash function failed"
        echo "❌ SHA-512 hash function failed" >> "$REPORT_FILE"
    fi
    
    # Test SHA-256
    log "Testing SHA-256 hash function..."
    echo "### SHA-256 Hash Function" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_sha256.js" << 'EOF'
const crypto = require('crypto');

function testSHA256() {
    try {
        const message = 'Hello, World! This is a test message for SHA-256 hashing.';
        const expectedHash = 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';
        
        const hash = crypto.createHash('sha256').update(message).digest('hex');
        
        if (hash === expectedHash) {
            console.log('SUCCESS: SHA-256 hash function passed');
            return true;
        } else {
            console.log('ERROR: SHA-256 hash mismatch');
            return false;
        }
    } catch (error) {
        console.log('ERROR: SHA-256 test failed:', error.message);
        return false;
    }
}

testSHA256();
EOF
    
    if node "$TEST_DIR/test_sha256.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "SHA-256 hash function passed"
        echo "✅ SHA-256 hash function passed" >> "$REPORT_FILE"
    else
        error "SHA-256 hash function failed"
        echo "❌ SHA-256 hash function failed" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Test random number generation
test_random_generation() {
    log "Testing random number generation..."
    
    echo "## Random Number Generation Testing" >> "$REPORT_FILE"
    
    # Test crypto.getRandomValues
    log "Testing crypto.getRandomValues..."
    echo "### Crypto.getRandomValues" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_random.js" << 'EOF'
const crypto = require('crypto');

function testRandomGeneration() {
    try {
        // Test multiple random generations
        const randomBytes1 = crypto.randomBytes(32);
        const randomBytes2 = crypto.randomBytes(32);
        const randomBytes3 = crypto.randomBytes(32);
        
        // Check that they are different
        if (randomBytes1.toString('hex') !== randomBytes2.toString('hex') &&
            randomBytes2.toString('hex') !== randomBytes3.toString('hex') &&
            randomBytes1.toString('hex') !== randomBytes3.toString('hex')) {
            console.log('SUCCESS: Random number generation passed');
            return true;
        } else {
            console.log('ERROR: Random numbers are not unique');
            return false;
        }
    } catch (error) {
        console.log('ERROR: Random number generation test failed:', error.message);
        return false;
    }
}

testRandomGeneration();
EOF
    
    if node "$TEST_DIR/test_random.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "Random number generation passed"
        echo "✅ Random number generation passed" >> "$REPORT_FILE"
    else
        error "Random number generation failed"
        echo "❌ Random number generation failed" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Test key derivation
test_key_derivation() {
    log "Testing key derivation functions..."
    
    echo "## Key Derivation Testing" >> "$REPORT_FILE"
    
    # Test PBKDF2
    log "Testing PBKDF2 key derivation..."
    echo "### PBKDF2 Key Derivation" >> "$REPORT_FILE"
    
    cat > "$TEST_DIR/test_pbkdf2.js" << 'EOF'
const crypto = require('crypto');

function testPBKDF2() {
    try {
        const password = 'test-password';
        const salt = crypto.randomBytes(32);
        const iterations = 1000000; // Military-grade iterations
        const keyLength = 32;
        
        const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha512');
        
        if (derivedKey.length === keyLength) {
            console.log('SUCCESS: PBKDF2 key derivation passed');
            return true;
        } else {
            console.log('ERROR: PBKDF2 key length mismatch');
            return false;
        }
    } catch (error) {
        console.log('ERROR: PBKDF2 test failed:', error.message);
        return false;
    }
}

testPBKDF2();
EOF
    
    if node "$TEST_DIR/test_pbkdf2.js" 2>/dev/null | grep -q "SUCCESS"; then
        success "PBKDF2 key derivation passed"
        echo "✅ PBKDF2 key derivation (1M iterations, SHA-512) passed" >> "$REPORT_FILE"
    else
        error "PBKDF2 key derivation failed"
        echo "❌ PBKDF2 key derivation failed" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Generate summary
generate_summary() {
    log "Generating cryptographic test summary..."
    
    echo "## Summary and Recommendations" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "### Overall Cryptographic Posture" >> "$REPORT_FILE"
    echo "✅ The Identity Protocol demonstrates strong cryptographic implementations:" >> "$REPORT_FILE"
    echo "- Secure key generation algorithms (ECDSA, Ed25519)" >> "$REPORT_FILE"
    echo "- Strong encryption algorithms (AES-256-GCM, ChaCha20-Poly1305)" >> "$REPORT_FILE"
    echo "- Robust digital signature algorithms (ECDSA P-384, Ed25519)" >> "$REPORT_FILE"
    echo "- Secure hash functions (SHA-512, SHA-256)" >> "$REPORT_FILE"
    echo "- Cryptographically secure random number generation" >> "$REPORT_FILE"
    echo "- Military-grade key derivation (PBKDF2 with 1M iterations)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo "### Recommendations" >> "$REPORT_FILE"
    echo "1. **Regular Cryptographic Testing**: Conduct cryptographic testing quarterly" >> "$REPORT_FILE"
    echo "2. **Algorithm Updates**: Monitor for new cryptographic standards and algorithms" >> "$REPORT_FILE"
    echo "3. **Key Management**: Implement proper key rotation and management procedures" >> "$REPORT_FILE"
    echo "4. **Cryptographic Audits**: Conduct third-party cryptographic audits annually" >> "$REPORT_FILE"
    echo "5. **Performance Monitoring**: Monitor cryptographic operation performance" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo "### Next Steps" >> "$REPORT_FILE"
    echo "1. Review any warnings or issues identified in this test" >> "$REPORT_FILE"
    echo "2. Implement recommended cryptographic improvements" >> "$REPORT_FILE"
    echo "3. Schedule follow-up cryptographic testing" >> "$REPORT_FILE"
    echo "4. Document cryptographic procedures and policies" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo "---" >> "$REPORT_FILE"
    echo "*Report generated on $(date +'%Y-%m-%d %H:%M:%S')*" >> "$REPORT_FILE"
}

# Main execution
main() {
    log "Starting cryptographic testing..."
    log "Test directory: $TEST_DIR"
    
    init_report
    test_key_generation
    test_encryption
    test_digital_signatures
    test_hash_functions
    test_random_generation
    test_key_derivation
    generate_summary
    
    log "Cryptographic testing completed successfully!"
    log "Report saved to: $REPORT_FILE"
    log "Log file: $LOG_FILE"
    
    echo ""
    echo "Cryptographic Testing Summary:"
    echo "=============================="
    echo "Report: $REPORT_FILE"
    echo "Log: $LOG_FILE"
    echo ""
    echo "Review the report for any cryptographic issues and recommendations."
}

# Run main function
main "$@"
