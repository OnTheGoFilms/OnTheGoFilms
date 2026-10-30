/* ==================================================================
   On The Go Films: quick-connect enquiry form
   - CTAs link to contact.html?enquiry=<type> to pre-select the enquiry
     type; site.js records which CTA (data-cta) was used.
   - Shows extra questions for the chosen enquiry type.
   - Validates inline and submits to Web3Forms with fetch(), which emails
     the enquiry to the inbox the access key is registered to.
   - Without JavaScript the form still posts normally to Web3Forms.
   Note: never call ScrollTrigger.refresh() from here. ScrollSmoother
   already re-measures when the form grows (ResizeObserver), and a forced
   refresh while the smooth scroll is still easing throws the page back
   several hundred pixels.
================================================================== */
(function () {
    'use strict';

    var form = document.getElementById('enquiry-form');
    if (!form) return;

    var ENDPOINT = 'https://api.web3forms.com/submit';
    var TIMEOUT_MS = 20000;
    var MAILTO_MAX = 1900; // some desktop mail handlers choke on longer mailto: URLs
    // Fallback address for the "send it by email instead" link. Built at runtime
    // so it is not in the page source for scrapers.
    var FALLBACK_EMAIL = ['vsr.bruh', 'gmail.com'].join('@');

    var TYPE_LABELS = {
        commercial: 'Commercial / ad film',
        music_video: 'Music video',
        branded_digital: 'Branded / digital content',
        production_services: 'Shoot in India or Japan (production services)',
        incentive_check: 'Incentive eligibility check',
        post_vfx: 'Post-production / VFX',
        other: 'Something else',
    };

    // Field name -> label used in the notification email (in this order).
    var FIELD_LABELS = [
        ['name', 'Name'],
        ['email', 'email'],
        ['phone', 'Phone / WhatsApp'],
        ['whatsapp_ok', 'OK to reply on WhatsApp'],
        ['company', 'Company / brand / agency'],
        ['location', 'Based in'],
        ['timeline', 'Needed by'],
        ['budget', 'Rough budget'],
        ['format', 'Format'],
        ['running_time', 'Running time'],
        ['shoot_country', 'Shooting in'],
        ['shoot_dates', 'Shoot dates'],
        ['india_locations', 'Cities / locations'],
        ['india_spend', 'Estimated spend in India'],
        ['incentive_interest', 'Also check incentive eligibility'],
        ['message', 'message'],
    ];
    var TEXT_FIELDS = ['name', 'email', 'phone', 'message'];
    var VALIDATED = ['enquiry_type', 'name', 'email', 'phone', 'message'];
    var NOT_ELIGIBLE_FORMAT = /^(Commercial|Music video)$/;

    var $ = function (sel, root) { return (root || form).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || form).querySelectorAll(sel)); };

    var card = form.parentElement;
    var submitBtn = $('.otg-form__submit');
    var submitLabel = submitBtn ? ($('.text-1', submitBtn) || {}).textContent : '';
    var live = $('[data-form-live]');
    var errorBox = $('[data-form-error]');
    var errorDetail = $('[data-form-error-detail]');
    var mailtoLink = $('[data-form-mailto]');
    var fallbackText = $('[data-form-fallback-email]');
    var successBox = card.querySelector('[data-form-success]');
    var whatsappRow = $('.otg-form__whatsapp');
    var formatNote = $('#note-format');
    var incentiveBox = $('input[name="incentive_interest"]');
    var sourceInput = $('input[name="source_cta"]');

    // JS takes over validation; without JS the browser's native checks still run.
    form.noValidate = true;

    /* ---------- scroll + focus helpers ---------- */
    function smoother() {
        return window.ScrollSmoother && window.ScrollSmoother.get && window.ScrollSmoother.get();
    }

    function scrollToEl(el, position) {
        var sm = smoother();
        if (sm) sm.scrollTo(el, true, position || 'top 120px');
        else el.scrollIntoView({ behavior: 'smooth', block: position && position.indexOf('center') === 0 ? 'center' : 'start' });
    }

    function inViewport(el) {
        if (window.ScrollTrigger && window.ScrollTrigger.isInViewport) return window.ScrollTrigger.isInViewport(el, 0.5);
        var r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
    }

    // Focus an element once it is on screen. ScrollSmoother re-scrolls to any element
    // that gets focus while off screen, so never focus it off screen: give up instead.
    function focusWhenVisible(el) {
        if (!el || !el.focus) return;
        var start = Date.now();
        (function check() {
            if (inViewport(el)) {
                el.focus({ preventScroll: true });
                return;
            }
            if (Date.now() - start < 3000) requestAnimationFrame(check);
        })();
    }

    function announce(msg) {
        if (!live) return;
        live.textContent = '';
        setTimeout(function () { live.textContent = msg; }, 50);
    }

    function currentType() {
        var checked = $('input[name="enquiry_type"]:checked');
        return checked ? checked.value : '';
    }

    /* ---------- conditional questions ---------- */
    function updateConditional(fromUser) {
        var type = currentType();
        var revealed = false;
        $$('[data-show-for]').forEach(function (el) {
            var show = !!type && el.getAttribute('data-show-for').split(/\s+/).indexOf(type) !== -1;
            if (show && el.hidden) revealed = true;
            el.hidden = !show;
        });
        // Disable inputs inside hidden groups so they are neither validated nor sent.
        $$('[data-show-for] input, [data-show-for] select, [data-show-for] textarea').forEach(function (input) {
            input.disabled = !!input.closest('[data-show-for][hidden]');
        });
        updateFormatNote(fromUser);
        if (fromUser && revealed) announce('A few more questions about your project have been added below.');
    }

    // Commercials and music videos are not eligible for the incentive: say so, and
    // drop the "also check the incentive" box for those formats.
    function updateFormatNote(fromUser) {
        var format = ($('select[name="format"]') || {}).value || '';
        var type = currentType();
        var notEligible = (type === 'incentive_check' || type === 'production_services') && NOT_ELIGIBLE_FORMAT.test(format);
        if (formatNote) {
            if (fromUser && notEligible && formatNote.hidden) announce(formatNote.textContent);
            formatNote.hidden = !notEligible;
        }
        if (incentiveBox) {
            var row = incentiveBox.closest('[data-show-for]');
            var rowShown = row && !row.hidden;
            var blocked = NOT_ELIGIBLE_FORMAT.test(format);
            incentiveBox.closest('label').hidden = blocked;
            incentiveBox.disabled = !rowShown || blocked;
            if (blocked) incentiveBox.checked = false;
        }
    }

    function updateWhatsapp() {
        var phone = form.elements.phone;
        if (!whatsappRow || !phone) return;
        var hasPhone = phone.value.trim() !== '';
        whatsappRow.hidden = !hasPhone;
        if (!hasPhone) whatsappRow.querySelector('input').checked = false;
    }

    /* ---------- validation ---------- */
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function messageFor(name) {
        var el = form.elements[name];
        if (!el) return '';
        switch (name) {
            case 'enquiry_type':
                return currentType() ? '' : 'Select what you need help with.';
            case 'name':
                return el.value.trim() ? '' : 'Enter your name.';
            case 'email':
                if (!el.value.trim()) return 'Enter your email address.';
                return EMAIL_RE.test(el.value.trim()) ? '' : 'Enter an email address in the correct format, like name@example.com.';
            case 'phone':
                var digits = el.value.replace(/\D/g, '');
                return !el.value.trim() || (digits.length >= 8 && digits.length <= 15) ? '' : 'Enter a phone number with country code, like +91 98200 12345.';
            case 'message':
                if (!el.value.trim()) return 'Tell us a little about your project.';
                return el.value.trim().length >= 10 ? '' : 'Add a little more detail (at least a short sentence).';
        }
        return '';
    }

    function showError(name, msg) {
        var wrap = $('[data-field="' + name + '"]');
        var err = $('#err-' + name);
        if (!wrap || !err) return;
        wrap.classList.toggle('is-invalid', !!msg);
        err.textContent = msg;
        err.hidden = !msg;
        var inputs = name === 'enquiry_type' ? $$('input[name="enquiry_type"]') : [form.elements[name]];
        inputs.forEach(function (input) {
            if (msg) input.setAttribute('aria-invalid', 'true');
            else input.removeAttribute('aria-invalid');
        });
        if (name === 'enquiry_type') {
            if (msg) wrap.setAttribute('aria-describedby', 'err-enquiry_type');
            else wrap.removeAttribute('aria-describedby');
        }
    }

    function validateAll() {
        var firstInvalid = null;
        VALIDATED.forEach(function (name) {
            var msg = messageFor(name);
            showError(name, msg);
            if (msg && !firstInvalid) firstInvalid = name;
        });
        return firstInvalid;
    }

    // Validate a field when the visitor leaves it; clear the error as soon as it is fixed.
    TEXT_FIELDS.forEach(function (name) {
        var el = form.elements[name];
        if (!el) return;
        el.addEventListener('blur', function () {
            if (el.value.trim() !== '' || el.dataset.touched) showError(name, messageFor(name));
            el.dataset.touched = '1';
        });
        el.addEventListener('input', function () {
            if ($('[data-field="' + name + '"]').classList.contains('is-invalid') && !messageFor(name)) showError(name, '');
        });
    });

    /* ---------- CTA wiring ---------- */
    function selectType(type) {
        var radio = $('input[name="enquiry_type"][value="' + type + '"]');
        if (!radio) return;
        radio.checked = true;
        showError('enquiry_type', '');
        updateConditional(false);
    }

    form.addEventListener('change', function (e) {
        if (e.target.name === 'enquiry_type') {
            showError('enquiry_type', '');
            updateConditional(true);
        }
        if (e.target.name === 'format') updateFormatNote(true);
    });
    if (form.elements.phone) form.elements.phone.addEventListener('input', updateWhatsapp);

    /* ---------- submission ---------- */
    function collect() {
        var type = currentType();
        var get = function (name) {
            var el = form.elements[name];
            if (!el || el.disabled) return '';
            if (el.type === 'checkbox') return el.checked ? el.value : '';
            return String(el.value || '').trim();
        };
        var lines = [['Enquiry type', TYPE_LABELS[type] || type]];
        FIELD_LABELS.forEach(function (pair) {
            var v = get(pair[0]);
            if (v) lines.push([pair[1], v]);
        });
        lines.push(['Came from', get('source_cta') || 'direct']);
        return { type: type, lines: lines, name: get('name'), email: get('email') };
    }

    function buildPayload(data) {
        var payload = {
            access_key: form.elements.access_key.value.trim(),
            subject: 'New enquiry: ' + (TYPE_LABELS[data.type] || 'General') + ' – ' + (data.name || 'website visitor'),
            from_name: form.elements.from_name.value,
        };
        data.lines.forEach(function (pair) { payload[pair[0]] = pair[1]; });
        payload['Page'] = location.origin + location.pathname; // no query string (ad click IDs)
        payload['Submitted at'] = new Date().toString();
        return payload;
    }

    function buildMailto(data) {
        var subject = encodeURIComponent('Enquiry: ' + (TYPE_LABELS[data.type] || 'General') + ' – ' + (data.name || ''));
        var message = '';
        var others = [];
        data.lines.forEach(function (pair) {
            if (pair[0] === 'message') message = String(pair[1]);
            else others.push(encodeURIComponent((pair[0] === 'email' ? 'Email' : pair[0]) + ': ' + pair[1]));
        });
        var build = function (msg) {
            var body = others.slice(0, -1).concat(encodeURIComponent('Message: ' + msg), others.slice(-1)).join('%0D%0A');
            return 'mailto:' + FALLBACK_EMAIL + '?subject=' + subject + '&body=' + body;
        };
        var url = build(message);
        var shortened = message;
        while (url.length > MAILTO_MAX && shortened.length > 200) {
            shortened = shortened.slice(0, shortened.length - 100);
            url = build(shortened + ' [message shortened, please paste the rest]');
        }
        return url;
    }

    function setSending(on) {
        submitBtn.disabled = on;
        submitBtn.setAttribute('aria-busy', on ? 'true' : 'false');
        $$('.text-1, .text-2', submitBtn).forEach(function (s) { s.textContent = on ? 'Sending…' : submitLabel; });
    }

    function showFailure(detail, data) {
        errorDetail.textContent = detail;
        mailtoLink.setAttribute('href', buildMailto(data));
        if (fallbackText) fallbackText.textContent = FALLBACK_EMAIL;
        errorBox.hidden = false;
        errorBox.focus({ preventScroll: true });
        scrollToEl(errorBox, 'center center');
    }

    function showSuccess(data) {
        form.hidden = true;
        successBox.hidden = false;
        var emailEl = successBox.querySelector('[data-form-success-email]');
        if (emailEl) emailEl.textContent = data.email || 'your email';
        var extra = successBox.querySelector('[data-form-success-extra]');
        var incentive = data.type === 'incentive_check' || data.lines.some(function (p) { return p[0] === 'Also check incentive eligibility'; });
        if (extra) extra.hidden = !incentive;
        scrollToEl(card);
        focusWhenVisible(successBox);
    }

    function resetForm() {
        form.reset();
        if (sourceInput) sourceInput.value = 'direct';
        VALIDATED.forEach(function (n) { showError(n, ''); });
        TEXT_FIELDS.forEach(function (n) { if (form.elements[n]) delete form.elements[n].dataset.touched; });
        updateWhatsapp();
    }

    var sending = false;
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (sending) return;
        errorBox.hidden = true;

        var firstInvalid = validateAll();
        if (firstInvalid) {
            var el = firstInvalid === 'enquiry_type' ? $('input[name="enquiry_type"]') : form.elements[firstInvalid];
            announce('Please fix the highlighted fields.');
                scrollToEl($('[data-field="' + firstInvalid + '"]') || el);
            focusWhenVisible(el);
            return;
        }

        var data = collect();

        // Honeypot ticked: quietly pretend it worked.
        if (form.elements.botcheck && form.elements.botcheck.checked) {
            showSuccess(data);
            return;
        }

        if (/^YOUR_/.test(form.elements.access_key.value.trim())) {
            if (window.console) console.warn('Enquiry form: set the Web3Forms access key in src/sections/contact.html (input name="access_key"), then run python src/build.py.');
            showFailure("Our online form isn't switched on yet.", data);
            return;
        }

        sending = true;
        setSending(true);
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(buildPayload(data)),
            signal: controller ? controller.signal : undefined,
        })
            .then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (json) { return { res: res, json: json }; });
            }, function () {
                return { network: true };
            })
            .then(function (r) {
                if (timer) clearTimeout(timer);
                sending = false;
                setSending(false);
                if (r.network) {
                    showFailure("We couldn't reach our form service (this sometimes happens on office networks). Please try again in a minute.", data);
                } else if (r.res.ok && r.json.success === true) {
                    resetForm();
                    updateConditional(false);
                    showSuccess(data);
                } else if (r.res.status === 429) {
                    showFailure('Our form provider has paused sending from this connection for about an hour.', data);
                } else {
                    showFailure('Something went wrong on our side. Please try again.', data);
                    if (window.console) console.warn('Enquiry form error', r.res.status, r.json);
                }
            });
    });

    // "Send another enquiry"
    var again = successBox.querySelector('[data-form-again]');
    if (again) {
        again.addEventListener('click', function () {
            resetForm();
            successBox.hidden = true;
            form.hidden = false;
            updateConditional(false);
            var first = $('input[name="enquiry_type"]:checked') || $('input[name="enquiry_type"]');
            if (first) first.focus({ preventScroll: true });
        });
    }

    /* ---------- pre-selection from the link that brought the visitor here ---------- */
    // CTAs link to contact.html?enquiry=<type>; site.js stores which CTA was clicked.
    (function () {
        var type = '';
        try { type = new URLSearchParams(location.search).get('enquiry') || ''; } catch (e) {}
        if (type && TYPE_LABELS[type]) selectType(type);
        var cta = '';
        try { cta = sessionStorage.getItem('otg_cta') || ''; sessionStorage.removeItem('otg_cta'); } catch (e) {}
        if (sourceInput) sourceInput.value = cta || 'direct';
    })();

    updateConditional(false);
    updateWhatsapp();
})();
