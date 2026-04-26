/**
 * Flowdeck Popup - Thin UI Controller
 * Uses course categories and items from scrape/models. Expandable UI per category
 * to edit category weight and per-item weights/grades. No add/delete category.
 */

import { Course, Category, Item } from './models.js';
import { computeCourseCurrentGrade, computeMaxPossibleGradeIfPerfect, computePerItemRequiredBreakdown } from './calc.js';
import { loadCourse, saveCourse, loadOutlineCache, saveOutlineCache, clearOutlineCache } from './storage.js';

document.addEventListener('DOMContentLoaded', function () {

  document.getElementById("feedbackBtn").addEventListener("click", function () {
    console.log("Clicked")
    this.style.display = "none"; // hides button after click
  });

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
  const outlineFallback = document.getElementById('outlineFallback');
  const outlineURLInput = document.getElementById('outlineURL');
  const outlineSubmitBtn = document.getElementById('outlineSubmitBtn');
  const outlineError = document.getElementById('outlineError');
  const goodUrl = document.getElementById('goodUrl');
  const manualUrl = document.getElementById('manualUrl');
  const aiLoadingBanner = document.getElementById('aiLoadingBanner');
  const aiLoadingText = document.getElementById('aiLoadingText');
  const aiRetryBanner = document.getElementById('aiRetryBanner');
  const aiRetryBtn = document.getElementById('aiRetryBtn');
  const aiRetryMsg = document.getElementById('aiRetryMsg');
  const outlineWarning = document.getElementById('outlineWarning');

  let currentCourseKey = null;
  /** @type {Course|null} */
  let currentCourse = null;

  /**
   * Fetch and parse outline weights directly from the popup (no background hop).
   * @param {string} outlineUrl
   * @returns {Promise<{ok: boolean, weights?: Array<{name: string, weight: number}>, error?: string}>}
   */
  async function fetchOutlineWeightsInPopup(outlineUrl, cacheKey, isManual) {
    // Step 1: Fetch the outline page
    let response;
    try {
      console.log('[Flowdeck] [Outline] Fetching outline directly from popup:', outlineUrl);
      response = await fetch(outlineUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (fetchErr) {
      console.error('[Flowdeck] [Outline] URL fetch failed:', fetchErr);
      return { ok: false, error: fetchErr?.message || String(fetchErr), reason: 'url_fetch_failed' };
    }

    // Step 2: Parse HTML and find evaluation table
    let evalTable = null;
    try {
      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const headings = doc.querySelectorAll('h3');
      for (const heading of headings) {
        if ((heading.textContent || '').toLowerCase().includes('evaluation criteria')) {
          let sibling = heading.nextElementSibling;
          while (sibling) {
            if (sibling.tagName === 'TABLE') { evalTable = sibling; break; }
            const nestedTable = sibling.querySelector && sibling.querySelector('table');
            if (nestedTable) { evalTable = nestedTable; break; }
            sibling = sibling.nextElementSibling;
          }
          break;
        }
      }
    } catch (parseErr) {
      console.error('[Flowdeck] [Outline] HTML parse error:', parseErr);
      return { ok: false, error: parseErr?.message || String(parseErr), reason: 'url_fetch_failed' };
    }

    if (!evalTable) {
      console.warn('[Flowdeck] [Outline] No evaluation table found');
      return { ok: false, error: 'No evaluation table found', reason: 'url_fetch_failed' };
    }

    console.log("cacheKey in fetchOutline is: " + cacheKey);

    // Step 3: Call AI to parse the table
    try {
      // http://localhost:3000/parse-outline
      const AIresponse = await fetch('https://site--flowdeck-extensionserver--7hgkydn2hz94.code.run/parse-outline', {
        method: 'POST',
        body: JSON.stringify({ text: evalTable.outerHTML, cacheKey: isManual ? null : cacheKey }),
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await AIresponse.json();
      console.log(`[Flowdeck BG] weights are ${JSON.stringify(result)}`);
      if (!AIresponse.ok || !result.weights) {
        return { ok: false, error: 'AI returned no weights', reason: 'ai_failed' };
      }
      return { ok: true, weights: result.weights };
    } catch (aiErr) {
      console.error('[Flowdeck] [Outline] AI call failed:', aiErr);
      return { ok: false, error: aiErr?.message || String(aiErr), reason: 'ai_failed' };
    }
  }

  // --- UI Helpers ---

  function showSaveStatus(message, type) {
    if (!saveStatus) return;
    saveStatus.textContent = message;
    saveStatus.className = `save-status ${type}`;
    saveStatus.style.display = 'flex';
    setTimeout(() => {
      if (saveStatus) saveStatus.style.display = 'none';
    }, 3000);
  }

  function showFetchStatus(message, className) {
    if (!fetchStatus) return;
    fetchStatus.style.display = 'flex';
    fetchStatus.textContent = message;
    fetchStatus.className = `fetch-status ${className || ''}`;
  }

  function showAILoading(msg) {
    if (!aiLoadingBanner) return;
    if (aiLoadingText) aiLoadingText.textContent = msg;
    aiLoadingBanner.style.display = 'flex';
  }

  function hideAILoading() {
    if (aiLoadingBanner) aiLoadingBanner.style.display = 'none';
  }

  // --- Compute category grade average from items ---
  
  function computeCategoryGrade(category) {
    if (!category || !category.items || category.items.length === 0) {
      // No items — use the category-level grade from D2L directly (e.g. Chapter Quizzes).
      return (category && Number.isFinite(category.grade) && category.grade > 0) ? category.grade : null;
    }
    
    const itemsWithGrades = category.items.filter(item => item.done === true && Number.isFinite(item.grade));
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
      nameSpan.title = cat.category || 'Unnamed';

      const weightWrap = document.createElement('div');
      weightWrap.className = 'category-block-weight-wrap';
      const weightLabel = document.createElement('label');
      weightLabel.textContent = 'Wt%';
      weightLabel.title = 'Category weight (%)';
      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.className = 'weight-input';
      weightInput.min = '0';
      weightInput.max = '100';
      weightInput.step = '1';
      weightInput.value = Number.isFinite(cat.weight) ? cat.weight : '';
      weightInput.placeholder = '0';
      weightInput.dataset.categoryId = cat.id;
      const catGrade = computeCategoryGrade(cat);
      // Category grade display placeholder
      const gradeDisplay = document.createElement('input');
      gradeDisplay.type = 'number';
      gradeDisplay.min = '0';
      gradeDisplay.step = '1';
      gradeDisplay.title = 'Override category grade manually';
      gradeDisplay.className = 'category-grade-display';
      if (cat.manualGrade !== null && cat.manualGrade !== undefined) {
        gradeDisplay.value = cat.manualGrade;
        gradeDisplay.placeholder = 'Grade %';
      } else {
        gradeDisplay.value = '';
        gradeDisplay.placeholder = catGrade !== null ? catGrade.toFixed(1) : '--';
      }

      gradeDisplay.addEventListener('input', (e) => {
        e.stopPropagation();
        const val = e.target.value;
        cat.manualGrade = val === '' ? null : parseFloat(val);

        if (val === '' && cat.items.length === 0)
        {
          cat.grade = null;
        }
      });
      
      // gradeDisplay.textContent = catGrade !== null ? `Grade: ${catGrade.toFixed(1)}%` : 'Grade: --%';
      
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
        if (e.target.closest('.category-grade-display')) return;
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
        const doneCheckbox = tr.querySelector('.done-checkbox');

        // console.log('[Flowdeck] doneCheckbox found:', doneCheckbox, 'checked:', doneCheckbox?.checked); // ADD THIS


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
        if (cat.manualGrade === null || cat.manualGrade === undefined) {
          gradeDisplay.value = '';
          gradeDisplay.placeholder = catGrade !== null ? catGrade.toFixed(1) : '--';
        }
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
                // Only restore a saved grade if the fresh scrape has no grade yet (grade = 0).
                // If D2L returned a real grade, always trust the scrape over stale saved data.
                if (Number.isFinite(si.grade) && si.grade > 0 && (!Number.isFinite(item.grade) || item.grade === 0)) item.grade = si.grade;
                if (typeof si.done === 'boolean') item.done = si.done;
              }
            });
          }
        }
      });
    }
    normalizeDoneFlags(course);
    return course;
  }

  // --- Per-item required grade breakdown renderer ---

  function renderPerItemBreakdown(course, targetGrade) {
    const breakdown = computePerItemRequiredBreakdown(course, targetGrade);
    const container = document.createElement('div');
    container.className = 'breakdown-container';

    if (breakdown.alreadyMet) {
      container.innerHTML = `<div class="breakdown-success">Goal achieved! Your current grade of ${breakdown.currentEarned.toFixed(1)}% already meets your target of ${targetGrade}%.</div>`;
      return container;
    }

    if (breakdown.impossible || breakdown.items.length === 0) {
      const maxStr = Number.isFinite(breakdown.maxPossible) ? ` Max possible grade: <strong>${breakdown.maxPossible.toFixed(1)}%</strong>.` : '';
      container.innerHTML = `<div class="breakdown-impossible">Target of ${targetGrade}% is unreachable.${maxStr}</div>`;
      return container;
    }

    const summary = document.createElement('p');
    summary.className = 'breakdown-summary';
    summary.textContent = `Blended required: ${breakdown.requiredAverage.toFixed(1)}% on remaining ${breakdown.remainingWeight.toFixed(1)}% of course`;
    container.appendChild(summary);

    const table = document.createElement('table');
    table.className = 'breakdown-table';
    table.innerHTML = `<thead><tr><th>Item</th><th>Weight</th><th>Need</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    breakdown.items.forEach(item => {
      const tr = document.createElement('tr');
      let scoreCell;
      if (item.requiredScore <= 0) {
        scoreCell = `<span class="score-easy">No minimum</span>`;
      } else if (item.achievable) {
        scoreCell = `<span class="score-ok">${item.requiredScore.toFixed(1)}%</span>`;
      } else {
        scoreCell = `<span class="score-hard">${item.requiredScore.toFixed(1)}% ⚠</span>`;
      }
      tr.innerHTML = `<td class="breakdown-item-name" title="${escapeHtml(item.category)}">${escapeHtml(item.name)}</td><td>${item.courseWeight.toFixed(1)}%</td><td>${scoreCell}</td>`;
      tbody.appendChild(tr);
    });

    container.appendChild(table);
    return container;
  }

  // --- Normalize done flags after any data load ---
  // Items with a valid grade (> 0) are always done, regardless of stale saved state.
  function normalizeDoneFlags(course) {
    if (!course || !course.categories) return;
    course.categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        if (Number.isFinite(item.grade) && item.grade > 0) {
          item.done = true;
        }
      });
    });
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
              normalizeDoneFlags(currentCourse);
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

          const course = await buildCourseFromResponse(response.course);

          console.log('[Flowdeck] Built course from response and saved data:', course);

          const allItemsArray = [];

          course.categories.forEach(category => {
              allItemsArray.push({
                category: category.category,
                items: category.items.map(item => item.name)
              })
          });

          console.log(`[Flowdeck] All categories and items for debugging outline matching: ${JSON.stringify(allItemsArray)}`);
          
          // --- Try to fetch and apply outline weights (best-effort, non-fatal) ---
          try {
            console.log('[Flowdeck] Attempting to fetch outline weights...');
            
            // Step 1: Ask content script for the outline URL
            const urlResult = await new Promise((resolveOutline) => {
              chrome.tabs.sendMessage(
                tab.id,
                { type: 'FLOWDECK_GET_OUTLINE_URL' },
                (outlineResponse) => {
                  resolveOutline(outlineResponse || { ok: false });
                }
              );
            });

            if (!urlResult.ok || !urlResult.outlineUrl) {
              console.log('[Flowdeck] Could not get outline URL:', urlResult.error || 'unknown');
              // Continue without weights - non-fatal
            } else {
              console.log("URL for the course is: " + JSON.stringify(urlResult));
              const cacheKey = urlResult.outlineUrl.match(/\/outlines\/(\d+)\//)[1];
              console.log("cacheKey is: " + cacheKey);

              console.log('[Flowdeck] Got outline URL:', urlResult.outlineUrl);

              // Step 2: Fetch outline directly from popup (uses host_permissions)
              const applyResult = await applyOutlineWeights(urlResult.outlineUrl, allItemsArray, course, cacheKey);
              if (!applyResult.ok) {
                const term = urlResult.term;
                console.log('[Flowdeck] applyOutlineWeights failed, reason:', applyResult.reason);
                if (outlineWarning) outlineWarning.style.display = 'block';

                if (applyResult.reason === 'ai_failed') {
                  // URL was valid but AI failed — show retry button, not URL input
                  if (aiRetryBanner) {
                    if (aiRetryMsg) aiRetryMsg.textContent = 'AI processing failed. Please try again.';
                    aiRetryBanner.style.display = 'flex';
                    aiRetryBtn.onclick = async () => {
                      aiRetryBtn.disabled = true;
                      if (aiRetryMsg) aiRetryMsg.textContent = 'Retrying…';
                      const retryResult = await applyOutlineWeights(urlResult.outlineUrl, allItemsArray, course, cacheKey);
                      if (retryResult.ok) {
                        aiRetryBanner.style.display = 'none';
                        if (outlineWarning) outlineWarning.style.display = 'none';
                        renderCategoriesAndItems(course);
                        const calcResult = computeCourseCurrentGrade(course);
                        updateResultsFromCalc(calcResult);
                        updateTargetFromCourse(course);
                      } else {
                        if (aiRetryMsg) aiRetryMsg.textContent = 'AI processing failed again. Please close and reopen the extension.';
                        aiRetryBtn.style.display = 'none';
                      }
                    };
                  }
                } else {
                  // URL could not be fetched — show manual URL input
                  console.log("URL result is: " + JSON.stringify(urlResult));
                  manualUrl.textContent = "Course outline could not be accessed on this page (can only be accessed if grades are posted on the main LH page (lecture page), please either enter the course CRN or the full associate outline URL for the course (https://...) to get data from the course outline.";
                  manualUrl.style.display = 'block';
                  outlineFallback.style.display = 'block';

                  outlineSubmitBtn.addEventListener('click', async () => {
                    outlineError.style.display = 'none';
                    outlineError.textContent = '';
                    const url = outlineURLInput.value.trim();
                    if (!url) {
                      outlineError.textContent = 'Please enter a URL.';
                      outlineError.style.display = 'block';
                      return;
                    } else if (/^\d+$/.test(url)) {
                      const full_url = 'https://www.bcit.ca/outlines/' + term + url;
                      console.log("Full url is: " + full_url);
                      const r = await applyOutlineWeights(full_url, allItemsArray, course, cacheKey, true);
                      if (!r.ok) {
                        outlineError.textContent = r.reason === 'ai_failed'
                          ? 'Outline found but AI failed. Please try again later.'
                          : 'Failed to fetch weights from the provided CRN. Either enter the CRN(for lecture) or full URL(https://...).';
                        outlineError.style.display = 'block';
                      } else {
                        outlineFallback.style.display = 'none';
                        if (outlineWarning) outlineWarning.style.display = 'none';
                        goodUrl.textContent = 'Good CRN, fetching data from the outline URL';
                        goodUrl.style.display = 'block';
                        renderCategoriesAndItems(course);
                        const calcResult = computeCourseCurrentGrade(course);
                        updateResultsFromCalc(calcResult);
                        updateTargetFromCourse(course);
                      }
                    } else {
                      const r = await applyOutlineWeights(url, allItemsArray, course, cacheKey, true);
                      if (!r.ok) {
                        outlineError.textContent = r.reason === 'ai_failed'
                          ? 'Outline found but AI failed. Please try again later.'
                          : 'Failed to fetch weights from the provided URL. Either enter the CRN(for lecture) or full URL (https://...).';
                        outlineError.style.display = 'block';
                      } else {
                        outlineFallback.style.display = 'none';
                        if (outlineWarning) outlineWarning.style.display = 'none';
                        goodUrl.textContent = 'Good URL, fetching data from the outline URL';
                        goodUrl.style.display = 'block';
                        renderCategoriesAndItems(course);
                        const calcResult = computeCourseCurrentGrade(course);
                        updateResultsFromCalc(calcResult);
                        updateTargetFromCourse(course);
                      }
                    }
                  });
                }
              } else {
                if (outlineWarning) outlineWarning.style.display = 'none';

                // Re-apply saved user data on top of AI-rebuilt categories
                const saved = await loadCourse(currentCourseKey);
                if (saved && Array.isArray(saved.categories)) {
                    const savedCatByName = new Map(
                        saved.categories.map((c) => [(c.category || '').toLowerCase(), c])
                    );
                    course.categories.forEach((cat) => {
                        const savedCat = savedCatByName.get((cat.category || '').toLowerCase());
                        if (savedCat) {
                            if (Number.isFinite(savedCat.weight)) cat.weight = savedCat.weight;
                            if (savedCat.manualGrade !== null && savedCat.manualGrade !== undefined) {
                                cat.manualGrade = savedCat.manualGrade;
                            }
                            const savedItemByName = new Map(
                                (savedCat.items || []).map((i) => [(i.name || '').toLowerCase(), i])
                            );
                            cat.items.forEach((item) => {
                                const si = savedItemByName.get((item.name || '').toLowerCase());
                                if (si) {
                                    if (Number.isFinite(si.weight)) item.weight = si.weight;
                                    if (Number.isFinite(si.grade) && si.grade > 0) item.grade = si.grade;
                                    if (typeof si.done === 'boolean') item.done = si.done;
                                }
                            });
                        }
                    });
                }
              }
            }
          } catch (outlineErr) {
            console.warn('[Flowdeck] Outline fetch failed (non-fatal):', outlineErr);
            // Continue without weights - this is best-effort
          }
          
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

  function categoryRebuild(structuredData, course) {
    const newStructuredCategories = [];
      structuredData.forEach(categoryData => {
        const newCategory = new Category({
          course_id: course.id,
          category: categoryData.outlineCategory,
          weight: categoryData.weight,
          grade: 0,
          items: []
        });
        categoryData.learningHubCategories.forEach(hubCategoryName => {
          const matchedCategory = course.categories.find(cat => cat.category === hubCategoryName);
          if (matchedCategory) {
            matchedCategory.items.forEach(item => { newCategory.items.push(item); });
          }
        });
        newStructuredCategories.push(newCategory);
      });

      course.categories = newStructuredCategories;
  }

  async function applyOutlineWeights(outlineUrl, allItemsArray, course, cacheKey, isManual) {
    // Check client-side cache first
    const cachedStructuredData = await loadOutlineCache(cacheKey);
    if (cachedStructuredData) {
      console.log('[Flowdeck] Found cached outline structure for cacheKey:', cacheKey);
      categoryRebuild(cachedStructuredData, course);
      showFetchStatus('Categories loaded from course outline', 'success');
      return { ok: true };
    }

    showAILoading('AI is reading your course outline…');
    const weightsResult = await fetchOutlineWeightsInPopup(outlineUrl, cacheKey, isManual);

    if (!weightsResult.ok) {
      hideAILoading();
      return { ok: false, error: weightsResult.error, reason: weightsResult.reason };
    }

    console.log('[Flowdeck] Successfully fetched outline weights:', weightsResult.weights);

    showAILoading('AI is mapping your categories…');
    let structuredData;
    try {
      structuredData = await buildCourseStructureFromAI(weightsResult.weights, allItemsArray, cacheKey, isManual);
    } catch (err) {
      hideAILoading();
      return { ok: false, error: err?.message || String(err), reason: 'ai_failed' };
    }

    if (!structuredData) {
      hideAILoading();
      return { ok: false, error: 'AI mapping returned no data', reason: 'ai_failed' };
    }

    // save outline structure to cache for future use
    await saveOutlineCache(cacheKey, structuredData);

    console.log('[Flowdeck] Received structured category-item mapping from AI:', structuredData);

    categoryRebuild(structuredData, course);

    hideAILoading();
    showFetchStatus('Categories loaded from course outline', 'success');
    console.log('[Flowdeck] Updated course categories with AI-structured categories:', course.categories);
    return { ok: true };
    
  }

  // function to call the second AI to get structured weights from the learning hub matching with the course outline.
  async function buildCourseStructureFromAI(outlineCategories, learningHubItems, cacheKey, isManual) {
    try 
    {
      // http://localhost:3000/map-categories
      const AIResponse = await fetch('https://site--flowdeck-extensionserver--7hgkydn2hz94.code.run/map-categories', {
          method: 'POST',
          body: JSON.stringify({ outlineCategories: outlineCategories, learningHubItems: learningHubItems, cacheKey: isManual ? null : cacheKey }), // send the data to the server for mapping as JSON objects
          headers: {
            'Content-Type': 'application/json'
          }
    });

      const result = await AIResponse.json();
      console.log("Received mapped categories from AI:", result.mappedCategories);

      return result.mappedCategories;
    }
    catch (err) {
      console.error('Error fetching mapped categories from AI:', err);
      return null;
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
      
      // Also refresh the per-item breakdown if target is set
      if (currentCourse.target_grade && Number.isFinite(currentCourse.target_grade)) {
        if (requiredGradeValue) {
          requiredGradeValue.innerHTML = '';
          requiredGradeValue.appendChild(renderPerItemBreakdown(currentCourse, currentCourse.target_grade));
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
          //const result = computeRequiredGradeOnRemaining(currentCourse, v);
          
          // Update the UI with the message
          if (requiredGradeValue) {
           // requiredGradeValue.textContent = result.message;
          }

          requiredGradeValue.innerHTML = '';
          requiredGradeValue.appendChild(renderPerItemBreakdown(currentCourse, v));
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

const feedbackBtn = document.getElementById('feedbackBtn');
if (feedbackBtn) {
  feedbackBtn.addEventListener('click', () => {
    chrome.tabs.create({ 
      url: 'https://form.jotform.com/250936223826055' 
    });
  });
}



