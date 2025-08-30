#!/bin/bash

echo "🚀 Building Par Noir app..."
cd apps/id-dashboard
npm run build

echo "✅ Build complete!"
echo ""
echo "📁 Your built files are in: apps/id-dashboard/dist"
echo ""
echo "🌐 To deploy:"
echo "1. Go to any hosting service (Render, Netlify, Vercel, etc.)"
echo "2. Upload the 'dist' folder contents"
echo "3. Point your domain pn.parnoir.com to it"
echo ""
echo "🔧 Test locally: npx serve apps/id-dashboard/dist"
