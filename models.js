// models.js
// Robust ES6 data models for Flowdeck (Chrome Extension)

/**
 * @returns {string} A reasonably unique ID for local storage usage.
 * Note: Not cryptographically secure. Good enough for extension data.
 */
function generateId() {
    // Prefer crypto if available (most modern browsers)
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  
    // Fallback: timestamp + random
    const rand = Math.random().toString(16).slice(2);
    return `id_${Date.now().toString(16)}_${rand}`;
  }
  
  /**
   * @param {any} value
   * @param {number} fallback
   * @returns {number}
   */
  function toNumberOr(value, fallback = 0) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
    return fallback;
  }
  
  /**
   * @param {any} value
   * @param {string} fallback
   * @returns {string}
   */
  function toStringOr(value, fallback = "") {
    if (typeof value === "string") {
      return value;
    }
    if (value === null || value === undefined) {
      return fallback;
    }
    return String(value);
  }
  
  /**
   * @param {any} value
   * @param {boolean} fallback
   * @returns {boolean}
   */
  function toBooleanOr(value, fallback = false) {
    if (typeof value === "boolean") {
      return value;
    }
    // Common cases when deserializing or scraping
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return fallback;
  }
  
  /**
   * Represents a single graded item within a category (e.g., "Quiz 1").
   */
  export class Item {
    /**
     * @param {Object} [params]
     * @param {string} [params.id] Unique ID
     * @param {string} [params.name] Item name (e.g., "Quiz 1")
     * @param {number} [params.grade] Score achieved (0-100)
     * @param {boolean} [params.done] True if graded/completed
     * @param {number}  [params.weight] the weight this item holds in it's category
     */
    constructor({
      id = generateId(),
      name = "",
      grade = 0,
      done = false,
      weight = 100
    } = {}) {
      this.id = toStringOr(id, generateId());
      this.name = toStringOr(name, "");
      this.grade = toNumberOr(grade, 0);
      this.done = toBooleanOr(done, false);
      this.weight = toNumberOr(weight,0)
    }
  
    /**
     * Convert this instance into a plain object suitable for JSON.stringify.
     * @returns {{id: string, name: string, grade_percent: number, done: boolean}}
     */
    toJson() {
      return {
        id: this.id,
        name: this.name,
        grade: this.grade,
        done: this.done,
        weight:this.weight
      };
    }
  
    /**
     * Factory method to create an Item from a plain JS object.
     * Safely handles invalid inputs.
     * @param {any} json
     * @returns {Item}
     */
    static fromJson(json = {}) {
      if (!json || typeof json !== "object") {
        return new Item();
      }
  
      return new Item({
        id: json.id,
        name: json.name,
        grade: json.grade,
        done: json.done,
        weight:json.weight
      });
    }
  }
  
  /**
   * Represents a grading category within a course (e.g., "Assignments").
   */
  export class Category {
    /**
     * @param {Object} [params]
     * @param {string} [params.id] Unique ID
     * @param {string} [params.course_id] Links back to parent Course
     * @param {string} [params.category] Category name (e.g., "Assignments")
     * @param {number} [params.weight] Category weight of total course (0-100)
     * @param {number} [params.grade] Current calculated category grade (0-100)
     * @param {Item[]} [params.items] Array of Item instances
     */
    constructor({
      id = generateId(),
      course_id = "",
      category = "",
      weight = 0,
      grade = 0,
      items = [],
    } = {}) {
      this.id = toStringOr(id, generateId());
      this.course_id = toStringOr(course_id, "");
      this.category = toStringOr(category, "");
      this.weight = toNumberOr(weight, 0);
      this.grade = toNumberOr(grade, 0);
  
      // Ensure deep instance array
      this.items = Array.isArray(items)
        ? items.map((it) => (it instanceof Item ? it : Item.fromJson(it)))
        : [];
    }
  
    /**
     * Helper to add an Item to this category.
     * @param {Item|Object} item
     * @returns {void}
     */
    addItem(item = {}) {
      const instance = item instanceof Item ? item : Item.fromJson(item);
      this.items.push(instance);
    }
  
    /**
     * Convert this instance into a plain object suitable for JSON.stringify.
     * @returns {{
     *  id: string,
     *  course_id: string,
     *  category: string,
     *  weight_percent: number,
     *  grade: number,
     *  items: Array<{id: string, name: string, grade_percent: number, done: boolean}>
     * }}
     */
    toJson() {
      return {
        id: this.id,
        course_id: this.course_id,
        category: this.category,
        weight: this.weight,
        grade: this.grade,
        items: this.items.map((it) => it.toJson()),
      };
    }
  
    /**
     * Factory method to create a Category from a plain JS object.
     * Performs deep deserialization of items.
     * @param {any} json
     * @returns {Category}
     */
    static fromJson(json = {}) {
      if (!json || typeof json !== "object") {
        return new Category();
      }
  
      const rawItems = Array.isArray(json.items) ? json.items : [];
  
      return new Category({
        id: json.id,
        course_id: json.course_id,
        category: json.category,
        weight: json.weight,
        grade: json.grade,
        items: rawItems.map((it) => Item.fromJson(it)),
      });
    }
  }
  
  /**
   * Represents a course and its grading structure (categories/items).
   */
  export class Course {
    /**
     * @param {Object} [params]
     * @param {string} [params.id] Unique ID
     * @param {string} [params.course_name] Course title (e.g., "Computer Architecture")
     * @param {string} [params.course_number] Course code (e.g., "CST-2300")
     * @param {number} [params.current_grade] Overall course grade (0-100)
     * @param {number} [params.target_grade] User goal (0-100)
     * @param {Category[]} [params.categories] Array of Category instances
     */
    constructor({
      id = generateId(),
      course_name = "",
      course_number = "",
      current_grade = 0,
      target_grade = 0,
      categories = [],
    } = {}) {
      this.id = toStringOr(id, generateId());
      this.course_name = toStringOr(course_name, "");
      this.course_number = toStringOr(course_number, "");
      this.current_grade = toNumberOr(current_grade, 0);
      this.target_grade = toNumberOr(target_grade, 0);
  
      // Ensure deep instance array
      this.categories = Array.isArray(categories)
        ? categories.map((c) => (c instanceof Category ? c : Category.fromJson(c)))
        : [];
    }
  
    /**
     * Helper to add a Category to this course.
     * Ensures the category.course_id is linked to this course id.
     * @param {Category|Object} category
     * @returns {void}
     */
    addCategory(category = {}) {
      const instance = category instanceof Category ? category : Category.fromJson(category);
  
      // Link category back to course if missing or mismatched
      if (!instance.course_id) {
        instance.course_id = this.id;
      }
  
      this.categories.push(instance);
    }
  
    /**
     * Convert this instance into a plain object suitable for JSON.stringify.
     * @returns {{
     *  id: string,
     *  course_name: string,
     *  course_number: string,
     *  current_grade: number,
     *  target_grade: number,
     *  categories: Array<ReturnType<Category["toJson"]>>
     * }}
     */
    toJson() {
      return {
        id: this.id,
        course_name: this.course_name,
        course_number: this.course_number,
        current_grade: this.current_grade,
        target_grade: this.target_grade,
        categories: this.categories.map((c) => c.toJson()),
      };
    }
  
    /**
     * Factory method to create a Course from a plain JS object.
     * Performs deep deserialization of categories and their items.
     * @param {any} json
     * @returns {Course}
     */
    static fromJson(json = {}) {
      if (!json || typeof json !== "object") {
        return new Course();
      }
  
      const rawCategories = Array.isArray(json.categories) ? json.categories : [];
  
      return new Course({
        id: json.id,
        course_name: json.course_name,
        course_number: json.course_number,
        current_grade: json.current_grade,
        target_grade: json.target_grade,
        categories: rawCategories.map((c) => Category.fromJson(c)),
      });
    }
  }
  