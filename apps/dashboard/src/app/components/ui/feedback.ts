import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  input,
  linkedSignal,
} from '@angular/core';
import { LucideLoaderCircle } from '@lucide/angular';
import { cn } from '../../lib/utils';

/** Placeholder with the shape of the content that is loading. */
@Directive({
  selector: '[uiSkeleton]',
  host: { '[class]': 'classes()', 'aria-hidden': 'true', 'data-slot': 'skeleton' },
})
export class UiSkeleton {
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn('animate-shimmer rounded-md bg-surface-active', this.userClass()),
  );
}

/** Spinner. Decorative by default (inside a button that says what is happening). */
@Component({
  selector: 'ui-spinner',
  imports: [LucideLoaderCircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex',
    '[attr.role]': "label() ? 'status' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
  },
  template: `<svg lucideLoaderCircle [class]="classes()" />`,
})
export class UiSpinner {
  readonly label = input<string>('');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() => cn('size-4 animate-spin', this.userClass()));
}

@Component({
  selector: 'ui-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'clamped()',
    '[class]': 'classes()',
    'data-slot': 'progress',
  },
  template: `
    <div
      [class]="indicator()"
      class="h-full w-full flex-1 origin-left transition-transform duration-500 ease-out"
      [style.transform]="'scaleX(' + clamped() / 100 + ')'"
    ></div>
  `,
})
export class UiProgress {
  /** 0–100 */
  readonly value = input(0);
  readonly indicatorClass = input('bg-primary');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly clamped = computed(() => Math.max(0, Math.min(100, Math.round(this.value()))));
  protected readonly indicator = computed(() => this.indicatorClass());
  protected readonly classes = computed(() =>
    cn(
      'relative block h-2 w-full overflow-hidden rounded-full bg-surface-active',
      this.userClass(),
    ),
  );
}

@Directive({
  selector: '[uiSeparator]',
  host: { '[class]': 'classes()', role: 'none', 'data-slot': 'separator' },
})
export class UiSeparator {
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly userClass = input<string>('', { alias: 'class' });
  protected readonly classes = computed(() =>
    cn(
      'shrink-0 bg-border',
      this.orientation() === 'horizontal' ? 'h-px w-full' : 'h-full w-px self-stretch',
      this.userClass(),
    ),
  );
}

const AVATAR_TONES = [
  'bg-live-soft text-live-text',
  'bg-gift-soft text-gift-text',
  'bg-automation-soft text-automation-text',
  'bg-sound-soft text-sound-text',
  'bg-analytics-soft text-analytics-text',
  'bg-follow-soft text-follow-text',
];

/** Viewer avatar: the TikTok picture when there is one, otherwise initials with a stable tone. */
@Component({
  selector: 'ui-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', 'aria-hidden': 'true', 'data-slot': 'avatar' },
  template: `
    @if (src() && !broken()) {
      <img
        [src]="src()"
        alt=""
        class="size-full rounded-full object-cover"
        loading="lazy"
        referrerpolicy="no-referrer"
        (error)="broken.set(true)"
      />
    } @else {
      {{ initials() }}
    }
  `,
})
export class UiAvatar {
  readonly name = input('');
  readonly src = input<string | undefined>(undefined);
  readonly userClass = input<string>('', { alias: 'class' });
  /** Resets when the picture changes (rows are recycled by virtual scroll). */
  protected readonly broken = linkedSignal({ source: this.src, computation: () => false });

  protected readonly initials = computed(() => {
    const clean = this.name().replace(/^@/, '').trim();
    return (clean.slice(0, 2) || '?').toUpperCase();
  });
  protected readonly classes = computed(() => {
    let hash = 0;
    for (const ch of this.name()) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    const tone = AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
    return cn(
      'inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[0.6875rem] font-semibold select-none',
      tone,
      this.userClass(),
    );
  });
}
