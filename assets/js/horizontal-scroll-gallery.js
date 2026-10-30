/* ============================================================
   Horizontal Scroll Gallery (GSAP ScrollTrigger)
   ------------------------------------------------------------
   Drives the .hsg-stage section: vertical scroll is converted
   into horizontal translation of .hsg-track while the section
   is pinned. Background layers crossfade in sync with the
   active slide; a bottom progress bar mirrors the scrub.

   Selector contract (see sections/portfolio-horizontal-gallery/sec-2.html):
     .hsg-stage             - pinned section
       .hsg-bg-layer        - fullscreen background container
         .hsg-bg            - one per slide (img inside)
       .hsg-track-wrap      - viewport-width clip area
         .hsg-track         - flex row of cards (transformed)
           .hsg-slide       - card; data-slide-index
       .hsg-progress__bar   - scaled X by progress
       .hsg-counter         - shows current slide number
   ============================================================ */
(function () {
    'use strict';

    function initHorizontalScrollGallery() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        var stage = document.querySelector('.hsg-stage');
        if (!stage) return;

        var track = stage.querySelector('.hsg-track');
        var slides = Array.prototype.slice.call(stage.querySelectorAll('.hsg-slide'));
        var bgLayer = stage.querySelector('.hsg-bg-layer');
        var progressBar = stage.querySelector('.hsg-progress__bar');
        var counterCurrent = stage.querySelector('.hsg-counter__current');
        var counterTotal = stage.querySelector('.hsg-counter__total');

        if (!track || slides.length === 0) return;

        var total = slides.length;
        if (counterTotal) counterTotal.textContent = String(total).padStart(2, '0');

        // Build the background layers from each slide's thumbnail src so the
        // HTML stays DRY: edit a slide image and the bg follows automatically.
        // .hsg-bg__veil (if present) is kept as the topmost child for tinting.
        var bgLayers = [];
        if (bgLayer) {
            var veil = bgLayer.querySelector('.hsg-bg__veil');
            slides.forEach(function (slide, i) {
                var slideImg = slide.querySelector('.hsg-slide__img');
                if (!slideImg) return;

                var bg = document.createElement('div');
                bg.className = 'hsg-bg';
                if (i === 0) bg.classList.add('is-active');
                bg.setAttribute('data-bg-index', String(i));

                var bgImg = document.createElement('img');
                bgImg.className = 'hsg-bg__img';
                // currentSrc handles <picture>/srcset cases; falls back to src.
                bgImg.src = slideImg.currentSrc || slideImg.src;
                bgImg.alt = '';
                bgImg.setAttribute('aria-hidden', 'true');
                bgImg.loading = i === 0 ? 'eager' : 'lazy';
                bgImg.decoding = 'async';

                bg.appendChild(bgImg);
                if (veil) {
                    bgLayer.insertBefore(bg, veil);
                } else {
                    bgLayer.appendChild(bg);
                }
                bgLayers.push(bg);
            });
        }

        gsap.registerPlugin(ScrollTrigger);

        // Layout rule: only the first slide is visible at rest, and slides are
        // separated by 50svw. We apply the gap via inline margin-left on every
        // non-first slide and dynamically size the track's side padding so the
        // first slide is centered initially and the last slide is centered at
        // the end of the scroll.
        slides.forEach(function (slide, i) {
            slide.style.marginLeft = i === 0 ? '0' : '50svw';
        });

        function applyTrackPadding() {
            if (!slides[0]) return;
            var slideWidth = slides[0].getBoundingClientRect().width;
            // Side padding = half of the empty space around a centered slide.
            // Math.max prevents negative padding on narrow viewports.
            var pad = Math.max((window.innerWidth - slideWidth) / 2, 0);
            track.style.paddingLeft = pad + 'px';
            track.style.paddingRight = pad + 'px';
        }

        applyTrackPadding();

        // Distance the track must travel horizontally so the last slide ends
        // up centered. Recomputed on every refresh (resize, etc.).
        function getScrollDistance() {
            return Math.max(track.scrollWidth - window.innerWidth, 0);
        }

        // Returns which slide is "active" given a 0..1 progress value.
        // Splits the timeline into `total` equal segments.
        function activeIndexAt(progress) {
            var idx = Math.floor(progress * total);
            return Math.min(idx, total - 1);
        }

        function setActive(index) {
            slides.forEach(function (slide, i) {
                slide.classList.toggle('is-active', i === index);
            });
            bgLayers.forEach(function (bg, i) {
                bg.classList.toggle('is-active', i === index);
            });
            if (counterCurrent) {
                counterCurrent.textContent = String(index + 1).padStart(2, '0');
            }
        }

        // Scroll-driven parallax + exit. For each slide we publish three CSS
        // custom properties read by _portfolio-horizontal-gallery.scss:
        //   --hsg-norm          signed distance from viewport center (-1..+1),
        //                       drives the image/title/tags parallax drift.
        //   --hsg-centeredness  unsigned closeness in [0, 1], fades the body.
        //   --hsg-exit          segment progress for this slide in [0, 1].
        //                       0 before the slide reaches its active segment,
        //                       ramps to 1 across that segment, then stays 1.
        //                       The active slide uses it to translate right,
        //                       shrink and fade as the user scrolls past it.
        function updateParallax(progress) {
            var halfVw = window.innerWidth / 2;
            var hasProgress = typeof progress === 'number';
            slides.forEach(function (slide, i) {
                var rect = slide.getBoundingClientRect();
                var center = rect.left + rect.width / 2;
                var norm = (center - halfVw) / window.innerWidth;
                if (norm > 1.5) norm = 1.5;
                if (norm < -1.5) norm = -1.5;
                var centeredness = 1 - Math.min(Math.abs(norm), 1);
                slide.style.setProperty('--hsg-norm', norm.toFixed(3));
                slide.style.setProperty('--hsg-centeredness', centeredness.toFixed(3));

                if (hasProgress) {
                    // Segment-local progress: <0 before this slide's turn,
                    // 0..1 during it, >1 after — clamped to [0, 1] so the
                    // discarded slide holds its exit pose rather than reset.
                    var local = progress * total - i;
                    var exit = local < 0 ? 0 : (local > 1 ? 1 : local);
                    slide.style.setProperty('--hsg-exit', exit.toFixed(3));
                }
            });
        }

        // Single ScrollTrigger pins the stage and drives the track's x via tween.
        gsap.to(track, {
            x: function () { return -getScrollDistance(); },
            ease: 'none',
            scrollTrigger: {
                trigger: stage,
                start: 'top top',
                // Pin length = horizontal distance, so 1px of scroll == 1px of slide.
                end: function () { return '+=' + getScrollDistance(); },
                pin: true,
                pinSpacing: true,
                scrub: 0.6,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                // Re-center the track on every refresh BEFORE distance is read,
                // otherwise the first refresh measures stale padding.
                onRefreshInit: applyTrackPadding,
                onUpdate: function (self) {
                    var progress = self.progress;
                    setActive(activeIndexAt(progress));
                    updateParallax(progress);
                    if (progressBar) {
                        progressBar.style.transform = 'scaleX(' + progress + ')';
                    }
                },
            },
        });

        // Run parallax once for the at-rest state (progress 0).
        updateParallax(0);

        // Resize hook - ScrollTrigger already calls invalidate via
        // invalidateOnRefresh, but ensure a refresh after fonts/images settle.
        if (window.addEventListener) {
            window.addEventListener('load', function () {
                ScrollTrigger.refresh();
                updateParallax(0);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHorizontalScrollGallery);
    } else {
        initHorizontalScrollGallery();
    }
})();
