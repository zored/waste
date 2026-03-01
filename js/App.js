import { TBankCSVParser } from './TBankCSVParser.js';
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

        // Инициализация модулей
        this.parser = new TBankCSVParser();
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

        // Привязка событий
        this.bindEvents();
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

        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.name.endsWith('.pdf'))) {
            this.loadFile(file);
        }
    }

    onFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadFile(file);
        }
    }

    async loadFile(file) {
        try {
            const parser = file.name.endsWith('.pdf') ? this.pdfParser : this.parser;
            const transactions = await parser.parse(file);

            this.dataManager.loadTransactions(transactions);

            const categories = this.dataManager.getCategories();
            this.categoryManager.init(categories);

            // Показываем основной интерфейс
            this.dropzone.hidden = true;
            this.main.hidden = false;

            // Рендерим
            this.renderCategories();
            this.updateChart();
            this.updateSummary();

            // Прокручиваем к концу после рендера
            requestAnimationFrame(() => {
                this.dragScroller.scrollToEnd();
            });

        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            alert('Не удалось загрузить файл. Проверьте формат.');
        }
    }

    setMode(mode) {
        this.currentMode = mode;

        // Обновляем кнопки
        this.groupToggle.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.updateChart();
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
            });
        });

        this.expenseCategories.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.categoryManager.toggle(chip.dataset.category);
                chip.classList.toggle('disabled');
                this.updateSummary();
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

    updateChart() {
        const enabledCategories = this.categoryManager.getEnabled();

        let data;
        if (this.currentMode === 'day') {
            data = this.dataManager.groupByDays(enabledCategories);
        } else {
            data = this.dataManager.groupByMonths(enabledCategories);
        }

        this.chartRenderer.render(data, this.currentMode);
    }

    updateSummary() {
        const totals = this.dataManager.getTotals(this.categoryManager.getEnabled());

        this.totalIncome.textContent = this.formatMoney(totals.income);
        this.totalExpense.textContent = this.formatMoney(totals.expense);
        this.totalBalance.textContent = this.formatMoney(totals.balance);
    }

    formatMoney(amount) {
        const formatted = Math.abs(amount).toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        return `${amount < 0 ? '-' : ''}${formatted} ₽`;
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
