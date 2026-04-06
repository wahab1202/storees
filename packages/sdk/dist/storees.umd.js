(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Storees = {}));
})(this, (function (exports) { 'use strict';

    /** Generate a UUID v4 */
    function generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for older browsers
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    /** Safe localStorage get */
    function storageGet(key) {
        try {
            return localStorage.getItem(key);
        }
        catch (_a) {
            return null;
        }
    }
    /** Safe localStorage set */
    function storageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch (_a) {
            // localStorage may be full or blocked
        }
    }
    /** Safe localStorage remove */
    function storageRemove(key) {
        try {
            localStorage.removeItem(key);
        }
        catch (_a) {
            // ignore
        }
    }
    /** Safe sessionStorage get */
    function sessionGet(key) {
        try {
            return sessionStorage.getItem(key);
        }
        catch (_a) {
            return null;
        }
    }
    /** Safe sessionStorage set */
    function sessionSet(key, value) {
        try {
            sessionStorage.setItem(key, value);
        }
        catch (_a) {
            // ignore
        }
    }
    /** Get current ISO timestamp */
    function now() {
        return new Date().toISOString();
    }
    /** Debug logger — only logs when debug mode is enabled */
    function createLogger(debug) {
        return {
            log: (...args) => {
                if (debug)
                    console.log('[Storees]', ...args);
            },
            warn: (...args) => {
                if (debug)
                    console.warn('[Storees]', ...args);
            },
            error: (...args) => {
                console.error('[Storees]', ...args);
            },
        };
    }

    const ANON_ID_KEY = 'storees_anon_id';
    const USER_ID_KEY = 'storees_user_id';
    const USER_ATTRS_KEY = 'storees_user_attrs';
    class IdentityManager {
        constructor(log) {
            this.log = log;
            // Restore or generate anonymous ID
            const stored = storageGet(ANON_ID_KEY);
            if (stored) {
                this.anonymousId = stored;
            }
            else {
                this.anonymousId = generateId();
                storageSet(ANON_ID_KEY, this.anonymousId);
            }
            // Restore identified user if exists
            const storedUserId = storageGet(USER_ID_KEY);
            if (storedUserId) {
                this.userId = storedUserId;
                const storedAttrs = storageGet(USER_ATTRS_KEY);
                if (storedAttrs) {
                    try {
                        this.attributes = JSON.parse(storedAttrs);
                    }
                    catch (_a) {
                        // corrupt data, ignore
                    }
                }
            }
            this.log.log('Identity initialized', {
                anonymousId: this.anonymousId,
                userId: this.userId,
            });
        }
        /** Identify a user — transitions from anonymous to known */
        identify(userId, attributes) {
            const isNew = !this.userId || this.userId !== userId;
            const previousAnonymousId = this.anonymousId;
            this.userId = userId;
            storageSet(USER_ID_KEY, userId);
            if (attributes) {
                this.attributes = Object.assign(Object.assign({}, this.attributes), attributes);
                storageSet(USER_ATTRS_KEY, JSON.stringify(this.attributes));
            }
            this.log.log('User identified', { userId, isNew });
            return { previousAnonymousId, isNewIdentification: isNew };
        }
        /** Set additional user properties without changing identity */
        setAttributes(attributes) {
            this.attributes = Object.assign(Object.assign({}, this.attributes), attributes);
            storageSet(USER_ATTRS_KEY, JSON.stringify(this.attributes));
            this.log.log('Attributes updated', attributes);
        }
        /** Get current identity state */
        getIdentity() {
            return {
                anonymousId: this.anonymousId,
                userId: this.userId,
                attributes: this.attributes,
            };
        }
        /** Get the customer_id to use in events */
        getCustomerId() {
            return this.userId || `anon_${this.anonymousId}`;
        }
        /** Get customer_email if available */
        getCustomerEmail() {
            var _a;
            return (_a = this.attributes) === null || _a === void 0 ? void 0 : _a.email;
        }
        /** Get customer_phone if available */
        getCustomerPhone() {
            var _a;
            return (_a = this.attributes) === null || _a === void 0 ? void 0 : _a.phone;
        }
        /** Reset identity — used on logout */
        reset() {
            storageRemove(USER_ID_KEY);
            storageRemove(USER_ATTRS_KEY);
            storageRemove(ANON_ID_KEY);
            this.userId = undefined;
            this.attributes = undefined;
            this.anonymousId = generateId();
            storageSet(ANON_ID_KEY, this.anonymousId);
            this.log.log('Identity reset, new anonymousId:', this.anonymousId);
        }
    }

    const CONSENT_KEY = 'storees_consent';
    class ConsentManager {
        constructor(required, defaultCategories, log) {
            this.required = required;
            this.log = log;
            // Restore previous consent
            const stored = storageGet(CONSENT_KEY);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    this.categories = new Set(parsed);
                    this.hasConsented = true;
                }
                catch (_a) {
                    this.categories = new Set(defaultCategories);
                    this.hasConsented = !required;
                }
            }
            else {
                this.categories = new Set(defaultCategories);
                this.hasConsented = !required;
            }
            this.log.log('Consent initialized', {
                required,
                hasConsented: this.hasConsented,
                categories: [...this.categories],
            });
        }
        /** Set a callback for when consent is first granted */
        onGranted(callback) {
            this.onConsentGranted = callback;
        }
        /** Update consent categories */
        setConsent(categories) {
            this.categories = new Set(categories);
            // 'necessary' is always included
            this.categories.add('necessary');
            this.hasConsented = true;
            storageSet(CONSENT_KEY, JSON.stringify([...this.categories]));
            this.log.log('Consent updated', [...this.categories]);
            // Trigger flush of queued events
            if (this.onConsentGranted) {
                this.onConsentGranted();
            }
        }
        /** Check if tracking is currently allowed */
        canTrack() {
            if (!this.required)
                return true;
            return this.hasConsented;
        }
        /** Check if a specific category is consented */
        hasCategory(category) {
            if (category === 'necessary')
                return true;
            if (!this.required)
                return true;
            return this.categories.has(category);
        }
        /** Get current consent state */
        getCategories() {
            return [...this.categories];
        }
    }

    function parseOS(ua) {
        if (/Windows/.test(ua))
            return 'Windows';
        if (/Mac OS X/.test(ua))
            return 'macOS';
        if (/iPhone|iPad|iPod/.test(ua))
            return 'iOS';
        if (/Android/.test(ua))
            return 'Android';
        if (/Linux/.test(ua))
            return 'Linux';
        if (/CrOS/.test(ua))
            return 'ChromeOS';
        return 'Unknown';
    }
    function parseBrowser(ua) {
        // Order matters — check specific browsers before generic ones
        const patterns = [
            ['Edge', /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/],
            ['Opera', /(?:OPR|Opera)\/(\d+[\d.]*)/],
            ['Chrome', /Chrome\/(\d+[\d.]*)/],
            ['Firefox', /Firefox\/(\d+[\d.]*)/],
            ['Safari', /Version\/(\d+[\d.]*).*Safari/],
        ];
        for (const [name, regex] of patterns) {
            const match = ua.match(regex);
            if (match)
                return { name, version: match[1] || '' };
        }
        return { name: 'Unknown', version: '' };
    }
    function getDeviceType() {
        const width = window.screen.width;
        if (width <= 768)
            return 'mobile';
        if (width <= 1024)
            return 'tablet';
        return 'desktop';
    }
    let cachedContext = null;
    function getDeviceContext() {
        if (cachedContext)
            return cachedContext;
        const ua = navigator.userAgent;
        const browser = parseBrowser(ua);
        cachedContext = {
            os: parseOS(ua),
            browser: browser.name,
            browser_version: browser.version,
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            device_type: getDeviceType(),
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        return cachedContext;
    }

    const SDK_VERSION = '0.1.0';
    class EventBuilder {
        constructor(identity, sessionIdGetter, log) {
            this.identity = identity;
            this.sessionIdGetter = sessionIdGetter;
            this.log = log;
        }
        /** Build an event payload ready for the batch endpoint */
        build(eventName, properties = {}) {
            const context = getDeviceContext();
            const event = {
                event_name: eventName,
                customer_id: this.identity.getCustomerId(),
                customer_email: this.identity.getCustomerEmail(),
                customer_phone: this.identity.getCustomerPhone(),
                timestamp: now(),
                idempotency_key: `sdk_${generateId()}_${Date.now()}`,
                session_id: this.sessionIdGetter(),
                source: 'sdk',
                platform: 'web',
                properties: Object.assign(Object.assign({}, properties), { 
                    // Device context
                    $os: context.os, $browser: context.browser, $browser_version: context.browser_version, $screen_width: context.screen_width, $screen_height: context.screen_height, $device_type: context.device_type, $language: context.language, $timezone: context.timezone, 
                    // SDK metadata
                    $sdk_version: SDK_VERSION, $source: 'sdk', $session_id: this.sessionIdGetter(), $page_url: window.location.href, $page_path: window.location.pathname, $page_title: document.title }),
            };
            this.log.log('Event built:', eventName, event.properties);
            return event;
        }
        /** Build a page view event */
        buildPageView(path, properties = {}) {
            return this.build('page_viewed', Object.assign(Object.assign({}, properties), { url: window.location.href, path: path || window.location.pathname, title: properties.title || document.title, referrer: document.referrer }));
        }
        /** Build an identify event for anonymous → known transition */
        buildIdentifyEvent(userId, previousAnonymousId, attributes = {}) {
            return this.build('customer_identified', Object.assign({ user_id: userId, previous_anonymous_id: `anon_${previousAnonymousId}` }, attributes));
        }
        /** Build a user properties update event */
        buildSetPropertiesEvent(attributes) {
            return this.build('user_properties_updated', attributes);
        }
    }

    const MAX_RETRIES = 3;
    const RETRY_BASE_MS = 1000;
    class Transport {
        constructor(apiUrl, apiKey, log) {
            this.apiUrl = apiUrl.replace(/\/$/, ''); // strip trailing slash
            this.apiKey = apiKey;
            this.log = log;
        }
        /** Send a batch of events via fetch with retry */
        async sendBatch(events) {
            const url = `${this.apiUrl}/api/v1/events/batch`;
            const body = JSON.stringify({ events });
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': this.apiKey,
                        },
                        body,
                    });
                    if (response.ok) {
                        const data = (await response.json());
                        this.log.log(`Batch sent: ${events.length} events`, data);
                        return data;
                    }
                    // 4xx errors — don't retry (client error)
                    if (response.status >= 400 && response.status < 500) {
                        const errorData = await response.json().catch(() => ({}));
                        this.log.error(`Batch rejected (${response.status}):`, errorData);
                        return {
                            success: false,
                            error: `HTTP ${response.status}`,
                        };
                    }
                    // 5xx — retry
                    this.log.warn(`Batch failed (${response.status}), attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
                }
                catch (err) {
                    this.log.warn(`Network error, attempt ${attempt + 1}/${MAX_RETRIES + 1}:`, err);
                }
                // Wait before retry (exponential backoff)
                if (attempt < MAX_RETRIES) {
                    const delay = RETRY_BASE_MS * Math.pow(2, attempt);
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
            return { success: false, error: 'Max retries exceeded' };
        }
        /** Send via sendBeacon (for page unload — fire and forget) */
        sendBeacon(events) {
            const url = `${this.apiUrl}/api/v1/events/batch`;
            const body = JSON.stringify({ events });
            // sendBeacon doesn't support custom headers, so we append apiKey as query param
            const beaconUrl = `${url}?api_key=${encodeURIComponent(this.apiKey)}`;
            const blob = new Blob([body], { type: 'application/json' });
            const sent = navigator.sendBeacon(beaconUrl, blob);
            this.log.log(`Beacon ${sent ? 'sent' : 'failed'}: ${events.length} events`);
            return sent;
        }
        /** Send customer upsert (for identify) — with retry on 5xx/network errors */
        async sendCustomerUpsert(customerId, attributes) {
            const url = `${this.apiUrl}/api/v1/customers`;
            const body = JSON.stringify({ customer_id: customerId, attributes });
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': this.apiKey,
                        },
                        body,
                    });
                    if (response.ok) {
                        this.log.log('Customer upserted:', customerId);
                        return;
                    }
                    // 4xx — don't retry (client error)
                    if (response.status >= 400 && response.status < 500) {
                        this.log.warn(`Customer upsert rejected (${response.status})`);
                        return;
                    }
                    this.log.warn(`Customer upsert failed (${response.status}), attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
                }
                catch (err) {
                    this.log.warn(`Customer upsert network error, attempt ${attempt + 1}/${MAX_RETRIES + 1}:`, err);
                }
                if (attempt < MAX_RETRIES) {
                    const delay = RETRY_BASE_MS * Math.pow(2, attempt);
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
            this.log.error('Customer upsert failed after max retries:', customerId);
        }
    }

    const QUEUE_KEY = 'storees_queue';
    const MAX_PERSISTED_EVENTS = 1000;
    class EventQueue {
        constructor(transport, consent, batchSize, flushInterval, log) {
            this.buffer = [];
            this.timer = null;
            this.flushing = false;
            this.transport = transport;
            this.consent = consent;
            this.batchSize = batchSize;
            this.flushInterval = flushInterval;
            this.log = log;
            // Restore any persisted events from previous session
            this.restorePersistedEvents();
            // Start flush timer
            this.startTimer();
            // Flush on page visibility change (hidden) and beforeunload
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.flushBeacon();
                }
            });
            window.addEventListener('beforeunload', () => {
                this.flushBeacon();
            });
            // Wire up consent: when consent is granted, flush queued events
            this.consent.onGranted(() => {
                this.log.log('Consent granted — flushing queued events');
                this.flush();
            });
        }
        /** Add an event to the queue */
        push(event) {
            this.buffer.push(event);
            this.log.log(`Queued event: ${event.event_name} (buffer: ${this.buffer.length})`);
            if (this.buffer.length >= this.batchSize) {
                this.flush();
            }
        }
        /** Flush events via fetch (async, with retry) */
        async flush() {
            if (this.flushing || this.buffer.length === 0)
                return;
            if (!this.consent.canTrack()) {
                this.log.log('Consent not granted — events queued but not sent');
                return;
            }
            this.flushing = true;
            const batch = this.buffer.splice(0, this.batchSize);
            try {
                const result = await this.transport.sendBatch(batch);
                if (!result.success) {
                    // Put failed events back and persist
                    this.buffer.unshift(...batch);
                    this.persistEvents();
                }
            }
            catch (_a) {
                // Network error — persist for later
                this.buffer.unshift(...batch);
                this.persistEvents();
            }
            finally {
                this.flushing = false;
            }
            // If there are still events, flush again
            if (this.buffer.length >= this.batchSize) {
                this.flush();
            }
        }
        /** Flush via sendBeacon (synchronous, for page unload) */
        flushBeacon() {
            if (this.buffer.length === 0)
                return;
            if (!this.consent.canTrack()) {
                this.persistEvents();
                return;
            }
            const batch = this.buffer.splice(0);
            const sent = this.transport.sendBeacon(batch);
            if (!sent) {
                // sendBeacon failed — persist for next page load
                this.buffer.unshift(...batch);
                this.persistEvents();
            }
        }
        /** Persist events to localStorage for offline/crash recovery */
        persistEvents() {
            if (this.buffer.length === 0)
                return;
            const toSave = this.buffer.slice(0, MAX_PERSISTED_EVENTS);
            storageSet(QUEUE_KEY, JSON.stringify(toSave));
            this.log.log(`Persisted ${toSave.length} events to localStorage`);
        }
        /** Restore persisted events on init */
        restorePersistedEvents() {
            const stored = storageGet(QUEUE_KEY);
            if (!stored)
                return;
            try {
                const events = JSON.parse(stored);
                if (Array.isArray(events) && events.length > 0) {
                    this.buffer.unshift(...events);
                    storageRemove(QUEUE_KEY);
                    this.log.log(`Restored ${events.length} persisted events`);
                }
            }
            catch (_a) {
                storageRemove(QUEUE_KEY);
            }
        }
        /** Start the periodic flush timer */
        startTimer() {
            if (this.timer)
                return;
            this.timer = setInterval(() => {
                this.flush();
            }, this.flushInterval);
        }
        /** Stop the flush timer */
        destroy() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            // Persist any remaining events
            this.persistEvents();
        }
        /** Get current buffer size (for debugging) */
        get size() {
            return this.buffer.length;
        }
    }

    const SESSION_ID_KEY = 'storees_session_id';
    const SESSION_START_KEY = 'storees_session_start';
    const SESSION_PAGES_KEY = 'storees_session_pages';
    const UTM_KEY = 'storees_utm';
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    class AutoTracker {
        constructor(autoTrackConfig, eventBuilder, queue, consent, log) {
            this.utmParams = {};
            this.scrollThresholds = new Set();
            this.cleanupFns = [];
            this.config = autoTrackConfig;
            this.eventBuilder = eventBuilder;
            this.queue = queue;
            this.consent = consent;
            this.log = log;
            // Initialize session
            this.sessionId = this.initSession();
            // Capture UTM params
            if (this.config.utm !== false) {
                this.captureUTM();
            }
            // Auto-tracking is started in setEventBuilder() to avoid using
            // an uninitialized eventBuilder (circular dependency with core.ts)
            if (eventBuilder) {
                this.startAutoTracking();
            }
        }
        /** Set the EventBuilder after construction (breaks circular init dependency) */
        setEventBuilder(builder) {
            this.eventBuilder = builder;
            this.startAutoTracking();
        }
        startAutoTracking() {
            if (this.config.pageViews !== false)
                this.trackPageViews();
            if (this.config.sessions !== false)
                this.trackSessions();
            if (this.config.clicks)
                this.trackClicks();
            if (this.config.scroll)
                this.trackScroll();
        }
        /** Get current session ID */
        getSessionId() {
            return this.sessionId;
        }
        /** Get captured UTM params to attach to events */
        getUTMParams() {
            return Object.assign({}, this.utmParams);
        }
        // ─── Session Management ─────────────────────────────────────
        initSession() {
            const existingId = sessionGet(SESSION_ID_KEY);
            const lastActivity = sessionGet(SESSION_START_KEY);
            if (existingId && lastActivity) {
                const elapsed = Date.now() - parseInt(lastActivity, 10);
                if (elapsed < SESSION_TIMEOUT_MS) {
                    // Resume existing session
                    sessionSet(SESSION_START_KEY, String(Date.now()));
                    return existingId;
                }
            }
            // New session
            const newId = generateId();
            sessionSet(SESSION_ID_KEY, newId);
            sessionSet(SESSION_START_KEY, String(Date.now()));
            sessionSet(SESSION_PAGES_KEY, '0');
            return newId;
        }
        trackSessions() {
            // Track session_started
            const event = this.eventBuilder.build('session_started', Object.assign({ referrer: document.referrer, landing_page: window.location.href }, this.utmParams));
            this.queue.push(event);
            // Track session_ended on visibility hidden (with timeout check)
            const handler = () => {
                if (document.visibilityState === 'hidden') {
                    const startStr = sessionGet(SESSION_START_KEY);
                    if (startStr) {
                        const duration = Date.now() - parseInt(startStr, 10);
                        const pageCount = parseInt(sessionGet(SESSION_PAGES_KEY) || '0', 10);
                        const endEvent = this.eventBuilder.build('session_ended', {
                            duration_ms: duration,
                            page_count: pageCount,
                        });
                        this.queue.push(endEvent);
                    }
                }
            };
            document.addEventListener('visibilitychange', handler);
            this.cleanupFns.push(() => document.removeEventListener('visibilitychange', handler));
        }
        // ─── Page View Tracking ─────────────────────────────────────
        trackPageViews() {
            // Track initial page view
            this.recordPageView();
            // Monkey-patch pushState and replaceState for SPA navigation
            const originalPushState = history.pushState.bind(history);
            const originalReplaceState = history.replaceState.bind(history);
            history.pushState = (...args) => {
                originalPushState(...args);
                this.onNavigation();
            };
            history.replaceState = (...args) => {
                originalReplaceState(...args);
                this.onNavigation();
            };
            // Listen for popstate (back/forward)
            const popHandler = () => this.onNavigation();
            window.addEventListener('popstate', popHandler);
            this.cleanupFns.push(() => {
                history.pushState = originalPushState;
                history.replaceState = originalReplaceState;
                window.removeEventListener('popstate', popHandler);
            });
        }
        onNavigation() {
            // Small delay to let the URL update
            setTimeout(() => this.recordPageView(), 0);
        }
        recordPageView() {
            if (!this.consent.hasCategory('analytics'))
                return;
            const event = this.eventBuilder.buildPageView(undefined, this.utmParams);
            this.queue.push(event);
            // Increment session page count
            const count = parseInt(sessionGet(SESSION_PAGES_KEY) || '0', 10);
            sessionSet(SESSION_PAGES_KEY, String(count + 1));
            // Reset scroll thresholds for new page
            this.scrollThresholds.clear();
        }
        // ─── Click Tracking ─────────────────────────────────────────
        trackClicks() {
            const handler = (e) => {
                if (!this.consent.hasCategory('analytics'))
                    return;
                const target = e.target;
                if (!target)
                    return;
                // Walk up to find the nearest clickable element
                const clickable = target.closest('a, button, [role="button"], [data-track]');
                const el = (clickable || target);
                const props = {
                    tag: el.tagName.toLowerCase(),
                    text: (el.innerText || '').slice(0, 100).trim(),
                };
                if (el.id)
                    props.id = el.id;
                if (el.className && typeof el.className === 'string') {
                    props.class = el.className.slice(0, 200);
                }
                if (el instanceof HTMLAnchorElement && el.href) {
                    props.href = el.href;
                }
                // Capture data-track-* attributes
                for (const attr of el.attributes) {
                    if (attr.name.startsWith('data-track-')) {
                        const key = attr.name.replace('data-track-', '');
                        props[key] = attr.value;
                    }
                }
                const event = this.eventBuilder.build('element_clicked', props);
                this.queue.push(event);
            };
            document.addEventListener('click', handler, true);
            this.cleanupFns.push(() => document.removeEventListener('click', handler, true));
        }
        // ─── Scroll Depth Tracking ──────────────────────────────────
        trackScroll() {
            const thresholds = [25, 50, 75, 100];
            let ticking = false;
            const handler = () => {
                if (ticking)
                    return;
                ticking = true;
                requestAnimationFrame(() => {
                    if (!this.consent.hasCategory('analytics')) {
                        ticking = false;
                        return;
                    }
                    const scrollTop = window.scrollY || document.documentElement.scrollTop;
                    const docHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
                    const percent = Math.round((scrollTop / docHeight) * 100);
                    for (const threshold of thresholds) {
                        if (percent >= threshold && !this.scrollThresholds.has(threshold)) {
                            this.scrollThresholds.add(threshold);
                            const event = this.eventBuilder.build('scroll_depth_reached', {
                                threshold,
                                page_url: window.location.href,
                                page_path: window.location.pathname,
                            });
                            this.queue.push(event);
                        }
                    }
                    ticking = false;
                });
            };
            window.addEventListener('scroll', handler, { passive: true });
            this.cleanupFns.push(() => window.removeEventListener('scroll', handler));
        }
        // ─── UTM Capture ────────────────────────────────────────────
        captureUTM() {
            // Check sessionStorage first (persist across pages in same session)
            const stored = sessionGet(UTM_KEY);
            if (stored) {
                try {
                    this.utmParams = JSON.parse(stored);
                    return;
                }
                catch (_a) {
                    // parse error, recapture
                }
            }
            // Parse from URL
            const params = new URLSearchParams(window.location.search);
            const utmKeys = [
                'utm_source',
                'utm_medium',
                'utm_campaign',
                'utm_term',
                'utm_content',
            ];
            for (const key of utmKeys) {
                const value = params.get(key);
                if (value) {
                    this.utmParams[key] = value;
                }
            }
            if (Object.keys(this.utmParams).length > 0) {
                sessionSet(UTM_KEY, JSON.stringify(this.utmParams));
                this.log.log('UTM params captured:', this.utmParams);
            }
        }
        // ─── Cleanup ────────────────────────────────────────────────
        destroy() {
            for (const fn of this.cleanupFns) {
                fn();
            }
            this.cleanupFns = [];
        }
    }

    const DEFAULT_CONFIG = {
        autoTrack: {
            pageViews: true,
            sessions: true,
            clicks: false,
            scroll: false,
            utm: true,
        },
        consent: {
            required: false,
            defaultCategories: ['necessary', 'analytics'],
        },
        batchSize: 20,
        flushInterval: 30000,
        debug: false,
    };
    class StoreesSdk {
        constructor() {
            this.initialized = false;
            // Pre-init command queue (for async snippet)
            this.preInitQueue = [];
        }
        /** Initialize the SDK */
        init(config) {
            var _a, _b;
            if (this.initialized) {
                console.warn('[Storees] SDK already initialized');
                return;
            }
            if (!config.apiKey) {
                console.error('[Storees] apiKey is required');
                return;
            }
            if (!config.apiUrl) {
                console.error('[Storees] apiUrl is required');
                return;
            }
            this.config = Object.assign(Object.assign(Object.assign({}, DEFAULT_CONFIG), config), { 
                // Deep merge nested objects so partial overrides don't wipe defaults
                autoTrack: Object.assign(Object.assign({}, DEFAULT_CONFIG.autoTrack), config.autoTrack), consent: Object.assign(Object.assign({}, DEFAULT_CONFIG.consent), config.consent) });
            const log = createLogger(this.config.debug || false);
            // Initialize modules
            this.identity = new IdentityManager(log);
            this.consent = new ConsentManager(((_a = this.config.consent) === null || _a === void 0 ? void 0 : _a.required) || false, ((_b = this.config.consent) === null || _b === void 0 ? void 0 : _b.defaultCategories) || ['necessary', 'analytics'], log);
            this.transport = new Transport(this.config.apiUrl, this.config.apiKey, log);
            this.queue = new EventQueue(this.transport, this.consent, this.config.batchSize || 20, this.config.flushInterval || 30000, log);
            // AutoTracker needs a sessionId getter — use a late-binding closure
            // so EventBuilder always gets the current session ID (not a stale copy)
            this.autoTracker = new AutoTracker(this.config.autoTrack || {}, undefined, // set below after eventBuilder is created
            this.queue, this.consent, log);
            this.eventBuilder = new EventBuilder(this.identity, () => this.autoTracker.getSessionId(), log);
            // Wire up the EventBuilder reference that AutoTracker needs
            this.autoTracker.setEventBuilder(this.eventBuilder);
            this.initialized = true;
            log.log('SDK initialized', {
                apiUrl: this.config.apiUrl,
                autoTrack: this.config.autoTrack,
            });
            // Process any commands queued before init
            this.drainPreInitQueue();
        }
        /** Identify a user — anonymous → known transition */
        identify(userId, attributes) {
            if (!this.ensureInit('identify', userId, attributes))
                return;
            const { previousAnonymousId, isNewIdentification } = this.identity.identify(userId, attributes);
            // Track the identification event
            if (isNewIdentification) {
                const event = this.eventBuilder.buildIdentifyEvent(userId, previousAnonymousId, attributes);
                this.queue.push(event);
            }
            // Upsert customer on the backend
            if (attributes) {
                this.transport.sendCustomerUpsert(userId, attributes);
            }
        }
        /** Track a custom event */
        track(eventName, properties) {
            if (!this.ensureInit('track', eventName, properties))
                return;
            const event = this.eventBuilder.build(eventName, Object.assign(Object.assign({}, properties), this.autoTracker.getUTMParams()));
            this.queue.push(event);
        }
        /** Track a page view */
        page(path, properties) {
            if (!this.ensureInit('page', path, properties))
                return;
            const event = this.eventBuilder.buildPageView(path, Object.assign(Object.assign({}, properties), this.autoTracker.getUTMParams()));
            this.queue.push(event);
        }
        /** Set user properties without tracking an event */
        setUserProperties(attributes) {
            if (!this.ensureInit('setUserProperties', attributes))
                return;
            this.identity.setAttributes(attributes);
            // Track property update event
            const event = this.eventBuilder.buildSetPropertiesEvent(attributes);
            this.queue.push(event);
            // Upsert customer if identified
            const identity = this.identity.getIdentity();
            if (identity.userId) {
                this.transport.sendCustomerUpsert(identity.userId, attributes);
            }
        }
        /** Set GDPR consent categories */
        setConsent(categories) {
            if (!this.ensureInit('setConsent', categories))
                return;
            this.consent.setConsent(categories);
        }
        /** Reset identity and session — call on user logout */
        reset() {
            if (!this.ensureInit('reset'))
                return;
            this.queue.flush();
            this.identity.reset();
            this.autoTracker.destroy();
        }
        // ─── Internal Helpers ───────────────────────────────────────
        /** Ensure SDK is initialized, or queue the command */
        ensureInit(method, ...args) {
            if (this.initialized)
                return true;
            // Queue for processing after init
            this.preInitQueue.push([method, ...args]);
            return false;
        }
        /** Process commands that were called before init */
        drainPreInitQueue() {
            for (const [method, ...args] of this.preInitQueue) {
                const fn = this[method];
                if (typeof fn === 'function') {
                    fn.apply(this, args);
                }
            }
            this.preInitQueue = [];
        }
    }
    // ─── Singleton + UMD Export ─────────────────────────────────
    const instance = new StoreesSdk();
    // Support the async snippet pattern:
    // Storees('init', { ... }) before the SDK loads
    if (typeof window !== 'undefined') {
        const existingQueue = window.Storees;
        if (existingQueue && typeof existingQueue === 'function') {
            // The stub queued calls as: Storees.q = [[method, ...args], ...]
            const stub = existingQueue;
            if (stub.q && Array.isArray(stub.q)) {
                for (const [method, ...args] of stub.q) {
                    const fn = instance[method];
                    if (typeof fn === 'function') {
                        fn.apply(instance, args);
                    }
                }
            }
        }
        window.Storees = instance;
    }

    exports.StoreesSdk = StoreesSdk;
    exports.default = instance;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=storees.umd.js.map
