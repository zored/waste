/**
 * Управление состоянием категорий (включены/выключены)
 */
export class CategoryManager {
    constructor() {
        this.enabledCategories = new Set();
        this.onChange = null;
    }

    /**
     * Инициализирует категории из списка
     */
    init(categories) {
        this.enabledCategories = new Set(categories.map(c => c.name));
    }

    /**
     * Переключает состояние категории
     */
    toggle(categoryName) {
        if (this.enabledCategories.has(categoryName)) {
            this.enabledCategories.delete(categoryName);
        } else {
            this.enabledCategories.add(categoryName);
        }

        if (this.onChange) {
            this.onChange(this.enabledCategories);
        }
    }

    /**
     * Включает все категории
     */
    enableAll(categories) {
        this.enabledCategories = new Set(categories.map(c => c.name));
        if (this.onChange) {
            this.onChange(this.enabledCategories);
        }
    }

    /**
     * Проверяет, включена ли категория
     */
    isEnabled(categoryName) {
        return this.enabledCategories.has(categoryName);
    }

    /**
     * Возвращает множество включённых категорий
     */
    getEnabled() {
        return new Set(this.enabledCategories);
    }
}