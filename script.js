// par Noir Marketing Website Scripts

document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for in-page anchors (offset for fixed nav)
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    const navOffset = 72;

    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;

            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            if (!targetElement) return;

            e.preventDefault();
            const top = targetElement.getBoundingClientRect().top + window.pageYOffset - navOffset;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });

    // Custom video player
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoPlayerContainer = document.getElementById('videoPlayerContainer');
    const mainVideo = document.getElementById('mainVideo');
    const videoPreview = document.getElementById('videoPreview');

    if (videoThumbnail && videoPlayerContainer && mainVideo && videoPreview) {
        videoPreview.currentTime = 0;

        videoThumbnail.addEventListener('click', function() {
            videoThumbnail.style.display = 'none';
            videoPlayerContainer.style.display = 'block';
            mainVideo.play().catch(function() {
                // Autoplay blocked — controls remain available
            });
        });
    }

    // FAQ tabs
    const faqTabs = document.querySelectorAll('.faq-tab');
    const faqTabContents = document.querySelectorAll('.faq-tab-content');

    faqTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');

            faqTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            faqTabContents.forEach(content => {
                content.classList.remove('active');
            });

            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // FAQ accordion (one open item per tab)
    const faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(question => {
        question.addEventListener('click', function() {
            const faqItem = this.closest('.faq-item');
            const isActive = faqItem.classList.contains('active');
            const currentTab = faqItem.closest('.faq-tab-content');
            if (!currentTab) return;

            currentTab.querySelectorAll('.faq-item').forEach(item => {
                if (item !== faqItem) item.classList.remove('active');
            });

            if (isActive) {
                faqItem.classList.remove('active');
            } else {
                faqItem.classList.add('active');
            }
        });
    });
});

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) {
        mobileMenu.classList.toggle('active');
    }
}
