import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GalleryService, Photo } from '../../services/gallery.service';
import { ImageCarousel } from '../../components/image-carousel/image-carousel';
import { firstValueFrom, take } from 'rxjs';

const maxPhotoSizeBytes = 100 * 1024 * 1024;
const allowedPhotoMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/x-icon',
]);
const allowedPhotoExtensions = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.bmp', '.tif', '.tiff',
  '.avif', '.ico', '.dng', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.raf',
]);

function isSupportedPhoto(file: File): boolean {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return allowedPhotoMimeTypes.has(file.type) || allowedPhotoExtensions.has(extension);
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule, ImageCarousel],
  templateUrl: './gallery.html',
  styleUrls: ['./gallery.css']
})
export class GalleryComponent implements OnInit, OnDestroy {
  private galleryService = inject(GalleryService);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);

  photos: Photo[] = [];
  photoUrls: string[] = [];
  userEmail = '';
  targetEmail = '';
  selectedAlbumId = '';
  selectedFiles: File[] = [];
  uploadProgress = '';
  errorMessage = '';
  isLoading = false;
  isUploading = false;
  isDeletingPhoto = false;
  currentImageIndex: number = 0;
  private photoRefreshTimer?: ReturnType<typeof setInterval>;
  private lastPhotoRefreshAt = 0;

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    let currentEmail: string | undefined;
    try {
      const currentUser = await firstValueFrom(this.auth.user$.pipe(take(1)));
      currentEmail = currentUser?.email?.trim().toLowerCase();
    } catch (error) {
      console.error('No se pudo comprobar la sesión para cargar la galería:', error);
      this.isLoading = false;
      this.errorMessage = 'No se pudo comprobar tu sesión. Intenta iniciar sesión nuevamente.';
      return;
    }

    if (!currentEmail) {
      this.isLoading = false;
      this.errorMessage = 'Inicia sesión para ver tu galería.';
      return;
    }

    const requestedEmail = this.route.snapshot.queryParamMap.get('email');
    const esAdmin = this.auth.esAdminGaleria();
    this.userEmail = esAdmin
      ? requestedEmail?.trim().toLowerCase() || currentEmail
      : currentEmail;
    this.targetEmail = this.userEmail;
    if (this.userEmail) {
      void this.loadPersonalGallery(this.userEmail);
    } else {
      this.isLoading = false;
    }
    this.photoRefreshTimer = setInterval(() => this.refreshExpiringPhotoUrls(), 50 * 60 * 1000);
  }

  private async loadPersonalGallery(email: string): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const folder = await firstValueFrom(this.galleryService.ensureOwnFolder(email));
      if (this.userEmail !== email) return;
      this.selectedAlbumId = folder.albumId;
      this.loadGallery(email, folder.albumId);
    } catch (error) {
      console.error('No se pudo preparar la carpeta personal de Google Photos:', error);
      if (this.userEmail === email) {
        this.isLoading = false;
        this.photos = [];
        this.photoUrls = [];
        this.errorMessage = this.galleryService.provisioningErrorMessage(error);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.photoRefreshTimer) {
      clearInterval(this.photoRefreshTimer);
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (!document.hidden) {
      this.refreshExpiringPhotoUrls();
    }
  }

  private refreshExpiringPhotoUrls(): void {
    const refreshInterval = 50 * 60 * 1000;
    if (
      this.photos.length > 0 &&
      this.userEmail &&
      this.selectedAlbumId &&
      Date.now() - this.lastPhotoRefreshAt >= refreshInterval &&
      !this.isLoading
    ) {
      this.loadGallery(this.userEmail, this.selectedAlbumId);
    }
  }

  loadGallery(email: string, albumId = this.selectedAlbumId): void {
    if (!albumId) {
      this.photos = [];
      this.photoUrls = [];
      this.isLoading = false;
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';
    this.galleryService.getPhotos(email, albumId).subscribe({
      next: data => {
        this.photos = data;
        this.photoUrls = data.map(photo => photo.baseUrl);
        this.currentImageIndex = 0;
        this.lastPhotoRefreshAt = Date.now();
        this.isLoading = false;
      },
      error: err => {
        console.error('Error al cargar la galería:', err);
        this.isLoading = false;
        this.photos = [];
        this.photoUrls = [];
        this.errorMessage = err.error?.error || 'No se pudo cargar la carpeta. Intenta nuevamente.';
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
    this.selectedAlbumId = '';
    this.photos = [];
    this.photoUrls = [];
    void this.loadPersonalGallery(email);
  }

  setSelectedFiles(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      const files = Array.from(input.files || []);
      if (files.some(file => file.size > maxPhotoSizeBytes)) {
        this.selectedFiles = [];
        this.errorMessage = 'Cada foto debe pesar como máximo 100 MB.';
      } else if (files.some(file => !isSupportedPhoto(file))) {
        this.selectedFiles = [];
        this.errorMessage = 'Hay un formato no compatible. Usa JPG, PNG, WebP, HEIC, GIF, BMP, TIFF, AVIF o RAW compatible.';
      } else {
        this.selectedFiles = files;
        this.errorMessage = '';
      }
    }
  }

  async uploadPhotos(): Promise<void> {
    if (
      !this.auth.esAdminGaleria() ||
      !this.userEmail ||
      !this.selectedAlbumId ||
      this.selectedFiles.length === 0 ||
      this.isUploading
    ) {
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';
    const targetEmail = this.userEmail;
    const albumId = this.selectedAlbumId;
    const files = [...this.selectedFiles];
    this.uploadProgress = `0 de ${files.length}`;

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      this.uploadProgress = `${index + 1} de ${files.length}`;
      try {
        await firstValueFrom(this.galleryService.uploadPhotos(targetEmail, [file]));
      } catch (error) {
        console.error('Error al subir fotos:', error);
        this.selectedFiles = files.slice(index);
        this.isUploading = false;
        this.uploadProgress = '';
        const detail = error instanceof HttpErrorResponse && typeof error.error?.error === 'string'
          ? error.error.error
          : 'Intenta nuevamente.';
        this.errorMessage = `No se pudo subir "${file.name}". ${detail}`;
        return;
      }
    }

    this.selectedFiles = [];
    this.isUploading = false;
    this.uploadProgress = '';
    this.loadGallery(targetEmail, albumId);
  }

  deletePhoto(): void {
    if (
      this.isDeletingPhoto ||
      !this.auth.esAdminGaleria() ||
      this.photos.length === 0 ||
      this.currentImageIndex < 0 ||
      !this.userEmail ||
      !this.selectedAlbumId
    ) {
      return;
    }

    const photoToDelete = this.photos[this.currentImageIndex];

    if (!confirm('¿Seguro que deseas eliminar esta foto? Esta acción no se puede deshacer.')) {
      return;
    }

    const targetEmail = this.userEmail;
    const albumId = this.selectedAlbumId;
    this.isDeletingPhoto = true;
    this.galleryService.deletePhoto(photoToDelete.id, targetEmail, albumId).subscribe({
      next: () => {
        this.isDeletingPhoto = false;
        this.loadGallery(targetEmail, albumId);
      },
      error: (err) => {
        console.error('❌ Error al eliminar la foto:', err);
        this.isDeletingPhoto = false;
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
