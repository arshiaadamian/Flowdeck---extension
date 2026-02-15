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
 * - categoryAvg = average(item.grade) of done items
 * - Result stored in category.grade
 *
 * @param {Category|Object} category - Category instance or POJO
 * @returns {{ grade: number, doneCount: number, totalItems: number }}
 */
export function computeCategoryGradePercent(category) {
  const cat = toInstance(category, Category);
  const doneItems = cat.items.filter((it) => {
    const item = toInstance(it, Item);
    return item.done === true;
  });

  if (doneItems.length === 0) {
    cat.grade = 0;
    console.log('[Flowdeck] calc: category', cat.category || 'unnamed', 'no done items, grade=0');
    return { grade: 0, doneCount: 0, totalItems: cat.items.length };
  }

  const sum = doneItems.reduce((acc, it) => {
    const item = toInstance(it, Item);
    return acc + (Number.isFinite(item.grade) ? item.grade : 0);
  }, 0);
  const grade = sum / doneItems.length;
  cat.grade = grade;

  console.log('[Flowdeck] calc: category', cat.category || 'unnamed', 'grade=', grade.toFixed(2), 'done=', doneItems.length);
  return { grade, doneCount: doneItems.length, totalItems: cat.items.length };
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
    const weight = Number.isFinite(catInst.weight) ? catInst.weight : 0;
    const catGrade = Number.isFinite(catInst.grade) ? catInst.grade : 0;

    if (weight <= 0) continue;

    totalWeightEntered += weight;
    const contribution = (catGrade / 100) * weight;
    totalContrib += contribution;
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
