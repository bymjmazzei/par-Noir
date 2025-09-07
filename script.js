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
    const videoIframeContainer = document.getElementById('videoIframeContainer');
    const youtubeVideo = document.getElementById('youtube-video');

    if (videoThumbnail && videoIframeContainer && youtubeVideo) {
        videoThumbnail.addEventListener('click', function() {
            // Hide thumbnail
            videoThumbnail.style.display = 'none';
            
            // Show iframe container
            videoIframeContainer.style.display = 'block';
            
            // Load the YouTube video
            youtubeVideo.src = 'https://www.youtube.com/embed/S9Bpay4hrBM?rel=0&modestbranding=1&showinfo=0&controls=1&autoplay=1&iv_load_policy=3&cc_load_policy=0&fs=1&disablekb=0&enablejsapi=0&origin=https://parnoir.com&widget_referrer=https://parnoir.com';
        });
    }
});

// Mobile menu toggle (if needed)
function toggleMobileMenu() {
    const mobileMenu = document.querySelector('.mobile-menu');
    if (mobileMenu) {
        mobileMenu.classList.toggle('active');
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