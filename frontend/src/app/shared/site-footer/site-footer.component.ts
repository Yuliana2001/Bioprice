import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideActivity } from '@lucide/angular';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, LucideActivity],
  templateUrl: './site-footer.component.html',
})
export class SiteFooterComponent {}
