/**
 * Drag-to-scroll функционал для графика
 */
export class DragScroller {
    constructor(element) {
        this.element = element;
        this.isDragging = false;
        this.startX = 0;
        this.scrollLeft = 0;

        this.bindEvents();
    }

    bindEvents() {
        this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.element.addEventListener('mouseleave', this.onMouseUp.bind(this));
        this.element.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.element.addEventListener('mousemove', this.onMouseMove.bind(this));

        // Touch events
        this.element.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
        this.element.addEventListener('touchend', this.onTouchEnd.bind(this));
        this.element.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: true });
    }

    onMouseDown(e) {
        this.isDragging = true;
        this.element.classList.add('dragging');
        this.startX = e.pageX - this.element.offsetLeft;
        this.scrollLeft = this.element.scrollLeft;
    }

    onMouseUp() {
        this.isDragging = false;
        this.element.classList.remove('dragging');
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const x = e.pageX - this.element.offsetLeft;
        const walk = (x - this.startX) * 1.5;
        this.element.scrollLeft = this.scrollLeft - walk;
    }

    onTouchStart(e) {
        this.startX = e.touches[0].pageX - this.element.offsetLeft;
        this.scrollLeft = this.element.scrollLeft;
    }

    onTouchEnd() {
        this.isDragging = false;
        this.element.classList.remove('dragging');
    }

    onTouchMove(e) {
        const x = e.touches[0].pageX - this.element.offsetLeft;
        const walk = (x - this.startX) * 1.5;
        this.element.scrollLeft = this.scrollLeft - walk;
    }

    /**
     * Прокручивает к началу
     */
    scrollToStart() {
        this.element.scrollLeft = 0;
    }

    /**
     * Прокручивает так, чтобы последний столбик был виден на правом краю
     */
    scrollToEnd() {
        // scrollWidth - полная ширина контента внутри
        // clientWidth - видимая ширина
        // Максимальный скролл = scrollWidth - clientWidth
        const maxScroll = this.element.scrollWidth - this.element.clientWidth;
        this.element.scrollLeft = Math.max(0, maxScroll);
    }
}