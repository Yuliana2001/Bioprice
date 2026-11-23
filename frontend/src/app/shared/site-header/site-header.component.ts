import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideActivity,
  LucideArrowUpRight,
  LucideMenu,
  LucideX,
} from '@lucide/angular';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, LucideActivity, LucideArrowUpRight, LucideMenu, LucideX],
  templateUrl: './site-header.component.html',
})
export class SiteHeaderComponent {
  protected readonly menuOpen = signal(false);

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }
}
