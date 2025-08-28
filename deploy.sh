#!/bin/bash

echo "🚀 Building Par Noir app..."
cd apps/id-dashboard
npm run build

echo "✅ Build complete!"
echo "📁 Built files are in: apps/id-dashboard/dist"
echo ""
echo "🌐 To deploy:"
echo "1. Push to GitHub: git push origin main"
echo "2. GitHub Actions will automatically deploy to: https://pn.parnoir.com"
echo ""
echo "🔧 Or test locally: npx serve apps/id-dashboard/dist"
