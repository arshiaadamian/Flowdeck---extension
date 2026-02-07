// Flowdeck Calculation Utilities

/**
 * Calculates contribution earned so far for each category
 * @param {Array} gradeItems - Array of grade items from scraping
 * @param {Object} categoryWeights - Object mapping category names to weights (percentages)
 * @returns {Object} Category data with contributions and averages
 */
function calculateCategoryContributions(gradeItems, categoryWeights) {
  console.log('[Flowdeck] Calculating category contributions...');
  console.log('[Flowdeck] Grade items:', gradeItems.length);
  console.log('[Flowdeck] Category weights:', categoryWeights);
  
  // Group grade items by category
  const categoryData = {};
  
  // Initialize category data
  for (const categoryName in categoryWeights) {
    categoryData[categoryName] = {
      name: categoryName,
      weight: categoryWeights[categoryName],
      items: [],
      totalPointsEarned: 0,
      totalPointsPossible: 0,
      averagePercent: null,
      contributionPercent: null,
      gradedWeightFraction: 1.0, // Assume all graded if unknown
      isEstimated: false
    };
  }
  
  // Assign grade items to categories
  for (const item of gradeItems) {
    let assignedCategory = null;
    
    // Try to match by categoryGuess
    if (item.categoryGuess) {
      for (const categoryName in categoryWeights) {
        if (categoryName.toLowerCase().includes(item.categoryGuess.toLowerCase()) ||
            item.categoryGuess.toLowerCase().includes(categoryName.toLowerCase())) {
          assignedCategory = categoryName;
          break;
        }
      }
    }
    
    // If no match, try to match by title keywords
    if (!assignedCategory && item.title) {
      const titleLower = item.title.toLowerCase();
      for (const categoryName in categoryWeights) {
        const categoryLower = categoryName.toLowerCase();
        if (titleLower.includes(categoryLower) || categoryLower.includes(titleLower.split(' ')[0])) {
          assignedCategory = categoryName;
          break;
        }
      }
    }
    
    // If still no match, assign to first category or create "Other"
    if (!assignedCategory) {
      const firstCategory = Object.keys(categoryWeights)[0];
      assignedCategory = firstCategory;
      console.log('[Flowdeck] Could not match item to category, assigning to:', assignedCategory);
    }
    
    if (categoryData[assignedCategory]) {
      categoryData[assignedCategory].items.push(item);
      
      // Accumulate points
      if (item.pointsEarned !== null && item.pointsPossible !== null) {
        categoryData[assignedCategory].totalPointsEarned += item.pointsEarned;
        categoryData[assignedCategory].totalPointsPossible += item.pointsPossible;
      }
    }
  }
  
  // Calculate averages and contributions for each category
  for (const categoryName in categoryData) {
    const category = categoryData[categoryName];
    
    if (category.items.length === 0) {
      category.averagePercent = null;
      category.contributionPercent = 0;
      continue;
    }
    
    // Calculate average percent for this category
    if (category.totalPointsPossible > 0) {
      // Use points-based calculation
      category.averagePercent = (category.totalPointsEarned / category.totalPointsPossible) * 100;
    } else {
      // Use percent-based calculation (average of all item percents)
      const validPercents = category.items
        .map(item => item.scorePercent)
        .filter(p => p !== null && !isNaN(p));
      
      if (validPercents.length > 0) {
        category.averagePercent = validPercents.reduce((a, b) => a + b, 0) / validPercents.length;
      }
    }
    
    // Calculate contribution to final grade
    // Contribution = (categoryAverage / 100) * (weightPercent * gradedWeightFraction)
    if (category.averagePercent !== null && !isNaN(category.averagePercent)) {
      // For now, assume gradedWeightFraction = 1.0 (all items graded)
      // In the future, this could be calculated based on known vs unknown items
      category.gradedWeightFraction = 1.0;
      category.isEstimated = true; // Mark as estimated since we don't know total items
      
      category.contributionPercent = (category.averagePercent / 100) * 
                                     (category.weight * category.gradedWeightFraction);
    } else {
      category.contributionPercent = 0;
    }
    
    console.log(`[Flowdeck] Category ${categoryName}: avg=${category.averagePercent?.toFixed(1)}%, contribution=${category.contributionPercent?.toFixed(2)}%`);
  }
  
  return categoryData;
}

/**
 * Gets default category weights from the weights table
 * @returns {Object} Category name to weight mapping
 */
function getDefaultCategoryWeights() {
  const weights = {};
  const rows = document.querySelectorAll('#weightsTableBody tr');
  
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      const name = cells[0].textContent.trim();
      const weight = parseFloat(cells[1].textContent.trim());
      if (name && !isNaN(weight)) {
        weights[name] = weight;
      }
    }
  });
  
  return weights;
}
