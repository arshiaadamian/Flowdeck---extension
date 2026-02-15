/**
 * Flowdeck Storage Layer
 * Manages chrome.storage.local for course data.
 * Popup uses this instead of calling chrome.storage directly.
 */

const STORAGE_KEY = 'flowdeckCourses';
const LEGACY_WEIGHTS_KEY = 'weightsByCourse';

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
