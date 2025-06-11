import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Clipchain } from "../target/types/clipchain";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("clipchain", () => {
  // Use the devnet cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Clipchain as Program<Clipchain>;

  const user = provider.wallet;
  const treasury = Keypair.generate();
  let mint: PublicKey;
  let userTokenAccount: PublicKey;

  it("Airdrops and sets up test environment", async () => {
    // Airdrop to treasury and user
    await provider.connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(treasury.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create mint and associated token account
    mint = await createMint(provider.connection, user.payer, user.publicKey, null, 6);
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user.payer,
      mint,
      user.publicKey
    );
    userTokenAccount = ata.address;

    // Mint tokens to user
    await mintTo(
      provider.connection,
      user.payer,
      mint,
      userTokenAccount,
      user.payer,
      100_000_000 // 100 tokens with 6 decimals
    );
  });

  it("Initializes revenue pool", async () => {
    const [revenuePoolPDA, bump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );

    await program.methods
      .initializePool(new anchor.BN(1_000_000)) // 1 SOL to distribute
      .accounts({
        revenuePool: revenuePoolPDA,
        signer: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Pool initialized:", revenuePoolPDA.toBase58());
  });

  it("Claims revenue", async () => {
    const [revenuePoolPDA] = await PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );

    const [userStatePDA] = await PublicKey.findProgramAddressSync(
      [user.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .claimRevenue()
      .accounts({
        revenuePool: revenuePoolPDA,
        userState: userStatePDA,
        treasury: treasury.publicKey,
        userWallet: user.publicKey,
        tokenMint: mint,
        userToken: userTokenAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([treasury])
      .rpc();

    console.log("✅ Revenue claimed");
  });
});
