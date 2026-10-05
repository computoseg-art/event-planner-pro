import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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

  photos: Photo[] = [];
  photoUrls: string[] = [];
  userEmail: string | null = '';
  isLoading: boolean = true;
  currentImageIndex: number = 0;



  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      // Intenta obtener email de la URL o del queryParam
      this.userEmail = params.get('email') || this.route.snapshot.queryParamMap.get('email');

      if (this.userEmail) {
        this.loadGallery(this.userEmail);
      } else {
        console.error('❌ No se encontró el email en la URL.');
        this.isLoading = false;
      }
    });
  }

  loadGallery(email: string): void {
    this.isLoading = true;
    this.galleryService.getPhotosByEmail(email).subscribe({
      next: (data) => {
        this.photos = data;
        this.photoUrls = this.photos.map(p => p.baseUrl);
        this.isLoading = false;
        console.log('✅ Fotos cargadas con éxito:', this.photos);
      },
      error: (err) => {
        console.error('❌ Error al cargar la galería:', err);
        this.isLoading = false;
        this.photos = [];
        this.photoUrls = [];
      }
    });
  }

  deletePhoto(): void {
    if (this.photos.length === 0 || this.currentImageIndex < 0 || !this.userEmail) {
      console.warn('⚠️ No hay foto seleccionada o falta el email.');
      return;
    }

    const photoToDelete = this.photos[this.currentImageIndex];

    if (!confirm(`¿Estás seguro de que deseas eliminar esta foto?`)) {
      return;
    }

    this.galleryService.deletePhoto(photoToDelete.id, this.userEmail).subscribe({
      next: () => {
        console.log(`✅ Foto eliminada correctamente.`);
        if (this.userEmail) {
          this.loadGallery(this.userEmail);
        }
      },
      error: (err) => {
        console.error('❌ Error al eliminar la foto:', err);
        alert('Hubo un error al eliminar la foto. Por favor, inténtalo de nuevo.');
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
