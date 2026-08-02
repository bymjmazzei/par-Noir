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

    initScrollStories();
});

function initScrollStories() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stories = document.querySelectorAll('.scroll-story');

    if (reduceMotion) {
        stories.forEach(story => {
            story.querySelectorAll('[data-story-panel]').forEach(panel => {
                panel.classList.add('is-active');
            });
        });
        return;
    }

    stories.forEach(story => {
        const pin = story.querySelector('.scroll-story-pin');
        const panels = Array.from(story.querySelectorAll('[data-story-panel]'));
        const dots = Array.from(story.querySelectorAll('[data-story-goto]'));
        if (!pin || panels.length === 0) return;

        let activeIndex = 0;

        const setActive = (index) => {
            const next = Math.max(0, Math.min(panels.length - 1, index));
            if (next === activeIndex && panels[next].classList.contains('is-active')) return;
            activeIndex = next;

            panels.forEach((panel, i) => {
                const on = i === activeIndex;
                panel.classList.toggle('is-active', on);
                if (!on && panel.classList.contains('is-open')) {
                    panel.classList.remove('is-open');
                    const toggle = panel.querySelector('.compare-toggle');
                    const detail = panel.querySelector('.compare-panel');
                    if (toggle) toggle.setAttribute('aria-expanded', 'false');
                    if (detail) detail.hidden = true;
                }
            });

            dots.forEach((dot, i) => {
                dot.classList.toggle('is-active', i === activeIndex);
            });
        };

        const updateFromScroll = () => {
            const rect = pin.getBoundingClientRect();
            const travel = pin.offsetHeight - window.innerHeight;
            if (travel <= 0) {
                setActive(0);
                return;
            }
            const scrolled = Math.min(Math.max(-rect.top, 0), travel);
            const progress = scrolled / travel;
            const index = Math.min(
                panels.length - 1,
                Math.floor(progress * panels.length)
            );
            setActive(index);
        };

        dots.forEach(dot => {
            dot.addEventListener('click', () => {
                const index = Number(dot.getAttribute('data-story-goto'));
                if (Number.isNaN(index)) return;
                const travel = pin.offsetHeight - window.innerHeight;
                const target =
                    pin.getBoundingClientRect().top +
                    window.pageYOffset +
                    (travel * (index + 0.5)) / panels.length;
                window.scrollTo({ top: target - 1, behavior: 'smooth' });
            });
        });

        window.addEventListener('scroll', updateFromScroll, { passive: true });
        window.addEventListener('resize', updateFromScroll);
        setActive(0);
        updateFromScroll();
    });
}

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) mobileMenu.classList.toggle('active');
}
