import { TBankCSVParser } from './TBankCSVParser.js';
import { RaifCSVParser } from './RaifCSVParser.js';
import { SberbankPDFParser } from './SberbankPDFParser.js';
import { DataManager } from './DataManager.js';
import { CategoryManager } from './CategoryManager.js';
import { ChartRenderer } from './ChartRenderer.js';
import { DragScroller } from './DragScroller.js';

/**
 * Главный класс приложения
 */
class App {
    constructor() {
        // DOM элементы
        this.dropzone = document.getElementById('dropzone');
        this.fileInput = document.getElementById('fileInput');
        this.main = document.getElementById('main');
        this.chartContainer = document.getElementById('chart');
        this.chartScroll = document.getElementById('chartScroll');
        this.chartAxisY = document.getElementById('chartAxisY');
        this.incomeCategories = document.getElementById('incomeCategories');
        this.expenseCategories = document.getElementById('expenseCategories');
        this.totalIncome = document.getElementById('totalIncome');
        this.totalExpense = document.getElementById('totalExpense');
        this.totalBalance = document.getElementById('totalBalance');
        this.groupToggle = document.querySelector('.group-toggle');
        this.searchInput = document.getElementById('searchInput');
        this.incomeBreakdown = document.getElementById('incomeBreakdown');
        this.expenseBreakdown = document.getElementById('expenseBreakdown');
        this.incomeBreakdownTotal = document.getElementById('incomeBreakdownTotal');
        this.expenseBreakdownTotal = document.getElementById('expenseBreakdownTotal');
        this.similarityRange = document.getElementById('similarityRange');
        this.similarityValue = document.getElementById('similarityValue');
        this.similarExpensesList = document.getElementById('similarExpensesList');

        // Инициализация модулей
        this.tbankParser = new TBankCSVParser();
        this.raifParser = new RaifCSVParser();
        this.pdfParser = new SberbankPDFParser();
        this.dataManager = new DataManager();
        this.categoryManager = new CategoryManager();
        this.chartRenderer = new ChartRenderer(
            this.chartContainer,
            this.chartScroll,
            this.chartAxisY
        );
        this.dragScroller = new DragScroller(this.chartScroll);

        // Состояние
        this.currentMode = 'day';
        this.searchTerm = '';
        this.selectedMonth = null;
        this.similarityThreshold = 0.7;

        // Привязка событий
        this.bindEvents();

        // Callback для клика по месяцу
        this.chartRenderer.onMonthClick = (date) => this.onMonthClick(date);
    }

