use anchor_lang::prelude::*;

declare_id!("DPYRPGR7cLrtYR1E3E3yjhFbfnZk9qQh6eoryvSZiZBY");

#[program]
pub mod smart_contracts {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
