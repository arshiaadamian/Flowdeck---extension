/**
 * Flowdeck Popup - Thin UI Controller
 * Uses course categories and items from scrape/models. Expandable UI per category
 * to edit category weight and per-item weights/grades. No add/delete category.
 */

import { Course, Category, Item } from './models.js';
import { computeCourseCurrentGrade, computeRequiredGradeOnRemaining, computeMaxPossibleGradeIfPerfect } from './calc.js';
import { loadCourse, saveCourse } from './storage.js';

document.addEventListener('DOMContentLoaded', function () {
  console.log('[Flowdeck] Extension popup loaded');

  const weightsToggle = document.getElementById('weightsToggle');
  const weightsContent = document.getElementById('weightsContent');
  const changeCourseBtn = document.getElementById('changeCourseBtn');
  const saveWeightsBtn = document.getElementById('saveWeightsBtn');
  const editWeightsBtn = document.getElementById('editWeightsBtn');
  const resetCourseBtn = document.getElementById('resetCourseBtn');
  const refreshGradesBtn = document.getElementById('refreshGradesBtn');
  const fetchStatus = document.getElementById('fetchStatus');
  const autoFetchWarning = document.getElementById('autoFetchWarning');
  const detectedCourseEl = document.getElementById('detectedCourse');
  const saveStatus = document.getElementById('saveStatus');
  const categoriesContainer = document.getElementById('categoriesContainer');
  const currentGradeValue = document.getElementById('currentGradeValue');
  const maxPossibleValue = document.getElementById('maxPossibleValue');
  const requiredGradeValue = document.getElementById('requiredGradeValue');
  const targetGradeInput = document.getElementById('targetGrade');

  let currentCourseKey = null;
  /** @type {Course|null} */
  let currentCourse = null;

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

  // --- Compute category grade average from items ---
  
  function computeCategoryGrade(category) {
    if (!category || !category.items || category.items.length === 0) {
      return null;
    }
    
    const itemsWithGrades = category.items.filter(item => Number.isFinite(item.grade));
    if (itemsWithGrades.length === 0) {
      return null;
    }
    
    const totalWeight = itemsWithGrades.reduce((sum, item) => {
      const w = Number.isFinite(item.weight) ? item.weight : 0;
      return sum + w;
    }, 0);
    
    if (totalWeight === 0) {
      // Simple average if no weights
      const sum = itemsWithGrades.reduce((s, item) => s + item.grade, 0);
      return sum / itemsWithGrades.length;
    }
    
    // Weighted average
    const weightedSum = itemsWithGrades.reduce((sum, item) => {
      const w = Number.isFinite(item.weight) ? item.weight : 0;
      return sum + (item.grade * w);
    }, 0);
    
    return weightedSum / totalWeight;
  }

  // --- Render categories and items (from course data) ---

  /**
   * @param {Course} course
   */
  function renderCategoriesAndItems(course) {
    if (!categoriesContainer) return;
    categoriesContainer.innerHTML = '';

    if (!course || !course.categories || course.categories.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'grades-hint';
      empty.textContent = 'No categories yet. Use "Refresh from Learning Hub" on a grades page to load course data.';
      categoriesContainer.appendChild(empty);
      return;
    }

    course.categories.forEach((cat) => {
      const block = document.createElement('div');
      block.className = 'category-block';
      block.dataset.categoryId = cat.id;

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'category-block-header';
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('aria-controls', `items-${cat.id}`);

      const chevron = document.createElement('span');
      chevron.className = 'category-chevron';
      chevron.textContent = '▶';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'category-block-name';
      nameSpan.textContent = cat.category || 'Unnamed';

      const weightWrap = document.createElement('div');
      weightWrap.className = 'category-block-weight-wrap';
      const weightLabel = document.createElement('label');
      weightLabel.textContent = 'Weight (%)';
      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.className = 'weight-input';
      weightInput.min = '0';
      weightInput.max = '100';
      weightInput.step = '0.1';
      weightInput.value = Number.isFinite(cat.weight) ? cat.weight : '';
      weightInput.placeholder = '0';
      weightInput.dataset.categoryId = cat.id;
      
      // Category grade display placeholder
      const gradeDisplay = document.createElement('span');
      gradeDisplay.className = 'category-grade-display';
      const catGrade = computeCategoryGrade(cat);
      gradeDisplay.textContent = catGrade !== null ? `Grade: ${catGrade.toFixed(1)}%` : 'Grade: --%';
      
      weightWrap.appendChild(weightLabel);
      weightWrap.appendChild(weightInput);
      weightWrap.appendChild(gradeDisplay);

      header.appendChild(chevron);
      header.appendChild(nameSpan);
      header.appendChild(weightWrap);

      // Add listener to category weight input for dynamic item weight redistribution
      weightInput.addEventListener('input', (e) => {
        e.stopPropagation();
        const newCategoryWeight = parseFloat(weightInput.value);
        if (!Number.isFinite(newCategoryWeight) || newCategoryWeight <= 0) return;
        
        // Find all item weight inputs in this category's body
        const itemWeightInputs = body.querySelectorAll('.item-weight');
        if (itemWeightInputs.length === 0) return;
        
        // Calculate new weight per item (equal distribution)
        const weightPerItem = newCategoryWeight / itemWeightInputs.length;
        
        // Update each item weight input
        itemWeightInputs.forEach(input => {
          input.value = weightPerItem.toFixed(1);
        });
        
        console.log('[Flowdeck] Redistributed item weights:', weightPerItem.toFixed(1), 'per item');
      });

      const body = document.createElement('div');
      body.id = `items-${cat.id}`;
      body.className = 'category-items-body collapsed';

      const table = document.createElement('table');
      table.className = 'category-items-table';
      table.innerHTML = '<thead><tr><th>Item</th><th>Weight (%)</th><th>Grade (%)</th><th>Done</th></tr></thead><tbody></tbody>';
      const tbody = table.querySelector('tbody');

      (cat.items || []).forEach((item) => {
        const tr = document.createElement('tr');
        tr.dataset.itemId = item.id;
        tr.innerHTML = `
          <td class="item-name">${escapeHtml(item.name || '')}</td>
          <td><input type="number" class="weight-input item-weight" min="0" max="100" step="0.1" value="${Number.isFinite(item.weight) ? item.weight : ''}" placeholder="0" data-item-id="${escapeHtml(item.id)}"></td>
          <td><input type="number" class="grade-input item-grade" min="0" max="100" step="0.1" value="${Number.isFinite(item.grade) ? item.grade : ''}" placeholder="0-100" data-item-id="${escapeHtml(item.id)}"></td>
          <td style="text-align: center;"><input type="checkbox" class="done-checkbox" ${item.done ? 'checked' : ''} data-item-id="${escapeHtml(item.id)}" title="Mark as completed"></td>
        `;
        tbody.appendChild(tr);
      });

      body.appendChild(table);
      block.appendChild(header);
      block.appendChild(body);
      categoriesContainer.appendChild(block);

      header.addEventListener('click', (e) => {
        if (e.target.closest('.weight-input')) return;
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', !expanded);
        body.classList.toggle('collapsed', expanded);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Collect category weights and item weights/grades from the DOM into the current course object.
   * Does not add or remove categories/items; only updates existing.
   * @param {Course} course
   * @returns {Course}
   */
  function collectFromUIIntoCourse(course) {
    if (!categoriesContainer || !course) return course;

    const blocks = categoriesContainer.querySelectorAll('.category-block');
    const catById = new Map(course.categories.map((c) => [c.id, c]));

    blocks.forEach((block) => {
      const catId = block.dataset.categoryId;
      const cat = catById.get(catId);
      if (!cat) return;

      const weightInput = block.querySelector('.category-block-header .weight-input');
      if (weightInput && weightInput.value.trim() !== '') {
        const w = parseFloat(weightInput.value);
        if (Number.isFinite(w)) cat.weight = w;
      }

      const itemById = new Map((cat.items || []).map((i) => [i.id, i]));
      block.querySelectorAll('tr[data-item-id]').forEach((tr) => {
        const itemId = tr.dataset.itemId;
        const item = itemById.get(itemId);
        if (!item) return;

        const wInput = tr.querySelector('.item-weight');
        const gInput = tr.querySelector('.item-grade');
        if (wInput && wInput.value.trim() !== '') {
          const w = parseFloat(wInput.value);
          if (Number.isFinite(w)) item.weight = w;
        }
        if (gInput && gInput.value.trim() !== '') {
          const g = parseFloat(gInput.value);
          if (Number.isFinite(g)) item.grade = g;
        }
        if (doneCheckbox) {
          item.done = doneCheckbox.checked;
        }
      });
    });

    return course;
  }

  // --- Update category grade displays in the UI ---
  
  function updateCategoryGradeDisplays(course) {
    if (!categoriesContainer || !course) return;
    
    const blocks = categoriesContainer.querySelectorAll('.category-block');
    const catById = new Map(course.categories.map((c) => [c.id, c]));
    
    blocks.forEach((block) => {
      const catId = block.dataset.categoryId;
      const cat = catById.get(catId);
      if (!cat) return;
      
      const gradeDisplay = block.querySelector('.category-grade-display');
      if (gradeDisplay) {
        const catGrade = computeCategoryGrade(cat);
        gradeDisplay.textContent = catGrade !== null ? `Grade: ${catGrade.toFixed(1)}%` : 'Grade: --%';
      }
    });
  }

  // --- Course merge (saved overrides into scraped) ---

  /**
   * Builds a Course from scrape response and merges saved overrides (weights, grades).
   */
  async function buildCourseFromResponse(courseJson) {
    const course = Course.fromJson(courseJson || {});
    const courseKey = course.id || currentCourseKey;
    if (!courseKey) return course;

    const saved = await loadCourse(courseKey);
    if (saved && Array.isArray(saved.categories)) {
      const savedCatById = new Map(saved.categories.map((c) => [c.id, c]));
      const savedCatByName = new Map(
        saved.categories.map((c) => [(c.category || c.name || '').toLowerCase(), c])
      );

      course.categories.forEach((cat) => {
        const savedCat = savedCatById.get(cat.id) || savedCatByName.get((cat.category || '').toLowerCase());
        if (savedCat) {
          if (Number.isFinite(savedCat.weight)) cat.weight = savedCat.weight;
          if (Array.isArray(savedCat.items)) {
            const savedItemById = new Map(savedCat.items.map((i) => [i.id, i]));
            const savedItemByName = new Map(savedCat.items.map((i) => [(i.name || '').toLowerCase(), i]));
            cat.items.forEach((item) => {
              const si = savedItemById.get(item.id) || savedItemByName.get((item.name || '').toLowerCase());
              if (si) {
                if (Number.isFinite(si.weight)) item.weight = si.weight;
                if (Number.isFinite(si.grade)) item.grade = si.grade;
              }
            });
          }
        }
      });
    }
    return course;
  }

  // --- UI update from course / calc ---

  function updateResultsFromCalc(calcResult) {
    if (calcResult && currentGradeValue) {
      const suffix = calcResult.estimated ? ' (est.)' : '';
      currentGradeValue.textContent = `${calcResult.current_grade.toFixed(1)}%${suffix}`;
      if (calcResult.warnings && calcResult.warnings.length > 0) {
        console.log('[Flowdeck] Calc warnings:', calcResult.warnings);
      }
    }

    // Calculate and display max possible grade
    if (currentCourse && maxPossibleValue) {
      const maxResult = computeMaxPossibleGradeIfPerfect(currentCourse);
      maxPossibleValue.textContent = maxResult.message;
    }


    if (requiredGradeValue) {
      requiredGradeValue.textContent = '--%';
    }
  }

  function updateTargetFromCourse(course) {
    if (targetGradeInput && course && Number.isFinite(course.target_grade) && course.target_grade > 0) {
      targetGradeInput.value = course.target_grade;
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
            if (saved) {
              currentCourse = Course.fromJson(saved);
              renderCategoriesAndItems(currentCourse);
              const calcResult = computeCourseCurrentGrade(currentCourse);
              updateResultsFromCalc(calcResult);
              updateTargetFromCourse(currentCourse);
            }
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
          currentCourse = course;

          renderCategoriesAndItems(course);

          const calcResult = computeCourseCurrentGrade(course);
          updateResultsFromCalc(calcResult);
          updateTargetFromCourse(course);

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

  if (saveWeightsBtn) {
    saveWeightsBtn.addEventListener('click', async () => {
      if (!currentCourseKey || !currentCourse) {
        showSaveStatus('Open a Learning Hub course page and refresh grades first.', 'error');
        return;
      }
      collectFromUIIntoCourse(currentCourse);
      const courseJson = currentCourse.toJson();
      await saveCourse(currentCourseKey, courseJson);
      showSaveStatus('Saved', 'success');

      const calcResult = computeCourseCurrentGrade(currentCourse);
      updateResultsFromCalc(calcResult);
      
      // Also update required grade if target is set
      if (currentCourse.target_grade && Number.isFinite(currentCourse.target_grade)) {
        const requiredResult = computeRequiredGradeOnRemaining(currentCourse, currentCourse.target_grade);
        if (requiredGradeValue) {
          requiredGradeValue.textContent = requiredResult.message;
        }
      }

      updateCategoryGradeDisplays(currentCourse);
    });
  }

  if (editWeightsBtn) editWeightsBtn.addEventListener('click', () => {});
  if (resetCourseBtn) resetCourseBtn.addEventListener('click', () => {});

  if (refreshGradesBtn) {
    refreshGradesBtn.addEventListener('click', () => fetchGradesFromLearningHub());
  }

  if (targetGradeInput) {
    targetGradeInput.addEventListener('input', () => {
      if (currentCourse && targetGradeInput.value.trim() !== '') {
        const v = parseFloat(targetGradeInput.value);
        if (Number.isFinite(v)) {
          currentCourse.target_grade = v;
          
          // Calculate required grade on remaining work
          const result = computeRequiredGradeOnRemaining(currentCourse, v);
          
          // Update the UI with the message
          if (requiredGradeValue) {
            requiredGradeValue.textContent = result.message;
          }
        }
      }
    });
  }

  // --- Init ---
  if (categoriesContainer && !currentCourse) {
    const empty = document.createElement('p');
    empty.className = 'grades-hint';
    empty.textContent = 'No categories yet. Use "Refresh from Learning Hub" on a grades page to load course data.';
    categoriesContainer.appendChild(empty);
  }
  fetchCourseFromActiveTab();
  fetchGradesFromLearningHub().catch(() => {});
});