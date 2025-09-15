// Quick fix for mobile menu - run this in browser console on parnoir.com
function fixMobileMenu() {
    // Override the broken function with the correct one
    window.toggleMobileMenu = function() {
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu) {
            mobileMenu.classList.toggle('active');
        }
    };
    console.log('Mobile menu fix applied!');
}

// Apply the fix immediately
fixMobileMenu();
