import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DateTime } from 'luxon';
import { HQ_ZONE, buildDpcPeaks, summarizeCpc, summarizeDpc } from '../src/hydroquebec/peaks.js';

test('buildDpcPeaks: every open-data event becomes a critical peak, sorted by start date', () => {
  const openData = [
    { dateDebut: '2026-01-10T16:00:00-05:00', dateFin: '2026-01-10T20:00:00-05:00' },
    { dateDebut: '2026-01-05T06:00:00-05:00', dateFin: '2026-01-05T10:00:00-05:00' },
  ];
  const peaks = buildDpcPeaks(openData);
  assert.equal(peaks.length, 2);
  assert.ok(peaks[0].startDate < peaks[1].startDate);
  assert.ok(peaks.every((p) => p.isCritical === true));
});

test('summarizeDpc: reports "peak" while now falls inside a peak window, "normal" otherwise', () => {
  const openData = [{ dateDebut: '2026-01-10T16:00:00-05:00', dateFin: '2026-01-10T20:00:00-05:00' }];

  const during = DateTime.fromISO('2026-01-10T17:00:00', { zone: HQ_ZONE });
  const before = DateTime.fromISO('2026-01-10T12:00:00', { zone: HQ_ZONE });

  const duringSummary = summarizeDpc(openData, during);
  assert.equal(duringSummary.currentState, 'peak');
  assert.equal(duringSummary.peakInProgress, true);

  const beforeSummary = summarizeDpc(openData, before);
  assert.equal(beforeSummary.currentState, 'normal');
  assert.equal(beforeSummary.peakInProgress, false);
  // Pre-heat is 180 minutes before the peak start (16:00 -> pre-heat starts at 13:00).
  assert.equal(beforeSummary.preheatInProgress, false);

  const duringPreheat = DateTime.fromISO('2026-01-10T14:00:00', { zone: HQ_ZONE });
  assert.equal(summarizeDpc(openData, duringPreheat).preheatInProgress, true);
});

test('summarizeCpc: sums confirmed critical peaks and reports the right current_state', () => {
  const rawCpcData = {
    montantEffaceProjete: '42.50',
    periodesEffacementsHivers: [
      {
        dateDebutPeriodeHiver: '2026-01-01T05:00:00.000+0000',
        dateFinPeriodeHiver: '2026-01-05T04:00:00.000+0000',
        periodesEffacementHiver: [
          {
            dateEffacement: '2026-01-03T00:00:00.000+0000',
            heureDebut: '16:00:00',
            heureFin: '20:00:00',
            consoReelle: 5,
            consoReference: 8,
            consoEffacee: 3,
            montantEffacee: 6.75,
            codeConso: 'X',
            indFacture: false,
          },
        ],
      },
    ],
  };

  const duringCriticalPeak = DateTime.fromISO('2026-01-03T17:00:00', { zone: HQ_ZONE });
  const summary = summarizeCpc(rawCpcData, [], duringCriticalPeak);

  assert.equal(summary.cumulatedCredit, 6.75);
  assert.equal(summary.projectedCumulatedCredit, 42.5);
  assert.equal(summary.currentState, 'critical_peak');
  assert.equal(summary.currentPeakIsCritical, true);

  // A non-critical evening peak the next day should just be "peak".
  const nextDayPeak = DateTime.fromISO('2026-01-04T17:00:00', { zone: HQ_ZONE });
  assert.equal(summarizeCpc(rawCpcData, [], nextDayPeak).currentState, 'peak');

  // Outside any window: normal.
  const normalTime = DateTime.fromISO('2026-01-03T12:00:00', { zone: HQ_ZONE });
  assert.equal(summarizeCpc(rawCpcData, [], normalTime).currentState, 'normal');
});
