import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LandingPage } from './landing.page';

describe('Landing carousel', () => {
  it('moves in both directions and wraps around', async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const carousel = fixture.nativeElement.querySelector('[aria-roledescription="carrusel"]') as HTMLElement;
    const previous = carousel.querySelector('[aria-label="Etapa anterior"]') as HTMLButtonElement;
    const next = carousel.querySelector('[aria-label="Etapa siguiente"]') as HTMLButtonElement;

    expect(carousel.textContent).toContain('Procesamiento especializado');
    next.click();
    fixture.detectChanges();
    expect(carousel.textContent).toContain('Resultados revisados');
    previous.click();
    previous.click();
    fixture.detectChanges();
    expect(carousel.textContent).toContain('Exploración informada');
    expect(carousel.querySelector('[aria-roledescription="diapositiva"]')?.getAttribute('aria-label'))
      .toBe('3 de 3');
  });
});
