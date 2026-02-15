/**
 * Flowdeck Popup - Thin UI Controller
 * Orchestrates UI, calls storage/calc/messaging. No scraping or grade math.
 */

import { Course } from './models.js';
import { computeCourseCurrentGrade } from './calc.js';
import { loadCourse, saveCourse } from './storage.js';

document.addEventListener('DOMContentLoaded', function () {
  console.log('[Flowdeck] Extension popup loaded');

  const weightsToggle = document.getElementById('weightsToggle');
  const weightsContent = document.getElementById('weightsContent');
  const changeCourseBtn = document.getElementById('changeCourseBtn');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const saveWeightsBtn = document.getElementById('saveWeightsBtn');
  const editWeightsBtn = document.getElementById('editWeightsBtn');
  const resetCourseBtn = document.getElementById('resetCourseBtn');
  const refreshGradesBtn = document.getElementById('refreshGradesBtn');
  const fetchStatus = document.getElementById('fetchStatus');
  const autoFetchWarning = document.getElementById('autoFetchWarning');
  const detectedCourseEl = document.getElementById('detectedCourse');
  const saveStatus = document.getElementById('saveStatus');
  const weightsTableBody = document.getElementById('weightsTableBody');
  const currentGradeValue = document.getElementById('currentGradeValue');
  const requiredGradeValue = document.getElementById('requiredGradeValue');
  const targetGradeInput = document.getElementById('targetGrade');

  let currentCourseKey = null;

  // --- UI Helpers ---

  function showSaveStatus(message, type) {
    if (!saveStatus) return;
    saveStatus.textContent = message;
    saveStatus.className = `save-status ${type}`;
    saveStatus.style.display = 'block';
    setTimeout(() => {
      if (saveStatus) saveStatus.style.display = 'none';
    }, 3000);
  }

  function showFetchStatus(message, className) {
    if (!fetchStatus) return;
    fetchStatus.style.display = 'block';
    fetchStatus.textContent = message;
    fetchStatus.className = `fetch-status ${className || ''}`;
  }

  // --- Weights Table ---

  function getDefaultWeights() {
    return [
      { name: 'Assignments', weight: 30 },
      { name: 'Midterm', weight: 25 },
      { name: 'Final Exam', weight: 45 },
    ];
  }

  function renderWeightsTable(rows) {
    if (!weightsTableBody) return;
    weightsTableBody.innerHTML = '';
    (rows || []).forEach((row, index) => {
      const tr = document.createElement('tr');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'category-name-input';
      nameInput.value = row.name || '';
      nameInput.placeholder = 'Category name';
      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.className = 'weight-input';
      weightInput.min = '0';
      weightInput.max = '100';
      weightInput.step = '0.1';
      weightInput.value = row.weight != null ? row.weight : '';
      weightInput.placeholder = '0.0';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove';
      removeBtn.setAttribute('aria-label', 'Remove category');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => tr.remove());
      tr.appendChild(document.createElement('td')).appendChild(nameInput);
      tr.appendChild(document.createElement('td')).appendChild(weightInput);
      tr.appendChild(document.createElement('td')).appendChild(removeBtn);
      weightsTableBody.appendChild(tr);
    });
  }

  function collectWeightsFromTable() {
    if (!weightsTableBody) return [];
    const rows = [];
    weightsTableBody.querySelectorAll('tr').forEach((tr) => {
      const nameInput = tr.querySelector('.category-name-input');
      const weightInput = tr.querySelector('.weight-input');
      if (!nameInput || !weightInput) return;
      const name = (nameInput.value || '').trim();
      if (!name) return;
      const weightVal = weightInput.value.trim();
      const weight = weightVal ? (isNaN(parseFloat(weightVal)) ? null : parseFloat(weightVal)) : null;
      rows.push({ name, weight });
    });
    return rows;
  }

  function weightsTableToCategories(rows) {
    return rows.map((r) => ({ category: r.name, weight_percent: r.weight ?? 0 }));
  }

  function categoriesToWeightsRows(categories) {
    if (!Array.isArray(categories)) return getDefaultWeights();
    return categories.map((c) => ({
      name: c.category || c.name || '',
      weight: c.weight ?? c.weight ?? null,
    })).filter((r) => r.name);
  }

  // --- Course Merge ---

  /**
   * Builds a Course from scrape response and merges saved weights.
   */
  async function buildCourseFromResponse(courseJson) {
    const course = Course.fromJson(courseJson || {});
    const courseKey = course.id || currentCourseKey;
    if (!courseKey) return course;

    const saved = await loadCourse(courseKey);
    if (saved && Array.isArray(saved.categories)) {
      const weightMap = {};
      saved.categories.forEach((c) => {
        const name = (c.category || c.name || '').trim();
        if (name && (c.weight != null || c.weight != null)) {
          weightMap[name.toLowerCase()] = c.weight ?? c.weight;
        }
      });
      course.categories.forEach((cat) => {
        const key = (cat.category || '').toLowerCase();
        if (key && weightMap[key] != null) {
          cat.weight = weightMap[key];
        }
      });
    }
    return course;
  }

  /**
   * Syncs weights from table into course and returns updated course for calc.
   */
  function mergeWeightsFromTableIntoCourse(course) {
    const rows = collectWeightsFromTable();
    const byName = {};
    course.categories.forEach((c) => {
      byName[(c.category || '').toLowerCase()] = c;
    });
    rows.forEach((r) => {
      const key = (r.name || '').toLowerCase();
      if (!key) return;
      if (byName[key]) {
        byName[key].weight = r.weight ?? 0;
      } else {
        course.addCategory({ category: r.name, weight_percent: r.weight ?? 0 });
      }
    });
    return course;
  }

  // --- UI Update from Course ---

  function mapCategoryToInputIds(categoryName) {
    const lower = (categoryName || '').toLowerCase();
    if (lower.includes('assignment') || lower.includes('lab') || lower.includes('project')) {
      return { inputId: 'assignmentsGrade', infoId: 'assignmentsInfo' };
    }
    if (lower.includes('midterm') || lower.includes('mid-term')) {
      return { inputId: 'midtermGrade', infoId: 'midtermInfo' };
    }
    if (lower.includes('final') || lower.includes('exam')) {
      return { inputId: 'finalGrade', infoId: 'finalInfo' };
    }
    return null;
  }

  function updateUIFromCourse(course, calcResult) {
    if (calcResult && currentGradeValue) {
      const suffix = calcResult.estimated ? ' (est.)' : '';
      currentGradeValue.textContent = `${calcResult.current_grade.toFixed(1)}%${suffix}`;
      if (calcResult.warnings && calcResult.warnings.length > 0) {
        console.log('[Flowdeck] Calc warnings:', calcResult.warnings);
      }
    }

    if (course) {
      course.categories.forEach((cat) => {
        const ids = mapCategoryToInputIds(cat.category);
        if (!ids) return;
        const input = document.getElementById(ids.inputId);
        const info = document.getElementById(ids.infoId);
        if (input && Number.isFinite(cat.grade)) {
          input.value = cat.grade.toFixed(1);
        }
        if (info) {
          info.style.display = 'block';
          info.textContent = `Avg: ${(cat.grade || 0).toFixed(1)}%`;
        }
      });
    }

    // Required grade placeholder - could be extended later
    if (requiredGradeValue) {
      requiredGradeValue.textContent = '--%';
    }
  }

  // --- Messaging ---

  async function fetchCourseFromActiveTab() {
    console.log('[Flowdeck] Fetching course from active tab...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || typeof tab.id !== 'number') {
        if (detectedCourseEl) detectedCourseEl.textContent = 'Not found';
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'FLOWDECK_GET_COURSE' }, async (response) => {
        if (chrome.runtime.lastError) {
          if (detectedCourseEl) detectedCourseEl.textContent = 'Not found';
          return;
        }
        if (response && response.ok && response.courseName) {
          if (detectedCourseEl) detectedCourseEl.textContent = response.courseName;
          if (response.courseKey) {
            currentCourseKey = response.courseKey;
            const saved = await loadCourse(currentCourseKey);
            const rows = saved ? categoriesToWeightsRows(saved.categories) : getDefaultWeights();
            renderWeightsTable(rows.length ? rows : getDefaultWeights());
          }
        } else if (detectedCourseEl) {
          detectedCourseEl.textContent = 'Not found';
        }
      });
    } catch (err) {
      if (detectedCourseEl) detectedCourseEl.textContent = 'Not found';
    }
  }

  async function fetchGradesFromLearningHub() {
    console.log('[Flowdeck] Sending FLOWDECK_SCRAPE...');
    showFetchStatus('Fetching grades...', 'fetching');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        showFetchStatus('No active tab. Open a Learning Hub page.', 'error');
        return;
      }
      if (!tab.url.includes('learn.bcit.ca')) {
        showFetchStatus('Not on Learning Hub. Navigate to learn.bcit.ca', 'error');
        return;
      }

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'FLOWDECK_SCRAPE' }, async (response) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message;
            console.log('[Flowdeck] Message error:', msg);
            showFetchStatus('Content script not ready: ' + msg + '. Try refreshing the page.', 'error');
            resolve();
            return;
          }

          if (!response) {
            showFetchStatus('No response. Ensure you are on a Learning Hub grades page.', 'error');
            resolve();
            return;
          }

          if (!response.ok) {
            const reason = response.reason || 'unknown';
            let msg = 'Could not fetch grades.';
            if (reason === 'not_on_learninghub') msg = 'Not on Learning Hub.';
            else if (reason === 'not_found') msg = 'No grades found. Navigate to the Grades section.';
            else if (reason === 'scrape_failed') msg = 'Scrape failed: ' + (response.error || reason);
            console.log('[Flowdeck] Scrape fail:', reason);
            showFetchStatus(msg, 'error');
            resolve();
            return;
          }

          console.log('[Flowdeck] Scrape success');
          showFetchStatus(`Found ${(response.course?.categories?.length || 0)} categories`, 'success');
          if (autoFetchWarning) autoFetchWarning.style.display = 'flex';

          const course = await buildCourseFromResponse(response.course);
          currentCourseKey = course.id || currentCourseKey;
          renderWeightsTable(categoriesToWeightsRows(course.categories));

          const merged = mergeWeightsFromTableIntoCourse(course);
          const calcResult = computeCourseCurrentGrade(merged);

          updateUIFromCourse(merged, calcResult);

          resolve();
        });
      });
    } catch (err) {
      showFetchStatus('Error: ' + (err?.message || 'Unknown'), 'error');
    }
  }

  // --- Event Handlers ---

  if (weightsToggle && weightsContent) {
    weightsToggle.addEventListener('click', () => {
      const expanded = weightsToggle.getAttribute('aria-expanded') === 'true';
      weightsToggle.setAttribute('aria-expanded', !expanded);
      weightsContent.classList.toggle('collapsed', expanded);
    });
  }

  if (changeCourseBtn) {
    changeCourseBtn.addEventListener('click', () => console.log('[Flowdeck] Change Course'));
  }

  if (addCategoryBtn && weightsTableBody) {
    addCategoryBtn.addEventListener('click', () => {
      const rows = collectWeightsFromTable();
      rows.push({ name: 'New Category', weight: null });
      renderWeightsTable(rows);
    });
  }

  if (saveWeightsBtn) {
    saveWeightsBtn.addEventListener('click', async () => {
      if (!currentCourseKey) {
        showSaveStatus('Open a Learning Hub course page to save weights.', 'error');
        return;
      }
      const rows = collectWeightsFromTable();
      if (rows.length === 0) {
        showSaveStatus('Nothing to save', 'info');
        return;
      }
      const courseJson = {
        id: currentCourseKey,
        categories: weightsTableToCategories(rows),
      };
      await saveCourse(currentCourseKey, courseJson);
      showSaveStatus('Saved', 'success');
    });
  }

  if (editWeightsBtn) editWeightsBtn.addEventListener('click', () => {});
  if (resetCourseBtn) resetCourseBtn.addEventListener('click', () => {});

  if (refreshGradesBtn) {
    refreshGradesBtn.addEventListener('click', () => fetchGradesFromLearningHub());
  }

  if (targetGradeInput) {
    targetGradeInput.addEventListener('input', () => {});
  }

  // --- Init ---
  renderWeightsTable(getDefaultWeights());
  fetchCourseFromActiveTab();
  fetchGradesFromLearningHub().catch(() => {});
});
