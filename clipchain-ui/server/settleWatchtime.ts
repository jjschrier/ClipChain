/**
 * Batch watch-time settlement script
 * - Reads unsettled watch_logs
 * - Aggregates by viewer + creator mint
 * - Mints rewards to viewer and fee to platform treasury
 * - Settles pending claim_requests
 *
 * Requirements:
 *  - Set env vars: SERVICE_ACCOUNT (base64 json), RPC_URL, PLATFORM_TREASURY, PLATFORM_FEE_BPS
 *  - Mint authorities must be controlled by this signer/program
 *  - Install firebase-admin if you plan to run this: yarn add firebase-admin
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env' });
import { Connection, Keypair, PublicKey, Transaction, clusterApiUrl, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Accept either base64 SERVICE_ACCOUNT or a SERVICE_ACCOUNT_FILE path for convenience
let SERVICE_ACCOUNT: any = null;
if (process.env.SERVICE_ACCOUNT) {
  SERVICE_ACCOUNT = JSON.parse(Buffer.from(process.env.SERVICE_ACCOUNT, 'base64').toString('utf8'));
} else if (process.env.SERVICE_ACCOUNT_FILE) {
  const raw = fs.readFileSync(process.env.SERVICE_ACCOUNT_FILE, 'utf8');
  SERVICE_ACCOUNT = JSON.parse(raw);
}
const RPC_URL = process.env.RPC_URL || clusterApiUrl('mainnet-beta');
const PLATFORM_TREASURY = process.env.PLATFORM_TREASURY || '';
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS || 500); // 500 = 5%
const SETTLE_LIMIT = Number(process.env.SETTLE_LIMIT || 200);
const CLAIM_LIMIT = Number(process.env.CLAIM_LIMIT || 200);
const DEFAULT_RATE = Number(process.env.DEFAULT_REWARD_RATE || 0.05); // tokens per second
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 9); // match your mint decimals
const TREASURY_PUBKEY = (PLATFORM_TREASURY ? (()=>{ try { return new PublicKey(PLATFORM_TREASURY.trim()); } catch { return null; } })() : null);
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const maybePubkey = (s?: string | null) => {
  if (!s) return null;
  const cleaned = s.trim().replace(/\s+/g, '');
  try {
    return new PublicKey(cleaned);
  } catch {
    return null;
  }
};

type CreatorConfig = {
  rewardRatePerSecond?: number;
  dailyMintCap?: number;
  tier?: 'basic' | 'pro' | 'boosted';
};

type ViewerProfile = {
  verified?: boolean;
  engaged?: boolean;
  trusted?: boolean;
  staked?: boolean;
  botScore?: number;
};

if (!SERVICE_ACCOUNT) throw new Error('Missing SERVICE_ACCOUNT env (base64-encoded JSON) or SERVICE_ACCOUNT_FILE path');
if (!TREASURY_PUBKEY) throw new Error('Missing or invalid PLATFORM_TREASURY env');

initializeApp({
  credential: cert(SERVICE_ACCOUNT as any),
});
const firestore = getFirestore();
const connection = new Connection(RPC_URL, 'confirmed');

const getAssociatedTokenAddress = async (mint: PublicKey, owner: PublicKey) => {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
};

const createAssociatedTokenAccountInstruction = (
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey
) =>
  new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });

const createMintToInstruction = (
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint
) => {
  const data = Buffer.alloc(9);
  data.writeUInt8(7, 0); // MintTo instruction
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
};

// helper to mint rewards to viewer + fee to treasury
async function mintRewards(mint: PublicKey, viewer: PublicKey, treasury: PublicKey, reward: bigint, feeBps: number, mintAuthority: Keypair) {
  const viewerAta = await getAssociatedTokenAddress(mint, viewer);
  const treasuryAta = await getAssociatedTokenAddress(mint, treasury);
  const fee = reward * BigInt(feeBps) / BigInt(10_000);

  const instructions = [];
  // Create ATAs if they do not exist to avoid debit-without-credit errors
  const viewerInfo = await connection.getAccountInfo(viewerAta);
  if (!viewerInfo) {
    instructions.push(createAssociatedTokenAccountInstruction(mintAuthority.publicKey, viewerAta, viewer, mint));
  }
  const treasuryInfo = await connection.getAccountInfo(treasuryAta);
  if (!treasuryInfo) {
    instructions.push(createAssociatedTokenAccountInstruction(mintAuthority.publicKey, treasuryAta, treasury, mint));
  }

  instructions.push(
    createMintToInstruction(mint, viewerAta, mintAuthority.publicKey, reward),
    createMintToInstruction(mint, treasuryAta, mintAuthority.publicKey, fee),
  );

  const tx = new Transaction().add(...instructions);
  tx.feePayer = mintAuthority.publicKey;
  const sig = await connection.sendTransaction(tx, [mintAuthority]);
  await connection.confirmTransaction(sig, 'confirmed');
  return { sig, fee };
}

async function settleWatchLogs() {
  // fetch unsettled logs
  const snap = await firestore.collection('watch_logs').where('settled', '==', false).orderBy('createdAt').limit(SETTLE_LIMIT).get();
  if (snap.empty) {
    console.log('No unsettled watch logs');
    return;
  }

  // group by viewer + mint
  const groups = new Map<string, { viewer: string; mint?: string; seconds: number; creator: string; docIds: string[] }>();
  snap.docs.forEach((d) => {
    const data = d.data() as any;
    const mintPk = maybePubkey(data.mint);
    const viewerPk = maybePubkey(data.viewer);
    if (!mintPk || !viewerPk) {
      // mark skipped due to invalid pubkey and continue
      d.ref.update({
        settled: true,
        skippedReason: 'invalid_pubkey',
        settledAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
      return;
    }
    const key = `${data.viewer}|${data.mint}`;
    const item = groups.get(key) || { viewer: data.viewer, mint: data.mint, seconds: 0, creator: data.creator, docIds: [] };
    item.seconds += data.seconds || 0;
    item.docIds.push(d.id);
    groups.set(key, item);
  });

  for (const [, g] of groups) {
    try {
      // Pull creator config for rate and caps
      const creatorSnap = await firestore.collection('creators').doc(g.creator).get();
      const creatorCfg = (creatorSnap.exists ? (creatorSnap.data() as CreatorConfig) : {}) || {};
      let rate = typeof creatorCfg.rewardRatePerSecond === 'number' ? creatorCfg.rewardRatePerSecond : DEFAULT_RATE;
      const tierCap = TIER_RATE_MAX[creatorCfg.tier || 'basic'];
      if (tierCap) rate = Math.min(rate, tierCap);

      // Pull viewer profile for tier
      const viewerProfileSnap = await firestore.collection('viewer_profiles').doc(g.viewer).get();
      const viewer = (viewerProfileSnap.exists ? (viewerProfileSnap.data() as ViewerProfile) : {}) || {};

      // Determine daily cap by tier/flags
      const viewerCapSeconds = determineDailyCapSeconds(viewer);

      // Creator daily mint cap (tokens) -> convert to seconds for this rate
      const creatorCapTokens = typeof creatorCfg.dailyMintCap === 'number' ? creatorCfg.dailyMintCap : undefined;
      const creatorCapSeconds = creatorCapTokens ? Math.floor((creatorCapTokens / rate)) : Number.MAX_SAFE_INTEGER;

      const cappedSeconds = Math.min(g.seconds, viewerCapSeconds, creatorCapSeconds);

      const rawReward = cappedSeconds * rate;
      const reward = BigInt(Math.floor(rawReward * 10 ** TOKEN_DECIMALS)); // honor mint decimals

      const mintPubkey = maybePubkey(g.mint);
      const viewerPubkey = maybePubkey(g.viewer);
      if (!mintPubkey || !viewerPubkey) {
        console.warn('Skipping watch_log group due to invalid pubkey', g);
        await Promise.all(
          g.docIds.map((id) =>
            firestore.collection('watch_logs').doc(id).update({
              settled: true,
              skippedReason: 'invalid_pubkey',
              settledAt: FieldValue.serverTimestamp(),
            })
          )
        );
        continue;
      }
      const treasuryPubkey = TREASURY_PUBKEY!;
      const mintAuthority = Keypair.fromSecretKey(Buffer.from(process.env.MINT_AUTH_SECRET!, 'base64'));

      const { sig, fee } = await mintRewards(mintPubkey, viewerPubkey, treasuryPubkey, reward, PLATFORM_FEE_BPS, mintAuthority);

      await firestore.runTransaction(async (txn) => {
        g.docIds.forEach((id) => txn.update(firestore.collection('watch_logs').doc(id), { settled: true, settledAt: FieldValue.serverTimestamp() }));
        txn.set(firestore.collection('watch_settlements').doc(), {
          viewer: g.viewer,
          creator: g.creator,
          mint: g.mint,
          seconds: g.seconds,
          settledSeconds: cappedSeconds,
          appliedRate: rate,
          reward: reward.toString(),
          fee: fee.toString(),
          txid: sig,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      console.log(`Settled viewer ${g.viewer} mint ${g.mint} seconds ${g.seconds} (capped ${cappedSeconds})`);
    } catch (e) {
      console.error('Settlement failed for', g, e);
    }
  }
}

async function settleClaimRequests() {
  // No orderBy to avoid composite index requirement
  const snap = await firestore.collection('claim_requests').where('status', '==', 'pending').limit(CLAIM_LIMIT).get();
  if (snap.empty) {
    console.log('No pending claim_requests');
    return;
  }

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as any;
    const { viewer, creator, mint, pendingReward } = data;
    if (!mint) {
      await docSnap.ref.update({ status: 'skipped_no_mint', updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    if (!viewer || typeof pendingReward !== 'number' || pendingReward <= 0) {
      await docSnap.ref.update({ status: 'skipped_no_amount', updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    try {
      const reward = BigInt(Math.floor(pendingReward * 10 ** TOKEN_DECIMALS));
      const mintPubkey = maybePubkey(mint);
      const viewerPubkey = maybePubkey(viewer);
      if (!mintPubkey || !viewerPubkey) {
        await docSnap.ref.update({ status: 'skipped_invalid_pubkey', updatedAt: FieldValue.serverTimestamp() });
        console.warn('Skipping claim due to invalid pubkey', docSnap.id);
        continue;
      }
      const treasuryPubkey = TREASURY_PUBKEY!;
      const mintAuthority = Keypair.fromSecretKey(Buffer.from(process.env.MINT_AUTH_SECRET!, 'base64'));

      const { sig, fee } = await mintRewards(mintPubkey, viewerPubkey, treasuryPubkey, reward, PLATFORM_FEE_BPS, mintAuthority);

      await firestore.runTransaction(async (txn) => {
        txn.update(docSnap.ref, {
          status: 'settled',
          txid: sig,
          fee: fee.toString(),
          settledAt: FieldValue.serverTimestamp(),
        });
        txn.set(firestore.collection('claim_settlements').doc(), {
          viewer,
          creator: creator || null,
          mint,
          reward: reward.toString(),
          fee: fee.toString(),
          txid: sig,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      console.log(`Settled claim_request ${docSnap.id} for viewer ${viewer} mint ${mint}`);
    } catch (e) {
      console.error('Claim settlement failed for', docSnap.id, e);
      await docSnap.ref.update({ status: 'error', error: String(e), updatedAt: FieldValue.serverTimestamp() });
    }
  }
}

async function main() {
  await settleWatchLogs();
  await settleClaimRequests();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

// ---- helpers ----
function determineDailyCapSeconds(viewer: ViewerProfile): number {
  // Default: guest/anon -> 60 min
  let cap = 60 * 60;
  if (viewer.verified || viewer.engaged) cap = 120 * 60; // verified
  if (viewer.engaged) cap = 240 * 60; // engaged
  if (viewer.trusted) cap = 360 * 60; // trusted
  if (viewer.staked) cap = 24 * 60 * 60; // effectively unlimited

  const botScore = viewer.botScore ?? 0;
  if (botScore > 20) cap = Math.min(cap, 30 * 60); // throttle heavy bot signals
  return cap;
}
const TIER_RATE_MAX: Record<string, number> = {
  basic: 1 / 60,       // ~1 token/min default (override as needed)
  pro: 2 / 60,         // 2 tokens/min
  boosted: 3 / 60,     // 3 tokens/min
};
