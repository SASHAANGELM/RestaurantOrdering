import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PriceInput } from './price-input';

@Component({
  selector: 'app-unit-price-field', imports: [DecimalPipe, PriceInput], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span>{{ open() ? 'Unit price (USD)' : 'Unit price' }}</span>
    @if (open()) {
      <app-price-input [label]="label()" [value]="value()" [disabled]="disabled()" (valueChange)="valueChange.emit($event)" />
    } @else {
      <strong class="fixed-price">{{ priceMinor() / 100 | number:'1.2-2' }} USD</strong>
    }
  `,
  styles: [`:host { display: grid; gap: .4rem; min-width: 0; } span { font-size: .85rem; } .fixed-price { display: flex; align-items: center; min-height: 3.5rem; font-size: 1.25rem; font-weight: 600; overflow-wrap: anywhere; }`]
})
export class UnitPriceField {
  readonly open = input(false); readonly priceMinor = input(0);
  readonly value = input(''); readonly disabled = input(false); readonly label = input('Unit price (USD)');
  readonly valueChange = output<string>();
}
