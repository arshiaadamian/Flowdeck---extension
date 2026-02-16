import { Course, Category, Item } from './models.js';


const UNWEIGHTED_CATEGORY_IDENTIFIER = -100;
/**
 * UTILITY FUNCTIONS
 * Parsing text, numbers, and cleaning string data.
 */

/**
 * Clean whitespace and newlines from text.
 * @param {string} str 
 * @returns {string}
 */
const cleanText = (str) => {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
};

/**
 * Extract a float from a string (e.g., "85.5 %" -> 85.5).
 * @param {string} str 
 * @returns {number}
 */
const parseNumber = (str) => {
  if (!str) return 0;
  const match = str.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

/**
 * Parse a "Points" string like "8 / 10" into a percentage.
 * @param {string} str 
 * @returns {number|null} Returns percentage (0-100) or null if invalid format.
 */
const parsePointsToPercent = (str) => {
  if (!str) return null;
  // Handle "Dropped" status text if present in the points column
  if (str.toLowerCase().includes('dropped')) return 0;

  const parts = str.split('/');
  if (parts.length === 2) {
    const numerator = parseFloat(parts[0]);
    const denominator = parseFloat(parts[1]);
    if (denominator === 0) return 100; // Avoid division by zero, assume bonus or full
    return (numerator / denominator) * 100;
  }
  return null;
};

/**
 * Check if a row represents a "Dropped" grade.
 * Looks for specific text or D2L icons.
 * @param {HTMLElement} row 
 * @returns {boolean}
 */
const isDropped = (row) => {
  const text = row.innerText.toLowerCase();
  const hasDroppedText = text.includes('dropped');
  const hasDroppedIcon = row.querySelector('img[alt*="Dropped"]');
  return hasDroppedText || !!hasDroppedIcon;
};

/**
 * DOM SCRAPING FUNCTIONS
 * Extracting specific pieces of data from the HTML structure.
 */

/**
 * Scrapes the Course Name and Number from the D2L Navbar or Title.
 * @param {Document} doc 
 * @returns {{name: string, number: string}}
 */
const getCourseDetails = (doc) => {
  // Try finding the specific D2L navbar title first
  let titleElement = doc.querySelector('.d2l-navigation-s-title') || 
                     doc.querySelector('header h1') || 
                     doc.querySelector('title');

  let rawTitle = titleElement ? cleanText(titleElement.innerText || titleElement.text) : "Unknown Course";
  
  // Attempt to split Number and Name (e.g., "CST-2300 - Computer Architecture")
  // Regex looks for patterns like "COMP 1234" or "CST-2300" at the start
  const match = rawTitle.match(/^([A-Z]{3,4}[- ]\d{3,4}(?:-[A-Z0-9]+)?)\s*[-–]\s*(.*)/);

  if (match) {
    console.log(match[0] + " everything");
    return { number: match[1], name: match[2] };
  }

  return { number: "Unknown", name: rawTitle };
};

/**
 * Determines the index of key columns (Points, Weight, Grade) dynamically.
 * D2L tables change column order depending on the specific view/course.
 * @param {HTMLTableElement} table 
 * @returns {Object} map of column names to indices
 */
const getColumnIndices = (table) => {
  const headers = Array.from(table.querySelectorAll('th'));
  const indices = { points: -1, weight: -1, grade: -1 };

  headers.forEach((th, index) => {
    const text = cleanText(th.innerText).toLowerCase();
    if (text.includes('points')) indices.points = index;
    else if (text.includes('weight')) indices.weight = index;
    else if (text.includes('grade')) indices.grade = index;
  });

  return indices;
};

/**
 * Scrape all categories and items from the main grades table.
 * @param {Document} doc 
 * @param {string} courseId 
 * @returns {Category[]}
 */
const getCategoriesAndItems = (doc, courseId) => {

 
  const categories = [];
  
  // Find the main grades table. ID usually starts with 'z_' and has class 'd2l-table'
  const table = doc.querySelector('table.d2l-table[summary*="List of grade items"]'); // could also look for the id, if id is stable.
  if (!table) {
    console.warn("Flowdeck: Could not find grades table.");
    return [];
  }

  const indices = getColumnIndices(table); // points-1, weight-2, grades-3



  const rows = Array.from(table.querySelectorAll('tbody tr'));



  let currentCategory = null;

  rows.forEach((row, index) => {


    // Every single grade item thats under a ctaegory has a td element with the class d_g_treeNodeImage
    const hasIndentationElement = row.querySelector('td.d_g_treeNodeImage');

    // 1. Identify Row Type
    // D2L "Category" rows usually have class 'd_ggl1' (Grade Group Level 1)
    const isCategoryRow = row.classList.contains('d_ggl1');
    
    // D2L "Item" rows are usually 'd_gd' or have a specific indentation image
    // If it's not a header and not a category, it's likely an item.
    const isHeaderRow = row.classList.contains('d_gh'); 

    // if a grade item is not under a category, it is a stand alone grade item. and we check this by checking if the row doesnt have a td element with the class d_g_treeNodeImage and also doesnt have the class d_gh
    const standAloneGradeItem = !(!!hasIndentationElement) && !(isCategoryRow);


    
    if (isHeaderRow) return;

    // Get Cells
    const cells = row.querySelectorAll('td:not(.d_g_treeNodeImage), th');
    
    // Safety check for malformed rows
    if (cells.length < 3) return;

    // Helper to safely get text from a cell based on column mapping
    const getText = (colIndex) => {
      if (colIndex === -1 || !cells[colIndex]) return null;
      return cleanText(cells[colIndex].innerText);
    };


// The details of this row, whether it's a category row, an item row or standalone item row. We still get the points(empty if it's a category header), weight( empty if the item or header row is unweighted), and grade ( can also be empty)
    const rowPointsText = getText(indices.points);
    const rowWeightText = getText(indices.weight); 
    const rowGradeText = getText(indices.grade);


   

    // Does this row use weight achieved
    const rowHasWeight = rowWeightText && rowWeightText.includes('/'); 
    const rowHasPoints = rowPointsText && rowPointsText.includes("/");
    const rowHasGrade = rowGradeText && rowGradeText.includes("%");


    // e.g., "15 / 20" or "75 %"
    let rowWeight = 0;
    let rowGrade = 0;

    // Gets the grade for the row , if we have points we extract it from points if 

    if(rowHasPoints){
      rowGrade = parsePointsToPercent(rowPointsText);
    }else if (rowHasWeight){

      // Move this to seperate function
      const parts = rowWeightText.split('/');
         console.log("Grade: "+ rowGrade +" weight: "+ rowWeight)

      const part_achieved = parseFloat(parts[0]);
      const part_total = parseFloat(parts[1]); 

      rowGrade = (part_achieved / part_total) * 100;
    }else if(rowHasGrade){
      rowGrade = parseNumber(rowGradeText); 
    }
 
    if (rowHasWeight) {
      const parts = rowWeightText.split('/');
      rowWeight = parseFloat(parts[1]);  // The denominator is the total weight
    } else {
      rowWeight = UNWEIGHTED_CATEGORY_IDENTIFIER;
    }


      // Given the row, it will extract the points, weight, and grade of the item. Returning an Item object.
  // it will use the indices to get the points, weight, and grade from the row.
  const getGradeItemDetialsFromRow = (row) => {
 
    const itemName = cleanText(row.querySelector('th label, th div, th')?.innerText || "Unknown Item");
    let done = false;

    // Handle Dropped
    if (isDropped(row) || (rowPointsText === '-' || !rowPointsText)) { 
      done = false;
    } else{
      done = true;
    }




    return new Item({
      name: itemName,
      grade: rowGrade,
      done: done,
      weight: rowWeight 
    });

    


  }
  
    if (isCategoryRow) {
      // --- PROCESS CATEGORY ---
      
      // If we were processing a previous category, push it first
      if (currentCategory) categories.push(currentCategory);

      const catName = cleanText(row.querySelector('th label, th strong, th')?.innerText || "Unknown Category");
   
      currentCategory = new Category({
        course_id: courseId,
        category: catName,
        weight: rowWeight, // Total weight of this category (e.g. 20)
        grade: rowGrade, // What user achieved (e.g. 15)
        items: []
      });

    }else if(standAloneGradeItem){

      categories.push(currentCategory);
      const item = getGradeItemDetialsFromRow(row);
      currentCategory = new Category({
        course_id: courseId,
        category: item.name,
        weight: item.weight, // Total weight of this category (e.g. 20)
        grade: item.grade, // What user achieved (e.g. 15)
        items: [
          item
        ]
      });

    } else {
      const item = getGradeItemDetialsFromRow(row);
      currentCategory.addItem(item);
    }
  });

  // Push the final category
  if (currentCategory) categories.push(currentCategory);

  return categories;
};

/**
 * POST-PROCESSING
 * Handle the edge case where D2L doesn't give us the category weight,
 * requiring us to distribute weight based on item count.
 * * @param {Category[]} categories 
 */
const distributeMissingWeights = (categories) => {
  const total_categories = categories.length;

  categories.forEach(cat => {
    if(cat.weight === UNWEIGHTED_CATEGORY_IDENTIFIER){
      const totalItems = cat.items.length;
      cat.weight = 100/ total_categories;
       cat.items.forEach((item,index)=>{
  
         if(item.weight === UNWEIGHTED_CATEGORY_IDENTIFIER){
          item.weight = 100/ totalItems;
         }
       })
       
    }


  });
};

/**
 * Extracts course_id from current page URL (e.g. /d2l/home/1158526 -> "1158526")
 * Also checks nav link href as fallback.
 * @param {Document} dom
 * @returns {string} courseId or empty string
 */
const getCourseIdFromPage = (dom) => {
  const url = dom.location?.href || '';
  const urlMatch = url.match(/\/d2l\/home\/(\d+)/);
  if (urlMatch) return urlMatch[1];

  const link = dom.querySelector('a.d2l-navigation-s-link[href*="/d2l/home/"]');
  if (link) {
    const href = link.getAttribute('href') || '';
    const m = href.match(/\/d2l\/home\/(\d+)/);
    if (m) return m[1];
  }
  return '';
};

/**
 * MAIN FUNCTION
 * Scrapes the DOM and returns a Course as POJO (Course.toJson() shape).
 * Used by content script to respond to FLOWDECK_SCRAPE.
 *
 * @param {Document} [dom=document] The HTML document
 * @returns {Object} Course POJO suitable for Course.fromJson()
 */
export function scrapeCourseAndGradesFromPage(dom = document) {
  try {
    const courseId = getCourseIdFromPage(dom);
    const courseKey = courseId ? `d2l-${courseId}` : '';

    // 1. Get High Level Info
    const { name, number } = getCourseDetails(dom);

    // 2. Initialize Course (use courseKey as id for storage consistency)
    const course = new Course({
      id: courseKey || undefined,
      course_name: name,
      course_number: number,
      current_grade: 0,
      target_grade: 85,
    });

    // 3. Scrape "Final Adjusted Grade" if available
    const finalGradeLbl = Array.from(dom.querySelectorAll('label')).find(
      (l) =>
        l.innerText.includes('Final Adjusted Grade') ||
        l.innerText.includes('Final Calculated Grade')
    );
    if (finalGradeLbl) {
      const container = finalGradeLbl.closest('table')?.parentNode;
      if (container) {
        const scoreText = container.innerText;
        const parts = scoreText.match(/([\d.]+) \//);
        if (parts) course.current_grade = parseFloat(parts[1]);
      }
    }

    // 4. Scrape Categories and Items
    const categories = getCategoriesAndItems(dom, course.id);

    // 5. Post-process weights
    distributeMissingWeights(categories);

    // 6. Add categories to course
    categories.forEach((cat) => course.addCategory(cat));

    const courseJson = course.toJson();
    console.log('[Flowdeck] Scrape success, course:', courseJson.course_name, 'categories:', courseJson.categories?.length);


    console.log(courseJson)

    return courseJson;
  } catch (error) {
    console.error('[Flowdeck] Scrape failed:', error);
    throw error;
  }
}