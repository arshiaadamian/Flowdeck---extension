/**
 * Flowdeck Calculation Module
 * Robust grade aggregation: Item -> Category -> Course
 * Accepts Course/Category/Item instances or POJOs (converted via fromJson).
 */

import { Course, Category, Item } from './models.js';

/**
 * Ensures we have a model instance from either an instance or POJO.
 * @param {Category|Item|Object} obj
 * @param {Function} Ctor - Category or Item constructor
 * @returns {Category|Item}
 */
function toInstance(obj, Ctor) {
  if (obj instanceof Ctor) return obj;
  return Ctor.fromJson(obj);
}

/**
 * Computes the category grade from done items.
 * - Only items with item.done === true are included
 * - Uses weighted average if ALL done items have valid weight > 0
 * - Falls back to simple average otherwise
 * - Result stored in category.grade
 *
 * @param {Category|Object} category - Category instance or POJO
 * @returns {{ grade: number, doneCount: number, totalItems: number, usedWeighted: boolean }}
 */
export function computeCategoryGradePercent(category) {
  const cat = toInstance(category, Category);

  const doneItems = cat.items
    .map((it) => toInstance(it, Item))
    .filter((it) => it.done === true);

  if (doneItems.length === 0) {
    cat.grade = 0;
    return { grade: 0, doneCount: 0, totalItems: cat.items.length, usedWeighted: false };
  }

  // Check if ALL done items have valid weights
  const allHaveValidWeights = doneItems.every((it) => Number.isFinite(it.weight) && it.weight > 0);

  let grade = 0;
  let usedWeighted = false;

  if (allHaveValidWeights) {
    // Weighted average
    const totalWeight = doneItems.reduce((acc, it) => acc + it.weight, 0);
    const weightedSum = doneItems.reduce((acc, it) => acc + (it.grade * it.weight), 0);
    grade = weightedSum / totalWeight;
    usedWeighted = true;
    console.log('[Flowdeck] Category weighted average:', cat.category, 'grade:', grade.toFixed(2));
  } else {
    // Simple average fallback
    const sum = doneItems.reduce((acc, it) => acc + it.grade, 0);
    grade = sum / doneItems.length;
    usedWeighted = false;
    console.log('[Flowdeck] Category simple average:', cat.category, 'grade:', grade.toFixed(2));
  }

  cat.grade = grade;
  return { grade, doneCount: doneItems.length, totalItems: cat.items.length, usedWeighted };
}





/**
 * Computes the current course grade from categories.
 * - contribution = (category.grade / 100) * category.weight
 * - current_grade = sum(contributions)
 * - Does NOT normalize when weights don't sum to 100
 * - Returns metadata about total weight and warnings
 *
 * @param {Course|Object} course - Course instance or POJO
 * @returns {{
 *   current_grade: number,
 *   total_weight_entered: number,
 *   categories_used: number,
 *   estimated: boolean,
 *   warnings: string[]
 * }}
 */
