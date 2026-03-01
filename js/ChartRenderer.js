/**
 * Рендеринг графика-гистограммы
 */
export class ChartRenderer {
    constructor(container, scrollContainer, axisYContainer) {
        this.container = container;
        this.scrollContainer = scrollContainer;
        this.axisYContainer = axisYContainer;
        this.tooltip = this.createTooltip();
        this.data = [];
        this.maxValue = 0;
        this.BAR_GROUP_HEIGHT = 320;
        this.onMonthClick = null;
    }

    /**
     * Создаёт элемент подсказки
     */
    createTooltip() {
        const el = document.createElement('div');
        el.className = 'tooltip';
        document.body.appendChild(el);
        return el;
    }

    /**
     * Рендерит график на основе данных
     */
    render(data, mode) {
        this.data = data;
        this.mode = mode;

        if (data.length === 0) {
            this.renderEmpty();
            return;
        }

        // Находим максимальное значение для масштабирования
        this.maxValue = Math.max(
            ...data.map(d => Math.max(d.income, d.expense))
        );

        // Добавляем небольшой запас сверху
        this.maxValue = Math.ceil(this.maxValue * 1.1);

        this.renderBars(data, mode);
        this.renderAxisY();
    }

    /**
     * Рендерит пустое состояние
     */
    renderEmpty() {
        this.container.innerHTML = `
            <div class="empty-state">
                Нет данных для отображения
            </div>
        `;
        this.axisYContainer.innerHTML = '';
    }

