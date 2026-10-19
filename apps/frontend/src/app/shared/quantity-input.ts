import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-quantity-input', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="quantity-control" role="group" [attr.aria-label]="label()">
    <button type="button" [disabled]="disabled() || numericValue() <= min()" (click)="step(-1)" [attr.aria-label]="'Decrease ' + label()" [title]="'Decrease ' + label()">−</button>
    <input type="number" inputmode="numeric" [min]="min()" max="99" step="1" [attr.aria-label]="label()" [disabled]="disabled()" [value]="value()" (input)="valueChange.emit($any($event.target).value)" />
    <button type="button" [disabled]="disabled() || numericValue() >= 99" (click)="step(1)" [attr.aria-label]="'Increase ' + label()" [title]="'Increase ' + label()">+</button>
  </div>`,
  styles: [`:host { display: inline-block; min-width: 0; max-width: 100%; width: 100%; } .quantity-control { display: flex; height: 3.5rem; border: 1px solid #829aa9; border-radius: .5rem; overflow: hidden; background: white; }
    button { width: 2.25rem; flex-shrink: 0; border: 0; background: #edf3f7; color: #20303c; font-size: 1.6rem; cursor: pointer; } button:disabled { opacity: .4; cursor: default; }
    input { flex: 1; width: 3rem; min-width: 0; border: 0; border-inline: 1px solid #c7d5df; background: transparent; text-align: center; font: inherit; font-size: 1.25rem; font-weight: 600; appearance: textfield; }
    input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { appearance: none; margin: 0; } .quantity-control:focus-within { outline: 2px solid #2c6c93; outline-offset: 2px; }`]
})
export class QuantityInput {
  readonly value = input('1');
  readonly min = input(1);
  readonly disabled = input(false);
  readonly label = input('Quantity');
  readonly valueChange = output<string>();
  numericValue() { return Number(this.value()); }
  step(delta: number) {
    if (this.disabled()) return;
    const value = this.numericValue();
    this.valueChange.emit(String(Math.min(99, Math.max(this.min(), (Number.isInteger(value) ? value : this.min()) + delta))));
  }
}
