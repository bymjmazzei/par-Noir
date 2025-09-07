// par Noir Marketing Website Scripts

// Video loading functionality
function loadYouTubeVideo() {
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const youtubeVideo = document.getElementById('youtube-video');
    
    if (videoPlaceholder && youtubeVideo) {
        // Hide placeholder and show video
        videoPlaceholder.style.display = 'none';
        youtubeVideo.style.display = 'block';
        
        // Load the video
        youtubeVideo.src = youtubeVideo.src + '&autoplay=1';
    }
}

// Smooth scrolling for anchor links
document.addEventListener('DOMContentLoaded', function() {
    // Handle smooth scrolling for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Skip if it's the video link (handled by loadYouTubeVideo)
            if (href === '#video') {
                return;
            }
            
            e.preventDefault();
            
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Initialize video container
    const videoContainer = document.getElementById('video');
    if (videoContainer) {
        // Set up intersection observer for lazy loading
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Video container is visible, can load video if needed
                    console.log('Video container is visible');
                }
            });
        });
        
        observer.observe(videoContainer);
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
