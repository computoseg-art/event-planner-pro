import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GalleryFolder, GalleryService, Photo } from '../../services/gallery.service';
import { ImageCarousel } from '../../components/image-carousel/image-carousel';

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
  folders: GalleryFolder[] = [];
  photoUrls: string[] = [];
  userEmail = '';
  targetEmail = '';
  selectedAlbumId = '';
  newFolderName = '';
  selectedFiles: File[] = [];
  errorMessage = '';
  isLoading = false;
  isUploading = false;
  isCreatingFolder = false;
  currentImageIndex: number = 0;
  private photoRefreshTimer?: ReturnType<typeof setInterval>;
  private lastPhotoRefreshAt = 0;

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
    this.loadFolders(this.userEmail);
    this.photoRefreshTimer = setInterval(() => this.refreshExpiringPhotoUrls(), 50 * 60 * 1000);
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

  loadFolders(email: string, preferredAlbumId = ''): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.galleryService.getFolders(email).subscribe({
      next: folders => {
        this.folders = folders;
        const albumId = folders.some(folder => folder.albumId === preferredAlbumId)
          ? preferredAlbumId
          : folders[0]?.albumId || '';
        this.selectedAlbumId = albumId;
        if (albumId) {
          this.loadGallery(email, albumId);
        } else {
          this.photos = [];
          this.photoUrls = [];
          this.isLoading = false;
        }
      },
      error: err => {
        console.error('Error al cargar las carpetas de la galería:', err);
        this.isLoading = false;
        this.folders = [];
        this.photos = [];
        this.photoUrls = [];
        this.errorMessage = err.error?.error || 'No se pudieron cargar las carpetas de la galería.';
      }
    });
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
    this.loadFolders(email);
  }

  selectFolder(event: Event): void {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    this.selectedAlbumId = select.value;
    this.loadGallery(this.userEmail, this.selectedAlbumId);
  }

  setNewFolderName(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.newFolderName = input.value;
    }
  }

  createFolder(): void {
    const title = this.newFolderName.trim();
    if (!this.auth.esAdmin() || !this.userEmail || !title || this.isCreatingFolder) return;

    this.isCreatingFolder = true;
    this.errorMessage = '';
    this.galleryService.createFolder(this.userEmail, title).subscribe({
      next: folder => {
        this.newFolderName = '';
        this.isCreatingFolder = false;
        this.loadFolders(this.userEmail, folder.albumId);
      },
      error: err => {
        console.error('Error al crear carpeta de galería:', err);
        this.isCreatingFolder = false;
        this.errorMessage = err.error?.error || 'No se pudo crear la carpeta.';
      }
    });
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
      } else if (files.some(file => ![
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'image/gif',
        'image/bmp',
        'image/tiff',
      ].includes(file.type))) {
        this.selectedFiles = [];
        this.errorMessage = 'Usa archivos JPG, PNG, WebP, HEIC, GIF, BMP o TIFF.';
      } else {
        this.selectedFiles = files;
        this.errorMessage = '';
      }
    }
  }

  uploadPhotos(): void {
    if (
      !this.auth.esAdmin() ||
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
    this.galleryService.uploadPhotos(targetEmail, albumId, this.selectedFiles).subscribe({
      next: () => {
        this.selectedFiles = [];
        this.isUploading = false;
        this.loadGallery(targetEmail, albumId);
      },
      error: (err) => {
        console.error('❌ Error al subir fotos:', err);
        this.isUploading = false;
        this.errorMessage = err.error?.error || 'No se pudieron subir las fotos. Intenta nuevamente.';
      }
    });
  }

  deletePhoto(): void {
    if (
      !this.auth.esAdmin() ||
      this.photos.length === 0 ||
      this.currentImageIndex < 0 ||
      !this.userEmail ||
      !this.selectedAlbumId
    ) {
      return;
    }

    const photoToDelete = this.photos[this.currentImageIndex];

    if (!confirm(`¿Estás seguro de que deseas eliminar esta foto?`)) {
      return;
    }

    const targetEmail = this.userEmail;
    const albumId = this.selectedAlbumId;
    this.galleryService.deletePhoto(photoToDelete.id, targetEmail, albumId).subscribe({
      next: () => {
        this.loadGallery(targetEmail, albumId);
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
