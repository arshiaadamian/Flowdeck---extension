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
      // Placeholder: Would add new row to weights table
    });
  }

  // Save Weights Button
  const saveWeightsBtn = document.getElementById('saveWeightsBtn');
  if (saveWeightsBtn) {
    saveWeightsBtn.addEventListener('click', function() {
      console.log('[Flowdeck] Save Weights button clicked');
      // Placeholder: Would save weight configuration
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

  /**
   * Mirrors the cleanup used for `cleanedName` in content.js.
   * (We can’t directly access content-script globals from the popup.)
   */
  function cleanCourseName(rawName) {
    if (!rawName || typeof rawName !== 'string') return null;
    return rawName.split('(merge')[0].trim();
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

      chrome.tabs.sendMessage(tab.id, { type: 'FLOWDECK_GET_COURSE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Flowdeck] FLOWDECK_GET_COURSE lastError:', chrome.runtime.lastError.message);
          if (detectedCourseEl) detectedCourseEl.textContent = 'Not found';
          return;
        }

        console.log('[Flowdeck] FLOWDECK_GET_COURSE response:', response);

        if (response && response.ok && response.courseName && detectedCourseEl) {
          detectedCourseEl.textContent = response.courseName;
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
        throw new Error('No active tab found');
      }

      console.log('[Flowdeck] Active tab URL:', tab.url);

      // Check if we're on a Learning Hub page
      if (!tab.url.includes('learn.bcit.ca')) {
        if (fetchStatus) {
          fetchStatus.textContent = 'Not on a Learning Hub page';
          fetchStatus.className = 'fetch-status error';
        }
        console.log('[Flowdeck] Not on Learning Hub page');
        return;
      }

      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { type: 'FLOWDECK_GET_GRADES' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Flowdeck] Error sending message:', chrome.runtime.lastError.message);

          if (fetchStatus) {
            fetchStatus.textContent = 'Error: ' + chrome.runtime.lastError.message;
            fetchStatus.className = 'fetch-status error';
          }
          return;
        }

        console.log('[Flowdeck] Received response:', response);

        if (!response) {
          if (fetchStatus) {
            fetchStatus.textContent = 'No response from page';
            fetchStatus.className = 'fetch-status error';
          }
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

          if (fetchStatus) {
            fetchStatus.textContent = message;
            fetchStatus.className = 'fetch-status error';
          }
          console.log('[Flowdeck] Grade fetch failed:', reason);
          return;
        }

        // Successfully fetched grades
        console.log('[Flowdeck] Successfully fetched grades:', response);
        
        if (fetchStatus) {
          fetchStatus.textContent = `Found ${response.gradeItems.length} grade items`;
          fetchStatus.className = 'fetch-status success';
        }

        // Course name is handled via FLOWDECK_GET_COURSE. Leave grades fetch focused on grades.

        // Show warning
        if (autoFetchWarning) {
          autoFetchWarning.style.display = 'flex';
        }

        // Display grades in UI
        displayFetchedGrades(response);

      });

    } catch (error) {
      console.error('[Flowdeck] Error fetching grades:', error);
      if (fetchStatus) {
        fetchStatus.textContent = 'Error: ' + error.message;
        fetchStatus.className = 'fetch-status error';
      }
    }
  }

  /**
   * Displays fetched grades in the UI
   */
  function displayFetchedGrades(gradeData) {
    console.log('[Flowdeck] Displaying fetched grades...');

    // Get category weights from the table
    const categoryWeights = getDefaultCategoryWeights();
    console.log('[Flowdeck] Category weights:', categoryWeights);

    // Calculate contributions
    const categoryData = calculateCategoryContributions(gradeData.gradeItems, categoryWeights);

    // Update UI for each category
    for (const categoryName in categoryData) {
      const data = categoryData[categoryName];
      const categoryLower = categoryName.toLowerCase();
      
      // Find matching input field
      let inputField = null;
      let infoDiv = null;

      if (categoryLower.includes('assignment')) {
        inputField = document.getElementById('assignmentsGrade');
        infoDiv = document.getElementById('assignmentsInfo');
      } else if (categoryLower.includes('midterm')) {
        inputField = document.getElementById('midtermGrade');
        infoDiv = document.getElementById('midtermInfo');
      } else if (categoryLower.includes('final')) {
        inputField = document.getElementById('finalGrade');
        infoDiv = document.getElementById('finalInfo');
      }

      if (inputField && infoDiv && data.averagePercent !== null) {
        // Pre-fill input if empty
        if (!inputField.value) {
          inputField.value = data.averagePercent.toFixed(1);
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
      }
    }

    console.log('[Flowdeck] Grade display updated');
  }

  // getDefaultCategoryWeights() is defined in calc.js

  // Refresh button click handler
  if (refreshGradesBtn) {
    refreshGradesBtn.addEventListener('click', function() {
      console.log('[Flowdeck] Refresh grades button clicked');
      fetchGradesFromLearningHub();
    });
  }

  // Auto-fetch on popup load
  fetchCourseFromActiveTab();
  fetchGradesFromLearningHub();
});
