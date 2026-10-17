import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GalleryService, Photo } from '../../services/gallery.service';
import { ImageCarousel } from '../../components/image-carousel/image-carousel';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule, ImageCarousel],
  templateUrl: './gallery.html',
  styleUrls: ['./gallery.css']
})
export class GalleryComponent implements OnInit {
  private galleryService = inject(GalleryService);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);

  photos: Photo[] = [];
  photoUrls: string[] = [];
  userEmail = '';
  targetEmail = '';
  selectedFiles: File[] = [];
  errorMessage = '';
  isLoading = false;
  isUploading = false;
  currentImageIndex: number = 0;

  ngOnInit(): void {
    const currentEmail = this.auth.usuarioLogueado();
    if (!currentEmail) {
      this.errorMessage = 'Inicia sesión para ver tu galería.';
      return;
    }

    const requestedEmail = this.route.snapshot.queryParamMap.get('email');
    this.userEmail = this.auth.esAdmin() && requestedEmail
      ? requestedEmail.trim().toLowerCase()
      : currentEmail;
    this.targetEmail = this.userEmail;
    this.loadGallery(this.userEmail);
  }

  loadGallery(email: string): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.galleryService.getPhotosByEmail(email).subscribe({
      next: (data) => {
        this.photos = data;
        this.photoUrls = this.photos.map(p => p.baseUrl);
        this.currentImageIndex = 0;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('❌ Error al cargar la galería:', err);
        this.isLoading = false;
        this.photos = [];
        this.photoUrls = [];
        this.errorMessage = err.status === 404
          ? 'Esta galería todavía no tiene un álbum de fotos.'
          : err.error?.error || 'No se pudo cargar la galería. Intenta nuevamente.';
      }
    });
  }

  setTargetEmail(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.targetEmail = input.value.trim().toLowerCase();
    }
  }

  openTargetGallery(): void {
    const email = this.targetEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      this.errorMessage = 'Ingresa un correo válido para abrir la galería.';
      return;
    }
    this.userEmail = email;
    this.loadGallery(email);
  }

  setSelectedFiles(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      const files = Array.from(input.files || []);
      if (files.length > 5) {
        this.selectedFiles = [];
        this.errorMessage = 'Puedes seleccionar hasta 5 fotos por vez.';
      } else if (files.some(file => file.size > 25 * 1024 * 1024)) {
        this.selectedFiles = [];
        this.errorMessage = 'Cada foto debe pesar como máximo 25 MB.';
      } else if (files.some(file => !file.type.startsWith('image/'))) {
        this.selectedFiles = [];
        this.errorMessage = 'Solo puedes seleccionar archivos de imagen.';
      } else {
        this.selectedFiles = files;
        this.errorMessage = '';
      }
    }
  }

  uploadPhotos(): void {
    if (!this.auth.esAdmin() || !this.userEmail || this.selectedFiles.length === 0 || this.isUploading) {
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';
    const targetEmail = this.userEmail;
    this.galleryService.uploadPhotos(targetEmail, this.selectedFiles).subscribe({
      next: () => {
        this.selectedFiles = [];
        this.isUploading = false;
        this.loadGallery(targetEmail);
      },
      error: (err) => {
        console.error('❌ Error al subir fotos:', err);
        this.isUploading = false;
        this.errorMessage = err.error?.error || 'No se pudieron subir las fotos. Intenta nuevamente.';
      }
    });
  }

  deletePhoto(): void {
    if (!this.auth.esAdmin() || this.photos.length === 0 || this.currentImageIndex < 0 || !this.userEmail) {
      return;
    }

    const photoToDelete = this.photos[this.currentImageIndex];

    if (!confirm(`¿Estás seguro de que deseas eliminar esta foto?`)) {
      return;
    }

    const targetEmail = this.userEmail;
    this.galleryService.deletePhoto(photoToDelete.id, targetEmail).subscribe({
      next: () => {
        this.loadGallery(targetEmail);
      },
      error: (err) => {
        console.error('❌ Error al eliminar la foto:', err);
        this.errorMessage = err.error?.error || 'No se pudo eliminar la foto. Intenta nuevamente.';
      }
    });
  }

  selectImage(index: number): void {
    this.currentImageIndex = index;
  }

  onImageChanged(index: number): void {
    this.currentImageIndex = index;
  }
}
