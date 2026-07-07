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
        /** Send customer upsert (for identify) — with retry on 5xx/network errors.
         *  Phase F3 — session_id is included so the backend can link the
         *  pre-identify browser session to this customer and back-attribute prior
         *  anonymous events (browse-abandonment / open-but-not-purchase use cases).
         */
        async sendCustomerUpsert(customerId, attributes, sessionId) {
            const url = `${this.apiUrl}/api/v1/customers`;
            const body = JSON.stringify({ customer_id: customerId, attributes, session_id: sessionId });
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

    /**
     * Detect a Shopify product/collection page and extract structured info, so the
     * SDK can emit `product_viewed` / `collection_viewed` (not just generic
     * page_viewed). These are what the segment engine's has_viewed operator and
     * product-affinity flows match on.
     *
     * Everything is best-effort and defensive: the handle + name (from URL/title)
     * always resolve; id/price/vendor come from Shopify's on-page data when present
     * and are simply omitted otherwise. Never throws.
     */
    function shopifyMeta() {
        var _a, _b;
        const w = window;
        return (_b = (_a = w.ShopifyAnalytics) === null || _a === void 0 ? void 0 : _a.meta) !== null && _b !== void 0 ? _b : w.meta;
    }
    /** Read a numeric price (major units) from JSON-LD or og/product meta tags. */
    function priceFromDom() {
        try {
            for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
                const parsed = JSON.parse(el.textContent || '{}');
                const nodes = Array.isArray(parsed) ? parsed : [parsed];
                for (const node of nodes) {
                    if (node['@type'] === 'Product' && node.offers) {
                        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                        const p = Number(offer === null || offer === void 0 ? void 0 : offer.price);
                        if (Number.isFinite(p))
                            return p;
                    }
                }
            }
        }
        catch ( /* ignore malformed JSON-LD */_a) { /* ignore malformed JSON-LD */ }
        const metaPrice = document.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"]');
        const p = Number(metaPrice === null || metaPrice === void 0 ? void 0 : metaPrice.getAttribute('content'));
        return Number.isFinite(p) ? p : undefined;
    }
    /** If the current page is a product page, return structured info; else null. */
    function detectProduct() {
        var _a, _b, _c, _d;
        const path = window.location.pathname;
        const m = path.match(/\/products\/([^/?#]+)/);
        if (!m)
            return null;
        const handle = decodeURIComponent(m[1]);
        const meta = shopifyMeta();
        const prod = meta === null || meta === void 0 ? void 0 : meta.product;
        const variantId = (_a = new URLSearchParams(window.location.search).get('variant')) !== null && _a !== void 0 ? _a : undefined;
        // Price: matching variant from Shopify meta (in cents) → any variant → DOM
        let price;
        const variants = (_b = prod === null || prod === void 0 ? void 0 : prod.variants) !== null && _b !== void 0 ? _b : [];
        const matched = variantId ? variants.find(v => String(v.id) === variantId) : variants[0];
        if ((matched === null || matched === void 0 ? void 0 : matched.price) != null) {
            const cents = Number(matched.price);
            if (Number.isFinite(cents))
                price = cents / 100;
        }
        if (price === undefined)
            price = priceFromDom();
        const currencyMeta = document.querySelector('meta[property="product:price:currency"], meta[property="og:price:currency"]');
        return {
            product_handle: handle,
            product_id: (prod === null || prod === void 0 ? void 0 : prod.id) != null ? String(prod.id) : undefined,
            product_name: ((_c = document.title.split(/\s[–|-]\s/)[0]) === null || _c === void 0 ? void 0 : _c.trim()) || handle,
            price,
            currency: (_d = currencyMeta === null || currencyMeta === void 0 ? void 0 : currencyMeta.getAttribute('content')) !== null && _d !== void 0 ? _d : undefined,
            vendor: prod === null || prod === void 0 ? void 0 : prod.vendor,
            variant_id: variantId,
            url: window.location.href,
        };
    }
    /** If the current page is a collection page, return the handle; else null. */
    function detectCollection() {
        const m = window.location.pathname.match(/\/collections\/([^/?#]+)/);
        if (!m)
            return null;
        const handle = decodeURIComponent(m[1]);
        if (handle === 'all')
            return null;
        return { collection_handle: handle, url: window.location.href };
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
            // Emit a SPECIFIC event on product / collection pages too — generic
            // page_viewed can't drive "viewed product X but didn't buy" segments or
            // product-affinity flows; those need product_viewed with product fields.
            if (this.config.productViews !== false) {
                try {
                    const product = detectProduct();
                    if (product) {
                        this.queue.push(this.eventBuilder.build('product_viewed', Object.assign({}, product)));
                    }
                    else {
                        const collection = detectCollection();
                        if (collection) {
                            this.queue.push(this.eventBuilder.build('collection_viewed', Object.assign({}, collection)));
                        }
                    }
                }
                catch ( /* detection is best-effort — never break page tracking */_a) { /* detection is best-effort — never break page tracking */ }
            }
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

    /**
     * Storees on-site opt-in widgets (Phase F2b).
     *
     * Fetches active widgets for the project from /v1/widgets, attaches the
     * configured triggers (exit-intent, time-on-page, scroll-depth, manual),
     * and renders a modal with the form when a trigger fires. On submit POSTs
     * to /v1/optin which creates the contact, records consent (with the
     * widget's exact text), and emits optin_received for flow triggering.
     *
     * Designed for tiny bundle impact: ~3KB minified. No framework, no JSX, no
     * external dependencies. Inline CSS so the merchant doesn't need to add a
     * stylesheet. Polls fonts and colours from the widget config so the look
     * matches the brand.
     */
    const SHOWN_KEY_PREFIX = 'storees_widget_shown_';
    class WidgetManager {
        constructor(apiUrl, apiKey, debug) {
            this.widgets = [];
            this.mounted = new Set();
            this.apiUrl = apiUrl.replace(/\/$/, '');
            this.apiKey = apiKey;
            this.logger = createLogger(debug);
        }
        /** Boot: fetch active widgets + arm triggers. Idempotent. */
        async init() {
            var _a;
            if (typeof window === 'undefined')
                return;
            try {
                const resp = await fetch(`${this.apiUrl}/api/v1/widgets`, {
                    headers: { 'X-API-Key': this.apiKey },
                });
                if (!resp.ok) {
                    this.logger.warn('[widget] fetch failed:', resp.status);
                    return;
                }
                const data = (await resp.json());
                this.widgets = (_a = data.data) !== null && _a !== void 0 ? _a : [];
                this.logger.log(`[widget] loaded ${this.widgets.length} active widgets`);
                for (const w of this.widgets)
                    this.armTrigger(w);
            }
            catch (err) {
                this.logger.warn('[widget] init failed:', err);
            }
        }
        /** Manually show a widget by name or id (`Storees('widget', 'show', 'welcome')`). */
        show(idOrName) {
            const w = this.widgets.find(x => x.id === idOrName || x.name === idOrName);
            if (!w) {
                this.logger.warn('[widget] show: not found', idOrName);
                return;
            }
            if (!this.shouldShow(w))
                return;
            this.render(w);
        }
        // ── Trigger arming ──────────────────────────────────────────
        armTrigger(w) {
            if (this.mounted.has(w.id))
                return;
            if (!this.matchesPath(w))
                return;
            switch (w.triggerType) {
                case 'manual':
                    // No auto-arming — show() must be called explicitly
                    break;
                case 'time_on_page': {
                    const seconds = Number(w.triggerConfig.seconds) || 30;
                    const timer = window.setTimeout(() => {
                        if (this.shouldShow(w))
                            this.render(w);
                    }, seconds * 1000);
                    this.mounted.add(w.id);
                    // Clean up on page unload to avoid duplicate timers in SPA route changes
                    window.addEventListener('beforeunload', () => window.clearTimeout(timer), { once: true });
                    break;
                }
                case 'scroll_depth': {
                    const percent = Number(w.triggerConfig.percent) || 50;
                    const onScroll = () => {
                        const scrolled = window.scrollY;
                        const max = document.documentElement.scrollHeight - window.innerHeight;
                        const pct = max > 0 ? (scrolled / max) * 100 : 0;
                        if (pct >= percent) {
                            window.removeEventListener('scroll', onScroll);
                            if (this.shouldShow(w))
                                this.render(w);
                        }
                    };
                    window.addEventListener('scroll', onScroll, { passive: true });
                    this.mounted.add(w.id);
                    break;
                }
                case 'exit_intent': {
                    const onLeave = (e) => {
                        // Mouse leaves through the top of the viewport — desktop only.
                        if (e.clientY <= 0) {
                            document.removeEventListener('mouseleave', onLeave);
                            if (this.shouldShow(w))
                                this.render(w);
                        }
                    };
                    document.addEventListener('mouseleave', onLeave);
                    this.mounted.add(w.id);
                    break;
                }
            }
        }
        // ── Display gating ──────────────────────────────────────────
        shouldShow(w) {
            if (!w.showOnce)
                return true;
            try {
                return localStorage.getItem(SHOWN_KEY_PREFIX + w.id) !== '1';
            }
            catch (_a) {
                return true;
            }
        }
        markShown(w) {
            try {
                if (w.showOnce)
                    localStorage.setItem(SHOWN_KEY_PREFIX + w.id, '1');
            }
            catch (_a) {
                // localStorage unavailable (incognito quota etc.) — ignore
            }
        }
        matchesPath(w) {
            if (!w.targetPages || w.targetPages.length === 0)
                return true;
            const path = window.location.pathname;
            for (const glob of w.targetPages) {
                // Simple glob: '*' matches any sequence. Anchor at start; require path to start with the literal prefix.
                const re = new RegExp('^' + glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
                if (re.test(path))
                    return true;
            }
            return false;
        }
        // ── Render + submit ─────────────────────────────────────────
        render(w) {
            if (document.getElementById(`storees-widget-${w.id}`))
                return; // already on screen
            const overlay = document.createElement('div');
            overlay.id = `storees-widget-${w.id}`;
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
                'background:rgba(15,23,42,0.6)', 'z-index:2147483647',
                'display:flex', 'align-items:center', 'justify-content:center',
                'padding:16px', 'font-family:-apple-system,Segoe UI,Roboto,sans-serif',
            ].join(';');
            const card = document.createElement('div');
            card.style.cssText = [
                'background:#fff', 'border-radius:12px', 'padding:28px',
                'max-width:420px', 'width:100%', 'box-shadow:0 20px 50px rgba(0,0,0,0.25)',
                'box-sizing:border-box',
            ].join(';');
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.setAttribute('aria-label', 'Close');
            closeBtn.style.cssText = [
                'position:absolute', 'top:12px', 'right:16px',
                'background:transparent', 'border:0', 'font-size:28px',
                'color:#94a3b8', 'cursor:pointer', 'line-height:1', 'padding:4px 8px',
            ].join(';');
            closeBtn.addEventListener('click', () => {
                this.markShown(w);
                overlay.remove();
            });
            const inner = `
      <h2 style="font-size:20px;font-weight:600;margin:0 0 8px;color:#0f172a;">${escapeHtml(w.headline)}</h2>
      ${w.body ? `<p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#475569;">${escapeHtml(w.body)}</p>` : ''}
      <form data-storees-form style="margin:0;">
        ${w.collectName ? `<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:13px;color:#475569;margin-bottom:4px;">Name</span><input name="name" type="text" autocomplete="name" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;"></label>` : ''}
        ${w.collectEmail ? `<label style="display:block;margin-bottom:10px;"><span style="display:block;font-size:13px;color:#475569;margin-bottom:4px;">Email</span><input name="email" type="email" autocomplete="email" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;"></label>` : ''}
        <label style="display:block;margin-bottom:10px;">
          <span style="display:block;font-size:13px;color:#475569;margin-bottom:4px;">Phone${w.phoneRequired ? ' *' : ''}</span>
          <input name="phone" type="tel" autocomplete="tel" ${w.phoneRequired ? 'required' : ''} placeholder="+91 9876543210" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;">
        </label>
        <!-- honeypot — bots fill every input. Hidden visually + from screen readers via aria-hidden + tabindex=-1. -->
        <input name="hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;height:0;width:0;opacity:0;">
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#64748b;margin:14px 0 16px;line-height:1.5;">
          <input name="consent" type="checkbox" ${w.preCheckConsent ? 'checked' : ''} style="margin-top:2px;flex-shrink:0;">
          <span>${escapeHtml(w.consentText)}</span>
        </label>
        <button type="submit" style="width:100%;padding:11px;background:#4F46E5;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">${escapeHtml(w.buttonLabel)}</button>
        <div data-storees-status style="margin-top:10px;text-align:center;font-size:13px;min-height:18px;"></div>
      </form>
    `;
            card.style.position = 'relative';
            card.innerHTML = inner;
            card.appendChild(closeBtn);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            const form = card.querySelector('[data-storees-form]');
            const statusEl = card.querySelector('[data-storees-status]');
            form.addEventListener('submit', async (e) => {
                var _a, _b, _c, _d, _e;
                e.preventDefault();
                const fd = new FormData(form);
                const consentChecked = fd.get('consent') === 'on';
                if (!consentChecked) {
                    statusEl.style.color = '#dc2626';
                    statusEl.textContent = 'Please tick the consent box to continue.';
                    return;
                }
                const phone = (_a = fd.get('phone')) === null || _a === void 0 ? void 0 : _a.trim();
                if (w.phoneRequired && !phone) {
                    statusEl.style.color = '#dc2626';
                    statusEl.textContent = 'Phone number is required.';
                    return;
                }
                statusEl.style.color = '#475569';
                statusEl.textContent = 'Submitting…';
                const submitBtn = form.querySelector('button[type=submit]');
                submitBtn.disabled = true;
                try {
                    const resp = await fetch(`${this.apiUrl}/api/v1/optin`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
                        body: JSON.stringify({
                            widgetId: w.id,
                            phone,
                            email: (_b = fd.get('email')) !== null && _b !== void 0 ? _b : undefined,
                            name: (_c = fd.get('name')) !== null && _c !== void 0 ? _c : undefined,
                            sourceUrl: window.location.href,
                            hp: (_d = fd.get('hp')) !== null && _d !== void 0 ? _d : undefined,
                        }),
                    });
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        statusEl.style.color = '#dc2626';
                        statusEl.textContent = (_e = body.error) !== null && _e !== void 0 ? _e : 'Something went wrong. Please try again.';
                        submitBtn.disabled = false;
                        return;
                    }
                    // Success — show a thank-you, then auto-close after 2.5s
                    statusEl.style.color = '#059669';
                    statusEl.textContent = 'Thanks! We\'ll be in touch.';
                    this.markShown(w);
                    setTimeout(() => overlay.remove(), 2500);
                }
                catch (err) {
                    statusEl.style.color = '#dc2626';
                    statusEl.textContent = 'Network error. Please check your connection.';
                    submitBtn.disabled = false;
                    this.logger.warn('[widget] submit failed:', err);
                }
            });
        }
    }
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Shopify cart bridge — stamps the current SDK session id onto the Shopify
     * cart as the `storees_sid` attribute (POST /cart/update.js).
     *
     * Why this matters: Shopify carries cart attributes into
     * `order.note_attributes` (the backend's order→session stitch reads exactly
     * that key), and hosted-checkout providers like Shopflo forward cart
     * attributes in their webhook payloads the same way. This one attribute is
     * the bridge that lets identity captured at checkout (phone/email typed on a
     * DIFFERENT domain, e.g. checkout.shopflo.co) back-attribute the anonymous
     * browsing session.
     *
     * Behavior:
     * - Idempotent per session id (in-memory + sessionStorage guard, so SPA
     *   navigations don't re-POST).
     * - Session renewals re-stamp automatically (the guard keys on the sid).
     * - Safe on non-Shopify sites: /cart/update.js 404s once, we stop trying for
     *   the rest of the page load. One tiny request, no errors surfaced.
     */
    class ShopifyCartBridge {
        constructor(getSessionId, log) {
            this.getSessionId = getSessionId;
            this.log = log;
            this.stampedSid = null;
            this.inflight = false;
            this.unavailable = false; // non-Shopify page — stop trying
        }
        /** Idempotent — call as often as convenient; it no-ops unless the sid changed. */
        async stamp() {
            if (this.unavailable || this.inflight)
                return;
            const sid = this.getSessionId();
            if (!sid || this.stampedSid === sid)
                return;
            try {
                if (sessionStorage.getItem('storees_sid_stamped') === sid) {
                    this.stampedSid = sid;
                    return;
                }
            }
            catch ( /* storage unavailable — rely on the in-memory guard */_a) { /* storage unavailable — rely on the in-memory guard */ }
            this.inflight = true;
            try {
                const res = await fetch('/cart/update.js', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ attributes: { storees_sid: sid } }),
                });
                if (res.ok) {
                    this.stampedSid = sid;
                    try {
                        sessionStorage.setItem('storees_sid_stamped', sid);
                    }
                    catch ( /* ignore */_b) { /* ignore */ }
                    this.log.log('[cart] storees_sid stamped onto Shopify cart', sid);
                }
                else {
                    // 404/405 → not a Shopify storefront (or AJAX API disabled)
                    this.unavailable = true;
                    this.log.log('[cart] /cart/update.js unavailable — cart bridge off for this page');
                }
            }
            catch (_c) {
                // network hiccup — leave guards unset so a later trigger retries
            }
            finally {
                this.inflight = false;
            }
        }
        /** Stamp now and keep the cart in sync with session renewals. */
        start() {
            void this.stamp();
            // Sessions renew after inactivity; a 30s idempotent re-check keeps the
            // cart attribute current without hooking the session lifecycle.
            setInterval(() => void this.stamp(), 30000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible')
                    void this.stamp();
            });
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
            // On-site opt-in widgets (Phase F2b). Loaded async so the SDK init
            // doesn't block on the network — widgets render whenever they're ready,
            // which is fine for time/scroll/exit triggers (all fire after first paint).
            this.widgetManager = new WidgetManager(this.config.apiUrl, this.config.apiKey, this.config.debug || false);
            this.widgetManager.init().catch(err => log.warn('[widget] init failed:', err));
            // Shopify cart bridge — stamps storees_sid onto the cart so checkout /
            // order webhooks can stitch this session to the identified customer.
            if (this.config.cartBridge !== false) {
                new ShopifyCartBridge(() => this.autoTracker.getSessionId(), log).start();
            }
            this.initialized = true;
            log.log('SDK initialized', {
                apiUrl: this.config.apiUrl,
                autoTrack: this.config.autoTrack,
            });
            // Process any commands queued before init
            this.drainPreInitQueue();
        }
        /**
         * Manually trigger a widget by name or id.
         * Usage: Storees('widget', 'show', 'welcome_offer')
         */
        widget(action, idOrName) {
            if (!this.ensureInit('widget', action, idOrName))
                return;
            if (action === 'show')
                this.widgetManager.show(idOrName);
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
                this.transport.sendCustomerUpsert(userId, attributes, this.autoTracker.getSessionId());
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
