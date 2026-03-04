const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const TOKEN_PROGRAM_ID_STR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ID_STR = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

let firestore = null;

const getDb = () => {
  if (!firestore) {
    if (!getApps().length) {
      initializeApp();
    }
    firestore = getFirestore();
  }
  return firestore;
};

const createSolanaHelpers = (web3) => {
  const tokenProgramId = new web3.PublicKey(TOKEN_PROGRAM_ID_STR);
  const associatedTokenProgramId = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID_STR);

  const maybePubkey = (value) => {
    if (!value) return null;
    const cleaned = value.trim().replace(/\s+/g, '');
    try {
      return new web3.PublicKey(cleaned);
    } catch {
      return null;
    }
  };

  const getAssociatedTokenAddress = (mint, owner) => {
    const [ata] = web3.PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
      associatedTokenProgramId
    );
    return ata;
  };

  const createAssociatedTokenAccountInstruction = (payer, ata, owner, mint) =>
    new web3.TransactionInstruction({
      programId: associatedTokenProgramId,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.alloc(0),
    });

  const createMintToInstruction = (mint, destination, authority, amount) => {
    const data = Buffer.alloc(9);
    data.writeUInt8(7, 0);
    data.writeBigUInt64LE(amount, 1);
    return new web3.TransactionInstruction({
      programId: tokenProgramId,
      keys: [
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: false },
      ],
      data,
    });
  };

  return {
    maybePubkey,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
  };
};

const getRuntimeConfig = (defaultRpcUrl, maybePubkey, overrides = {}) => {
  const rpcUrl = overrides.rpcUrl || process.env.RPC_URL || defaultRpcUrl;
  const platformTreasury = (overrides.platformTreasury || process.env.PLATFORM_TREASURY || '').trim();
  const feeBps = Number(overrides.platformFeeBps || process.env.PLATFORM_FEE_BPS || 500);
  const settleLimit = Number(process.env.SETTLE_LIMIT || 200);
  const claimLimit = Number(process.env.CLAIM_LIMIT || 200);
  const defaultRate = Number(process.env.DEFAULT_REWARD_RATE || 0.05);
  const tokenDecimals = Number(overrides.tokenDecimals || process.env.TOKEN_DECIMALS || 9);
  return {
    rpcUrl,
    platformTreasury,
    feeBps,
    settleLimit,
    claimLimit,
    defaultRate,
    tokenDecimals,
    treasuryPubkey: platformTreasury ? maybePubkey(platformTreasury) : null,
  };
};

const parseClaimMessage = (message) => {
  if (!message) return { error: 'missing_message' };
  const lines = String(message).split('\n');
  const header = lines.shift()?.trim();
  if (header !== 'ClipChain Claim v1') return { error: 'invalid_header' };
  const fields = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    fields[key] = value;
  }
  return { fields };
};

const verifyClaimSignature = (data, web3, helpers) => {
  if (!data?.signature || !data?.message) {
    return { ok: false, reason: 'missing_signature' };
  }
  if (data.signatureType && data.signatureType !== 'message') {
    return { ok: false, reason: 'unsupported_signature_type' };
  }
  const parsed = parseClaimMessage(data.message);
  if (parsed.error) return { ok: false, reason: parsed.error };
  const fields = parsed.fields || {};

  const viewer = fields.viewer || data.viewer;
  if (!viewer) return { ok: false, reason: 'missing_viewer' };
  if (data.viewer && fields.viewer && data.viewer !== fields.viewer) {
    return { ok: false, reason: 'viewer_mismatch' };
  }
  if (data.creator && fields.creator && data.creator !== fields.creator) {
    return { ok: false, reason: 'creator_mismatch' };
  }
  if (data.videoId && fields.videoId && data.videoId !== fields.videoId) {
    return { ok: false, reason: 'video_mismatch' };
  }
  if (data.mint && fields.mint && data.mint !== fields.mint) {
    return { ok: false, reason: 'mint_mismatch' };
  }
  if (data.nonce && fields.nonce && data.nonce !== fields.nonce) {
    return { ok: false, reason: 'nonce_mismatch' };
  }

  const amount = Number(fields.amount);
  if (!Number.isFinite(amount)) return { ok: false, reason: 'invalid_amount' };
  const pending = typeof data.pendingReward === 'number' ? data.pendingReward : Number(data.pendingReward);
  if (!Number.isFinite(pending)) return { ok: false, reason: 'invalid_pending_reward' };
  const roundedAmount = Number(amount.toFixed(2));
  const roundedPending = Number(pending.toFixed(2));
  if (roundedAmount !== roundedPending) return { ok: false, reason: 'amount_mismatch' };

  const viewerPubkey = helpers.maybePubkey(viewer);
  if (!viewerPubkey) return { ok: false, reason: 'invalid_viewer_pubkey' };

  const signatureBytes = Buffer.from(String(data.signature), 'base64');
  if (signatureBytes.length !== 64) return { ok: false, reason: 'invalid_signature_length' };
  const messageBytes = Buffer.from(String(data.message), 'utf8');

  const crypto = require('crypto');
  const publicKeyBytes = Buffer.from(viewerPubkey.toBytes());
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const publicKeyDer = Buffer.concat([spkiPrefix, publicKeyBytes]);
  const keyObject = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
  const ok = crypto.verify(null, messageBytes, keyObject, signatureBytes);
  if (!ok) return { ok: false, reason: 'signature_verify_failed' };

  return { ok: true };
};

