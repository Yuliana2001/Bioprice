import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideActivity,
  LucideArrowRight,
  LucideChartColumn,
  LucideCheck,
  LucideDatabase,
  LucideHeartPulse,
  LucideLightbulb,
  LucideShieldCheck,
  LucideTarget,
} from '@lucide/angular';

import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../shared/site-header/site-header.component';

@Component({
  selector: 'app-landing-page',
  imports: [
    RouterLink,
    LucideActivity,
    LucideArrowRight,
    LucideChartColumn,
    LucideCheck,
    LucideDatabase,
    LucideHeartPulse,
    LucideLightbulb,
    LucideShieldCheck,
    LucideTarget,
    SiteFooterComponent,
    SiteHeaderComponent,
  ],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.css',
})
export class LandingPage {
  protected readonly families = [
    'Ecógrafos',
    'Aceleradores lineales',
    'Mesas de cirugía',
    'Sistemas de rayos X',
    'Ventiladores mecánicos',
  ];
}
