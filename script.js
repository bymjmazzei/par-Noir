// Par Noir - Narrative-Driven JavaScript

// Mobile menu functionality
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    mobileMenu.classList.toggle('active');
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuToggle = document.querySelector('.nav-menu-toggle');
    
    if (mobileMenu && !mobileMenu.contains(event.target) && !menuToggle.contains(event.target)) {
        mobileMenu.classList.remove('active');
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
    document.querySelectorAll('.problem-item, .timeline-item, .cta-box, .founder-image, .heritage-point').forEach(el => {
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

// Parallax effect for background (now static but keeping function for potential future use)
function initializeParallax() {
    // Background remains static - no movement
    // This function is kept for potential future enhancements
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

// Subtle mouse trail effect (reduced from previous version)
function initializeMouseTrail() {
    const trail = [];
    const maxTrailLength = 10;
    
    document.addEventListener('mousemove', throttle((e) => {
        const particle = document.createElement('div');
        particle.style.position = 'fixed';
        particle.style.left = e.clientX + 'px';
        particle.style.top = e.clientY + 'px';
        particle.style.width = '1px';
        particle.style.height = '1px';
        particle.style.background = 'rgba(255, 255, 255, 0.2)';
        particle.style.borderRadius = '50%';
        particle.style.pointerEvents = 'none';
        particle.style.zIndex = '9999';
        particle.style.transition = 'opacity 0.3s ease';
        
        document.body.appendChild(particle);
        trail.push(particle);
        
        // Remove old particles
        if (trail.length > maxTrailLength) {
            const oldParticle = trail.shift();
            oldParticle.style.opacity = '0';
            setTimeout(() => {
                if (oldParticle.parentNode) {
                    oldParticle.parentNode.removeChild(oldParticle);
                }
            }, 300);
        }
        
        // Fade out particles
        setTimeout(() => {
            particle.style.opacity = '0';
        }, 50);
    }, 50));
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
        
        .problem-item, .timeline-item, .cta-box {
            opacity: 0;
            transform: translateY(30px);
            transition: all 0.6s ease;
        }
        
        .problem-item.animate-in, .timeline-item.animate-in, .cta-box.animate-in {
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
    initializeParallax();
    initializeNavigation();
    initializeScrollAnimations();
    initializeMouseTrail();
    
    // Initialize carousel based on window size
    checkWindowSize();
    
    // Listen for window resize
    window.addEventListener('resize', checkWindowSize);
    
    console.log('Par Noir narrative site initialized');
});

// Add smooth scroll behavior for improved UX
document.documentElement.style.scrollBehavior = 'smooth';

// Mobile menu toggle function
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

// Dynamic carousel functionality based on window width
let currentSlide = 0;
let currentVisionSlide = 0;
let currentCTASlide = 0;
let isCarouselMode = false;
let isVisionCarouselMode = false;
let isCTACarouselMode = false;

const slides = document.querySelectorAll('.problem-item');
const visionSlides = document.querySelectorAll('.timeline-item');
const ctaSlides = document.querySelectorAll('.cta-box');

const dots = document.querySelectorAll('.problem-carousel .dot');
const visionDots = document.querySelectorAll('.vision-carousel .dot');
const ctaDots = document.querySelectorAll('.cta-carousel .dot');

const carouselBtns = document.querySelectorAll('.carousel-btn');
const carouselDots = document.querySelector('.carousel-dots');
const problemGrid = document.querySelector('.problem-grid');
const visionGrid = document.querySelector('.vision-timeline');
const ctaGrid = document.querySelector('.cta-grid');

function checkWindowSize() {
    const windowWidth = window.innerWidth;
    const problemContainerWidth = problemGrid ? problemGrid.offsetWidth : 0;
    const visionContainerWidth = visionGrid ? visionGrid.offsetWidth : 0;
    const ctaContainerWidth = ctaGrid ? ctaGrid.offsetWidth : 0;
    
    // Switch to carousel mode if window is narrow or content would be cramped
    const shouldUseCarousel = windowWidth < 800 || (problemContainerWidth > 0 && problemContainerWidth < 600);
    const shouldUseVisionCarousel = windowWidth < 800 || (visionContainerWidth > 0 && visionContainerWidth < 600);
    const shouldUseCTACarousel = windowWidth < 800 || (ctaContainerWidth > 0 && ctaContainerWidth < 600);
    
    // Problem carousel
    if (shouldUseCarousel && !isCarouselMode) {
        enableCarouselMode();
    } else if (!shouldUseCarousel && isCarouselMode) {
        disableCarouselMode();
    }
    
    // Vision carousel
    if (shouldUseVisionCarousel && !isVisionCarouselMode) {
        enableVisionCarouselMode();
    } else if (!shouldUseVisionCarousel && isVisionCarouselMode) {
        disableVisionCarouselMode();
    }
    
    // CTA carousel
    if (shouldUseCTACarousel && !isCTACarouselMode) {
        enableCTACarouselMode();
    } else if (!shouldUseCTACarousel && isCTACarouselMode) {
        disableCTACarouselMode();
    }
}

function enableCarouselMode() {
    isCarouselMode = true;
    
    // Show carousel elements
    carouselBtns.forEach(btn => btn.style.display = 'flex');
    if (carouselDots) carouselDots.style.display = 'flex';
    
    // Add carousel classes
    if (problemGrid) problemGrid.classList.add('carousel-mode');
    slides.forEach(slide => slide.classList.add('carousel-mode'));
    
    // Show first slide
    showSlide(0);
}

function disableCarouselMode() {
    isCarouselMode = false;
    
    // Hide carousel elements
    carouselBtns.forEach(btn => btn.style.display = 'none');
    if (carouselDots) carouselDots.style.display = 'none';
    
    // Remove carousel classes
    if (problemGrid) problemGrid.classList.remove('carousel-mode');
    slides.forEach(slide => {
        slide.classList.remove('carousel-mode');
        slide.style.display = 'block';
    });
    
    // Reset dots
    dots.forEach(dot => dot.classList.remove('active'));
}

function enableVisionCarouselMode() {
    isVisionCarouselMode = true;
    
    // Add carousel classes
    if (visionGrid) visionGrid.classList.add('carousel-mode');
    visionSlides.forEach(slide => slide.classList.add('carousel-mode'));
    
    // Show first slide
    showVisionSlide(0);
}

function disableVisionCarouselMode() {
    isVisionCarouselMode = false;
    
    // Remove carousel classes
    if (visionGrid) visionGrid.classList.remove('carousel-mode');
    visionSlides.forEach(slide => {
        slide.classList.remove('carousel-mode');
        slide.style.display = 'block';
    });
    
    // Reset dots
    visionDots.forEach(dot => dot.classList.remove('active'));
}

function enableCTACarouselMode() {
    isCTACarouselMode = true;
    
    // Add carousel classes
    if (ctaGrid) ctaGrid.classList.add('carousel-mode');
    ctaSlides.forEach(slide => slide.classList.add('carousel-mode'));
    
    // Show first slide
    showCTASlide(0);
}

function disableCTACarouselMode() {
    isCTACarouselMode = false;
    
    // Remove carousel classes
    if (ctaGrid) ctaGrid.classList.remove('carousel-mode');
    ctaSlides.forEach(slide => {
        slide.classList.remove('carousel-mode');
        slide.style.display = 'block';
    });
    
    // Reset dots
    ctaDots.forEach(dot => dot.classList.remove('active'));
}

function showSlide(n) {
    if (!isCarouselMode) return;
    
    // Hide all slides
    for (let i = 0; i < slides.length; i++) {
        slides[i].style.display = 'none';
        if (dots[i]) dots[i].classList.remove('active');
    }
    
    // Show current slide
    if (slides[n]) {
        slides[n].style.display = 'block';
        if (dots[n]) dots[n].classList.add('active');
    }
    
    currentSlide = n;
}

function moveCarousel(direction) {
    if (!isCarouselMode) return;
    
    let newSlide = currentSlide + direction;
    
    if (newSlide >= slides.length) {
        newSlide = 0;
    } else if (newSlide < 0) {
        newSlide = slides.length - 1;
    }
    
    showSlide(newSlide);
}

function goToSlide(n) {
    if (!isCarouselMode) return;
    showSlide(n);
}

// Vision carousel functions
function showVisionSlide(n) {
    if (!isVisionCarouselMode) return;
    
    // Hide all slides
    for (let i = 0; i < visionSlides.length; i++) {
        visionSlides[i].style.display = 'none';
        if (visionDots[i]) visionDots[i].classList.remove('active');
    }
    
    // Show current slide
    if (visionSlides[n]) {
        visionSlides[n].style.display = 'block';
        if (visionDots[n]) visionDots[n].classList.add('active');
    }
    
    currentVisionSlide = n;
}

function moveVisionCarousel(direction) {
    if (!isVisionCarouselMode) return;
    
    let newSlide = currentVisionSlide + direction;
    
    if (newSlide >= visionSlides.length) {
        newSlide = 0;
    } else if (newSlide < 0) {
        newSlide = visionSlides.length - 1;
    }
    
    showVisionSlide(newSlide);
}

function goToVisionSlide(n) {
    if (!isVisionCarouselMode) return;
    showVisionSlide(n);
}

// CTA carousel functions
function showCTASlide(n) {
    if (!isCTACarouselMode) return;
    
    // Hide all slides
    for (let i = 0; i < ctaSlides.length; i++) {
        ctaSlides[i].style.display = 'none';
        if (ctaDots[i]) ctaDots[i].classList.remove('active');
    }
    
    // Show current slide
    if (ctaSlides[n]) {
        ctaSlides[n].style.display = 'block';
        if (ctaDots[n]) ctaDots[n].classList.add('active');
    }
    
    currentCTASlide = n;
}

function moveCTACarousel(direction) {
    if (!isCTACarouselMode) return;
    
    let newSlide = currentCTASlide + direction;
    
    if (newSlide >= ctaSlides.length) {
        newSlide = 0;
    } else if (newSlide < 0) {
        newSlide = ctaSlides.length - 1;
    }
    
    showCTASlide(newSlide);
}

function goToCTASlide(n) {
    if (!isCTACarouselMode) return;
    showCTASlide(n);
}