async function mintRewards(connection, web3, helpers, mint, viewer, treasury, reward, feeBps, mintAuthority) {
  const viewerAta = helpers.getAssociatedTokenAddress(mint, viewer);
  const treasuryAta = helpers.getAssociatedTokenAddress(mint, treasury);
  const fee = reward * BigInt(feeBps) / BigInt(10_000);

  const instructions = [];
  const viewerInfo = await connection.getAccountInfo(viewerAta);
  if (!viewerInfo) {
    instructions.push(helpers.createAssociatedTokenAccountInstruction(mintAuthority.publicKey, viewerAta, viewer, mint));
  }
  const treasuryInfo = await connection.getAccountInfo(treasuryAta);
  if (!treasuryInfo) {
    instructions.push(helpers.createAssociatedTokenAccountInstruction(mintAuthority.publicKey, treasuryAta, treasury, mint));
  }

  instructions.push(
    helpers.createMintToInstruction(mint, viewerAta, mintAuthority.publicKey, reward),
    helpers.createMintToInstruction(mint, treasuryAta, mintAuthority.publicKey, fee)
  );

  const tx = new web3.Transaction().add(...instructions);
  tx.feePayer = mintAuthority.publicKey;
  const sig = await connection.sendTransaction(tx, [mintAuthority]);
  await connection.confirmTransaction(sig, 'confirmed');
  return { sig, fee };
}

