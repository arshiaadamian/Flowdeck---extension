/**
 * Flowdeck Storage Layer
 * Manages chrome.storage.local for course data.
 * Popup uses this instead of calling chrome.storage directly.
 */

const STORAGE_KEY = 'flowdeckCourses';
const LEGACY_WEIGHTS_KEY = 'weightsByCourse';
const OUTLINE_CACHE_KEY = 'flowdeckOutlineCache';

/**
 * Loads course data for a given course key.
 * @param {string} courseKey - e.g. "d2l-123456"
 * @returns {Promise<Object|null>} Course JSON (POJO) or null if not found
 */
export async function loadCourse(courseKey) {
  if (!courseKey || typeof courseKey !== 'string') {
    console.log('[Flowdeck] loadCourse: invalid courseKey');
    return null;
  }

  if (!chrome?.storage?.local) {
    console.error('[Flowdeck] Storage API not available');
    return null;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY, LEGACY_WEIGHTS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error('[Flowdeck] loadCourse error:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      const data = result[STORAGE_KEY] || {};
      let course = data[courseKey] ?? null;
      if (!course && result[LEGACY_WEIGHTS_KEY]?.[courseKey]) {
        const rows = result[LEGACY_WEIGHTS_KEY][courseKey];
        course = { id: courseKey, categories: rows.map((r) => ({ category: r.name, weight_percent: r.weight ?? 0 })) };
        console.log('[Flowdeck] loadCourse: migrated from legacy weightsByCourse');
      }
      console.log('[Flowdeck] loadCourse:', courseKey, course ? 'found' : 'not found');
      resolve(course);
    });
  });
}

/**
 * Saves course data for a given course key.
 * @param {string} courseKey - e.g. "d2l-123456"
 * @param {Object} courseJson - Course POJO (e.g. from Course.toJson())
 * @returns {Promise<void>}
 */
export async function saveCourse(courseKey, courseJson) {
  if (!courseKey || typeof courseKey !== 'string') {
    console.log('[Flowdeck] saveCourse: invalid courseKey');
    return;
  }

  if (!chrome?.storage?.local) {
    console.error('[Flowdeck] Storage API not available');
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error('[Flowdeck] saveCourse get error:', chrome.runtime.lastError.message);
        resolve();
        return;
      }
      const data = result[STORAGE_KEY] || {};
      data[courseKey] = courseJson;
      chrome.storage.local.set({ [STORAGE_KEY]: data }, () => {
        if (chrome.runtime.lastError) {
          console.error('[Flowdeck] saveCourse set error:', chrome.runtime.lastError.message);
        } else {
          console.log('[Flowdeck] saveCourse: saved', courseKey);
        }
        resolve();
      });
    });
  });
}

/**
 * Loads the outline from the cache for a given course key.
 * @param {string} cacheKey - e.g. a course key -> "20251048068"
 * @returns {Promise<Object|null>} Cached outline object or null if not found
 */
export async function loadOutlineCache(cacheKey){
    if (!cacheKey || typeof cacheKey !== 'string') {
        console.log('[Flowdeck] loadOutlineCache: invalid cacheKey');
        return null;
    }

    if (!chrome?.storage?.local) {
        console.error('[Flowdeck] Storage API not available');
        return null;
    }

    return new Promise((resolve) => {
        chrome.storage.local.get([OUTLINE_CACHE_KEY], (result) => {
            if (chrome.runtime.lastError) {
                console.error('[Flowdeck] loadOutlineCache error:', chrome.runtime.lastError.message);
                resolve(null);
                return;
            }
            const data = result[OUTLINE_CACHE_KEY] || {};
            const cached = data[cacheKey] ? data[cacheKey] : null;
            console.log('[Flowdeck] loadOutlineCache:', cacheKey, cached ? 'found' : 'not found');
            resolve(cached);
        });
    })
}

/**
 * Saves the outline to the cache for a given cacheKey and structured outline object.
 * @param {string} cacheKey - e.g. a course key -> "20251048068"
 * @param {Object} structuredData - structured outline object to cache (e.g. from AI parsing)
 * @returns {Promise<void>}
 */
export async function saveOutlineCache(cacheKey, structuredData){
    if (!cacheKey || typeof cacheKey !== 'string') {
        console.log('[Flowdeck] saveOutlineCache: invalid cacheKey');
        return;
    }

    if (!chrome?.storage?.local) {
        console.error('[Flowdeck] Storage API not available');
        return;
    }

    return new Promise((resolve) => {
        chrome.storage.local.get([OUTLINE_CACHE_KEY], (result) => {
            if (chrome.runtime.lastError) {
                console.error('[Flowdeck] saveOutlineCache get error:', chrome.runtime.lastError.message);
                resolve();
                return;
            }

            const data = result[OUTLINE_CACHE_KEY] || {};
            data[cacheKey] = structuredData;
            chrome.storage.local.set({ [OUTLINE_CACHE_KEY]: data }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[Flowdeck] saveOutlineCache set error:', chrome.runtime.lastError.message);
                } else {
                    console.log('[Flowdeck] saveOutlineCache: saved', cacheKey);
                }
                resolve();
            });
        });
    });
}

/** 
 * Clears outline cache for a given cachKey
 * @param {string} cacheKey - e.g. a course key -> "20251048068"
 * @returns {Promise<void>}
 */

export async function clearOutlineCache(cacheKey){
    if (!cacheKey || typeof cacheKey !== 'string')
    {
      console.log("[Flowdeck] clearOutlineCache: invalid cachekey");
      return;
    }

    if (!chrome?.storage?.local){
      console.error('[Flowdeck] Storage API not available');
      return;
    }

    return new Promise ((resolve) => {
      chrome.storage.local.get([OUTLINE_CACHE_KEY], (result) => {
        if (chrome.runtime.lastError)
        {
          console.error('[Flowdeck] saveOutlineCache get error:', chrome.runtime.lastError.message);
          resolve();
          return;
        }

        const data = result[OUTLINE_CACHE_KEY] || {};
        delete data[cacheKey];
        chrome.storage.local.set({ [OUTLINE_CACHE_KEY]: data }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Flowdeck] clearOutlineCache set error:', chrome.runtime.lastError.message);
          } else {
            console.log('[Flowdeck] clearOutlineCache: saved', cacheKey);
          }
          resolve();
        })
      })
    })
}

