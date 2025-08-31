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
    const menuToggle = document.querySelector('.nav-menu-toggle');
    
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
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe narrative elements
    document.querySelectorAll('.problem-item, .timeline-item, .carousel-item, .cta-box, .founder-image, .heritage-point').forEach(el => {
        observer.observe(el);
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
                    connection.style.transform = 'scaleX(1.3)';
                    connection.style.opacity = '1';
                }, index * 100);
            });
        });
        
        keyIcon.addEventListener('mouseleave', () => {
            connections.forEach(connection => {
                connection.style.transform = 'scaleX(1)';
                connection.style.opacity = '0.3';
            });
        });
    }
}

// Heritage timeline interaction
function initializeHeritageTimeline() {
    const heritagePoints = document.querySelectorAll('.heritage-point');
    
    heritagePoints.forEach((point, index) => {
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
    });
}

// Enhanced navigation with scroll direction detection
function initializeNavigation() {
    const nav = document.querySelector('.nav');
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
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    document.querySelectorAll('.feature-card, .protocol-card, .solution-text, .legacy-text').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
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
        
        .nav.scrolled {
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

// Universal Carousel System
class CarouselManager {
    constructor() {
        this.carousels = new Map();
        this.breakpoint = 768; // Switch to carousel mode below this width
        this.init();
    }

    init() {
        this.initializeCarousels();
        this.checkWindowSize();
        window.addEventListener('resize', this.throttle(() => this.checkWindowSize(), 100));
    }

    initializeCarousels() {
        console.log('Initializing carousels...');
        
        // Problem section carousel
        const problemGrid = document.querySelector('.problem-grid');
        const problemItems = document.querySelectorAll('.problem-item');
        const problemDots = document.querySelectorAll('.problem-carousel .dot');
        
        console.log('Problem section:', {
            grid: problemGrid,
            items: problemItems.length,
            dots: problemDots.length
        });
        
        if (problemGrid && problemItems.length > 0) {
            this.carousels.set('problem', {
                grid: problemGrid,
                items: Array.from(problemItems),
                dots: Array.from(problemDots),
                currentSlide: 0,
                isCarouselMode: false
            });
            console.log('Problem carousel initialized');
        }

        // Vision section carousel
        const visionTimeline = document.querySelector('.vision-timeline');
        const timelineItems = document.querySelectorAll('.timeline-item');
        const visionDots = document.querySelectorAll('.vision-carousel .dot');
        
        console.log('Vision section:', {
            timeline: visionTimeline,
            items: timelineItems.length,
            dots: visionDots.length
        });
        
        if (visionTimeline && timelineItems.length > 0) {
            this.carousels.set('vision', {
                grid: visionTimeline,
                items: Array.from(timelineItems),
                dots: Array.from(visionDots),
                currentSlide: 0,
                isCarouselMode: false
            });
            console.log('Vision carousel initialized');
        }

        // Features section carousel
        const featuresGrid = document.querySelector('.carousel-grid[data-carousel-id="features"]');
        const featuresItems = document.querySelectorAll('.carousel-grid[data-carousel-id="features"] .carousel-item');
        const featuresDots = document.querySelectorAll('.carousel-widget[data-carousel-id="features"] .dot');
        
        if (featuresGrid && featuresItems.length > 0) {
            this.carousels.set('features', {
                grid: featuresGrid,
                items: Array.from(featuresItems),
                dots: Array.from(featuresDots),
                currentSlide: 0,
                isCarouselMode: false
            });
        }

        // CTA section carousel
        const ctaGrid = document.querySelector('.carousel-grid[data-carousel-id="cta"]');
        const ctaItems = document.querySelectorAll('.carousel-grid[data-carousel-id="cta"] .carousel-item');
        const ctaDots = document.querySelectorAll('.carousel-widget[data-carousel-id="cta"] .dot');
        
        if (ctaGrid && ctaItems.length > 0) {
            this.carousels.set('cta', {
                grid: ctaGrid,
                items: Array.from(ctaItems),
                dots: Array.from(ctaDots),
                currentSlide: 0,
                isCarouselMode: false
            });
        }

        // Set up dot click handlers
        this.setupDotHandlers();
    }

    setupDotHandlers() {
        // Problem dots
        document.querySelectorAll('.problem-carousel .dot').forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide('problem', index));
        });

        // Vision dots
        document.querySelectorAll('.vision-carousel .dot').forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide('vision', index));
        });

        // Features dots
        document.querySelectorAll('.carousel-widget[data-carousel-id="features"] .dot').forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide('features', index));
        });

        // CTA dots
        document.querySelectorAll('.carousel-widget[data-carousel-id="cta"] .dot').forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide('cta', index));
        });
    }

    checkWindowSize() {
        const windowWidth = window.innerWidth;
        const shouldUseCarousel = windowWidth < this.breakpoint;
        
        console.log('Window width:', windowWidth, 'Should use carousel:', shouldUseCarousel);

        this.carousels.forEach((carousel, id) => {
            console.log(`Checking carousel ${id}:`, carousel.isCarouselMode);
            if (shouldUseCarousel && !carousel.isCarouselMode) {
                console.log(`Enabling carousel mode for ${id}`);
                this.enableCarouselMode(id);
            } else if (!shouldUseCarousel && carousel.isCarouselMode) {
                console.log(`Disabling carousel mode for ${id}`);
                this.disableCarouselMode(id);
            }
        });
    }

    enableCarouselMode(carouselId) {
        const carousel = this.carousels.get(carouselId);
        if (!carousel) return;

        carousel.isCarouselMode = true;
        carousel.grid.classList.add('carousel-mode');
        carousel.items.forEach(item => item.classList.add('carousel-mode'));
        
        this.showSlide(carouselId, 0);
    }

    disableCarouselMode(carouselId) {
        const carousel = this.carousels.get(carouselId);
        if (!carousel) return;

        carousel.isCarouselMode = false;
        carousel.grid.classList.remove('carousel-mode');
        carousel.items.forEach(item => {
            item.classList.remove('carousel-mode');
            item.style.display = 'block';
        });
        
        carousel.dots.forEach(dot => dot.classList.remove('active'));
    }

    showSlide(carouselId, slideIndex) {
        const carousel = this.carousels.get(carouselId);
        if (!carousel || !carousel.isCarouselMode) return;

        // Hide all slides
        carousel.items.forEach((item, index) => {
            item.style.display = 'none';
            if (carousel.dots[index]) carousel.dots[index].classList.remove('active');
        });

        // Show current slide
        if (carousel.items[slideIndex]) {
            carousel.items[slideIndex].style.display = 'block';
            if (carousel.dots[slideIndex]) carousel.dots[slideIndex].classList.add('active');
        }

        carousel.currentSlide = slideIndex;
    }

    goToSlide(carouselId, slideIndex) {
        this.showSlide(carouselId, slideIndex);
    }

    throttle(func, limit) {
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
}

// Global carousel manager instance
let carouselManager;

// Initialize all effects
document.addEventListener('DOMContentLoaded', function() {
    // Add narrative styles first
    addNarrativeStyles();
    
    // Initialize carousel system
    carouselManager = new CarouselManager();
    
    // Initialize all interactive features
    initializeVideoInteraction();
    initializeNarrativeAnimations();
    initializeMasterKeyInteraction();
    initializeHeritageTimeline();
    
    // Initialize core functionality
    initializeNavigation();
    initializeScrollAnimations();
    
    console.log('Par Noir narrative site initialized with carousel system');
});

// Add smooth scroll behavior for improved UX
document.documentElement.style.scrollBehavior = 'smooth';

// Global functions for dot clicks (for backward compatibility)
function goToSlide(carouselId, n) {
    if (carouselManager) {
        carouselManager.goToSlide(carouselId, n);
    }
}

function goToVisionSlide(n) {
    if (carouselManager) {
        carouselManager.goToSlide('vision', n);
    }
}