import { Directive, ElementRef, effect, inject, input, Renderer2 } from '@angular/core';

/** Keeps the button label in place while an API action is pending. */
@Directive({ selector: 'button[appBusy]' })
export class BusyButton {
  readonly appBusy = input(false);
  private readonly element = inject<ElementRef<HTMLButtonElement>>(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);
  constructor() {
    effect(() => {
      const busy = this.appBusy();
      this.renderer.setAttribute(this.element, 'aria-busy', String(busy));
      if (busy) this.renderer.addClass(this.element, 'button-busy');
      else this.renderer.removeClass(this.element, 'button-busy');
    });
  }
}
