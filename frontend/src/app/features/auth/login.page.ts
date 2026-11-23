import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../shared/site-header/site-header.component';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, SiteFooterComponent, SiteHeaderComponent],
  template: `
    <app-site-header />
    <main id="contenido" class="flex min-h-[65vh] items-center justify-center bg-[#f8fafc] px-5 py-16">
      <section
        aria-labelledby="login-title"
        class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"
      >
        @if (recoveryMode()) {
          <h1 id="login-title" class="text-2xl font-semibold tracking-tight text-[#0B1736]">
            Recuperar contraseña
          </h1>
          <p class="mt-3 leading-7 text-slate-600">
            Indica el correo asociado a tu cuenta. Si la recuperación está habilitada y la cuenta
            existe, recibirás instrucciones.
          </p>
          <form class="mt-7 space-y-5" [formGroup]="recoveryForm" (ngSubmit)="requestRecovery()">
            <label class="block text-sm font-medium text-slate-700" for="recovery-email">
              Correo electrónico
              <input
                id="recovery-email"
                class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                type="email"
                autocomplete="email"
                formControlName="email"
                required
              />
            </label>
            @if (recoveryForm.controls.email.touched && recoveryForm.controls.email.invalid) {
              <p class="text-sm text-red-700">Ingresa un correo electrónico válido.</p>
            }
            <button
              class="w-full rounded-xl bg-[#0B1736] px-5 py-3 font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              [disabled]="pending()"
            >
              {{ pending() ? 'Enviando…' : 'Solicitar instrucciones' }}
            </button>
          </form>
          <button
            class="mt-5 text-sm font-semibold text-blue-800 underline underline-offset-4"
            type="button"
            (click)="showLogin()"
          >
            Volver a ingresar
          </button>
        } @else {
          <h1 id="login-title" class="text-2xl font-semibold tracking-tight text-[#0B1736]">
            Ingresar a BioPrice BI
          </h1>
          <p class="mt-3 leading-7 text-slate-600">
            Accede con la cuenta que te proporcionó la persona administradora de la plataforma.
          </p>
          <form class="mt-7 space-y-5" [formGroup]="loginForm" (ngSubmit)="submitLogin()">
            <label class="block text-sm font-medium text-slate-700" for="login-email">
              Correo electrónico
              <input
                id="login-email"
                class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                type="email"
                autocomplete="username"
                formControlName="email"
                required
              />
            </label>
            @if (loginForm.controls.email.touched && loginForm.controls.email.invalid) {
              <p class="text-sm text-red-700">Ingresa un correo electrónico válido.</p>
            }
            <label class="block text-sm font-medium text-slate-700" for="login-password">
              Contraseña
              <span class="mt-2 flex rounded-xl border border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
                <input
                  id="login-password"
                  class="min-w-0 flex-1 rounded-l-xl px-4 py-3 outline-none"
                  [type]="passwordVisible() ? 'text' : 'password'"
                  autocomplete="current-password"
                  formControlName="password"
                  required
                />
                <button
                  class="rounded-r-xl px-4 text-sm font-semibold text-blue-800"
                  type="button"
                  [attr.aria-pressed]="passwordVisible()"
                  (click)="togglePasswordVisibility()"
                >
                  {{ passwordVisible() ? 'Ocultar' : 'Mostrar' }}
                </button>
              </span>
            </label>
            <button
              class="w-full rounded-xl bg-[#0B1736] px-5 py-3 font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              [disabled]="pending()"
            >
              {{ pending() ? 'Validando…' : 'Ingresar' }}
            </button>
          </form>
          <button
            class="mt-5 text-sm font-semibold text-blue-800 underline underline-offset-4"
            type="button"
            (click)="showRecovery()"
          >
            ¿Olvidaste tu contraseña?
          </button>
            <a
              class="mt-3 block text-sm font-semibold text-blue-800 underline underline-offset-4"
              routerLink="/registro"
            >
              ¿No tienes una cuenta? Crear la primera cuenta
            </a>
        }

        @if (errorMessage()) {
          <p class="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {{ errorMessage() }}
          </p>
        }
        @if (successMessage()) {
          <p class="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            {{ successMessage() }}
          </p>
        }
        <a
          class="mt-7 inline-block text-sm font-semibold text-slate-600 underline underline-offset-4"
          routerLink="/"
        >
          Volver al inicio
        </a>
      </section>
    </main>
    <app-site-footer />
  `,
})
export class LoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly pending = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly recoveryMode = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });
  protected readonly recoveryForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  constructor() {
    if (this.route.snapshot.queryParamMap.get('registro') === '1') {
      void this.router.navigate(['/registro']);
      return;
    }
    if (this.route.snapshot.queryParamMap.get('authError') === 'unavailable') {
      this.errorMessage.set(
        'No se pudo validar la sesión. Inténtalo de nuevo cuando el servicio esté disponible.',
      );
    }
    this.auth.loadCurrentUser().subscribe({
      next: (user) => {
        if (user) {
          void this.router.navigateByUrl('/app/dashboard');
        }
      },
      error: () => this.errorMessage.set('No se pudo comprobar la sesión. Inténtalo de nuevo.'),
    });
  }

  protected submitLogin(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    const { email, password } = this.loginForm.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => void this.router.navigateByUrl('/app/dashboard'),
      error: (error: unknown) => {
        this.pending.set(false);
        this.errorMessage.set(this.describeError(error));
      },
      complete: () => this.pending.set(false),
    });
  }

  protected requestRecovery(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.recoveryForm.invalid) {
      this.recoveryForm.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.auth.forgotPassword(this.recoveryForm.controls.email.value).subscribe({
      next: (response) => this.successMessage.set(response.message),
      error: (error: unknown) => {
        this.pending.set(false);
        this.errorMessage.set(this.describeError(error));
      },
      complete: () => this.pending.set(false),
    });
  }

  protected showRecovery(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.recoveryMode.set(true);
  }

  protected showLogin(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.recoveryMode.set(false);
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        return 'Correo electrónico o contraseña incorrectos.';
      }
      if (error.status === 429) {
        return 'Se alcanzó el límite de intentos. Espera un momento e inténtalo de nuevo.';
      }
      const detail = error.error?.detail;
      if (typeof detail === 'string') {
        return detail;
      }
    }
    return 'No se pudo completar la solicitud. Inténtalo más tarde.';
  }
}
