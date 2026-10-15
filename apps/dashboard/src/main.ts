import { loadTranslations } from '@angular/localize';
import { bootstrapApplication } from '@angular/platform-browser';
import { currentLocale } from './app/core/locale';

/** Translations are loaded before the app code, so every `$localize` call already sees them. */
async function start(): Promise<void> {
  const locale = currentLocale();
  if (locale === 'en') {
    const { default: file } = await import('./locale/messages.en.json');
    loadTranslations(file.translations);
  }
  document.documentElement.lang = locale;
  const [{ appConfig }, { App }] = await Promise.all([
    import('./app/app.config'),
    import('./app/app'),
  ]);
  await bootstrapApplication(App, appConfig);
}

start().catch((err) => console.error(err));
