import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CookieJar } from '../src/hydroquebec/cookieJar.js';

function fakeHeaders(setCookieValues) {
  return { getSetCookie: () => setCookieValues };
}

test('CookieJar: cookies apply to the exact host that set them', () => {
  const jar = new CookieJar();
  jar.extract('https://connexion.solutions.hydroquebec.com/foo', fakeHeaders(['csrf=abc; Path=/']));
  assert.equal(jar.header('https://connexion.solutions.hydroquebec.com/bar'), 'csrf=abc');
  assert.equal(jar.header('https://services-cl.solutions.hydroquebec.com/bar'), undefined);
});

test('CookieJar: a Domain-scoped cookie applies to matching subdomains', () => {
  const jar = new CookieJar();
  jar.extract('https://session.hydroquebec.com/x', fakeHeaders(['sid=xyz; Domain=.hydroquebec.com; Path=/']));
  assert.equal(jar.header('https://foo.hydroquebec.com/y'), 'sid=xyz');
  assert.equal(jar.header('https://hydroquebec.com/y'), 'sid=xyz');
  assert.equal(jar.header('https://otherdomain.com/y'), undefined);
});

test('CookieJar: clear() removes every cookie', () => {
  const jar = new CookieJar();
  jar.extract('https://a.example.com', fakeHeaders(['k=v']));
  jar.clear();
  assert.equal(jar.header('https://a.example.com'), undefined);
});

test('CookieJar: later Set-Cookie for the same name overwrites the value', () => {
  const jar = new CookieJar();
  jar.extract('https://a.example.com', fakeHeaders(['k=v1']));
  jar.extract('https://a.example.com', fakeHeaders(['k=v2']));
  assert.equal(jar.header('https://a.example.com'), 'k=v2');
});