export function computeCourseCurrentGrade(course) {
  const c = toInstance(course, Course);
  const warnings = [];

  // First compute each category's grade
  for (const cat of c.categories) {
    const catInst = toInstance(cat, Category);
    computeCategoryGradePercent(catInst);
  }

  let totalContrib = 0;
  let totalWeightEntered = 0;
  let categoriesUsed = 0;

  for (const cat of c.categories) {
    const catInst = toInstance(cat, Category);
    const catWeight = Number.isFinite(catInst.weight) ? catInst.weight : 0;

    if (catWeight <= 0) continue;

    const allItems = catInst.items.map((it) => toInstance(it, Item));
    const doneItems = allItems.filter((it) => it.done === true);

    // If no items, treat whole category as done
    if (allItems.length === 0) {
      const catGrade = Number.isFinite(catInst.grade) ? catInst.grade : 0;
      totalWeightEntered += catWeight;
      totalContrib += (catGrade / 100) * catWeight;
      categoriesUsed++;
      continue;
    }

    // Only count the portion of weight that is done
    const doneRatio = doneItems.length / allItems.length;
    const doneWeight = catWeight * doneRatio;

    if (doneWeight <= 0) continue;

    const catGrade = Number.isFinite(catInst.grade) ? catInst.grade : 0;
    totalWeightEntered += doneWeight;
    totalContrib += (catGrade / 100) * doneWeight;
    categoriesUsed++;
  }

  const estimated = totalWeightEntered !== 100;
  if (totalWeightEntered < 100 && totalWeightEntered > 0) {
    warnings.push(`Weights sum to ${totalWeightEntered.toFixed(1)}%, not 100%. Grade is partial.`);
  }
  if (totalWeightEntered > 100) {
    warnings.push(`Weights sum to ${totalWeightEntered.toFixed(1)}%, exceeding 100%.`);
  }
  if (totalWeightEntered === 0) {
    warnings.push('No category weights entered.');
  }

  const result = {
    current_grade: totalContrib,
    total_weight_entered: totalWeightEntered,
    categories_used: categoriesUsed,
    estimated,
    warnings,
  };

  console.log('[Flowdeck] calc: computeCourseCurrentGrade', result);
  return result;
}

function generateEstElementId(category,item) {
  return `${category.id}_${item.id}_est`;
}
function showUndoneCourseWork(course,requiredGrade, remainingWeight) {

  let text = "";


  course.categories.forEach((c)=> c.items.forEach((item)=>{

    if(item.done === false){
      text += c.name + item.name + `<input id='${generateEstElementId(c,item)}' value="">`;
    }

  }))
}

/**
 * Calculates what grade is needed on remaining work to achieve target grade.
 * Formula: required = (target - current_achieved) / remaining_weight * 100
 * 
 * @param {Course|Object} course 
 * @param {number} targetGrade - Desired final grade (0-100)
 * @returns {{
*   required_grade: number,
*   is_possible: boolean,
*   remaining_weight: number,
*   message: string
* }}
*/
export function computeRequiredGradeOnRemaining(course, targetGrade)
{
  const c = toInstance(course, Course);
  const currentGrade = computeCourseCurrentGrade(course);
  const remainingWeight = 100 - currentGrade.total_weight_entered;
  const currentGradePoints = currentGrade.current_grade
  const pointsNeeded = targetGrade - currentGradePoints;
  const requiredGrade = (pointsNeeded / remainingWeight) * 100;

  if(remainingWeight <= 0)
    {
      return {
        required_grade: 0,
        is_possible: currentGradePoints >= targetGrade,
        remaining_weight:0,
        message: "No remaining work, Current grade is final"
      };
    }

  const isPossible = requiredGrade <= 100;

  let message = "";
  if (isPossible && requiredGrade > 0)
  {
    message = `You need ${requiredGrade.toFixed(1)}% on remaining ${remainingWeight.toFixed(1)}% of work.\n\n Remaining work: ${showUndoneCourseWork(requiredGrade,remainingWeight)}`;

  } else if(requiredGrade <= 0)
  {
    message = `You already exceeded your target! Current: ${currentGradePoints.toFixed(1)}%`;
  } else {
    message = `Target unreachable. Even with 100% on remaining work, max grade to get is: ${(currentGradePoints + remainingWeight).toFixed(1)}%`;
  }

  console.log("testing computeTargetGrade function: ", {
    target: targetGrade,
    current: currentGradePoints,
    remaining: remainingWeight,
    required: requiredGrade,
    possible: isPossible
  });

  return {
    required_grade: requiredGrade,
    is_possible: isPossible,
    remaining_weight: remainingWeight,
    message: message
  };

}


/**
 * Calculates the maximum possible grade if user had gotten 100% on all completed work.
 * Only considers items where done === true.
 * 
 * @param {Course|Object} course 
 * @returns {{
*   max_possible_grade: number,
*   actual_grade: number,
*   points_lost: number,
*   message: string
* }}
*/

