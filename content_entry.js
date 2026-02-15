/**
 * Flowdeck Content Entry - Thin message bridge
 * Receives FLOWDECK_SCRAPE, calls scrapedata.js, responds with JSON.
 * Contains NO scraping logic.
 */

console.log('[Flowdeck] Content script loaded');

const SCRAPE_MODULE_URL = chrome.runtime.getURL('scrapedata.js');

let scrapeModulePromise = null;

function getScrapeModule() {
  if (!scrapeModulePromise) {
    scrapeModulePromise = import(SCRAPE_MODULE_URL).catch((err) => {
      console.error('[Flowdeck] Failed to load scrapedata module:', err);
      scrapeModulePromise = null;
      throw err;
    });
  }
  return scrapeModulePromise;
}

function isLearningHub(url) {
  return url && typeof url === 'string' && url.includes('learn.bcit.ca');
}

/**
 * Minimal course detection from nav link (no grades table required).
 * Used when popup needs courseKey/name before user is on grades page.
 */
function getCourseFromNav() {
  const link = document.querySelector('a.d2l-navigation-s-link[href*="/d2l/home/"]');
  if (!link) return { ok: false };
  const href = link.getAttribute('href') || '';
  const m = href.match(/\/d2l\/home\/(\d+)/);
  if (!m) return { ok: false };
  const rawText = (link.textContent || '').trim();
  const courseName = rawText ? rawText.split('(merge')[0].trim() : '';
  if (!courseName) return { ok: false };
  return { ok: true, courseName, courseKey: `d2l-${m[1]}` };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('[Flowdeck] Message received:', request?.type);

  if (request.type === 'FLOWDECK_GET_COURSE') {
    const result = getCourseFromNav();
    console.log('[Flowdeck] GET_COURSE response:', result.ok ? result.courseKey : 'not found');
    sendResponse(result);
    return false;
  }

  if (request.type !== 'FLOWDECK_SCRAPE') {
    return false;
  }

  const url = typeof window !== 'undefined' ? window.location?.href : '';
  if (!isLearningHub(url)) {
    console.log('[Flowdeck] Not on Learning Hub, rejecting');
    sendResponse({ ok: false, reason: 'not_on_learninghub' });
    return false;
  }

  getScrapeModule()
    .then((mod) => {
      const scrape = mod.scrapeCourseAndGradesFromPage;
      if (typeof scrape !== 'function') {
        console.error('[Flowdeck] scrapeCourseAndGradesFromPage not found');
        sendResponse({ ok: false, reason: 'scrape_failed', error: 'Scrape function not available' });
        return;
      }
      try {
        const courseJson = scrape(document);
        const hasCategories = Array.isArray(courseJson?.categories) && courseJson.categories.length > 0;
        if (!hasCategories) {
          console.log('[Flowdeck] No categories found on page');
          sendResponse({ ok: false, reason: 'not_found' });
          return;
        }
        console.log('[Flowdeck] Scrape success, sending course');
        sendResponse({ ok: true, course: courseJson });
      } catch (err) {
        console.error('[Flowdeck] Scrape error:', err);
        sendResponse({
          ok: false,
          reason: 'scrape_failed',
          error: err?.message || String(err),
        });
      }
    })
    .catch((err) => {
      console.error('[Flowdeck] Module load error:', err);
      sendResponse({
        ok: false,
        reason: 'scrape_failed',
        error: err?.message || String(err),
      });
    });

  return true; // Keep channel open for async response
});
