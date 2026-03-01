/**
 * Парсер PDF файлов банковских выписок Сбербанк
 * Использует pdf.js для извлечения текста, затем восстанавливает транзакции
 * по паттернам даты и суммы.
 */

const PDFJS_URL = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const AMOUNT_RE = /^[+-]?[\d\u00a0 ]+,\d{2}$/;
const CURRENCY_RE = /^[₽$€]$|^(?:RUB|USD|EUR)$/;
const SKIP_RE = /остаток|баланс|итого|период|выписка|счёт|дата|операц|категори/i;

export class SberbankPDFParser {
    async parse(file) {
        const pdfjsLib = await import(PDFJS_URL);
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const lines = await this._extractLines(pdf);
        return this._parseTransactions(lines);
    }

    /**
     * Извлекает строки из всех страниц PDF, группируя элементы по Y-координате.
     */
    async _extractLines(pdf) {
        const allItems = [];

        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();

            for (const item of content.items) {
                const text = item.str.trim();
                if (text) {
                    allItems.push({
                        text,
                        x: item.transform[4],
                        y: Math.round(item.transform[5]),
                        page: p,
                    });
                }
            }
        }

        // Сортируем: страница по возрастанию, Y по убыванию (сверху вниз), X по возрастанию
        allItems.sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page;
            if (a.y !== b.y) return b.y - a.y;
            return a.x - b.x;
        });

        // Группируем в строки с допуском ±3px по Y
        const lines = [];
        for (const item of allItems) {
            const last = lines[lines.length - 1];
            if (last && last.page === item.page && Math.abs(last.y - item.y) <= 3) {
                last.tokens.push(item.text);
            } else {
                lines.push({ page: item.page, y: item.y, tokens: [item.text] });
            }
        }

        return lines;
    }

    /**
     * Разбивает строки на блоки транзакций (новый блок начинается при появлении даты),
     * затем парсит каждый блок.
     */
    _parseTransactions(lines) {
        const blocks = [];
        let current = null;

        for (const line of lines) {
            if (line.tokens.some(t => DATE_RE.test(t))) {
                if (current) blocks.push(current);
                current = { tokens: [], lines: [] };
            }
            if (current) {
                current.tokens.push(...line.tokens);
                current.lines.push(line);
            }
        }
        if (current) blocks.push(current);

        const transactions = [];

        for (const block of blocks) {
            const tx = this._parseBlock(block.tokens, block.lines);
            if (tx) transactions.push(tx);
        }

        return transactions;
    }

    _parseBlock(tokens, lines = []) {
        const dateStr = tokens.find(t => DATE_RE.test(t));
        if (!dateStr) return null;

        const [, dd, mm, yyyy] = dateStr.match(DATE_RE);
        const date = new Date(+yyyy, +mm - 1, +dd);

        const amountIndices = [];
        for (let i = 0; i < tokens.length; i++) {
            const n = tokens[i].replace(/\u00a0/g, ' ').trim();
            const nNoRub = n.replace(/\s*₽\s*$/, '').trim();
            if (AMOUNT_RE.test(nNoRub)) {
                amountIndices.push(i);
            }
        }

        if (amountIndices.length === 0) return null;

        const deltaIdx = amountIndices.length >= 2 ? amountIndices[amountIndices.length - 2] : amountIndices[0];
        let deltaStr = tokens[deltaIdx].replace(/\u00a0/g, ' ').trim();
        deltaStr = deltaStr.replace(/\s*₽\s*$/, '').trim();

        const isIncome = deltaStr.startsWith('+');
        const rawAmount = this._parseAmount(deltaStr);
        if (rawAmount === 0) return null;

        const amount = isIncome ? rawAmount : -rawAmount;

        const metaTokens = tokens.filter((t, idx) => {
            const n = t.replace(/\u00a0/g, ' ').trim();
            const nNoRub = n.replace(/\s*₽\s*$/, '').trim();
            return !DATE_RE.test(n)
                && !TIME_RE.test(n)
                && !CURRENCY_RE.test(n)
                && !AMOUNT_RE.test(nNoRub);
        });

        const fullText = metaTokens.join(' ').trim();
        if (SKIP_RE.test(fullText)) return null;

        let category = 'Без категории';
        if (metaTokens.length >= 2) {
            category = metaTokens[metaTokens.length - 1];
        }

        let description = '';
        let cardNumber = '';

        for (const line of lines) {
            const lineText = line.tokens.join(' ');
            const cardMatch = lineText.match(/\*{4}(\d{4})/);
            if (cardMatch) {
                cardNumber = '****' + cardMatch[1];
            }

            if (lineText.includes('Операция по')) {
                const opIdx = lineText.indexOf('. Операция по');
                if (opIdx > 0) {
                    description = lineText.substring(0, opIdx + 1);
                } else {
                    const parts = lineText.split(' Операция по');
                    description = parts[0].trim();
                }
            }
        }

        if (!description) {
            description = metaTokens.slice(0, -1).join(' ') || fullText;
        }

        return {
            operationDate: date,
            paymentDate: date,
            amount,
            isIncome: amount > 0,
            category: category || 'Без категории',
            description: description || fullText,
            status: 'OK',
            cardNumber,
            currency: 'RUB',
            paymentAmount: Math.abs(amount),
            paymentCurrency: 'RUB',
            cashback: 0,
            bonuses: 0,
            mcc: '',
            rounding: 0,
            amountWithRounding: Math.abs(amount),
        };
    }

    _parseAmount(str) {
        return parseFloat(str.replace(/[\u00a0 ]/g, '').replace(',', '.'));
    }
}
