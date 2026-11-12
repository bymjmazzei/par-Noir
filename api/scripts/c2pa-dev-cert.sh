#!/usr/bin/env bash
# Dev-only Pen C2PA signer: a local root CA and an ES256 leaf that meets the C2PA certificate
# profile (a self-signed leaf is rejected by validators). Outside production the API loads
# pen.pem / pen.key as the signer and root.pem as an extra trust anchor.
#
# Usage: bash api/scripts/c2pa-dev-cert.sh [out-dir]   (default: api/.c2pa-dev, gitignored)
set -euo pipefail

OUT="${1:-$(cd "$(dirname "$0")/.." && pwd)/.c2pa-dev}"
mkdir -p "$OUT"
cd "$OUT"

cat > root.cnf <<'EOF'
[req]
distinguished_name=dn
prompt=no
[dn]
CN=par Noir Dev Root
O=par Noir
C=US
[v3_ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
EOF

cat > pen.cnf <<'EOF'
[req]
distinguished_name=dn
prompt=no
[dn]
CN=par Noir Pen Dev Signer
O=par Noir
C=US
[v3_leaf]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=emailProtection
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EOF

openssl ecparam -name prime256v1 -genkey -noout -out root.key 2>/dev/null
openssl req -x509 -new -key root.key -sha256 -days 3650 -config root.cnf -extensions v3_ca -out root.pem
openssl ecparam -name prime256v1 -genkey -noout 2>/dev/null | openssl pkcs8 -topk8 -nocrypt -out pen.key
openssl req -new -key pen.key -config pen.cnf -out pen.csr
openssl x509 -req -in pen.csr -CA root.pem -CAkey root.key -CAcreateserial -days 825 -sha256 \
  -extfile pen.cnf -extensions v3_leaf -out pen.pem 2>/dev/null
rm -f pen.csr root.srl root.cnf pen.cnf
chmod 600 root.key pen.key

echo "Pen C2PA dev signer written to $OUT (pen.pem, pen.key, root.pem)"
