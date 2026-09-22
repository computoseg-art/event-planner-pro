import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { ContactoComponent } from './components/contacto/contacto';
import { AgendaComponent } from './components/agenda/agenda';
import { Eventos } from './components/eventos/eventos'; // Nomenclatura moderna sin 'Component'
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'home', component: HomeComponent },
  { path: 'contacto', component: ContactoComponent },
  { path: 'eventos', component: Eventos, canActivate: [authGuard] }, // Nueva carátula protegida
  { path: 'agenda', component: AgendaComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' }
];
