import { Component } from '@angular/core';
import { Begruessung } from './begruessung/begruessung';

@Component({
  imports: [Begruessung],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