async function settleWatchLogs(db, connection, cfg, web3, helpers, mintAuthority) {
  const snap = await db.collection('watch_logs').where('settled', '==', false).orderBy('createdAt').limit(cfg.settleLimit).get();
  if (snap.empty) {
    console.log('No unsettled watch logs');
    return;
  }

  const groups = new Map();
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const mintPk = helpers.maybePubkey(data.mint);
    const viewerPk = helpers.maybePubkey(data.viewer);
    if (!mintPk || !viewerPk) {
      docSnap.ref.update({
        settled: true,
        skippedReason: 'invalid_pubkey',
        settledAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
      return;
    }
    const key = `${data.viewer}|${data.mint}`;
    const item = groups.get(key) || { viewer: data.viewer, mint: data.mint, seconds: 0, creator: data.creator, docIds: [] };
    item.seconds += data.seconds || 0;
    item.docIds.push(docSnap.id);
    groups.set(key, item);
  });

  for (const [, group] of groups) {
    try {
      const creatorSnap = await db.collection('creators').doc(group.creator).get();
      const creatorCfg = creatorSnap.exists ? creatorSnap.data() : {};
      let rate = typeof creatorCfg.rewardRatePerSecond === 'number' ? creatorCfg.rewardRatePerSecond : cfg.defaultRate;
      const tierCap = TIER_RATE_MAX[creatorCfg.tier || 'basic'];
      if (tierCap) rate = Math.min(rate, tierCap);

      const viewerProfileSnap = await db.collection('viewer_profiles').doc(group.viewer).get();
      const viewerProfile = viewerProfileSnap.exists ? viewerProfileSnap.data() : {};
      const viewerCapSeconds = determineDailyCapSeconds(viewerProfile);

      const creatorCapTokens = typeof creatorCfg.dailyMintCap === 'number' ? creatorCfg.dailyMintCap : undefined;
      const creatorCapSeconds = creatorCapTokens ? Math.floor(creatorCapTokens / rate) : Number.MAX_SAFE_INTEGER;

      const cappedSeconds = Math.min(group.seconds, viewerCapSeconds, creatorCapSeconds);
      const rawReward = cappedSeconds * rate;
      const reward = BigInt(Math.floor(rawReward * 10 ** cfg.tokenDecimals));

      const mintPubkey = helpers.maybePubkey(group.mint);
      const viewerPubkey = helpers.maybePubkey(group.viewer);
      if (!mintPubkey || !viewerPubkey) {
        await Promise.all(
          group.docIds.map((id) =>
            db.collection('watch_logs').doc(id).update({
              settled: true,
              skippedReason: 'invalid_pubkey',
              settledAt: FieldValue.serverTimestamp(),
            })
          )
        );
        continue;
      }

      const treasuryPubkey = cfg.treasuryPubkey;
      const { sig, fee } = await mintRewards(connection, web3, helpers, mintPubkey, viewerPubkey, treasuryPubkey, reward, cfg.feeBps, mintAuthority);

      await db.runTransaction(async (txn) => {
        group.docIds.forEach((id) => txn.update(db.collection('watch_logs').doc(id), { settled: true, settledAt: FieldValue.serverTimestamp() }));
        txn.set(db.collection('watch_settlements').doc(), {
          viewer: group.viewer,
          creator: group.creator,
          mint: group.mint,
          seconds: group.seconds,
          settledSeconds: cappedSeconds,
          appliedRate: rate,
          reward: reward.toString(),
          fee: fee.toString(),
          txid: sig,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      console.log(`Settled viewer ${group.viewer} mint ${group.mint} seconds ${group.seconds} (capped ${cappedSeconds})`);
    } catch (error) {
      console.error('Settlement failed for', group, error);
    }
  }
}

async function settleClaimRequests(db, connection, cfg, web3, helpers, mintAuthority) {
  const snap = await db.collection('claim_requests').where('status', '==', 'pending').limit(cfg.claimLimit).get();
  if (snap.empty) {
    console.log('No pending claim_requests');
    return;
  }

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const { viewer, creator, mint, pendingReward } = data;
    if (!mint) {
      await docSnap.ref.update({ status: 'skipped_no_mint', updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    if (!viewer || typeof pendingReward !== 'number' || pendingReward <= 0) {
      await docSnap.ref.update({ status: 'skipped_no_amount', updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    const verification = verifyClaimSignature(data, web3, helpers);
    if (!verification.ok) {
      await docSnap.ref.update({
        status: 'rejected_invalid_signature',
        error: verification.reason,
        updatedAt: FieldValue.serverTimestamp(),
      });
      continue;
    }
    try {
      const reward = BigInt(Math.floor(pendingReward * 10 ** cfg.tokenDecimals));
      const mintPubkey = helpers.maybePubkey(mint);
      const viewerPubkey = helpers.maybePubkey(viewer);
      if (!mintPubkey || !viewerPubkey) {
        await docSnap.ref.update({ status: 'skipped_invalid_pubkey', updatedAt: FieldValue.serverTimestamp() });
        continue;
      }

      const treasuryPubkey = cfg.treasuryPubkey;
      const { sig, fee } = await mintRewards(connection, web3, helpers, mintPubkey, viewerPubkey, treasuryPubkey, reward, cfg.feeBps, mintAuthority);

      await db.runTransaction(async (txn) => {
        txn.update(docSnap.ref, {
          status: 'settled',
          txid: sig,
          fee: fee.toString(),
          settledAt: FieldValue.serverTimestamp(),
        });
        txn.set(db.collection('claim_settlements').doc(), {
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
    } catch (error) {
      console.error('Claim settlement failed for', docSnap.id, error);
      await docSnap.ref.update({ status: 'error', error: String(error), updatedAt: FieldValue.serverTimestamp() });
    }
  }
}

function determineDailyCapSeconds(viewer) {
  let cap = 60 * 60;
  if (viewer.verified || viewer.engaged) cap = 120 * 60;
  if (viewer.engaged) cap = 240 * 60;
  if (viewer.trusted) cap = 360 * 60;
  if (viewer.staked) cap = 24 * 60 * 60;

  const botScore = viewer.botScore ?? 0;
  if (botScore > 20) cap = Math.min(cap, 30 * 60);
  return cap;
}

const TIER_RATE_MAX = {
  basic: 1 / 60,
  pro: 2 / 60,
  boosted: 3 / 60,
};

async function runSettlement({ mintAuthSecret, rpcUrl, platformTreasury, platformFeeBps, tokenDecimals } = {}) {
  const web3 = require('@solana/web3.js');
  const { Connection, Keypair } = web3;
  const helpers = createSolanaHelpers(web3);
  const cfg = getRuntimeConfig(web3.clusterApiUrl('mainnet-beta'), helpers.maybePubkey, {
    rpcUrl,
    platformTreasury,
    platformFeeBps,
    tokenDecimals,
  });
  if (!cfg.treasuryPubkey) {
    throw new Error('Missing or invalid PLATFORM_TREASURY env');
  }

  const secret = mintAuthSecret || process.env.MINT_AUTH_SECRET;
  if (!secret) {
    throw new Error('Missing MINT_AUTH_SECRET');
  }

  const db = getDb();
  const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(secret, 'base64')));
  const connection = new Connection(cfg.rpcUrl, 'confirmed');
  await settleWatchLogs(db, connection, cfg, web3, helpers, mintAuthority);
  await settleClaimRequests(db, connection, cfg, web3, helpers, mintAuthority);
}

async function runInstantClaim({ payload, mintAuthSecret, rpcUrl, platformTreasury, platformFeeBps, tokenDecimals } = {}) {
  const web3 = require('@solana/web3.js');
  const { Connection, Keypair } = web3;
  const helpers = createSolanaHelpers(web3);
  const cfg = getRuntimeConfig(web3.clusterApiUrl('mainnet-beta'), helpers.maybePubkey, {
    rpcUrl,
    platformTreasury,
    platformFeeBps,
    tokenDecimals,
  });
  if (!cfg.treasuryPubkey) {
    throw new Error('Missing or invalid PLATFORM_TREASURY env');
  }

  const secret = mintAuthSecret || process.env.MINT_AUTH_SECRET;
  if (!secret) {
    throw new Error('Missing MINT_AUTH_SECRET');
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, status: 'invalid_payload' };
  }

  const { viewer, mint, pendingReward } = payload;
  if (!viewer || !mint || typeof pendingReward !== 'number' || pendingReward <= 0) {
    return { ok: false, status: 'invalid_claim' };
  }

  const verification = verifyClaimSignature(payload, web3, helpers);
  if (!verification.ok) {
    return { ok: false, status: 'rejected_invalid_signature', reason: verification.reason };
  }

  const reward = BigInt(Math.floor(pendingReward * 10 ** cfg.tokenDecimals));
  const mintPubkey = helpers.maybePubkey(mint);
  const viewerPubkey = helpers.maybePubkey(viewer);
  if (!mintPubkey || !viewerPubkey) {
    return { ok: false, status: 'invalid_pubkey' };
  }

  const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(secret, 'base64')));
  const connection = new Connection(cfg.rpcUrl, 'confirmed');

  const { sig, fee } = await mintRewards(
    connection,
    web3,
    helpers,
    mintPubkey,
    viewerPubkey,
    cfg.treasuryPubkey,
    reward,
    cfg.feeBps,
    mintAuthority
  );

  const db = getDb();
  await db.collection('claim_settlements').doc().set({
    viewer,
    creator: payload.creator || null,
    mint,
    reward: reward.toString(),
    fee: fee.toString(),
    txid: sig,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, status: 'settled', txid: sig, fee: fee.toString() };
}

module.exports = { runSettlement, runInstantClaim };
