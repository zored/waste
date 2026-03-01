/**
 * Парсер CSV файлов банковских выписок
 */
export class TBankCSVParser {
    constructor() {
        this.delimiter = ';';
        this.dateFormat = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/;
    }

    /**
     * Парсит CSV файл
     * @param {File} file - CSV файл
     * @returns {Promise<Array>} Массив транзакций
     */
    async parse(file) {
        const text = await file.text();
        const lines = this.splitLines(text);

        if (lines.length < 2) {
            throw new Error('Файл пуст или имеет неверный формат');
        }

        const headers = this.parseLine(lines[0]);
        const transactions = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = this.parseLine(line);
            const transaction = this.mapTransaction(headers, values);

            if (transaction && transaction.status === 'OK') {
                transactions.push(transaction);
            }
        }

        return transactions;
    }

    /**
     * Разбивает текст на строки, корректно обрабатывая кавычки
     */
    splitLines(text) {
        const lines = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (current.trim()) {
                    lines.push(current.trim());
                }
                current = '';
                if (char === '\r' && text[i + 1] === '\n') i++;
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            lines.push(current.trim());
        }

        return lines;
    }

    /**
     * Парсит одну строку CSV
     */
    parseLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === this.delimiter && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        values.push(current.trim());
        return values;
    }

    /**
     * Преобразует строку CSV в объект транзакции
     */
    mapTransaction(headers, values) {
        const get = (name) => {
            const index = headers.findIndex(h => h === name);
            return index >= 0 ? values[index] || '' : '';
        };

        const operationDate = this.parseDate(get('Дата операции'));

        // 1. Берем сумму платежа и бонусы
        const paymentAmount = this.parseAmount(get('Сумма платежа'));
        const bonuses = this.parseAmount(get('Бонусы (включая кэшбэк)'));

        // 2. Считаем реальную сумму (Net Cost)
        // Пример: -1793.93 (трата) + 17.00 (бонус) = -1776.93
        const calculatedAmount = paymentAmount + bonuses;

        if (!operationDate || isNaN(calculatedAmount)) return null;

        return {
            operationDate,
            paymentDate: this.parseDate(get('Дата платежа')),
            cardNumber: get('Номер карты'),
            status: get('Статус'),

            // 3. В поле amount записываем уже рассчитанную сумму,
            // чтобы графики и статистика строились по ней
            amount: calculatedAmount,

            currency: get('Валюта операции'),
            paymentAmount: paymentAmount, // Сохраняем исходные данные на всякий случай
            paymentCurrency: get('Валюта платежа'),
            cashback: this.parseAmount(get('Кэшбэк')),
            category: get('Категория') || 'Без категории',
            mcc: get('MCC'),
            description: get('Описание'),
            bonuses: bonuses,
            rounding: this.parseAmount(get('Округление на инвесткопилку')),
            amountWithRounding: this.parseAmount(get('Сумма операции с округлением')),

            // 4. Доход определяем по знаку итоговой суммы
            // > 0 — Доход (или возврат превышающий трату)
            // < 0 — Расход
            isIncome: calculatedAmount > 0
        };
    }

    /**
     * Парсит дату из формата DD.MM.YYYY HH:MM:SS
     */
    parseDate(str) {
        if (!str) return null;

        const match = str.match(this.dateFormat);
        if (!match) return null;

        const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;

        return new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        );
    }

    /**
     * Парсит число из формата "1234,56" или "-1234,56"
     */
    parseAmount(str) {
        if (!str) return 0;
        const normalized = str.replace(',', '.').replace(/\s/g, '');
        const num = parseFloat(normalized);
        return isNaN(num) ? 0 : num;
    }
}
