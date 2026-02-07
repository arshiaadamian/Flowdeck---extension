// Flowdeck Content Script - Scrapes grades from BCIT Learning Hub

console.log('[Flowdeck] Content script loaded');

// --- Course detection (Learning Hub / Brightspace) ---
// Cache the latest detected course info so message responses are synchronous.
let flowdeckCourseCache = { ok: false };

function cleanCourseName(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;
  return rawName.split('(merge')[0].trim();
}

function detectCourseFromPage() {
  // Brightspace nav link example:
  // <a class="d2l-navigation-s-link" href="/d2l/home/1158526" title="COMP-... (merge ...)">...</a>
  const courseLink = document.querySelector('a.d2l-navigation-s-link[href*="/d2l/home/"]');
  if (!courseLink) {
    console.log('[Flowdeck] Course link not found (a.d2l-navigation-s-link)');
    return { ok: false };
  }

  const href = courseLink.getAttribute('href') || '';
  const courseIdMatch = href.match(/\/d2l\/home\/(\d+)/);
  const courseId = courseIdMatch ? courseIdMatch[1] : null;

  const rawText = (courseLink.textContent || '').trim();
  const cleaned = cleanCourseName(rawText);

  if (!courseId || !cleaned) {
    console.log('[Flowdeck] Course detection incomplete', { courseId, rawText });
    return { ok: false };
  }

  const courseKey = `d2l-${courseId}`;
  console.log('[Flowdeck] Course detected:', { courseName: cleaned, courseKey });

  return {
    ok: true,
    courseName: cleaned,
    courseKey
  };
}

function updateCourseCache() {
  const detected = detectCourseFromPage();
  if (detected.ok) {
    flowdeckCourseCache = detected;
  }
}