    /**
     * Рендерит столбики
     */
    renderBars(data, mode) {
        this.container.innerHTML = '';
        // Сбрасываем жесткую ширину, пусть браузер сам считает ширину на основе контента (flexbox)
        this.container.style.width = '';

        const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
            'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

        let lastYear = null;
        let lastMonth = null;

        data.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'bar-wrapper';

            // Группа столбиков с фиксированной высотой
            const barGroup = document.createElement('div');
            barGroup.className = 'bar-group';

            // Добавляем столбик доходов только если есть доход
            if (item.income > 0) {
                const incomeBar = document.createElement('div');
                incomeBar.className = 'bar income';
                incomeBar.style.height = `${this.scaleValue(item.income)}px`;
                barGroup.appendChild(incomeBar);
            }

            // Добавляем столбик расходов только если есть расход
            if (item.expense > 0) {
                const expenseBar = document.createElement('div');
                expenseBar.className = 'bar expense';
                expenseBar.style.height = `${this.scaleValue(item.expense)}px`;
                barGroup.appendChild(expenseBar);
            }

            wrapper.appendChild(barGroup);

            // Подпись - формируем текст
            const label = document.createElement('div');
            label.className = 'bar-label';

            if (mode === 'day') {
                // Для дневного режима
                const day = item.date.getDate();
                const month = item.date.getMonth();
                const year = item.date.getFullYear();

                // Показываем месяц только при смене
                if (lastMonth !== month) {
                    label.textContent = `${day} ${monthNames[month]}`;
                    lastMonth = month;
                } else {
                    label.textContent = day;
                }

                // Год показываем при смене года
                if (lastYear !== year) {
                    const yearLabel = document.createElement('div');
                    yearLabel.className = 'bar-label-month';
                    yearLabel.textContent = year;
                    label.appendChild(yearLabel);
                    lastYear = year;
                }
            } else {
                // Для месячного режима
                const month = item.date.getMonth();
                const year = item.date.getFullYear();

                label.textContent = monthNames[month];

                // Год показываем для января или при смене года
                if (month === 0 || lastYear !== year) {
                    const yearLabel = document.createElement('div');
                    yearLabel.className = 'bar-label-month';
                    yearLabel.textContent = year;
                    label.appendChild(yearLabel);
                    lastYear = year;
                }
            }

            wrapper.appendChild(label);
            this.container.appendChild(wrapper);

            // Обработчики для tooltip
            wrapper.addEventListener('mouseenter', (e) => this.showTooltip(e, item));
            wrapper.addEventListener('mousemove', (e) => this.moveTooltip(e));
            wrapper.addEventListener('mouseleave', () => this.hideTooltip());

            // Обработчик клика для месячного режима
            if (mode === 'month' && this.onMonthClick) {
                wrapper.style.cursor = 'pointer';
                wrapper.addEventListener('click', () => this.onMonthClick(item.date));
            }
        });

        // Мы убрали ручной расчет ширины (contentWidth), так как CSS flex-shrink: 0
        // на дочерних элементах сам растянет контейнер ровно на столько, сколько нужно.
    }

    /**
     * Масштабирует значение в пиксели
     */
    scaleValue(value) {
        if (this.maxValue === 0 || value === 0) return 0;
        return Math.max(2, (value / this.maxValue) * this.BAR_GROUP_HEIGHT);
    }

    /**
     * Рендерит ось Y
     */
    renderAxisY() {
        if (this.maxValue === 0) {
            this.axisYContainer.innerHTML = '';
            return;
        }

        this.axisYContainer.innerHTML = '';

        const steps = 5;
        const stepValue = this.maxValue / steps;

        for (let i = steps; i >= 0; i--) {
            const label = document.createElement('span');
            label.className = 'axis-label';
            label.textContent = this.formatNumber(stepValue * i);
            this.axisYContainer.appendChild(label);
        }
    }

    /**
     * Форматирует число для оси
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return `${(num / 1000000).toFixed(1)}M`;
        }
        if (num >= 1000) {
            return `${(num / 1000).toFixed(0)}k`;
        }
        return Math.round(num).toString();
    }

    /**
     * Собирает статистику по категориям для текущего набора транзакций
     */
    getBreakdown(transactions) {
        const incomeMap = new Map();
        const expenseMap = new Map();

        transactions.forEach(t => {
            const key = `${t.category} — ${t.description}`;
            const targetMap = t.isIncome ? incomeMap : expenseMap;

            if (!targetMap.has(key)) {
                targetMap.set(key, 0);
            }
            targetMap.set(key, targetMap.get(key) + Math.abs(t.amount));
        });

        // Превращаем в массив и сортируем по убыванию суммы
        const sortFn = (a, b) => b[1] - a[1];

        return {
            income: Array.from(incomeMap.entries()).sort(sortFn),
            expense: Array.from(expenseMap.entries()).sort(sortFn)
        };
    }

    /**
     * Показывает подсказку
     */
    showTooltip(e, item) {
        const dateStr = this.mode === 'day'
            ? this.formatDate(item.date)
            : this.formatMonth(item.date);

        // Получаем разбивку по категориям
        const breakdown = this.getBreakdown(item.transactions);

        // Генерируем HTML для списков
        const renderList = (list, type) => {
            if (list.length === 0) return '';
            return `
                <div class="tooltip-list ${type}">
                    ${list.map(([name, amount]) => `
                        <div class="tooltip-item">
                            <span class="tooltip-item-name">${name}</span>
                            <span class="tooltip-item-amount">${this.formatMoney(amount)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        };

        this.tooltip.innerHTML = `
            <div class="tooltip-header">
                <div class="tooltip-date">${dateStr}</div>
            </div>
            
            ${item.income > 0 ? `
                <div class="tooltip-section">
                    <div class="tooltip-row income main-row">
                        <span>Доход</span>
                        <span>${this.formatMoney(item.income)}</span>
                    </div>
                    ${renderList(breakdown.income, 'income')}
                </div>
            ` : ''}

            ${item.expense > 0 ? `
                <div class="tooltip-section">
                    <div class="tooltip-row expense main-row">
                        <span>Расход</span>
                        <span>${this.formatMoney(item.expense)}</span>
                    </div>
                    ${renderList(breakdown.expense, 'expense')}
                </div>
            ` : ''}
        `;

        this.tooltip.classList.add('visible');
        this.moveTooltip(e);
    }

    /**
     * Перемещает подсказку
     */
    moveTooltip(e) {
        const x = e.clientX + 15;
        const y = e.clientY + 15;

        // Не выходить за границы экрана
        const rect = this.tooltip.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 20;
        const maxY = window.innerHeight - rect.height - 20;

        this.tooltip.style.left = `${Math.min(x, maxX)}px`;
        this.tooltip.style.top = `${Math.min(y, maxY)}px`;
    }

    /**
     * Скрывает подсказку
     */
    hideTooltip() {
        this.tooltip.classList.remove('visible');
    }

    /**
     * Форматирует дату
     */
    formatDate(date) {
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн',
            'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    /**
     * Форматирует месяц
     */
    formatMonth(date) {
        const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    /**
     * Форматирует деньги
     */
    formatMoney(amount) {
        return `${amount.toLocaleString('ru-RU')} ₽`;
    }
}