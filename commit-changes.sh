#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")"

# Add the modified script.js file
git add script.js

# Commit with a descriptive message
git commit -m "Fix mobile hamburger menu toggle function

- Updated toggleMobileMenu() to use getElementById('mobileMenu') instead of querySelector('.mobile-menu')
- This fixes the mobile menu not opening when hamburger button is clicked
- Affects all pages: index.html, developer-portal.html, whitepaper.html"

# Push to GitHub
git push

echo "Changes committed and pushed successfully!"
