use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};

declare_id!("DPYRPGR7cLrtYR1E3E3yjhFbfnZk9qQh6eoryvSZiZBY");

#[program]
pub mod smart_contracts {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>, total_funds: u64) -> Result<()> {
        let pool = &mut ctx.accounts.revenue_pool;
        pool.total_funds = total_funds;
        pool.bump = ctx.bumps.revenue_pool;
        Ok(())
    }

    pub fn claim_revenue(ctx: Context<ClaimRevenue>) -> Result<()> {
        let pool = &mut ctx.accounts.revenue_pool;
        let user_state = &mut ctx.accounts.user_state;

        let user_balance = ctx.accounts.user_token.amount;
        let total_supply = ctx.accounts.token_mint.supply;

        require!(total_supply > 0, CustomError::ZeroSupply);
        require!(!user_state.claimed, CustomError::AlreadyClaimed);

        let claimable = (pool.total_funds * user_balance) / total_supply;

        user_state.claimed = true;

        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= claimable;
        **ctx.accounts.user_wallet.to_account_info().try_borrow_mut_lamports()? += claimable;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(total_funds: u64)]
pub struct InitializePool<'info> {
    #[account(
        init,
        seeds = [b"pool"],
        bump,
        payer = signer,
        space = 8 + 8 + 1
    )]
    pub revenue_pool: Account<'info, RevenuePool>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRevenue<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = revenue_pool.bump
    )]
    pub revenue_pool: Account<'info, RevenuePool>,

    #[account(
        init_if_needed,
        seeds = [user_wallet.key().as_ref()],
        bump,
        payer = user_wallet,
        space = 8 + 1
    )]
    pub user_state: Account<'info, UserState>,

    #[account(mut)]
    pub treasury: SystemAccount<'info>,

    #[account(mut)]
    pub user_wallet: Signer<'info>,

    pub token_mint: Account<'info, Mint>,
    pub user_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct RevenuePool {
    pub total_funds: u64,
    pub bump: u8,
}

#[account]
pub struct UserState {
    pub claimed: bool,
}

#[error_code]
pub enum CustomError {
    #[msg("User has already claimed")]
    AlreadyClaimed,
    #[msg("Token supply is zero")]
    ZeroSupply,
}
