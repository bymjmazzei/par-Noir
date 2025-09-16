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

// Mobile menu toggle
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
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

// FAQ Tab Functionality
document.addEventListener('DOMContentLoaded', function() {
    const faqTabs = document.querySelectorAll('.faq-tab');
    const faqTabContents = document.querySelectorAll('.faq-tab-content');

    faqTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Remove active class from all tabs
            faqTabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Hide all tab contents
            faqTabContents.forEach(content => {
                content.classList.remove('active');
            });
            
            // Show target tab content
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // FAQ Collapsible Functionality
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', function() {
            const faqItem = this.closest('.faq-item');
            const isActive = faqItem.classList.contains('active');
            
            // Close all other FAQ items in the same tab
            const currentTab = faqItem.closest('.faq-tab-content');
            const allItemsInTab = currentTab.querySelectorAll('.faq-item');
            allItemsInTab.forEach(item => {
                if (item !== faqItem) {
                    item.classList.remove('active');
                }
            });
            
            // Toggle current item
            if (isActive) {
                faqItem.classList.remove('active');
            } else {
                faqItem.classList.add('active');
            }
        });
    });
});