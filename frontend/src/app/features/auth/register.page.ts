import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { timeout } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../shared/site-header/site-header.component';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, SiteFooterComponent, SiteHeaderComponent],
  template: `
    <app-site-header />
    <main id="contenido" class="flex min-h-[65vh] items-center justify-center bg-[#f8fafc] px-5 py-16">
      <section
        aria-labelledby="register-title"
        class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"
      >
        <h1 id="register-title" class="text-2xl font-semibold tracking-tight text-[#0B1736]">
          Crear la primera cuenta
        </h1>
        <p class="mt-3 leading-7 text-slate-600">
          El registro está disponible únicamente cuando no hay usuarios. El correo se usará como
          nombre visible.
        </p>
        <form class="mt-7 space-y-5" [formGroup]="form" (ngSubmit)="submit()">
          <label class="block text-sm font-medium text-slate-700" for="register-email">
            Correo electrónico
            <input
              id="register-email"
              class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              type="email"
              autocomplete="username"
              formControlName="email"
              required
            />
          </label>
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <p class="text-sm text-red-700">Ingresa un correo electrónico válido.</p>
          }
          <label class="block text-sm font-medium text-slate-700" for="register-password">
            Contraseña
            <input
              id="register-password"
              class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              type="password"
              autocomplete="new-password"
              formControlName="password"
              minlength="12"
              maxlength="128"
              required
            />
          </label>
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <p class="text-sm text-red-700">Usa entre 12 y 128 caracteres.</p>
          }
          <label class="block text-sm font-medium text-slate-700" for="register-confirmation">
            Confirmar contraseña
            <input
              id="register-confirmation"
              class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              type="password"
              autocomplete="new-password"
              formControlName="confirmation"
              required
            />
          </label>
          @if (form.controls.confirmation.touched && form.controls.confirmation.value !== form.controls.password.value) {
            <p class="text-sm text-red-700">Las contraseñas no coinciden.</p>
          }
          <button
            class="w-full rounded-xl bg-[#0B1736] px-5 py-3 font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            [disabled]="pending()"
          >
            {{ pending() ? 'Creando cuenta…' : 'Registrarse' }}
          </button>
        </form>
        @if (errorMessage()) {
          <p class="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {{ errorMessage() }}
          </p>
        }
        <a
          class="mt-5 inline-block text-sm font-semibold text-blue-800 underline underline-offset-4"
          routerLink="/ingresar"
        >
          Ya tengo una cuenta
        </a>
      </section>
    </main>
    <app-site-footer />
  `,
})
export class RegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly pending = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    confirmation: ['', Validators.required],
  });

  protected submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password, confirmation } = this.form.getRawValue();
    if (password !== confirmation) {
      this.form.controls.confirmation.markAsTouched();
      return;
    }

    this.pending.set(true);
    this.auth.register(email.trim().slice(0, 120), email, password).pipe(timeout(15000)).subscribe({
      next: () => void this.router.navigateByUrl('/app/dashboard'),
      error: (error: unknown) => {
        this.pending.set(false);
        const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
        this.errorMessage.set(
          typeof detail === 'string'
            ? detail
            : 'No se pudo completar el registro. Verifica que el backend y la base de datos estén disponibles.',
        );
      },
      complete: () => this.pending.set(false),
    });
  }
}
