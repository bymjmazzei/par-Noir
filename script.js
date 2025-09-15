// par Noir Marketing Website Scripts

// Smooth scrolling for anchor links
document.addEventListener('DOMContentLoaded', function() {
    // Handle smooth scrolling for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');

    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Custom video player functionality
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoPlayerContainer = document.getElementById('videoPlayerContainer');
    const mainVideo = document.getElementById('mainVideo');
    const videoPreview = document.getElementById('videoPreview');

    if (videoThumbnail && videoPlayerContainer && mainVideo && videoPreview) {
        // Set preview video to show first frame
        videoPreview.currentTime = 0;
        
        videoThumbnail.addEventListener('click', function() {
            // Hide thumbnail
            videoThumbnail.style.display = 'none';
            
            // Show video player container
            videoPlayerContainer.style.display = 'block';
            
            // Play the main video
            mainVideo.play().catch(function(error) {
                console.log('Autoplay prevented:', error);
                // If autoplay fails, user can click play manually
            });
        });
    }
});

// Mobile menu toggle - FIXED VERSION
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) {
        mobileMenu.classList.toggle('active');
        console.log('Mobile menu toggled!'); // Debug log
    }
}

// Theme toggle (if needed)
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
}

// Load saved theme
document.addEventListener('DOMContentLoaded', function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
});

// YouTube video loading function (referenced in HTML)
function loadYouTubeVideo() {
    // This function is called from the "WATCH THE STORY" button
    // The actual video loading is handled by the custom video player
    const videoThumbnail = document.getElementById('videoThumbnail');
    if (videoThumbnail) {
        videoThumbnail.click();
    }
}