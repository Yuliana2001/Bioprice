import { Component, signal } from '@angular/core';
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
  protected readonly activeStep = signal(0);
  protected readonly steps = [
    {
      title: 'Procesamiento especializado',
      description: 'Los datos se clasifican y analizan en el entorno científico definido para el proyecto.',
    },
    {
      title: 'Resultados revisados',
      description: 'Los archivos exportados se sincronizan manualmente y se validan antes de publicarse en la API.',
    },
    {
      title: 'Exploración informada',
      description: 'Los indicadores se consultan desde una interfaz con filtros y advertencias metodológicas.',
    },
  ];

  protected changeStep(offset: number): void {
    this.activeStep.update((index) => (index + offset + this.steps.length) % this.steps.length);
  }

  protected readonly families = [
    'Ecógrafos',
    'Aceleradores lineales',
    'Mesas de cirugía',
    'Sistemas de rayos X',
    'Ventiladores mecánicos',
  ];
}
