import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { parseUnitPriceMinor } from '@restaurant-ordering/contracts';

@Component({
  selector: 'app-price-input', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="price-control" role="group" [attr.aria-label]="label()">
    <button type="button" [disabled]="disabled() || amount() <= 0" (click)="step(-100)" [attr.aria-label]="'Decrease ' + label()" [title]="'Decrease ' + label()">−</button>
    <input inputmode="decimal" maxlength="32" [attr.aria-label]="label()" [disabled]="disabled()" [value]="value()" (input)="onInput($event)" />
    <button type="button" [disabled]="disabled() || amount() >= 1000000" (click)="step(100)" [attr.aria-label]="'Increase ' + label()" [title]="'Increase ' + label()">+</button>
  </div>`,
  styles: [`:host { display: inline-block; min-width: 0; max-width: 100%; width: 100%; } .price-control { display: flex; height: 3.5rem; border: 1px solid #829aa9; border-radius: .5rem; overflow: hidden; background: white; }
    button { width: 2.25rem; flex-shrink: 0; border: 0; background: #edf3f7; color: #20303c; font-size: 1.6rem; cursor: pointer; } button:disabled { opacity: .4; cursor: default; }
    input { flex: 1; width: 3rem; min-width: 0; border: 0; border-inline: 1px solid #c7d5df; background: transparent; text-align: center; font: inherit; font-size: 1.1rem; font-weight: 600; } .price-control:focus-within { outline: 2px solid #2c6c93; outline-offset: 2px; }`]
})
export class PriceInput {
  readonly value = input(''); readonly disabled = input(false); readonly label = input('Unit price (USD)');
  readonly valueChange = output<string>();
  onInput(event: Event) {
    const field = event.target as HTMLInputElement;
    const value = field.value.replaceAll(',', '.');
    if (field.value !== value) field.value = value;
    this.valueChange.emit(value);
  }
  amount() { try { return parseUnitPriceMinor(this.value()); } catch { return 0; } }
  step(delta: number) { if (!this.disabled()) this.valueChange.emit((Math.min(1000000, Math.max(0, this.amount() + delta)) / 100).toFixed(2)); }
}
