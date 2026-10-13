// -----------------------------------------------------------------------------
// The dashboard widgets: "SNCB departures" and "SNCB disturbances". Pure.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { T } from './i18n.js';

const pick = (text, language) => (typeof text === 'string' ? text : (text[language] ?? text.en));

function clock(iso, language) {
  try {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : `${language}-BE`, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Brussels',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function departuresWidget({ stationName, reading, language = 'fr' }) {
  const components = [{ type: 'text', text: stationName ?? 'SNCB', variant: 'heading' }];
  if (!reading) {
    components.push({ type: 'text', text: T.widget.notLoaded, variant: 'body' });
    return { ttl_seconds: 30, components };
  }
  if (reading.departures.length === 0) {
    components.push({ type: 'text', text: T.widget.noDeparture, variant: 'body' });
  } else {
    const items = reading.departures.slice(0, 8).map((d) => {
      const when = clock(d.scheduledAt, language);
      let value;
      let color = WIDGET_COLORS.SUCCESS;
      if (d.canceled) {
        value = pick({ en: `${when} · canceled`, fr: `${when} · supprimé` }, language);
        color = WIDGET_COLORS.DANGER;
      } else {
        const parts = [when, pick(T.widget.inMinutes(d.minutes), language)];
        if (d.delayMinutes > 0) {
          parts.push(`+${d.delayMinutes}`);
          color = WIDGET_COLORS.WARNING;
        }
        if (d.platform) {
          parts.push(
            `${pick({ en: 'pl.', fr: 'voie' }, language)} ${d.platform}${d.platformChanged ? ' !' : ''}`,
          );
          if (d.platformChanged && color === WIDGET_COLORS.SUCCESS) {
            color = WIDGET_COLORS.WARNING;
          }
        }
        value = parts.join(' · ');
      }
      return {
        label: `${d.train} → ${d.destination}`.slice(0, 40),
        value: value.slice(0, 40),
        icon: 'navigation',
        color,
      };
    });
    components.push({ type: 'status', items });
  }
  components.push({
    type: 'text',
    text: `${pick(T.widget.readAt, language)} ${clock(reading.readAt, language)}`,
    variant: 'caption',
  });
  return { ttl_seconds: 60, components };
}

export function disturbancesWidget({ reading, language = 'fr' }) {
  const components = [{ type: 'text', text: T.widget.disturbances, variant: 'heading' }];
  if (!reading) {
    components.push({ type: 'text', text: T.widget.notLoaded, variant: 'body' });
    return { ttl_seconds: 60, components };
  }
  const items = [...reading.items]
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'disturbance' ? -1 : 1))
    .slice(0, 8)
    .map((d) => ({
      title: d.title.slice(0, 60),
      subtitle: pick(d.type === 'planned' ? T.widget.planned : T.widget.disturbance, language),
      date: d.publishedAt ?? undefined,
      badge: {
        text:
          d.type === 'planned'
            ? pick({ en: 'Works', fr: 'Travaux' }, language)
            : pick({ en: 'Live', fr: 'En cours' }, language),
        color: d.type === 'planned' ? WIDGET_COLORS.INFO : WIDGET_COLORS.DANGER,
      },
      description: d.description.slice(0, 2000) || undefined,
      links: d.link
        ? [{ url: d.link, label: pick({ en: 'Details', fr: 'Détails' }, language) }]
        : undefined,
    }));
  if (items.length === 0) {
    components.push({ type: 'text', text: T.widget.none, variant: 'body' });
  } else {
    components.push({ type: 'card-list', display: 'list', items });
  }
  return { ttl_seconds: 300, components };
}
