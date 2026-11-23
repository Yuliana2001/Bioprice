import { Routes } from '@angular/router';

import { adminGuard, authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.page').then((module) => module.LandingPage),
    title: 'BioPrice BI | Inteligencia de precios biomédicos',
  },
  {
    path: 'quienes-somos',
    loadComponent: () => import('./features/about/about.page').then((module) => module.AboutPage),
    title: 'Quiénes somos | BioPrice BI',
  },
  {
    path: 'ingresar',
    loadComponent: () =>
      import('./features/auth/login.page').then((module) => module.LoginPage),
    title: 'Ingresar | BioPrice BI',
  },
  {
    path: 'registro',
    loadComponent: () =>
      import('./features/auth/register.page').then((module) => module.RegisterPage),
    title: 'Registro | BioPrice BI',
  },
  {
    path: 'restablecer',
    loadComponent: () =>
      import('./features/auth/reset-password.page').then((module) => module.ResetPasswordPage),
    title: 'Restablecer contraseña | BioPrice BI',
  },
  {
    path: 'app/dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.page').then((module) => module.DashboardPage),
    title: 'Dashboard | BioPrice BI',
  },
  {
    path: 'app/administracion/usuarios',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/users.page').then((module) => module.AdminUsersPage),
    title: 'Administración de usuarios | BioPrice BI',
  },
  { path: '**', redirectTo: '' },
];
