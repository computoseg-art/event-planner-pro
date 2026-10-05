import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-carousel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-carousel.html',
  styleUrls: ['./image-carousel.css']
})
export class ImageCarousel {
  @Input() images: string[] = [];
  @Input() initialIndex: number = 0;
  @Output() imageChanged = new EventEmitter<number>();
  @Output() deletePhotoRequest = new EventEmitter<void>();

  get currentIndex(): number {
    return this.initialIndex;
  }

  nextImage(): void {
    if (this.images.length === 0) return;
    const next = (this.initialIndex + 1) % this.images.length;
    this.imageChanged.emit(next);
  }

  prevImage(): void {
    if (this.images.length === 0) return;
    const prev = (this.initialIndex - 1 + this.images.length) % this.images.length;
    this.imageChanged.emit(prev);
  }

  onDelete(): void {
    this.deletePhotoRequest.emit();
  }
}
