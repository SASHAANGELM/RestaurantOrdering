import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-breadcrumbs', imports: [RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav class="breadcrumbs" aria-label="Breadcrumb">@for (item of items(); track $index) {
    @if ($index) { <span aria-hidden="true">&gt;</span> }
    @if (item.path) { <a [routerLink]="item.path">{{ item.label }}</a> }
    @else { <span aria-current="page">{{ item.label }}</span> }
  }</nav>`,
  styles: [`.breadcrumbs { flex-wrap: wrap; } a, span { overflow-wrap: anywhere; min-width: 0; }`]
})
export class Breadcrumbs {
  readonly items = input.required<readonly { label: string; path?: string }[]>();
}