    bindEvents() {
        // Dropzone
        this.dropzone.addEventListener('click', () => this.fileInput.click());
        this.dropzone.addEventListener('dragover', (e) => this.onDragOver(e));
        this.dropzone.addEventListener('dragleave', (e) => this.onDragLeave(e));
        this.dropzone.addEventListener('drop', (e) => this.onDrop(e));
        this.fileInput.addEventListener('change', (e) => this.onFileSelect(e));

        // Group toggle
        this.groupToggle.addEventListener('click', (e) => {
            if (e.target.classList.contains('toggle-btn')) {
                this.setMode(e.target.dataset.mode);
            }
        });

        // Category change callback
        this.categoryManager.onChange = () => this.updateChart();

        // Search input
        this.searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase().trim();
            this.renderCategories();
            this.updateChart();
            this.updateSummary();
            this.renderCategoryBreakdown();
            this.renderSimilarExpenses();
        });

        this.similarityRange.addEventListener('input', (e) => {
            this.similarityThreshold = e.target.value / 100;
            this.similarityValue.textContent = `${e.target.value}%`;
            this.renderSimilarExpenses();
        });
    }

    onDragOver(e) {
        e.preventDefault();
        this.dropzone.classList.add('dragover');
    }

    onDragLeave(e) {
        e.preventDefault();
        this.dropzone.classList.remove('dragover');
    }

    onDrop(e) {
        e.preventDefault();
        this.dropzone.classList.remove('dragover');

        const files = Array.from(e.dataTransfer.files).filter(
            file => file.name.endsWith('.csv') || file.name.endsWith('.pdf')
        );
        if (files.length > 0) {
            this.loadFiles(files);
        }
    }

    onFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.loadFiles(files);
        }
    }

    async loadFiles(files) {
        try {
            let allTransactions = [];

            for (const file of files) {
                let parser;
                
                if (file.name.endsWith('.pdf')) {
                    parser = this.pdfParser;
                } else {
                    parser = await this.detectCSVParser(file);
                }
                
                const transactions = await parser.parse(file);
                allTransactions = allTransactions.concat(transactions);
            }

            this.dataManager.loadTransactions(allTransactions);

            const categories = this.dataManager.getCategories();
            this.categoryManager.init(categories);

            this.dropzone.hidden = true;
            this.main.hidden = false;

            this.renderCategories();
            this.updateChart();
            this.updateSummary();
            this.renderCategoryBreakdown();
            this.renderSimilarExpenses();

            requestAnimationFrame(() => {
                this.dragScroller.scrollToEnd();
            });

        } catch (error) {
            console.error('Ошибка загрузки файлов:', error);
            alert('Не удалось загрузить файлы. Проверьте формат.');
        }
    }

    async detectCSVParser(file) {
        const buffer = await file.arrayBuffer();
        
        let text;
        try {
            const decoder1251 = new TextDecoder('windows-1251');
            text = decoder1251.decode(buffer);
        } catch {
            const decoderUtf8 = new TextDecoder('utf-8');
            text = decoderUtf8.decode(buffer);
        }
        
        const firstLine = text.split('\n')[0];
        
        if (firstLine.includes('Дата ввода')) {
            return this.raifParser;
        }
        
        return this.tbankParser;
    }

    setMode(mode) {
        this.currentMode = mode;

        // Обновляем кнопки
        this.groupToggle.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        if (mode === 'month') {
            this.selectedMonth = null;
        }

        this.updateChart();
    }

    onMonthClick(date) {
        this.selectedMonth = date;
        this.setMode('day');
    }

    renderCategories() {
        const categories = this.dataManager.getCategories();

        const incomeList = categories.filter(c => c.isIncome && this.matchesSearch(c));
        const expenseList = categories.filter(c => !c.isIncome && this.matchesSearch(c));

        this.incomeCategories.innerHTML = incomeList.map(cat =>
            this.createCategoryChip(cat, true)
        ).join('');

        this.expenseCategories.innerHTML = expenseList.map(cat =>
            this.createCategoryChip(cat, false)
        ).join('');

        // Вешаем обработчики
        this.incomeCategories.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.categoryManager.toggle(chip.dataset.category);
                chip.classList.toggle('disabled');
                this.updateSummary();
                this.renderCategoryBreakdown();
                this.renderSimilarExpenses();
            });
        });

        this.expenseCategories.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.categoryManager.toggle(chip.dataset.category);
                chip.classList.toggle('disabled');
                this.updateSummary();
                this.renderCategoryBreakdown();
                this.renderSimilarExpenses();
            });
        });
    }

    matchesSearch(category) {
        if (!this.searchTerm) return true;
        const name = (category.displayName || category.name || '').toLowerCase();
        const description = (category.description || '').toLowerCase();
        return name.includes(this.searchTerm) || description.includes(this.searchTerm);
    }

    createCategoryChip(category, isIncome) {
        const enabled = this.categoryManager.isEnabled(category.name);
        return `
            <div class="category-chip ${isIncome ? 'income' : 'expense'} ${enabled ? '' : 'disabled'}" 
                 data-category="${this.escapeHtml(category.name)}">
                <span class="category-name">${this.escapeHtml(category.displayName)}</span>
                <span class="category-amount">${this.formatMoney(category.total)}</span>
                <div class="category-tooltip">${this.escapeHtml(category.description || category.displayName)}</div>
            </div>
        `;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    getFilteredCategories() {
        const enabled = this.categoryManager.getEnabled();
        if (!this.searchTerm) return enabled;

        const allCategories = this.dataManager.getCategories();
        const filtered = new Set();

        for (const cat of allCategories) {
            if (enabled.has(cat.name) && this.matchesSearch(cat)) {
                filtered.add(cat.name);
            }
        }

        return filtered;
    }

    updateChart() {
        const filteredCategories = this.getFilteredCategories();

        let data;
        if (this.currentMode === 'day') {
            data = this.dataManager.groupByDays(filteredCategories);
        } else {
            data = this.dataManager.groupByMonths(filteredCategories);
        }

        this.chartRenderer.render(data, this.currentMode);

        if (this.currentMode === 'day' && this.selectedMonth) {
            requestAnimationFrame(() => {
                this.scrollToMonth(this.selectedMonth);
            });
        }
    }

    scrollToMonth(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
            'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const targetLabel = `${monthNames[month]}`;

        const labels = this.chartContainer.querySelectorAll('.bar-label');
        for (const label of labels) {
            if (label.textContent.includes(targetLabel)) {
                const wrapper = label.closest('.bar-wrapper');
                if (wrapper) {
                    wrapper.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                    break;
                }
            }
        }
    }

    updateSummary() {
        const totals = this.dataManager.getTotals(this.getFilteredCategories());

        this.totalIncome.textContent = this.formatMoney(totals.income);
        this.totalExpense.textContent = this.formatMoney(totals.expense);
        this.totalBalance.textContent = this.formatMoney(totals.balance);
    }

    renderCategoryBreakdown() {
        const enabled = this.categoryManager.getEnabled();
        
        const categoryTotals = new Map();
        
        for (const t of this.dataManager.transactions) {
            const typeKey = t.isIncome ? 'inc' : 'exp';
            const catKey = `${t.category}|${t.description}|${typeKey}`;
            
            if (!enabled.has(catKey)) continue;
            
            if (this.searchTerm) {
                const desc = (t.description || '').toLowerCase();
                const cat = (t.category || '').toLowerCase();
                const fullDisplayName = `${cat} — ${desc}`;
                if (!desc.includes(this.searchTerm) && !cat.includes(this.searchTerm) && !fullDisplayName.includes(this.searchTerm)) {
                    continue;
                }
            }
            
            const groupKey = `${t.category}|${typeKey}`;
            if (!categoryTotals.has(groupKey)) {
                categoryTotals.set(groupKey, {
                    name: groupKey,
                    displayName: t.category,
                    category: t.category,
                    isIncome: t.isIncome,
                    total: 0,
                    count: 0
                });
            }
            
            const group = categoryTotals.get(groupKey);
            group.total += Math.abs(t.amount);
            group.count++;
        }

        const categories = Array.from(categoryTotals.values());

        const incomeCategories = categories
            .filter(c => c.isIncome)
            .sort((a, b) => b.total - a.total);

        const expenseCategories = categories
            .filter(c => !c.isIncome)
            .sort((a, b) => b.total - a.total);

        this.incomeBreakdown.innerHTML = incomeCategories.map(cat => `
            <div class="breakdown-item income">
                <span class="breakdown-name">${this.escapeHtml(cat.displayName)}</span>
                <span class="breakdown-amount">${this.formatMoney(cat.total)}</span>
            </div>
        `).join('');

        this.expenseBreakdown.innerHTML = expenseCategories.map(cat => `
            <div class="breakdown-item expense">
                <span class="breakdown-name">${this.escapeHtml(cat.displayName)}</span>
                <span class="breakdown-amount">${this.formatMoney(cat.total)}</span>
            </div>
        `).join('');

        const incomeTotal = incomeCategories.reduce((sum, c) => sum + c.total, 0);
        const expenseTotal = expenseCategories.reduce((sum, c) => sum + c.total, 0);

        this.incomeBreakdownTotal.textContent = this.formatMoney(incomeTotal);
        this.expenseBreakdownTotal.textContent = this.formatMoney(expenseTotal);
    }

    formatMoney(amount) {
        const formatted = Math.abs(amount).toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        return `${amount < 0 ? '-' : ''}${formatted} ₽`;
    }

    renderSimilarExpenses() {
        const groups = this.groupExpensesBySimilarity();
        
        const sortedGroups = Object.values(groups).sort((a, b) => b.total - a.total);

        this.similarExpensesList.innerHTML = sortedGroups.map(group => `
            <div class="similar-group">
                <div class="similar-group-header">
                    <span class="similar-group-title">
                        ${this.escapeHtml(group.representative)}
                        <span class="similar-group-count">${group.items.length}</span>
                    </span>
                    <span class="similar-group-total">${this.formatMoney(group.total)}</span>
                </div>
                <div class="similar-group-items">
                    ${group.items.map(item => `
                        <div class="similar-item">
                            <span class="similar-item-name">${this.escapeHtml(item.description)}</span>
                            <span class="similar-item-count">${item.count} шт.</span>
                            <span class="similar-item-amount">${this.formatMoney(item.total)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    groupExpensesBySimilarity() {
        const enabledCategories = this.getFilteredCategories();
        
        const expenseTransactions = this.dataManager.transactions.filter(t => {
            if (t.isIncome) return false;
            
            const typeKey = 'exp';
            const catKey = `${t.category}|${t.description}|${typeKey}`;
            if (!enabledCategories.has(catKey)) return false;
            
            if (this.searchTerm) {
                const desc = (t.description || '').toLowerCase();
                const cat = (t.category || '').toLowerCase();
                if (!desc.includes(this.searchTerm) && !cat.includes(this.searchTerm)) {
                    return false;
                }
            }
            
            return true;
        });
        
        const expenseMap = new Map();
        for (const t of expenseTransactions) {
            const key = t.description || t.category;
            if (!expenseMap.has(key)) {
                expenseMap.set(key, {
                    description: key,
                    category: t.category,
                    total: 0,
                    count: 0
                });
            }
            const item = expenseMap.get(key);
            item.total += Math.abs(t.amount);
            item.count++;
        }

        const expenses = Array.from(expenseMap.values());
        const groups = {};
        const assigned = new Set();

        for (const expense of expenses) {
            if (assigned.has(expense.description)) continue;

            const groupKey = expense.description;
            groups[groupKey] = {
                representative: expense.description,
                items: [expense],
                total: expense.total
            };
            assigned.add(expense.description);

            for (const other of expenses) {
                if (assigned.has(other.description)) continue;

                const similarity = this.calculateSimilarity(
                    expense.description.toLowerCase(),
                    other.description.toLowerCase()
                );

                if (similarity >= this.similarityThreshold) {
                    groups[groupKey].items.push(other);
                    groups[groupKey].total += other.total;
                    assigned.add(other.description);
                }
            }
        }

        return groups;
    }

    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1;
        if (str1.length === 0 || str2.length === 0) return 0;

        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2[i - 1] === str1[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        const distance = matrix[str2.length][str1.length];
        const maxLength = Math.max(str1.length, str2.length);
        return 1 - distance / maxLength;
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
