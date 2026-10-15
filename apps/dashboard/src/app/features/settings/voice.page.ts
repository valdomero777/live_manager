import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '../../components/shared/page-header';
import { ModerationForm } from './moderation-form';
import { TtsForm } from './tts-form';

/** Quick access to the voice (TTS) and moderation settings, without going through Ajustes. */
@Component({
  selector: 'app-voice-page',
  imports: [PageHeader, TtsForm, ModerationForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page pb-24' },
  template: `
    <app-page-header
      title="Voz (TTS)"
      description="Motor, idioma, voz, a quién leer y filtros del texto que se lee en voz alta."
    />
    <div class="grid gap-6">
      <app-tts-form />
      <app-moderation-form />
    </div>
  `,
})
export class VoicePage {}
