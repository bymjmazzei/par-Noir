// par Noir Marketing Website Scripts

// Video loading functionality
function loadYouTubeVideo() {
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const youtubeVideo = document.getElementById('youtube-video');
    
    if (videoPlaceholder && youtubeVideo) {
        console.log('Loading video...');
        
        // Hide placeholder completely
        videoPlaceholder.style.display = 'none';
        videoPlaceholder.style.visibility = 'hidden';
        videoPlaceholder.style.opacity = '0';
        
        // Show video
        youtubeVideo.style.display = 'block';
        youtubeVideo.style.visibility = 'visible';
        youtubeVideo.style.opacity = '1';
        
        // Add autoplay to the video URL if not already present
        let videoSrc = youtubeVideo.src;
        if (!videoSrc.includes('autoplay=1')) {
            videoSrc += '&autoplay=1';
            youtubeVideo.src = videoSrc;
        }
        
        console.log('Video loaded:', videoSrc);
        console.log('Placeholder hidden, video shown');
    } else {
        console.error('Video elements not found');
        console.log('Placeholder element:', videoPlaceholder);
        console.log('Video element:', youtubeVideo);
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
                    
                    // Auto-load video after 2 seconds if user hasn't clicked play
                    setTimeout(() => {
                        const placeholder = document.getElementById('videoPlaceholder');
                        if (placeholder && placeholder.style.display !== 'none') {
                            console.log('Auto-loading video...');
                            loadYouTubeVideo();
                        }
                    }, 2000);
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
