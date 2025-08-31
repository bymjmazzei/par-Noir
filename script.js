// Par Noir - Narrative-Driven JavaScript

// Mobile menu functionality
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    const body = document.body;
    
    if (mobileMenu.classList.contains('active')) {
        mobileMenu.classList.remove('active');
        body.style.overflow = 'auto';
    } else {
        mobileMenu.classList.add('active');
        body.style.overflow = 'hidden';
    }
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuToggle = document.querySelector('.nav-mobile-toggle');
    
    if (mobileMenu && !mobileMenu.contains(event.target) && !menuToggle.contains(event.target)) {
        mobileMenu.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Video placeholder interaction
function initializeVideoInteraction() {
    const videoButton = document.querySelector('.video-play-button');
    
    if (videoButton) {
        videoButton.addEventListener('click', () => {
            // For now, just show an alert - replace with actual video modal
            alert('Founder video coming soon! This will open a modal with the story of Par Noir and its connection to the legacy of freedom.');
        });
    }
}

// Enhanced scroll animations for narrative sections
function initializeNarrativeAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.target) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe narrative elements
    document.querySelectorAll('.problem-item, .timeline-item, .carousel-item, .cta-box, .founder-image, .heritage-point').forEach(el => {
        if (el) {
            observer.observe(el);
        }
    });
}

// Master key animation interaction
function initializeMasterKeyInteraction() {
    const keyIcon = document.querySelector('.key-icon');
    const connections = document.querySelectorAll('.connection');
    
    if (keyIcon && connections.length > 0) {
        keyIcon.addEventListener('mouseenter', () => {
            connections.forEach((connection, index) => {
                setTimeout(() => {
                    if (connection) {
                        connection.style.transform = 'scaleX(1.3)';
                        connection.style.opacity = '1';
                    }
                }, index * 100);
            });
        });
        
        keyIcon.addEventListener('mouseleave', () => {
            connections.forEach(connection => {
                if (connection) {
                    connection.style.transform = 'scaleX(1)';
                    connection.style.opacity = '0.3';
                }
            });
        });
    }
}

// Heritage timeline interaction
function initializeHeritageTimeline() {
    const heritagePoints = document.querySelectorAll('.heritage-point');
    
    heritagePoints.forEach((point, index) => {
        if (point) {
            point.addEventListener('mouseenter', () => {
                // Highlight the connection between past and present
                point.style.transform = 'scale(1.05)';
                
                // Add a subtle glow effect
                point.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.1)';
            });
            
            point.addEventListener('mouseleave', () => {
                point.style.transform = 'scale(1)';
                point.style.boxShadow = 'none';
            });
        }
    });
}

// Enhanced navigation with scroll direction detection
function initializeNavigation() {
    const nav = document.querySelector('.site-navigation');
    if (!nav) return; // Exit if navigation doesn't exist
    
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', throttle(() => {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > lastScrollY && currentScrollY > 100) {
            // Scrolling down
            nav.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            nav.style.transform = 'translateY(0)';
        }
        
        // Add class for scroll-based styling
        if (currentScrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
        
        lastScrollY = currentScrollY;
    }, 16));
}

// Intersection Observer for general scroll animations
function initializeScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.target) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    document.querySelectorAll('.feature-card, .protocol-card, .solution-text, .legacy-text').forEach(el => {
        if (el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        }
    });
}

// Add CSS animations for narrative elements
function addNarrativeStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            animation: slideInUp 0.6s ease forwards;
        }
        
        @keyframes slideInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .site-navigation.scrolled {
            background: rgba(0, 0, 0, 0.9);
            backdrop-filter: blur(30px);
        }
        
        .problem-item, .timeline-item, .carousel-item, .cta-box {
            opacity: 0;
            transform: translateY(30px);
            transition: all 0.6s ease;
        }
        
        .problem-item.animate-in, .timeline-item.animate-in, .carousel-item.animate-in, .cta-box.animate-in {
            opacity: 1;
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);
}

// Performance optimization: Throttle function
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}



// Initialize all effects
document.addEventListener('DOMContentLoaded', function() {
    // Add narrative styles first
    addNarrativeStyles();
    
    // Initialize all interactive features
    initializeVideoInteraction();
    initializeNarrativeAnimations();
    initializeMasterKeyInteraction();
    initializeHeritageTimeline();
    
    // Initialize core functionality
    initializeNavigation();
    initializeScrollAnimations();
    
    console.log('Par Noir narrative site initialized');
});

// Add smooth scroll behavior for improved UX
document.documentElement.style.scrollBehavior = 'smooth';