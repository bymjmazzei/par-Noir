// par Noir Marketing Website Scripts

document.addEventListener('DOMContentLoaded', function() {
    const navOffset = 72;

    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;

            const targetElement = document.getElementById(href.substring(1));
            if (!targetElement) return;

            e.preventDefault();
            const top = targetElement.getBoundingClientRect().top + window.pageYOffset - navOffset;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });

    const faqTabs = document.querySelectorAll('.faq-tab');
    const faqTabContents = document.querySelectorAll('.faq-tab-content');

    faqTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');

            faqTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            faqTabContents.forEach(content => content.classList.remove('active'));

            const targetContent = document.getElementById(targetTab);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', function() {
            const faqItem = this.closest('.faq-item');
            const isActive = faqItem.classList.contains('active');
            const currentTab = faqItem.closest('.faq-tab-content');
            if (!currentTab) return;

            currentTab.querySelectorAll('.faq-item').forEach(item => {
                if (item !== faqItem) item.classList.remove('active');
            });

            faqItem.classList.toggle('active', !isActive);
        });
    });

    document.querySelectorAll('.compare-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const item = this.closest('.compare-item');
            const panel = item && item.querySelector('.compare-panel');
            if (!item || !panel) return;

            const willOpen = !item.classList.contains('is-open');

            document.querySelectorAll('.compare-item.is-open').forEach(openItem => {
                if (openItem === item) return;
                openItem.classList.remove('is-open');
                const openToggle = openItem.querySelector('.compare-toggle');
                const openPanel = openItem.querySelector('.compare-panel');
                if (openToggle) openToggle.setAttribute('aria-expanded', 'false');
                if (openPanel) openPanel.hidden = true;
            });

            item.classList.toggle('is-open', willOpen);
            this.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            panel.hidden = !willOpen;
        });
    });

    const revealItems = document.querySelectorAll('.step-card, .compare-item');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
        revealItems.forEach(item => item.classList.add('is-visible'));
    } else {
        revealItems.forEach(item => item.classList.add('scroll-reveal'));

        const revealObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                });
            },
            {
                threshold: 0.35,
                rootMargin: '0px 0px -12% 0px'
            }
        );

        revealItems.forEach(item => revealObserver.observe(item));
    }
});

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) mobileMenu.classList.toggle('active');
}
