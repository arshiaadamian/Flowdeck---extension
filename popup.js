// Flowdeck - Popup Script with Auto-Fetch Grade Support

document.addEventListener('DOMContentLoaded', function() {
  console.log('[Flowdeck] Extension popup loaded');

  // Grade Weights Toggle
  const weightsToggle = document.getElementById('weightsToggle');
  const weightsContent = document.getElementById('weightsContent');
  if (weightsToggle && weightsContent) {
    weightsToggle.addEventListener('click', function() {
      const isExpanded = weightsToggle.getAttribute('aria-expanded') === 'true';
      const newState = !isExpanded;
      
      weightsToggle.setAttribute('aria-expanded', newState);
      
      if (newState) {
        weightsContent.classList.remove('collapsed');
      } else {
        weightsContent.classList.add('collapsed');
      }
      
      console.log('[Flowdeck] Grade Weights section toggled:', newState ? 'expanded' : 'collapsed');
    });
  }

  // Change Course Button
  const changeCourseBtn = document.getElementById('changeCourseBtn');
  if (changeCourseBtn) {
    changeCourseBtn.addEventListener('click', function() {
      console.log('[Flowdeck] Change Course button clicked');
      // Placeholder: Would open course selection UI
    });
  }

  // Add Category Button
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', function() {
      console.log('[Flowdeck] Add Category button clicked');
      
      if (!weightsTableBody) return;

      // Create new row
      const tr = document.createElement('tr');
      
      // Category name input
      const nameTd = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'category-name-input';
      nameInput.value = 'New Category';
      nameInput.placeholder = 'Category name';
      nameTd.appendChild(nameInput);
      
      // Weight input
      const weightTd = document.createElement('td');
      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.className = 'weight-input';
      weightInput.min = '0';
      weightInput.max = '100';
      weightInput.step = '0.1';
      weightInput.value = '';
      weightInput.placeholder = '0.0';
      weightTd.appendChild(weightInput);
      
      // Remove button
      const actionTd = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove';
      removeBtn.setAttribute('aria-label', 'Remove category');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', function() {
        console.log('[Flowdeck] Remove button clicked for new row');
        tr.remove();
      });
      actionTd.appendChild(removeBtn);
      
      tr.appendChild(nameTd);
      tr.appendChild(weightTd);
      tr.appendChild(actionTd);
      weightsTableBody.appendChild(tr);
      
      // Focus on the name input for immediate editing
      nameInput.focus();
      nameInput.select();
      
      console.log('[Flowdeck] Added new category row');
    });
  }

  // Save Weights Button
  const saveWeightsBtn = document.getElementById('saveWeightsBtn');
  if (saveWeightsBtn) {
    saveWeightsBtn.addEventListener('click', async function() {
      console.log('[Flowdeck] Save Weights button clicked');
      console.log('[Flowdeck] Current courseKey:', currentCourseKey);
      
      // Check if courseKey is available
      if (!currentCourseKey) {
        console.log('[Flowdeck] No courseKey available');
        showSaveStatus('Open a Learning Hub course page to save weights.', 'error');
        return;
      }
      
      // Collect weights from table
      const rows = collectWeightsFromTable();
      console.log('[Flowdeck] Collected rows:', rows);
      
      // Check if there are any valid rows
      if (rows.length === 0) {
        console.log('[Flowdeck] No valid rows to save');
        showSaveStatus('Nothing to save', 'info');
        return;
      }
      
      // Save weights
      await saveWeights(currentCourseKey, rows);
    });
  }

  // Edit Weights Button
  const editWeightsBtn = document.getElementById('editWeightsBtn');
  if (editWeightsBtn) {
    editWeightsBtn.addEventListener('click', function() {
      console.log('[Flowdeck] Edit Weights button clicked');
      // Placeholder: Would enable editing mode for weights
    });
  }

  // Reset Course Button
  const resetCourseBtn = document.getElementById('resetCourseBtn');
  if (resetCourseBtn) {
    resetCourseBtn.addEventListener('click', function() {
      console.log('[Flowdeck] Reset Course button clicked');
      // Placeholder: Would reset all course data
    });
  }

  // Grade Input Fields (placeholder listeners)
  const gradeInputs = document.querySelectorAll('.grade-input');
  gradeInputs.forEach(input => {
    input.addEventListener('input', function() {
      console.log(`[Flowdeck] Grade input changed: ${input.id} = ${input.value}`);
      // Placeholder: Would update grade calculations
    });
  });

  // Target Grade Input
  const targetGradeInput = document.getElementById('targetGrade');
  if (targetGradeInput) {
    targetGradeInput.addEventListener('input', function() {
      console.log(`[Flowdeck] Target grade changed: ${targetGradeInput.value}`);
      // Placeholder: Would calculate required grade on remaining work
    });
  }

  // Auto-fetch grades functionality
  const refreshGradesBtn = document.getElementById('refreshGradesBtn');
  const fetchStatus = document.getElementById('fetchStatus');
  const autoFetchWarning = document.getElementById('autoFetchWarning');
  const detectedCourseEl = document.getElementById('detectedCourse');
  const saveStatus = document.getElementById('saveStatus');
  const weightsTableBody = document.getElementById('weightsTableBody');

  // Store current courseKey for saving weights
  let currentCourseKey = null;

  /**
   * Mirrors the cleanup used for `cleanedName` in content.js.
   * (We can't directly access content-script globals from the popup.)
   */
  function cleanCourseName(rawName) {
    if (!rawName || typeof rawName !== 'string') return null;
    return rawName.split('(merge')[0].trim();
  }

  /**
   * Renders the weights table with the provided rows
   * @param {Array} rows - Array of {name: string, weight: number|null} objects
   */
  function renderWeightsTable(rows) {
    if (!weightsTableBody) return;

    console.log('[Flowdeck] Rendering weights table with', rows.length, 'rows');
    
    // Clear existing rows
    weightsTableBody.innerHTML = '';

    // Render each row
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      
      // Category name input
      const nameTd = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'category-name-input';
      nameInput.value = row.name || '';
      nameInput.placeholder = 'Category name';
      nameTd.appendChild(nameInput);
      
      // Weight input
      const weightTd = document.createElement('td');
      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.className = 'weight-input';
      weightInput.min = '0';
      weightInput.max = '100';
      weightInput.step = '0.1';
      weightInput.value = row.weight !== null && row.weight !== undefined ? row.weight : '';
      weightInput.placeholder = '0.0';
      weightTd.appendChild(weightInput);
      
      // Remove button
      const actionTd = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove';
      removeBtn.setAttribute('aria-label', 'Remove category');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', function() {
        console.log('[Flowdeck] Remove button clicked for row', index);
        tr.remove();
      });
      actionTd.appendChild(removeBtn);
      
      tr.appendChild(nameTd);
      tr.appendChild(weightTd);
      tr.appendChild(actionTd);
      weightsTableBody.appendChild(tr);
    });
  }

  /**
   * Collects weights from the current table
   * @returns {Array} Array of {name: string, weight: number|null} objects
   */
  function collectWeightsFromTable() {
    if (!weightsTableBody) return [];

    const rows = [];
    const tableRows = weightsTableBody.querySelectorAll('tr');

    tableRows.forEach(tr => {
      const nameInput = tr.querySelector('.category-name-input');
      const weightInput = tr.querySelector('.weight-input');

      if (!nameInput || !weightInput) return;

      const name = (nameInput.value || '').trim();
      
      // Ignore rows with empty category names
      if (!name) return;

      // Convert weight to number, or null if invalid/empty
      let weight = null;
      const weightValue = weightInput.value.trim();
      if (weightValue) {
        const parsed = parseFloat(weightValue);
        if (!isNaN(parsed)) {
          weight = parsed;
        }
      }

      rows.push({ name, weight });
    });

    console.log('[Flowdeck] Collected weights from table:', rows);
    return rows;
  }

  /**
   * Gets existing weights by course from storage
   * @returns {Promise<Object>} Object mapping courseKey to weight arrays
   */
  async function getWeightsByCourse() {
    // Runtime check: Ensure chrome.storage API is available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      const errorDetails = {
        chrome: !!chrome,
        chromeStorage: !!chrome?.storage,
        chromeStorageLocal: !!chrome?.storage?.local
      };
      console.error('[Flowdeck] Storage API not available:', errorDetails);
      throw new Error('Storage API not available. Reload extension.');
    }

    console.log('[Flowdeck] chrome.storage available:', !!chrome?.storage);
    console.log('[Flowdeck] chrome.storage.local available:', !!chrome?.storage?.local);

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['weightsByCourse'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('[Flowdeck] Error reading storage:', chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result.weightsByCourse || {});
      });
    });
  }

  /**
   * Saves weights to chrome.storage.local for a specific course
   * @param {string} courseKey - The course key (e.g., "d2l-123456")
   * @param {Array} rows - Array of {name: string, weight: number|null} objects
   * 
   * NOTE: After manifest.json changes, user must reload the extension in chrome://extensions
   */
  async function saveWeights(courseKey, rows) {
    if (!courseKey) {
      console.log('[Flowdeck] Cannot save weights: no courseKey');
      showSaveStatus('Open a Learning Hub course page to save weights.', 'error');
      return;
    }

    // Runtime check: Ensure chrome.storage API is available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      const errorDetails = {
        chrome: !!chrome,
        chromeStorage: !!chrome?.storage,
        chromeStorageLocal: !!chrome?.storage?.local
      };
      console.error('[Flowdeck] Storage API not available:', errorDetails);
      showSaveStatus('Storage API not available. Reload extension.', 'error');
      return;
    }

    console.log('[Flowdeck] chrome.storage available:', !!chrome?.storage);
    console.log('[Flowdeck] chrome.storage.local available:', !!chrome?.storage?.local);
    console.log('[Flowdeck] Saving weights for courseKey:', courseKey);
    console.log('[Flowdeck] Rows to save:', JSON.stringify(rows));

    // Ensure data is JSON-safe (no DOM nodes, functions, etc.)
    const safeRows = rows.map(row => ({
      name: String(row.name || ''),
      weight: (row.weight !== null && row.weight !== undefined && !isNaN(row.weight)) 
        ? Number(row.weight) 
        : null
    }));

    try {
      // Read existing weightsByCourse object first
      const weightsByCourse = await getWeightsByCourse();

      // Merge/update only the current courseKey
      weightsByCourse[courseKey] = safeRows;

      // Save back to storage using callback pattern
      chrome.storage.local.set({ weightsByCourse }, () => {
        if (chrome.runtime.lastError) {
          console.error('[Flowdeck] Error saving weights:', chrome.runtime.lastError.message);
          showSaveStatus('Could not save: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        console.log('[Flowdeck] Weights saved successfully');
        showSaveStatus('Saved', 'success');
      });
    } catch (error) {
      console.error('[Flowdeck] Error in saveWeights:', error);
      const errorMsg = error.message || 'unknown error';
      showSaveStatus('Could not save: ' + errorMsg, 'error');
    }
  }

  /**
   * Loads weights from chrome.storage.local for a specific course
   * @param {string} courseKey - The course key (e.g., "d2l-123456")
   * @returns {Promise<Array|null>} Array of {name: string, weight: number|null} objects, or null if not found
   */
  async function loadWeights(courseKey) {
    if (!courseKey) {
      console.log('[Flowdeck] Cannot load weights: no courseKey');
      return null;
    }

    // Runtime check: Ensure chrome.storage API is available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      console.error('[Flowdeck] Storage API not available for loading weights');
      return null;
    }

    console.log('[Flowdeck] Loading weights for courseKey:', courseKey);

    return new Promise((resolve) => {
      // Use callback pattern (chrome.storage.local.get doesn't return a Promise)
      chrome.storage.local.get(['weightsByCourse'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('[Flowdeck] Error loading weights:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }

        const weightsByCourse = result.weightsByCourse || {};

        if (weightsByCourse[courseKey]) {
          console.log('[Flowdeck] Loaded weights:', weightsByCourse[courseKey]);
          resolve(weightsByCourse[courseKey]);
        } else {
          console.log('[Flowdeck] No saved weights found for courseKey:', courseKey);
          resolve(null);
        }
      });
    });
  }

  /**
   * Shows a status message near the Save button
   * @param {string} message - The message to display
   * @param {string} type - 'success', 'error', or 'info'
   */
  function showSaveStatus(message, type) {
    if (!saveStatus) return;

    saveStatus.textContent = message;
    saveStatus.className = `save-status ${type}`;
    saveStatus.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (saveStatus) {
        saveStatus.style.display = 'none';
      }
    }, 3000);
  }

  /**
   * Gets default weights (used when no saved weights are found)
   * @returns {Array} Default weight rows
   */
  function getDefaultWeights() {
    return [
      { name: 'Assignments', weight: 30 },
      { name: 'Midterm', weight: 25 },
      { name: 'Final Exam', weight: 45 }
    ];
  }

  /**
   * Requests course detection from the content script.
   * Does not access page DOM directly (popup is isolated).
   */
  async function fetchCourseFromActiveTab() {
    console.log('[Flowdeck] Fetching course from active tab...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || typeof tab.id !== 'number') {
        console.log('[Flowdeck] No active tab found for course detection');
        if (detectedCourseEl) detectedCourseEl.textContent = 'Not found';
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'FLOWDECK_GET_COURSE' }, async (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Flowdeck] FLOWDECK_GET_COURSE lastError:', chrome.runtime.lastError.message);
          if (detectedCourseEl) detectedCourseEl.textContent = 'Not found';
          return;
        }

        console.log('[Flowdeck] FLOWDECK_GET_COURSE response:', response);

        if (response && response.ok && response.courseName && detectedCourseEl) {
          detectedCourseEl.textContent = response.courseName;
          
          // Store courseKey and load weights
          if (response.courseKey) {
            currentCourseKey = response.courseKey;
            console.log('[Flowdeck] CourseKey detected:', currentCourseKey);
            
            // Load weights for this course
            const savedWeights = await loadWeights(currentCourseKey);
            if (savedWeights && savedWeights.length > 0) {
              console.log('[Flowdeck] Rendering loaded weights');
              renderWeightsTable(savedWeights);
            } else {
              console.log('[Flowdeck] No saved weights found, using defaults');
              renderWeightsTable(getDefaultWeights());
            }
          }
        } else if (detectedCourseEl) {
          detectedCourseEl.textContent = 'Not found';
        }
      });
    } catch (err) {
      console.log('[Flowdeck] Course detection error:', err);
      if (detectedCourseEl) detectedCourseEl.textContent = 'Not found';
    }
  }

  /**
   * Fetches grades from the active tab
   * @returns {Promise<void>}
   */
  async function fetchGradesFromLearningHub() {
    console.log('[Flowdeck] Fetching grades from Learning Hub...');
    
    if (fetchStatus) {
      fetchStatus.style.display = 'block';
      fetchStatus.textContent = 'Fetching grades...';
      fetchStatus.className = 'fetch-status fetching';
    }

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        const errorMsg = 'No active tab found';
        console.log('[Flowdeck]', errorMsg);
        if (fetchStatus) {
          fetchStatus.textContent = errorMsg + '. Open a Learning Hub page.';
          fetchStatus.className = 'fetch-status error';
        }
        return;
      }

      console.log('[Flowdeck] Active tab URL:', tab.url);

      // Check if we're on a Learning Hub page
      if (!tab.url.includes('learn.bcit.ca')) {
        const errorMsg = 'Not on a Learning Hub page';
        console.log('[Flowdeck]', errorMsg);
        if (fetchStatus) {
          fetchStatus.textContent = errorMsg + '. Navigate to learn.bcit.ca to fetch grades.';
          fetchStatus.className = 'fetch-status error';
        }
        return;
      }

      // Send message to content script with Promise wrapper
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { type: 'FLOWDECK_GET_GRADES' }, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            console.error('[Flowdeck] Error sending message:', errorMsg);
            if (fetchStatus) {
              fetchStatus.textContent = 'Content script not ready: ' + errorMsg + '. Try refreshing the page.';
              fetchStatus.className = 'fetch-status error';
            }
            reject(new Error(errorMsg));
            return;
          }

          console.log('[Flowdeck] Received response:', response);

          if (!response) {
            const errorMsg = 'No response from page';
            console.log('[Flowdeck]', errorMsg);
            if (fetchStatus) {
              fetchStatus.textContent = errorMsg + '. Make sure you are on a Learning Hub page.';
              fetchStatus.className = 'fetch-status error';
            }
            reject(new Error(errorMsg));
            return;
          }

          if (!response.ok) {
            const reason = response.reason || 'unknown_error';
            let message = 'Could not fetch grades. You can enter grades manually.';
            
            if (reason === 'not_on_grades_page') {
              message = 'Not on a grades page. Navigate to the Grades section.';
            } else if (reason === 'no_grade_items_found') {
              message = 'No grade items found on this page.';
            } else if (reason === 'scraping_error') {
              message = 'Error scraping grades: ' + (response.error || 'unknown error');
            }

            console.log('[Flowdeck] Grade fetch failed:', reason);
            if (fetchStatus) {
              fetchStatus.textContent = message;
              fetchStatus.className = 'fetch-status error';
            }
            reject(new Error(reason));
            return;
          }

          // Successfully fetched grades
          console.log('[Flowdeck] Successfully fetched grades:', response);
          
          if (fetchStatus) {
            fetchStatus.textContent = `Found ${response.gradeItems.length} grade items`;
            fetchStatus.className = 'fetch-status success';
          }

          // Show warning
          if (autoFetchWarning) {
            autoFetchWarning.style.display = 'flex';
          }

          // Display grades in UI
          displayFetchedGrades(response);
          
          resolve();
        });
      });

    } catch (error) {
      console.error('[Flowdeck] Error fetching grades:', error);
      if (fetchStatus) {
        fetchStatus.textContent = 'Error: ' + (error.message || 'Unknown error occurred');
        fetchStatus.className = 'fetch-status error';
      }
      throw error;
    }
  }

  /**
   * Maps category name to DOM element IDs
   * @param {string} categoryName - The category name from the table
   * @returns {Object|null} Object with inputId and infoId, or null if no match
   */
  function mapCategoryToDOMIds(categoryName) {
    if (!categoryName) return null;
    
    const categoryLower = categoryName.toLowerCase();
    
    // Check for assignments (assignment, lab, project, homework, etc.)
    if (categoryLower.includes('assignment') || 
        categoryLower.includes('lab') || 
        categoryLower.includes('project') ||
        categoryLower.includes('homework') ||
        categoryLower.includes('hw')) {
      return {
        inputId: 'assignmentsGrade',
        infoId: 'assignmentsInfo'
      };
    }
    
    // Check for midterm
    if (categoryLower.includes('midterm') || 
        categoryLower.includes('mid-term') ||
        categoryLower.includes('mid term')) {
      return {
        inputId: 'midtermGrade',
        infoId: 'midtermInfo'
      };
    }
    
    // Check for final
    if (categoryLower.includes('final') || 
        categoryLower.includes('exam') && categoryLower.includes('final')) {
      return {
        inputId: 'finalGrade',
        infoId: 'finalInfo'
      };
    }
    
    return null;
  }

  /**
   * Displays fetched grades in the UI
   */
  function displayFetchedGrades(gradeData) {
    console.log('[Flowdeck] ===== Displaying fetched grades =====');
    console.log('[Flowdeck] Response ok:', gradeData.ok);
    console.log('[Flowdeck] Grade items length:', gradeData.gradeItems ? gradeData.gradeItems.length : 0);
    console.log('[Flowdeck] Grade items:', gradeData.gradeItems);

    if (!gradeData || !gradeData.gradeItems || gradeData.gradeItems.length === 0) {
      console.log('[Flowdeck] No grade items to display');
      return;
    }

    // Get category weights from the table
    const categoryWeights = getDefaultCategoryWeights();
    console.log('[Flowdeck] Category weights from table:', categoryWeights);

    if (Object.keys(categoryWeights).length === 0) {
      console.log('[Flowdeck] No category weights found in table');
      return;
    }

    // Calculate contributions
    const categoryData = calculateCategoryContributions(gradeData.gradeItems, categoryWeights);
    console.log('[Flowdeck] Computed category data:', categoryData);

    // Update UI for each category
    let updatedCount = 0;
    for (const categoryName in categoryData) {
      const data = categoryData[categoryName];
      console.log(`[Flowdeck] Processing category: ${categoryName}, averagePercent: ${data.averagePercent}`);
      
      // Map category name to DOM IDs
      const domIds = mapCategoryToDOMIds(categoryName);
      
      if (!domIds) {
        console.log(`[Flowdeck] No DOM mapping found for category: ${categoryName}`);
        continue;
      }
      
      const inputField = document.getElementById(domIds.inputId);
      const infoDiv = document.getElementById(domIds.infoId);
      
      console.log(`[Flowdeck] Looking for elements: ${domIds.inputId}, ${domIds.infoId}`);
      console.log(`[Flowdeck] Found inputField:`, !!inputField, 'infoDiv:', !!infoDiv);
      console.log(`[Flowdeck] data.averagePercent:`, data.averagePercent);

      if (inputField && infoDiv && data.averagePercent !== null && !isNaN(data.averagePercent)) {
        const currentValue = inputField.value.trim();
        const shouldUpdate = !currentValue || currentValue === '--' || currentValue === '';
        
        console.log(`[Flowdeck] Current input value: "${currentValue}", shouldUpdate: ${shouldUpdate}`);
        
        if (shouldUpdate) {
          inputField.value = data.averagePercent.toFixed(1);
          console.log(`[Flowdeck] Updated ${domIds.inputId} to ${data.averagePercent.toFixed(1)}`);
          updatedCount++;
        }

        // Show info
        infoDiv.style.display = 'block';
        let infoText = `Earned so far: ${data.contributionPercent.toFixed(2)}% of final grade`;
        if (data.averagePercent !== null) {
          infoText += ` | Avg: ${data.averagePercent.toFixed(1)}%`;
        }
        if (data.isEstimated) {
          infoText += ' (estimated)';
        }
        infoDiv.textContent = infoText;
        infoDiv.className = 'grade-info';
      } else {
        console.log(`[Flowdeck] Skipping category ${categoryName}:`, {
          hasInputField: !!inputField,
          hasInfoDiv: !!infoDiv,
          averagePercent: data.averagePercent
        });
      }
    }

    console.log(`[Flowdeck] Grade display updated. Updated ${updatedCount} fields.`);
  }

  // getDefaultCategoryWeights() is defined in calc.js

  // Refresh button click handler
  if (refreshGradesBtn) {
    refreshGradesBtn.addEventListener('click', function() {
      console.log('[Flowdeck] Refresh grades button clicked');
      fetchGradesFromLearningHub();
    });
  }

  // Initialize with default weights on load (will be replaced if saved weights are found)
  renderWeightsTable(getDefaultWeights());

  // Auto-fetch on popup load
  fetchCourseFromActiveTab();
  
  // Auto-fetch grades, but fail gracefully if content script isn't ready
  fetchGradesFromLearningHub().catch(error => {
    console.log('[Flowdeck] Auto-fetch grades failed gracefully:', error);
    // Error is already handled in fetchGradesFromLearningHub with visible status message
  });
});
