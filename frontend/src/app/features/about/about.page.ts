import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideEye,
  LucideHeartPulse,
  LucideTarget,
} from '@lucide/angular';

import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../shared/site-header/site-header.component';

@Component({
  selector: 'app-about-page',
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideEye,
    LucideHeartPulse,
    LucideTarget,
    SiteFooterComponent,
    SiteHeaderComponent,
  ],
  templateUrl: './about.page.html',
  styleUrl: './about.page.css',
})
export class AboutPage {}
