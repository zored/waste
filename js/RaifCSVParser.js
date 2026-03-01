/**
 * Парсер CSV файлов банковских выписок Райффайзенбанка
 */
export class RaifCSVParser {
    constructor() {
        this.delimiter = ';';
        this.dateFormat = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/;
    }

    /**
     * Парсит CSV файл
     * @param {File} file - CSV файл
     * @returns {Promise<Array>} Массив транзакций
     */
    async parse(file) {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder('windows-1251');
        const text = decoder.decode(buffer);
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

            if (transaction && transaction.status === 'Исполнена') {
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

        const operationDate = this.parseDate(get('Дата ввода'));
        const amount = this.parseAmount(get('Сумма'));

        if (!operationDate || isNaN(amount)) return null;

        const operationType = get('Тип операции');
        const description = get('Операция');
        const isIncome = this.detectIncome(operationType, description, amount);

        return {
            operationDate,
            status: get('Статус'),
            amount: isIncome ? Math.abs(amount) : -Math.abs(amount),
            currency: get('Валюта'),
            category: this.detectCategory(operationType, description),
            description: description,
            operationType: operationType,
            changeDate: this.parseDate(get('Дата изменения')),
            isIncome: isIncome
        };
    }

    /**
     * Определяет, является ли операция доходом
     */
    detectIncome(operationType, description, amount) {
        if (amount > 0) {
            const incomeKeywords = [
                'перевод между счетами',
                'возврат',
                'кэшбэк',
                'проценты',
                'зачисление'
            ];
            const lowerDesc = description.toLowerCase();
            const lowerType = operationType.toLowerCase();
            
            for (const keyword of incomeKeywords) {
                if (lowerDesc.includes(keyword) || lowerType.includes(keyword)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Определяет категорию на основе типа операции
     */
    detectCategory(operationType, description) {
        const lowerType = operationType.toLowerCase();
        const lowerDesc = description.toLowerCase();

        if (lowerType.includes('сбп') || lowerDesc.includes('сбп')) {
            return 'Переводы СБП';
        }
        if (lowerType.includes('перевод между счетами')) {
            return 'Переводы между счетами';
        }
        if (lowerType.includes('оплата')) {
            return 'Оплата';
        }

        return 'Другое';
    }

    /**
     * Парсит дату из формата DD.MM.YYYY HH:MM
     */
    parseDate(str) {
        if (!str) return null;

        const match = str.match(this.dateFormat);
        if (!match) return null;

        const [, day, month, year, hour = '0', minute = '0'] = match;

        return new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
        );
    }

    /**
     * Парсит число из формата "1234.56"
     */
    parseAmount(str) {
        if (!str) return 0;
        const normalized = str.replace(',', '.').replace(/\s/g, '');
        const num = parseFloat(normalized);
        return isNaN(num) ? 0 : num;
    }
}
