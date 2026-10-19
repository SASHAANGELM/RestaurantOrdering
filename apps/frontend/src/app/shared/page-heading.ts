import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { BusyButton } from './busy-button';

@Component({
  selector: 'app-page-heading', imports: [MatButton, MatTooltip, BusyButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="heading"><h1 tabindex="-1" [attr.id]="headingId()">{{ title() }}</h1>
    @if (refreshLabel()) { <button class="icon-button" mat-button [appBusy]="busy()" [disabled]="busy()" [attr.aria-label]="refreshLabel()" [matTooltip]="refreshLabel()" (click)="refresh.emit()"><i class="ti ti-refresh" aria-hidden="true"></i></button> }
    <div class="extra"><ng-content /></div></div>`,
  styles: [`.heading { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; } h1 { margin: 0; min-width: 0; overflow-wrap: anywhere; } .extra { margin-left: auto; }`]
})
export class PageHeading {
  readonly title = input.required<string>();
  readonly headingId = input<string>();
  readonly refreshLabel = input('');
  readonly busy = input(false);
  readonly refresh = output<void>();
}
