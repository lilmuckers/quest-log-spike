// Offline check: a VAPID pair made with WebCrypto (as the app will) plus a browser-shaped
// subscription go through web-push's real encryption and signing. Only the HTTP send is stubbed.
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
import webpush from 'web-push';
import { sendAll, SUBJECT, TTL } from './send.mjs';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = b64url(await crypto.subtle.exportKey('raw', vapid.publicKey));
const privateKey = (await crypto.subtle.exportKey('jwk', vapid.privateKey)).d;

// What PushSubscription.toJSON() gives: an ECDH P-256 public key and 16 random auth bytes.
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fake',
  keys: { p256dh: b64url(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
};
const devices = [
  { id: 'a', label: 'A', subscription },
  { id: 'gone', label: 'Gone', subscription: { ...subscription, endpoint: 'https://web.push.apple.com/fake' } },
];

const seen = [];
const send = async (sub, payload, options) => {
  const req = webpush.generateRequestDetails(sub, payload, options); // real encryption + VAPID JWT
  seen.push(req);
  if (sub.endpoint.includes('apple')) throw Object.assign(new Error('Received unexpected response code'), { statusCode: 410, body: 'Unregistered' });
  return { statusCode: 201 };
};

const out = await sendAll({ devices, publicKey, privateKey, title: 't', body: 'b', urgency: 'normal', send });
assert.equal(out.sent, 1);
assert.deepEqual(out.expiredDevices, ['gone']);
const [req] = seen;
assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
assert.equal(req.headers.TTL, TTL);
assert.equal(req.headers.Urgency, 'normal');
assert.match(req.headers.Authorization, new RegExp(`^vapid t=.+, k=${publicKey}$`));
const jwt = JSON.parse(Buffer.from(req.headers.Authorization.split('t=')[1].split('.')[1], 'base64url'));
assert.equal(jwt.aud, 'https://fcm.googleapis.com');
assert.equal(jwt.sub, SUBJECT);
assert.ok(req.body.length > 100);
console.log('✓ WebCrypto VAPID keys work with web-push (aes128gcm, TTL, urgency, JWT aud/sub); 410 → expiredDevices');
