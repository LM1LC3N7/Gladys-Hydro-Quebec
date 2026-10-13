import { test } from 'node:test';
import assert from 'node:assert/strict';
import { departureLine, departuresOf, disturbancesReading, stationReading } from '../src/model.js';
import { findStation, fold, nearestStations, stationOf } from '../src/stations.js';
import { parseStationEntry } from '../src/config.js';
import { FIXTURE_NOW, fixture, liveboard } from './helpers/fakeFetch.js';

test('a liveboard becomes departures with countdowns', () => {
  const reading = stationReading(liveboard(), { now: FIXTURE_NOW, max: 3 });
  assert.equal(reading.stationName, 'Namur');
  assert.equal(reading.departures.length, 3);
  const [first] = reading.departures;
  assert.equal(first.train, 'L 5765');
  assert.equal(first.destination, 'Ciney');
  assert.equal(first.platform, '8');
  assert.equal(first.minutes, 1, '59 seconds away');
  assert.equal(first.delayMinutes, 0);
  assert.equal(first.canceled, false);
  assert.equal(reading.delayed, 0);
  assert.equal(reading.canceled, 0);
});

test('left and past trains are dropped, delays and cancellations counted, filters applied', () => {
  const board = liveboard({
    edit: (d) => {
      if (d.station === 'Ciney') {
        d.left = '1';
      }
      if (d.station === 'Dinant') {
        d.delay = '240';
      }
      if (d.station === 'Tournai') {
        d.canceled = '1';
      }
    },
  });
  const reading = stationReading(board, { now: FIXTURE_NOW, max: 5 });
  assert.ok(!reading.departures.some((d) => d.destination === 'Ciney'));
  assert.equal(reading.delayed, 1);
  assert.equal(reading.canceled, 1);
  const dinant = reading.departures.find((d) => d.destination === 'Dinant');
  assert.equal(dinant.delayMinutes, 4);
  assert.equal(departureLine(dinant, 'fr'), 'IC 2514 → Dinant · voie 6 (voie modifiée) · +4 min');
  assert.equal(
    departureLine(
      reading.departures.find((d) => d.canceled),
      'en',
    ),
    'IC 2436 → Tournai · canceled',
  );
  const filtered = departuresOf(board, { now: FIXTURE_NOW, filters: ['liège', 'dinant'], max: 5 });
  assert.deepEqual(
    filtered.map((d) => d.destination),
    ['Liège-Guillemins', 'Dinant'],
  );
  const past = departuresOf(liveboard({ shiftSeconds: -3600 }), { now: FIXTURE_NOW });
  assert.equal(past.length, 0);
});

test('disturbances', () => {
  const reading = disturbancesReading(fixture('disturbances.json').disturbance, FIXTURE_NOW);
  assert.equal(reading.items.length, 6);
  assert.equal(reading.disturbances, 3);
  assert.equal(reading.planned, 3);
  assert.match(reading.items[0].title, /Retards/);
  assert.match(reading.items[0].link, /^https:/);
  assert.ok(reading.items[0].publishedAt);
});

test('the station directory', () => {
  const stations = fixture('stations.json').station.map(stationOf);
  assert.equal(fold('Liège-Guillemins'), 'liege guillemins');
  assert.equal(findStation(stations, 'namur').name, 'Namur');
  assert.equal(findStation(stations, 'Brussel-Centraal').name, 'Bruxelles-Central');
  assert.equal(findStation(stations, 'BE.NMBS.008863008').name, 'Namur');
  assert.equal(findStation(stations, '008863008').name, 'Namur');
  assert.equal(findStation(stations, 'Bruxelles').name, 'Bruxelles-Midi', 'shortest containing');
  assert.equal(findStation(stations, 'Nowhere'), undefined);
  const near = nearestStations(stations, { latitude: 50.46, longitude: 4.87 }, 2);
  assert.deepEqual(
    near.map((s) => s.name),
    ['Namur', 'Dinant'],
  );
  assert.ok(near[0].distanceKm < 2);
  assert.deepEqual(nearestStations(stations, { latitude: null, longitude: null }, 2), []);
});

test('the stations field grammar', () => {
  assert.deepEqual(parseStationEntry(' Namur '), { query: 'Namur', filters: [], name: undefined });
  assert.deepEqual(parseStationEntry('Bruxelles-Central@Namur|Dinant:Train du retour'), {
    query: 'Bruxelles-Central',
    filters: ['namur', 'dinant'],
    name: 'Train du retour',
  });
  assert.equal(parseStationEntry(''), undefined);
});
