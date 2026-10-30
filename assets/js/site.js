/* ==================================================================
   On The Go Films: site-wide behaviour (all pages)
   - Fixed header: solid background once the page scrolls
   - Phone/tablet menu
   - Dark / light theme toggle (dark by default, remembered)
   - Works page tabs (works.html#india-long-formats, #india-commercials, #japan-long-formats, #japan-shorts)
   - Remembers which CTA led to the contact page (read by enquiry.js)
================================================================== */
(function () {
    'use strict';

    var root = document.documentElement;
    var header = document.getElementById('site-header');

    /* ---------- header: solid once scrolled ---------- */
    if (header) {
        var onScroll = function () {
            header.classList.toggle('is-scrolled', window.scrollY > 24);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ---------- phone / tablet menu ---------- */
    var burger = document.querySelector('.otg-burger');
    var mnav = document.getElementById('otg-mnav');
    function setMenu(open) {
        if (!burger || !mnav) return;
        mnav.hidden = !open;
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        header.classList.toggle('is-menu-open', open);
        // Keep the page behind the menu still
        var sm = window.ScrollSmoother && window.ScrollSmoother.get && window.ScrollSmoother.get();
        if (sm) sm.paused(open);
    }
    if (burger && mnav) {
        burger.addEventListener('click', function () { setMenu(mnav.hidden); });
        mnav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !mnav.hidden) { setMenu(false); burger.focus(); }
        });
        document.addEventListener('click', function (e) {
            if (!mnav.hidden && !header.contains(e.target)) setMenu(false);
        });
        window.addEventListener('resize', function () {
            if (window.matchMedia('(min-width: 992px)').matches) setMenu(false);
        });
    }

    /* ---------- Works dropdown: Escape closes it; first tap opens it on touch screens ---------- */
    var dd = document.querySelector('.otg-nav__item--dd');
    if (dd) {
        var ddLink = dd.querySelector('.otg-nav__link');
        var ddSub = dd.querySelector('.otg-nav__sub');
        var closeDd = function () {
            dd.classList.remove('is-open');
            ddLink.setAttribute('aria-expanded', 'false');
        };
        ddLink.setAttribute('aria-expanded', 'false');
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || !(dd.matches(':hover') || dd.contains(document.activeElement) || dd.classList.contains('is-open'))) return;
            if (ddSub.contains(document.activeElement)) ddLink.focus();
            dd.classList.add('is-dismissed');
            closeDd();
        });
        dd.addEventListener('focusin', function (e) { if (ddSub.contains(e.target)) dd.classList.remove('is-dismissed'); });
        dd.addEventListener('focusout', function (e) { if (!dd.contains(e.relatedTarget)) dd.classList.remove('is-dismissed'); });
        dd.addEventListener('mouseleave', function () { if (!dd.contains(document.activeElement)) dd.classList.remove('is-dismissed'); });
        if (window.matchMedia('(hover: none)').matches) {
            ddLink.addEventListener('click', function (e) {
                if (!dd.classList.contains('is-open')) {
                    e.preventDefault();
                    dd.classList.add('is-open');
                    dd.classList.remove('is-dismissed');
                    ddLink.setAttribute('aria-expanded', 'true');
                }
            });
            document.addEventListener('click', function (e) { if (!dd.contains(e.target)) closeDd(); });
        }
    }

    /* ---------- theme toggle ---------- */
    var themeBtn = document.querySelector('[data-theme-toggle]');
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    function applyTheme(theme) {
        root.setAttribute('data-bs-theme', theme);
        if (themeBtn) themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#0F0F0F' : '#FEFEFE');
    }
    applyTheme(root.getAttribute('data-bs-theme') === 'light' ? 'light' : 'dark');
    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            var next = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem('theme', next); } catch (e) {}
        });
    }

    /* ---------- works tabs ---------- */
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.otg-tabs__tab'));
    if (tabs.length) {
        // Older links from before the India / Japan split
        var ALIASES = { commercials: 'india-commercials', films: 'india-long-formats' };
        var activate = function (id, focus) {
            id = ALIASES[id] || id;
            // Unknown or empty id (e.g. plain works.html): fall back to the first tab.
            if (!tabs.some(function (tab) { return tab.getAttribute('data-tab') === id; })) id = tabs[0].getAttribute('data-tab');
            var found = false;
            tabs.forEach(function (tab) {
                var on = tab.getAttribute('data-tab') === id;
                if (on) found = true;
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
                tab.tabIndex = on ? 0 : -1;
                var panel = document.getElementById(tab.getAttribute('aria-controls'));
                if (panel) panel.hidden = !on;
                if (on && focus) tab.focus();
            });
            return found;
        };
        tabs.forEach(function (tab, i) {
            tab.addEventListener('click', function () {
                var id = tab.getAttribute('data-tab');
                activate(id);
                if (history.replaceState) history.replaceState(null, '', '#' + id);
            });
            tab.addEventListener('keydown', function (e) {
                var next = null;
                if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
                if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
                if (e.key === 'Home') next = tabs[0];
                if (e.key === 'End') next = tabs[tabs.length - 1];
                if (next) {
                    e.preventDefault();
                    activate(next.getAttribute('data-tab'), true);
                    if (history.replaceState) history.replaceState(null, '', '#' + next.getAttribute('data-tab'));
                }
            });
        });
        var fromHash = function () { return activate((location.hash || '').replace('#', '')); };
        fromHash();
        // Choosing a category from the menu while already on works.html: switch tab and bring the tabs into view
        window.addEventListener('hashchange', function () {
            fromHash();
            var bar = document.querySelector('.otg-tabs');
            if (!bar) return;
            var off = (header ? header.offsetHeight : 0) + 16;
            var sm = window.ScrollSmoother && window.ScrollSmoother.get && window.ScrollSmoother.get();
            if (sm) sm.scrollTo(bar, true, 'top ' + off + 'px');
            else window.scrollTo({ top: bar.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' });
        });
        // Opening works.html#films makes the browser jump to the panel; keep the page header in view instead.
        if (location.hash) {
            window.addEventListener('load', function () {
                var sm = window.ScrollSmoother && window.ScrollSmoother.get && window.ScrollSmoother.get();
                if (sm) sm.scrollTop(0); else window.scrollTo(0, 0);
            });
        }
    }

    /* ---------- Team title band: starts fully readable, slides left as the page scrolls ---------- */
    var bandLine = document.querySelector('.otg-team__band-line');
    if (bandLine && window.gsap && window.ScrollTrigger) {
        window.gsap.to(bandLine, {
            xPercent: -30,
            ease: 'none',
            scrollTrigger: {
                trigger: bandLine.closest('.otg-team__band') || bandLine,
                start: function () { return 'top ' + ((header ? header.offsetHeight : 0) + 1) + 'px'; },
                end: '+=900',
                scrub: 1,
            },
        });
    }

    /* ---------- remember which CTA was used (enquiry.js puts it in the email) ---------- */
    document.addEventListener('click', function (e) {
        var link = e.target.closest && e.target.closest('a[href^="contact.html"]');
        if (!link) return;
        try { sessionStorage.setItem('otg_cta', link.getAttribute('data-cta') || 'link'); } catch (err) {}
    }, true);
})();
