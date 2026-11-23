import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../shared/site-header/site-header.component';

function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmation')?.value;
  return password === confirmation ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, SiteFooterComponent, SiteHeaderComponent],
  template: `
    <app-site-header />
    <main id="contenido" class="flex min-h-[65vh] items-center justify-center bg-[#f8fafc] px-5 py-16">
      <section
        aria-labelledby="reset-title"
        class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"
      >
        <h1 id="reset-title" class="text-2xl font-semibold tracking-tight text-[#0B1736]">
          Crear una nueva contraseña
        </h1>
        @if (!token) {
          <p class="mt-4 text-red-800" role="alert">
            El enlace no incluye un token de recuperación válido.
          </p>
        } @else if (completed()) {
          <p class="mt-4 leading-7 text-slate-600" role="status">
            {{ successMessage() }}
          </p>
          <a
            class="mt-7 inline-block rounded-xl bg-[#0B1736] px-5 py-3 font-semibold text-white"
            routerLink="/ingresar"
          >
            Ir a ingresar
          </a>
        } @else {
          <p class="mt-3 leading-7 text-slate-600">
            Elige una contraseña de al menos 12 caracteres. El enlace se puede usar una sola vez.
          </p>
          <form class="mt-7 space-y-5" [formGroup]="form" (ngSubmit)="submit()">
            <label class="block text-sm font-medium text-slate-700" for="new-password">
              Nueva contraseña
              <input
                id="new-password"
                class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                type="password"
                autocomplete="new-password"
                formControlName="password"
                required
              />
            </label>
            <label class="block text-sm font-medium text-slate-700" for="confirm-password">
              Confirmar contraseña
              <input
                id="confirm-password"
                class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                type="password"
                autocomplete="new-password"
                formControlName="confirmation"
                required
              />
            </label>
            @if (form.touched && form.hasError('passwordMismatch')) {
              <p class="text-sm text-red-700">Las contraseñas no coinciden.</p>
            }
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <p class="text-sm text-red-700">Usa entre 12 y 128 caracteres.</p>
            }
            <button
              class="w-full rounded-xl bg-[#0B1736] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              [disabled]="pending()"
            >
              {{ pending() ? 'Actualizando…' : 'Actualizar contraseña' }}
            </button>
          </form>
        }
        @if (errorMessage()) {
          <p class="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {{ errorMessage() }}
          </p>
        }
      </section>
    </main>
    <app-site-footer />
  `,
})
export class ResetPasswordPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly token = new URLSearchParams(this.route.snapshot.fragment ?? '').get('token') ?? '';
  protected readonly pending = signal(false);
  protected readonly completed = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal('');
  protected readonly form = this.formBuilder.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
      confirmation: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );

  protected submit(): void {
    this.errorMessage.set(null);
    if (!this.token) {
      this.errorMessage.set('El enlace no es válido.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.auth.resetPassword(this.token, this.form.controls.password.value).subscribe({
      next: (response) => {
        this.successMessage.set(response.message);
        this.completed.set(true);
      },
      error: (error: unknown) => {
        this.pending.set(false);
        this.errorMessage.set(this.describeError(error));
      },
      complete: () => this.pending.set(false),
    });
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const detail = error.error?.detail;
      if (typeof detail === 'string') {
        return detail;
      }
    }
    return 'No se pudo actualizar la contraseña. Inténtalo más tarde.';
  }
}
