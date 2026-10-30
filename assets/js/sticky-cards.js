/* ============================================================
   Sticky cards — Slideshow-style 3D scroll-pinned stack
   Adapted from Slideshow-brandappart-sticky-cards/script.js
   No Lenis dependency: Orisa's ScrollSmoother already drives
   smooth scroll and feeds ScrollTrigger.
   Selector hook: .sec-4-home-15__cards (parent) > .sec-4-home-15__card (children)

   Tweaks vs the original demo:
   - The LAST card does not fly away; it stays centered at scale 1
     so the section never reveals an empty viewport before the pin ends.
   - Pin duration is sized to the number of transitions (n-1), not the
     total card count, so we do not buy extra blank scroll-time.
   ============================================================ */
(function () {
    'use strict';

    function initStickyCards() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        var containers = document.querySelectorAll('.sec-4-home-15__cards');
        if (!containers.length) return;

        containers.forEach(function (container) {
            var cards = Array.prototype.slice.call(container.querySelectorAll('.sec-4-home-15__card'));
            var totalCards = cards.length;
            if (totalCards < 2) return;

            var lastIndex = totalCards - 1;
            var segmentSize = 1 / totalCards;
            var cardYOffset = 5;        // % per card vertical stagger
            var cardScaleStep = 0.075;  // scale decrement per card

            cards.forEach(function (card, i) {
                gsap.set(card, {
                    xPercent: -50,
                    yPercent: -50 + i * cardYOffset,
                    scale: 1 - i * cardScaleStep,
                });
            });

            ScrollTrigger.create({
                trigger: container,
                start: 'top top',
                // Pin sized to the number of card transitions (n-1).
                // 1.1vh per transition keeps the stack snappy on a mouse-wheel
                // while still being smooth enough for trackpad / touch.
                end: function () { return '+=' + (window.innerHeight * Math.max(totalCards - 1, 1) * 1.1) + 'px'; },
                pin: true,
                pinSpacing: true,
                scrub: 0.5,
                invalidateOnRefresh: true,
                onUpdate: function (self) {
                    var progress = self.progress;
                    var activeIndex = Math.min(
                        Math.floor(progress / segmentSize),
                        lastIndex
                    );
                    var segProgress = (progress - activeIndex * segmentSize) / segmentSize;

                    cards.forEach(function (card, i) {
                        if (i < activeIndex) {
                            // Card already flipped away.
                            gsap.set(card, {
                                yPercent: -250,
                                rotationX: 35,
                            });
                        } else if (i === activeIndex) {
                            if (i === lastIndex) {
                                // Final card stays centered (no fly-away → no blank viewport).
                                gsap.set(card, {
                                    yPercent: -50,
                                    rotationX: 0,
                                    scale: 1,
                                });
                            } else {
                                gsap.set(card, {
                                    yPercent: gsap.utils.interpolate(-50, -200, segProgress),
                                    rotationX: gsap.utils.interpolate(0, 35, segProgress),
                                    scale: 1,
                                });
                            }
                        } else {
                            var behindIndex = i - activeIndex;
                            var currentYOffset = (behindIndex - segProgress) * cardYOffset;
                            var currentScale = 1 - (behindIndex - segProgress) * cardScaleStep;

                            gsap.set(card, {
                                yPercent: -50 + currentYOffset,
                                rotationX: 0,
                                scale: currentScale,
                            });
                        }
                    });
                },
            });
        });

        // Ensure layout is measured correctly once images load & ScrollSmoother is set up.
        if (window.addEventListener) {
            window.addEventListener('load', function () {
                if (typeof ScrollTrigger !== 'undefined' && ScrollTrigger.refresh) {
                    ScrollTrigger.refresh();
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStickyCards);
    } else {
        initStickyCards();
    }
})();
