import { Component } from '@angular/core';
import { Begruessung } from './begruessung/begruessung';

@Component({
  imports: [Begruessung],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}

export function probe(x: number): number {
  if (x > 1) {
    return x * 2;
  }
  return x;
}
