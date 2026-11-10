import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Begruessung } from './begruessung';

describe('Begruessung', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Begruessung],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('zeigt vor der Antwort „Lädt …“', async () => {
    const fixture = TestBed.createComponent(Begruessung);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Lädt …');
    http.expectOne({ method: 'GET', url: '/api/begruessung' });
  });

  it('zeigt den Text aus der Antwort', async () => {
    const fixture = TestBed.createComponent(Begruessung);
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: '/api/begruessung' }).flush({ text: 'Hallo aus der DB' });
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Hallo aus der DB');
    expect(text).not.toContain('Backend nicht erreichbar');
  });

  it('zeigt bei HTTP 502 „Backend nicht erreichbar“', async () => {
    const fixture = TestBed.createComponent(Begruessung);
    fixture.detectChanges();
    http
      .expectOne('/api/begruessung')
      .flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Backend nicht erreichbar');
  });

  it('zeigt bei Netzwerkfehler „Backend nicht erreichbar“', async () => {
    const fixture = TestBed.createComponent(Begruessung);
    fixture.detectChanges();
    http.expectOne('/api/begruessung').error(new ProgressEvent('error'));
    await fixture.whenStable();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Backend nicht erreichbar');
  });

  it('zeigt bei Antwort ohne Text den Fehlertext statt einer leeren Zeile', async () => {
    const fixture = TestBed.createComponent(Begruessung);
    fixture.detectChanges();
    http.expectOne('/api/begruessung').flush({});
    await fixture.whenStable();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Backend nicht erreichbar');
  });

  it('zeigt bei leerer Antwort (null) den Fehlertext', async () => {
    const fixture = TestBed.createComponent(Begruessung);
    fixture.detectChanges();
    http.expectOne('/api/begruessung').flush(null);
    await fixture.whenStable();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Backend nicht erreichbar');
  });
});
