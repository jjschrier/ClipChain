const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

setGlobalOptions({ region: 'us-central1', timeoutSeconds: 540, memory: '512MiB' });

const MINT_AUTH_SECRET = defineSecret('MINT_AUTH_SECRET');
const RPC_URL = defineSecret('RPC_URL');
const PLATFORM_TREASURY = defineSecret('PLATFORM_TREASURY');
const PLATFORM_FEE_BPS = defineSecret('PLATFORM_FEE_BPS');
const TOKEN_DECIMALS = defineSecret('TOKEN_DECIMALS');

exports.settleWatchtime = onSchedule(
  { schedule: 'every 5 minutes', secrets: [MINT_AUTH_SECRET, RPC_URL, PLATFORM_TREASURY, PLATFORM_FEE_BPS, TOKEN_DECIMALS] },
  async () => {
    const { runSettlement } = require('./settle');
    await runSettlement({
      mintAuthSecret: MINT_AUTH_SECRET.value(),
      rpcUrl: RPC_URL.value(),
      platformTreasury: PLATFORM_TREASURY.value(),
      platformFeeBps: PLATFORM_FEE_BPS.value(),
      tokenDecimals: TOKEN_DECIMALS.value(),
    });
  }
);

exports.claimNow = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [MINT_AUTH_SECRET, RPC_URL, PLATFORM_TREASURY, PLATFORM_FEE_BPS, TOKEN_DECIMALS],
    cors: true,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    const authHeader = req.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      res.status(401).json({ error: 'Missing auth token' });
      return;
    }
    try {
      await admin.auth().verifyIdToken(match[1]);
    } catch (error) {
      res.status(401).json({ error: 'Invalid auth token' });
      return;
    }

    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        res.status(400).json({ error: 'Invalid JSON payload' });
        return;
      }
    }

    try {
      const { runInstantClaim } = require('./settle');
      const result = await runInstantClaim({
        payload,
        mintAuthSecret: MINT_AUTH_SECRET.value(),
        rpcUrl: RPC_URL.value(),
        platformTreasury: PLATFORM_TREASURY.value(),
        platformFeeBps: PLATFORM_FEE_BPS.value(),
        tokenDecimals: TOKEN_DECIMALS.value(),
      });
      if (!result?.ok) {
        res.status(400).json(result || { error: 'Claim failed' });
        return;
      }
      res.status(200).json({ status: result.status, txid: result.txid, fee: result.fee });
    } catch (error) {
      console.error('claimNow failed:', error);
      res.status(500).json({ error: error?.message || 'Claim failed' });
    }
  }
);