function startCourseDetection() {
  console.log('[Flowdeck] Starting course detection...');
  updateCourseCache();

  // The nav can render after initial HTML; observe for updates.
  const observer = new MutationObserver(() => {
    // Only update when we don't have a course yet (keeps logs quieter).
    if (!flowdeckCourseCache.ok) updateCourseCache();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startCourseDetection, { once: true });
} else {
  startCourseDetection();
}

/**
 * Scrapes grade information from Learning Hub pages
 * @returns {Object} Grade data object or error state
 */
function scrapeLearningHubGrades() {
  console.log('[Flowdeck] Scraping grades from Learning Hub...');
  
  try {
    // Try multiple selectors for course name
    let courseName = null;
    const courseSelectors = [
      'h1.course-title',
      '.course-header h1',
      'h1[class*="course"]',
      '.page-header h1',
      'h1'
    ];
    
    for (const selector of courseSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        courseName = element.textContent.trim();
        console.log('[Flowdeck] Found course name:', courseName);
        break;
      }
    }
    
    if (!courseName) {
      // Try to extract from URL or page title
      courseName = document.title || 'Unknown Course';
      console.log('[Flowdeck] Using page title as course name:', courseName);
    }
    
    // Look for grades table or grade items
    // Common Learning Hub selectors for grades
    const gradeSelectors = [
      'table.grades',
      'table[class*="grade"]',
      '.grades-table',
      'table.user-grade',
      '.grade-items table',
      'table tbody tr[class*="grade"]'
    ];
    
    let gradeTable = null;
    for (const selector of gradeSelectors) {
      gradeTable = document.querySelector(selector);
      if (gradeTable) {
        console.log('[Flowdeck] Found grade table with selector:', selector);
        break;
      }
    }
    
    // If no table found, try to find any table that might contain grades
    if (!gradeTable) {
      const allTables = document.querySelectorAll('table');
      for (const table of allTables) {
        const text = table.textContent.toLowerCase();
        if (text.includes('grade') || text.includes('score') || text.includes('percent')) {
          gradeTable = table;
          console.log('[Flowdeck] Found potential grade table by content');
          break;
        }
      }
    }
    
    if (!gradeTable) {
      console.log('[Flowdeck] No grade table found on page');
      return { ok: false, reason: 'not_on_grades_page' };
    }
    
    // Extract grade items from table
    const gradeItems = [];
    const rows = gradeTable.querySelectorAll('tbody tr, tr');
    
    console.log('[Flowdeck] Found', rows.length, 'potential grade rows');
    
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 2) continue;
      
      // Try to extract title, category, and score
      const rowText = row.textContent.trim();
      if (!rowText || rowText.length < 3) continue;
      
      let title = null;
      let categoryGuess = null;
      let scorePercent = null;
      let pointsEarned = null;
      let pointsPossible = null;
      
      // Extract title (usually first cell)
      if (cells[0]) {
        title = cells[0].textContent.trim();
      }
      
      // Look for percentage scores
      const percentPattern = /(\d+\.?\d*)\s*%/g;
      const percentMatches = rowText.match(percentPattern);
      if (percentMatches && percentMatches.length > 0) {
        scorePercent = parseFloat(percentMatches[0]);
      }
      
      // Look for points (e.g., "85 / 100" or "85/100")
      const pointsPattern = /(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)/g;
      const pointsMatch = rowText.match(pointsPattern);
      if (pointsMatch) {
        const parts = pointsMatch[0].split('/').map(s => parseFloat(s.trim()));
        if (parts.length === 2) {
          pointsEarned = parts[0];
          pointsPossible = parts[1];
          // Calculate percent if not found
          if (!scorePercent && pointsPossible > 0) {
            scorePercent = (pointsEarned / pointsPossible) * 100;
          }
        }
      }
      
      // Try to guess category from title
      const titleLower = (title || '').toLowerCase();
      if (titleLower.includes('assignment') || titleLower.includes('assign')) {
        categoryGuess = 'Assignments';
      } else if (titleLower.includes('midterm') || titleLower.includes('mid-term')) {
        categoryGuess = 'Midterm';
      } else if (titleLower.includes('final') || titleLower.includes('exam')) {
        categoryGuess = 'Final Exam';
      } else if (titleLower.includes('quiz')) {
        categoryGuess = 'Quizzes';
      } else if (titleLower.includes('lab')) {
        categoryGuess = 'Labs';
      } else if (titleLower.includes('project')) {
        categoryGuess = 'Projects';
      }
      
      // Only add if we have at least a title and some score data
      if (title && (scorePercent !== null || pointsEarned !== null)) {
        gradeItems.push({
          title: title,
          categoryGuess: categoryGuess,
          scorePercent: scorePercent,
          pointsEarned: pointsEarned,
          pointsPossible: pointsPossible
        });
      }
    }
    
    console.log('[Flowdeck] Extracted', gradeItems.length, 'grade items');
    
    // Try to find overall grade
    let overallGradePercent = null;
    const overallSelectors = [
      '.overall-grade',
      '.final-grade',
      '[class*="overall"]',
      '[class*="total"]'
    ];
    
    for (const selector of overallSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent;
        const percentMatch = text.match(/(\d+\.?\d*)\s*%/);
        if (percentMatch) {
          overallGradePercent = parseFloat(percentMatch[1]);
          console.log('[Flowdeck] Found overall grade:', overallGradePercent);
          break;
        }
      }
    }
    
    if (gradeItems.length === 0) {
      return { ok: false, reason: 'no_grade_items_found' };
    }
    
    return {
      ok: true,
      courseName: courseName,
      gradeItems: gradeItems,
      overallGradePercent: overallGradePercent
    };
    
  } catch (error) {
    console.error('[Flowdeck] Error scraping grades:', error);
    return { ok: false, reason: 'scraping_error', error: error.message };
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Flowdeck] Received message:', request.type);
  
  if (request.type === 'FLOWDECK_GET_COURSE') {
    // Synchronous response: use cache; if empty, attempt one immediate detection.
    if (!flowdeckCourseCache.ok) {
      // We avoid querying before DOM ready by ensuring detection starts at/after DOMContentLoaded,
      // but if the popup asks early, do a best-effort immediate attempt.
      try {
        flowdeckCourseCache = detectCourseFromPage();
      } catch (e) {
        flowdeckCourseCache = { ok: false };
      }
    }

    if (flowdeckCourseCache.ok) {
      sendResponse({
        ok: true,
        courseName: flowdeckCourseCache.courseName,
        courseKey: flowdeckCourseCache.courseKey
      });
    } else {
      sendResponse({ ok: false });
    }
    return false;
  }

  if (request.type === 'FLOWDECK_GET_GRADES') {
    const result = scrapeLearningHubGrades();
    console.log('[Flowdeck] Sending grade data:', result);
    sendResponse(result);
    return true; // Keep message channel open for async response
  }
  
  return false;
});
