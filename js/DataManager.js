/**
 * Управление данными и их группировкой
 */
export class DataManager {
    constructor() {
        this.transactions = [];
        this.categories = new Map();
        this.minDate = new Date();
        this.maxDate = new Date();
    }

    /**
     * Загружает транзакции и строит индексы
     */
    loadTransactions(transactions) {
        if (transactions.length === 0) return;

        this.transactions = transactions.sort((a, b) =>
            a.operationDate - b.operationDate
        );

        // Определяем границы дат для графика (чтобы не было дырок)
        this.minDate = this.transactions[0].operationDate;
        this.maxDate = this.transactions[this.transactions.length - 1].operationDate;

        this.buildCategoryIndex();
    }

    /**
     * Строит индекс категорий.
     * Теперь разделяем Доходы и Расходы одной и той же категории.
     */
    buildCategoryIndex() {
        this.categories.clear();

        for (const t of this.transactions) {
            // Уникальный ключ теперь включает направление транзакции (isIncome)
            // Это позволяет иметь "Пятёрочка" и в доходах (возврат), и в расходах
            const typeKey = t.isIncome ? 'inc' : 'exp';
            const key = `${t.category}|${t.description}|${typeKey}`;

            if (!this.categories.has(key)) {
                this.categories.set(key, {
                    name: key,
                    displayName: `${t.category} — ${t.description}`,
                    category: t.category,
                    description: t.description,
                    isIncome: t.isIncome,
                    total: 0,
                    count: 0
                });
            }

            const cat = this.categories.get(key);
            cat.total += Math.abs(t.amount); // Суммируем по модулю для отображения
            cat.count++;
        }
    }

    /**
     * Возвращает список категорий, отсортированных по сумме
     */
    getCategories() {
        return Array.from(this.categories.values())
            .sort((a, b) => b.total - a.total);
    }

    /**
     * Группирует транзакции по дням (заполняя пробелы)
     */
    groupByDays(enabledCategories) {
        const map = new Map();

        // 1. Создаем каркас дат от мин до макс
        const current = new Date(this.minDate);
        current.setHours(0, 0, 0, 0);

        const end = new Date(this.maxDate);
        end.setHours(0, 0, 0, 0);

        while (current <= end) {
            const key = this.formatDayKey(current);
            map.set(key, {
                date: new Date(current),
                income: 0,
                expense: 0,
                transactions: []
            });
            current.setDate(current.getDate() + 1);
        }

        // 2. Наполняем данными только те, что включены
        for (const t of this.transactions) {
            const typeKey = t.isIncome ? 'inc' : 'exp';
            const catKey = `${t.category}|${t.description}|${typeKey}`;

            if (!enabledCategories.has(catKey)) continue;

            const dateKey = this.formatDayKey(t.operationDate);
            // Если транзакция выходит за пределы (редкий кейс, но для надежности проверим наличие)
            if (map.has(dateKey)) {
                const group = map.get(dateKey);
                group.transactions.push(t);

                if (t.isIncome) {
                    group.income += t.amount;
                } else {
                    group.expense += Math.abs(t.amount);
                }
            }
        }

        return Array.from(map.values());
    }

    /**
     * Группирует транзакции по месяцам (заполняя пробелы)
     */
    groupByMonths(enabledCategories) {
        const map = new Map();

        // 1. Создаем каркас месяцев
        const current = new Date(this.minDate);
        current.setDate(1); // Первое число
        current.setHours(0, 0, 0, 0);

        const end = new Date(this.maxDate);
        end.setDate(1);

        while (current <= end) {
            const key = this.formatMonthKey(current);
            map.set(key, {
                date: new Date(current),
                year: current.getFullYear(),
                month: current.getMonth(),
                income: 0,
                expense: 0,
                transactions: []
            });
            current.setMonth(current.getMonth() + 1);
        }

        // 2. Наполняем данными
        for (const t of this.transactions) {
            const typeKey = t.isIncome ? 'inc' : 'exp';
            const catKey = `${t.category}|${t.description}|${typeKey}`;

            if (!enabledCategories.has(catKey)) continue;

            const monthKey = this.formatMonthKey(t.operationDate);

            if (map.has(monthKey)) {
                const group = map.get(monthKey);
                group.transactions.push(t);

                if (t.isIncome) {
                    group.income += t.amount;
                } else {
                    group.expense += Math.abs(t.amount);
                }
            }
        }

        return Array.from(map.values());
    }

    formatDayKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    formatMonthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    /**
     * Возвращает общую статистику
     */
    getTotals(enabledCategories) {
        let income = 0;
        let expense = 0;

        for (const t of this.transactions) {
            const typeKey = t.isIncome ? 'inc' : 'exp';
            const key = `${t.category}|${t.description}|${typeKey}`;

            if (!enabledCategories.has(key)) continue;

            if (t.isIncome) {
                income += t.amount;
            } else {
                expense += Math.abs(t.amount);
            }
        }

        return { income, expense, balance: income - expense };
    }

    getCategoriesByGroup() {
        const groups = new Map();

        for (const t of this.transactions) {
            const typeKey = t.isIncome ? 'inc' : 'exp';
            const key = `${t.category}|${typeKey}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    name: key,
                    displayName: t.category,
                    category: t.category,
                    isIncome: t.isIncome,
                    total: 0,
                    count: 0
                });
            }

            const group = groups.get(key);
            group.total += Math.abs(t.amount);
            group.count++;
        }

        return Array.from(groups.values()).sort((a, b) => b.total - a.total);
    }
}