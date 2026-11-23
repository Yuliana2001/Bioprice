import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import {
  AuditEvent,
  AuthService,
  AuthUser,
  UserRole,
} from '../../core/auth/auth.service';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../shared/site-header/site-header.component';

@Component({
  selector: 'app-admin-users-page',
  imports: [DatePipe, FormsModule, ReactiveFormsModule, SiteFooterComponent, SiteHeaderComponent],
  template: `
    <app-site-header />
    <main id="contenido" class="min-h-screen bg-[#f8fafc] px-5 py-10 sm:px-8">
      <div class="mx-auto max-w-7xl">
        <div class="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.16em] text-blue-800">
              Administración
            </p>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight text-[#0B1736]">
              Usuarios y accesos
            </h1>
            <p class="mt-3 max-w-2xl leading-7 text-slate-600">
              Administra cuentas, roles y sesiones. Los cambios se registran en la auditoría de
              seguridad.
            </p>
          </div>
          <button
            class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
            type="button"
            (click)="signOut()"
          >
            Cerrar sesión
          </button>
        </div>

        @if (errorMessage()) {
          <p class="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {{ errorMessage() }}
          </p>
        }
        @if (successMessage()) {
          <p class="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            {{ successMessage() }}
          </p>
        }

        <section class="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-semibold text-[#0B1736]">Crear una cuenta</h2>
          <p class="mt-2 text-sm leading-6 text-slate-600">
            La contraseña inicial debe comunicarse al usuario de forma segura.
          </p>
          <form
            class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5"
            [formGroup]="createForm"
            (ngSubmit)="createUser()"
          >
            <label class="text-sm font-medium text-slate-700">
              Nombre
              <input
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                formControlName="name"
                maxlength="120"
                required
              />
            </label>
            <label class="text-sm font-medium text-slate-700">
              Correo electrónico
              <input
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                type="email"
                autocomplete="email"
                formControlName="email"
                required
              />
            </label>
            <label class="text-sm font-medium text-slate-700">
              Contraseña inicial
              <input
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                type="password"
                autocomplete="new-password"
                formControlName="password"
                minlength="12"
                maxlength="128"
                required
              />
            </label>
            <label class="text-sm font-medium text-slate-700">
              Rol
              <select
                class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                formControlName="role"
              >
                @for (role of roles; track role) {
                  <option [value]="role">{{ roleLabel(role) }}</option>
                }
              </select>
            </label>
            <div class="flex items-end">
              <button
                class="w-full rounded-lg bg-[#0B1736] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60"
                type="submit"
                [disabled]="pending()"
              >
                Crear usuario
              </button>
            </div>
          </form>
        </section>

        <section class="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-6">
            <div>
              <h2 class="text-xl font-semibold text-[#0B1736]">Cuentas registradas</h2>
              <p class="mt-1 text-sm text-slate-600">{{ totalUsers() }} cuentas en total</p>
            </div>
            <button
              class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              type="button"
              (click)="loadUsers()"
              [disabled]="pending()"
            >
              Actualizar
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[850px] text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th class="px-6 py-3">Nombre y correo</th>
                  <th class="px-6 py-3">Rol</th>
                  <th class="px-6 py-3">Estado</th>
                  <th class="px-6 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (user of users(); track user.id) {
                  <tr>
                    <td class="px-6 py-4">
                      <p class="font-semibold text-slate-900">{{ user.name }}</p>
                      <p class="mt-1 text-slate-600">{{ user.email }}</p>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex items-center gap-2">
                        <select
                          class="rounded-lg border border-slate-300 px-2 py-1.5"
                          [ngModel]="roleDraft(user)"
                          [ngModelOptions]="{ standalone: true }"
                          (ngModelChange)="setRoleDraft(user.id, $event)"
                          [attr.aria-label]="'Rol de ' + user.name"
                        >
                          @for (role of roles; track role) {
                            <option [value]="role">{{ roleLabel(role) }}</option>
                          }
                        </select>
                        <button
                          class="text-xs font-semibold text-blue-800 underline"
                          type="button"
                          (click)="saveRole(user)"
                          [disabled]="pending() || roleDraft(user) === user.role"
                        >
                          Guardar
                        </button>
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <span
                        class="rounded-full px-2.5 py-1 text-xs font-semibold"
                        [class]="user.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'"
                      >
                        {{ user.active ? 'Activa' : 'Inactiva' }}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex flex-wrap gap-3">
                        <button
                          class="text-xs font-semibold text-blue-800 underline"
                          type="button"
                          (click)="toggleActive(user)"
                          [disabled]="pending()"
                        >
                          {{ user.active ? 'Desactivar' : 'Activar' }}
                        </button>
                        <button
                          class="text-xs font-semibold text-blue-800 underline"
                          type="button"
                          (click)="revokeSessions(user)"
                          [disabled]="pending()"
                        >
                          Revocar sesiones
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td class="px-6 py-8 text-center text-slate-600" colspan="4">
                      No hay cuentas para mostrar.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <button
              class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              type="button"
              (click)="previousPage()"
              [disabled]="offset() === 0 || pending()"
            >
              Anterior
            </button>
            <span class="text-sm text-slate-600">
              {{ firstVisible() }}–{{ visibleEnd() }} de {{ totalUsers() }}
            </span>
            <button
              class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              type="button"
              (click)="nextPage()"
              [disabled]="offset() + pageSize >= totalUsers() || pending()"
            >
              Siguiente
            </button>
          </div>
        </section>

        <section class="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-xl font-semibold text-[#0B1736]">Auditoría reciente</h2>
          @if (auditEvents().length === 0) {
            <p class="mt-3 text-sm text-slate-600">No hay eventos de auditoría para mostrar.</p>
          } @else {
            <ul class="mt-4 divide-y divide-slate-100">
              @for (event of auditEvents(); track event.id) {
                <li class="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <span class="font-medium text-slate-800">{{ event.action }}</span>
                  <time class="text-slate-500">{{ event.occurred_at | date: 'medium' }}</time>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </main>
    <app-site-footer />
  `,
})
export class AdminUsersPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly pageSize = 25;
  protected readonly roles: UserRole[] = ['ADMIN', 'ANALISTA', 'VISUALIZADOR'];
  protected readonly users = signal<AuthUser[]>([]);
  protected readonly auditEvents = signal<AuditEvent[]>([]);
  protected readonly totalUsers = signal(0);
  protected readonly offset = signal(0);
  protected readonly pending = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected roleDrafts: Record<string, UserRole> = {};
  protected readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    role: ['VISUALIZADOR' as UserRole, Validators.required],
  });

  ngOnInit(): void {
    this.loadUsers();
    this.loadAuditEvents();
  }

  protected loadUsers(): void {
    this.errorMessage.set(null);
    this.auth.listUsers(this.pageSize, this.offset()).subscribe({
      next: (page) => {
        this.users.set(page.items);
        this.totalUsers.set(page.total);
        this.roleDrafts = {};
      },
      error: (error: unknown) => this.errorMessage.set(this.describeError(error)),
    });
  }

  protected createUser(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.auth.createUser(this.createForm.getRawValue()).subscribe({
      next: (user) => {
        this.successMessage.set(`La cuenta de ${user.name} fue creada.`);
        this.createForm.reset({ name: '', email: '', password: '', role: 'VISUALIZADOR' });
        this.offset.set(0);
        this.loadUsers();
      },
      error: (error: unknown) => {
        this.pending.set(false);
        this.errorMessage.set(this.describeError(error));
      },
      complete: () => this.pending.set(false),
    });
  }

  protected roleDraft(user: AuthUser): UserRole {
    return this.roleDrafts[user.id] ?? user.role;
  }

  protected setRoleDraft(userId: string, role: UserRole): void {
    this.roleDrafts[userId] = role;
  }

  protected roleLabel(role: UserRole): string {
    switch (role) {
      case 'ADMIN':
        return 'Administrador';
      case 'ANALISTA':
        return 'Analista';
      case 'VISUALIZADOR':
        return 'Visualizador';
    }
  }

  protected saveRole(user: AuthUser): void {
    const role = this.roleDraft(user);
    if (role === user.role) {
      return;
    }
    this.mutateUser(user.id, { role }, `Rol actualizado para ${user.name}.`);
  }

  protected toggleActive(user: AuthUser): void {
    this.mutateUser(
      user.id,
      { active: !user.active },
      user.active ? `Cuenta desactivada: ${user.name}.` : `Cuenta activada: ${user.name}.`,
    );
  }

  protected revokeSessions(user: AuthUser): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.pending.set(true);
    this.auth.revokeUserSessions(user.id).subscribe({
      next: (result) =>
        this.successMessage.set(`Sesiones revocadas para ${user.name}: ${result.revoked_count}.`),
      error: (error: unknown) => {
        this.pending.set(false);
        this.errorMessage.set(this.describeError(error));
      },
      complete: () => this.pending.set(false),
    });
  }

  protected previousPage(): void {
    this.offset.update((value) => Math.max(0, value - this.pageSize));
    this.loadUsers();
  }

  protected nextPage(): void {
    this.offset.update((value) => value + this.pageSize);
    this.loadUsers();
  }

  protected visibleEnd(): number {
    return Math.min(this.offset() + this.pageSize, this.totalUsers());
  }

  protected firstVisible(): number {
    return this.totalUsers() === 0 ? 0 : this.offset() + 1;
  }

  protected signOut(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/ingresar'),
      error: (error: unknown) => this.errorMessage.set(this.describeError(error)),
    });
  }

  private loadAuditEvents(): void {
    this.auth.listAuditEvents(8, 0).subscribe({
      next: (page) => this.auditEvents.set(page.items),
      error: (error: unknown) => this.errorMessage.set(this.describeError(error)),
    });
  }

  private mutateUser(
    userId: string,
    changes: { role?: UserRole; active?: boolean },
    successMessage: string,
  ): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.pending.set(true);
    this.auth.updateUser(userId, changes).subscribe({
      next: () => {
        this.successMessage.set(successMessage);
        this.loadUsers();
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
    return 'No se pudo completar la operación. Inténtalo más tarde.';
  }
}
