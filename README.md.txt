use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgDxfyF8N6Mu"); // Replace with your actual program ID later

#[program]
pub mod smart_contracts {
    use super::*;

    pub fn initialize_creator_token(
        ctx: Context<InitializeCreatorToken>,
        _bump: u8,
    ) -> Result<()> {
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
            ),
            1_000_000_000, // Amount to mint (e.g. 1 billion units)
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCreatorToken<'info> {
    #[account(mut)]
    pub mint_authority: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