export function computeMaxPossibleGradeIfPerfect(course)
{
  const c = toInstance(course, Course);

  let maxPossibleContribution = 0;

  // for each category, calculate what it would contribute if all DONE items were 100%
  for (const cat of c.categories)
  {
    const catInst = toInstance(cat, Category);
    const catWeight = Number.isFinite(catInst.weight) ? catInst.weight: 0;

    if (catWeight <= 0)
    {
      continue;
    }

    // get only done items.
    const doneItems = catInst.items.map((it) => toInstance(it, Item))
                                   .filter((it) => it.done === true);

    if (doneItems.length === 0)
    {
      continue;
    }

    // check if all done items have valid weights
    const allHaveValidWeights = doneItems.every((it) => Number.isFinite(it.weight) && it.weight > 0);

    let categoryMaxPercent = 100; // assume perfect score on done items

    if (allHaveValidWeights)
    {
      categoryMaxPercent = 100
    }
    else
    {
      const totalItems = catInst.items.length;
      const doneCount = doneItems.length;

      if (doneCount === totalItems)
      {
        categoryMaxPercent = 100;
      }
      else
      {
        categoryMaxPercent = (doneCount / totalItems) * 100;
      }
    }

    // add this category's max contribution
    const contribution = (categoryMaxPercent / 100) * catWeight;
    maxPossibleContribution += contribution;
  }

  // get actual grade
  const currentGradeResult = computeCourseCurrentGrade(course);
  const actualGrade = currentGradeResult.current_grade;
  const pointsLost = maxPossibleContribution - actualGrade;

  let message = '';
  if (pointsLost > 0.1) {
    message = `Max: ${maxPossibleContribution.toFixed(1)}% (lost ${pointsLost.toFixed(1)}%)`;
  } else {
    message = `Perfect! 🎉, you got all the marks possible so far.`;
  }

  return {
    max_possible_grade: maxPossibleContribution,
    actual_grade: actualGrade,
    points_lost: pointsLost,
    message: message
  };
}




/**
 * Generates an interactive DOM element tracking remaining required grades.
 * @param {Object} course - The course object.
 * @param {number} targetGrade - The desired final grade percentage.
 * @returns {HTMLElement} - The container element with the UI and logic attached.
 */
