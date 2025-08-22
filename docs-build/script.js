// Documentation Site JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all functionality
    initSidebar();
    initSearch();
    initCopyButtons();
    initSmoothScrolling();
    initActiveNavigation();
    initMobileToggle();
});

// Sidebar functionality
function initSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('open');
        });
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 1024) {
            if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        }
    });
}

// Search functionality
function initSearch() {
    const searchInput = document.getElementById('search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            const text = link.textContent.toLowerCase();
            const section = link.closest('.nav-section');
            
            if (text.includes(query)) {
                link.style.display = 'block';
                section.style.display = 'block';
            } else {
                link.style.display = 'none';
                // Hide section if no visible links
                const visibleLinks = section.querySelectorAll('.nav-link[style="display: block"]');
                if (visibleLinks.length === 0) {
                    section.style.display = 'none';
                }
            }
        });
        
        // Show all sections if search is empty
        if (query === '') {
            navLinks.forEach(link => {
                link.style.display = 'block';
                link.closest('.nav-section').style.display = 'block';
            });
        }
    });
}

// Copy button functionality
function initCopyButtons() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('copy-btn')) {
            const codeBlock = e.target.closest('.code-block');
            const code = codeBlock.querySelector('code');
            const text = code.textContent;
            
            copyToClipboard(text).then(() => {
                // Show success feedback
                const originalText = e.target.textContent;
                e.target.textContent = 'Copied!';
                e.target.style.background = '#059669';
                
                setTimeout(() => {
                    e.target.textContent = originalText;
                    e.target.style.background = '';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                e.target.textContent = 'Failed';
                e.target.style.background = '#dc2626';
                
                setTimeout(() => {
                    e.target.textContent = 'Copy';
                    e.target.style.background = '';
                }, 2000);
            });
        }
    });
}

// Copy to clipboard utility
async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        return new Promise((resolve, reject) => {
            document.execCommand('copy') ? resolve() : reject();
            textArea.remove();
        });
    }
}

// Smooth scrolling for navigation links
function initSmoothScrolling() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                
                if (target) {
                    const headerHeight = document.querySelector('.content-header').offsetHeight;
                    const targetPosition = target.offsetTop - headerHeight - 20;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Update active navigation
                    updateActiveNavigation(href);
                    
                    // Close mobile sidebar
                    if (window.innerWidth <= 1024) {
                        document.querySelector('.sidebar').classList.remove('open');
                    }
                }
            }
        });
    });
}

// Active navigation highlighting
function initActiveNavigation() {
    const sections = document.querySelectorAll('.doc-section');
    const navLinks = document.querySelectorAll('.nav-link');
    
    function updateActiveNav() {
        const scrollPosition = window.scrollY + 100;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.id;
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                // Remove active class from all links
                navLinks.forEach(link => link.classList.remove('active'));
                
                // Add active class to current section link
                const activeLink = document.querySelector(`[href="#${sectionId}"]`);
                if (activeLink) {
                    activeLink.classList.add('active');
                }
            }
        });
    }
    
    // Update on scroll
    window.addEventListener('scroll', updateActiveNav);
    
    // Initial update
    updateActiveNav();
}

function updateActiveNavigation(sectionId) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));
    
    const activeLink = document.querySelector(`[href="${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// Mobile toggle functionality
function initMobileToggle() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebarToggle && sidebar) {
        // Handle escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', function() {
            if (window.innerWidth > 1024) {
                sidebar.classList.remove('open');
            }
        });
    }
}

// Syntax highlighting enhancement
function enhanceCodeBlocks() {
    const codeBlocks = document.querySelectorAll('pre code');
    
    codeBlocks.forEach(block => {
        // Add line numbers for longer code blocks
        if (block.textContent.split('\n').length > 5) {
            const lines = block.textContent.split('\n');
            const numberedLines = lines.map((line, index) => 
                `<span class="line-number">${index + 1}</span>${line}`
            ).join('\n');
            block.innerHTML = numberedLines;
        }
    });
}

// Initialize code enhancement
document.addEventListener('DOMContentLoaded', enhanceCodeBlocks);

// Performance optimization: Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debouncing to scroll events
const debouncedScrollHandler = debounce(function() {
    // This will be called by the scroll event listener
}, 10);

// Add scroll event listener with debouncing
window.addEventListener('scroll', debouncedScrollHandler);

// Keyboard navigation for accessibility
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.focus();
        }
    }
    
    // Ctrl/Cmd + / to toggle sidebar on mobile
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && window.innerWidth <= 1024) {
            sidebar.classList.toggle('open');
        }
    }
});

// Add loading states for better UX
function addLoadingStates() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            if (this.href && this.href.startsWith('http')) {
                // External link - add loading state
                const originalText = this.textContent;
                this.textContent = 'Loading...';
                this.style.opacity = '0.7';
                
                setTimeout(() => {
                    this.textContent = originalText;
                    this.style.opacity = '1';
                }, 1000);
            }
        });
    });
}

// Initialize loading states
document.addEventListener('DOMContentLoaded', addLoadingStates);

// Add tooltips for better UX
function addTooltips() {
    const copyButtons = document.querySelectorAll('.copy-btn');
    
    copyButtons.forEach(button => {
        button.title = 'Copy to clipboard';
    });
    
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    
    externalLinks.forEach(link => {
        if (!link.title) {
            link.title = 'Opens in new tab';
        }
    });
}

// Initialize tooltips
document.addEventListener('DOMContentLoaded', addTooltips);

// Analytics tracking (if needed)
function trackPageView() {
    // Add analytics tracking here if needed
    console.log('Documentation page viewed');
}

// Track page view on load
document.addEventListener('DOMContentLoaded', trackPageView);
