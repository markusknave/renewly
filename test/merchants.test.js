import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanDescriptor,
  merchantFromEmail,
  normalizeMerchant,
} from '../src/domain/merchants.js';

test('normalizes common bank descriptors', () => {
  assert.equal(normalizeMerchant('NFLX*NETFLIX.COM').key, 'netflix');
  assert.equal(normalizeMerchant('SPOTIFY USA').key, 'spotify');
  assert.equal(normalizeMerchant('AMZN PRIME*2A3B4C').key, 'amazon-prime');
  assert.equal(normalizeMerchant('PAYPAL *DISNEYPLUS').key, 'disney-plus');
  assert.equal(normalizeMerchant('GOOGLE *Google One').key, 'google-one');
  assert.equal(normalizeMerchant('APPLE.COM/BILL').key, 'icloud');
  assert.equal(normalizeMerchant('MICROSOFT 365').key, 'microsoft-365');
  assert.equal(normalizeMerchant('ADOBE CREATIVE CLOUD').key, 'adobe');
});

test('unknown merchants get a stable slug and readable name', () => {
  const merchant = normalizeMerchant('SQ *BLUE BOTTLE COFFEE #123');
  assert.equal(merchant.key, 'blue-bottle-coffee');
  assert.equal(merchant.name, 'Blue Bottle Coffee');
  assert.equal(merchant.known, false);
});

test('uses sender, subject, then domain to identify email merchants', () => {
  assert.equal(merchantFromEmail({ from: 'Netflix <info@netflix.com>' }).key, 'netflix');
  assert.equal(
    merchantFromEmail({ from: 'Amazon <auto-confirm@amazon.com>', subject: 'Your Kindle Unlimited receipt' }).key,
    'kindle-unlimited'
  );
  assert.equal(
    merchantFromEmail({ from: 'Amazon <auto-confirm@amazon.com>', subject: 'Your Amazon Prime membership' }).key,
    'amazon-prime'
  );
  assert.equal(
    merchantFromEmail({ from: 'Spotify <no-reply@spotify.com>', subject: 'Your receipt' }).key,
    'spotify'
  );
});

test('cleanDescriptor removes processor noise', () => {
  assert.equal(cleanDescriptor('PAYPAL *SPOTIFY').toUpperCase(), 'SPOTIFY');
  assert.equal(cleanDescriptor('SQ *BLUE BOTTLE COFFEE').toUpperCase(), 'BLUE BOTTLE COFFEE');
});