export  function createGradeTrackerUI(course, targetGrade,console_) {
  // 1. Setup the main container
  const container = document.createElement('div');
  container.className = 'course-tracker-widget';
  container.style.fontFamily = 'sans-serif';
  container.style.maxWidth = '500px';

  let currentEarned = 0;
  let totalRemainingCourseWeight = 0;
  const remainingItems = [];

  // 2. Parse the course data to calculate current standing and remaining items
  course.categories.forEach(category => {
    category.items.forEach(item => {

      if (item.done) {
        currentEarned += (item.grade / 100) * item.weight ;
      } else {
        remainingItems.push({
          id: item.id,
          name: item.name,
          categoryName: category.category,
          courseWeight:  item.weight ,
          manualGrade: null, // null means we auto-calculate this
          currentDisplayGrade: 0
        });
        totalRemainingCourseWeight +=  item.weight ;
      }
    });
  });

  // 3. Check Base Reachability
  if (currentEarned >= targetGrade) {
    container.innerHTML = `<h3>Goal Achieved! 🎉</h3>
      <p>You currently have <strong>${currentEarned.toFixed(2)}%</strong>, which already meets or beats your target of ${targetGrade}%.</p>`;
    return container;
  }

  const maxPossibleOverall = currentEarned + totalRemainingCourseWeight;
  if (maxPossibleOverall < targetGrade) {
    container.innerHTML = `<h3>Target Unreachable ⚠️</h3>
      <p>You currently have <strong>${currentEarned.toFixed(2)}%</strong>. Even if you get 100% on everything left, you will max out at <strong>${maxPossibleOverall.toFixed(2)}%</strong> (Target: ${targetGrade}%).</p>`;
    return container;
  }

  // 4. Calculate initial even distribution
  const totalGradeNeeded = targetGrade - currentEarned;
  const initialRequiredAverage = (totalGradeNeeded / totalRemainingCourseWeight) * 100;

  remainingItems.forEach(item => {
    console_(JSON.stringify(item)  + " data dhjdhdj ")
    item.currentDisplayGrade = initialRequiredAverage;
  });

  // 5. Build the Interactive UI
  container.innerHTML = `
    <h3>Target: ${targetGrade}% | Current: ${currentEarned.toFixed(2)}%</h3>
    <p>You need to earn <strong>${totalGradeNeeded.toFixed(2)}%</strong> more overall.</p>
    <div id="warning-message" style="color: red; font-weight: bold; margin-bottom: 15px; display: none;">
      ⚠️ Warning: Your target is unreachable with these manually set grades!
    </div>
    <br><br>
    <div id="items-container"></div>
  `;

  const itemsContainer = container.querySelector('#items-container');
  const warningMessage = container.querySelector('#warning-message');

  // Generate input fields for each remaining item
  remainingItems.forEach(item => {
    const itemRow = document.createElement('div');
    itemRow.style.display = 'flex';
    itemRow.style.justifyContent = 'space-between';
    itemRow.style.alignItems = 'center';
    itemRow.style.marginBottom = '10px';
    itemRow.style.padding = '10px';
    itemRow.style.background = '#f4f4f4';
    itemRow.style.borderRadius = '5px';


    const label = document.createElement('label');
    label.htmlFor = `input_${item.id}`;
    label.innerHTML = `<strong>${item.name}</strong> <br><small>${item.categoryName} (Course Weight: ${item.courseWeight}%)</small>`;

    const inputWrapper = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'number';
    input.id = `input_${item.id}`;
    input.value = input.value = item.currentDisplayGrade.toFixed(2);
    input.min = "0";
    input.max = "100";
    input.style.width = '70px';
    input.style.padding = '5px';

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(document.createTextNode(' %'));

    itemRow.appendChild(label);
    itemRow.appendChild(inputWrapper);
    itemsContainer.appendChild(itemRow);

    // 6. Attach Event Listeners for Dynamic Recalculation
    input.addEventListener('input', (e) => {
      const val = e.target.value;

      // If user clears the input, revert it to auto-calculate mode
      if (val === '') {
        item.manualGrade = null;
      } else {
        item.manualGrade = parseFloat(val);
      }

      recalculateGrades();
    });
  });

  // 7. Core Recalculation Logic
  function recalculateGrades() {
    let manualEarnedCoursePercentage = 0;
    let remainingAutoWeight = 0;

    // Figure out what has been manually locked in, and what weight is left for auto-distribution
    remainingItems.forEach(item => {
      if (item.manualGrade !== null) {
        manualEarnedCoursePercentage += (item.manualGrade / 100) * item.courseWeight;
      } else {
        remainingAutoWeight += item.courseWeight;
      }
    });

    const newShortfall = totalGradeNeeded - manualEarnedCoursePercentage;

    // Edge case: All items are manually edited
    if (remainingAutoWeight === 0) {
      // Allow a tiny floating point buffer (0.01)
      if (newShortfall > 0.01) {
        warningMessage.style.display = 'block';
      } else {
        warningMessage.style.display = 'none';
      }
      return;
    }

    // Calculate what the remaining untouched items need to average
    const requiredAutoAverage = (newShortfall / remainingAutoWeight) * 100;

    if (requiredAutoAverage > 100) {
      warningMessage.style.display = 'block';
    } else {
      warningMessage.style.display = 'none';

      // Update the input values for everything the user hasn't manually touched
      remainingItems.forEach(item => {
        if (item.manualGrade === null) {
          item.currentDisplayGrade = Math.max(0, requiredAutoAverage); // Don't show negative grades
          const inputEl = container.querySelector(`#input_${item.id}`);
          if (inputEl) {
            inputEl.value = item.currentDisplayGrade.toFixed(2);
          }
        }
      });
    }
  }

  return container;
}