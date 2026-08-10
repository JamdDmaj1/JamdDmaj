use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("HvbiDNyHotAUYVqK3T2apCW5HEPbvWriK3hrPsPSaLKR");

const BPS_DENOMINATOR: u64 = 10_000;
const MIN_LOCK_BPS: u16 = 8_500;
const PROTECTED_PARTICIPANTS: u32 = 2_000;
const DAY_SECONDS: i64 = 86_400;
const MIN_CLIFF_SECONDS: i64 = 730 * DAY_SECONDS;
const MIN_RELEASE_SECONDS: i64 = 365 * DAY_SECONDS;
const MIN_LIQUIDITY_LOCK_SECONDS: i64 = 730 * DAY_SECONDS;
const MIN_GOVERNANCE_DELAY_SECONDS: i64 = 2 * DAY_SECONDS;
const CREATOR_ELIGIBILITY_ID: [u8; 32] = [0u8; 32];

#[program]
pub mod jamddmaj_lock {
    use super::*;

    pub fn initialize_policy(ctx: Context<InitializePolicy>, args: InitializePolicyArgs) -> Result<()> {
        require!(args.governance_delay_seconds >= MIN_GOVERNANCE_DELAY_SECONDS, LockError::GovernanceDelayTooShort);

        let now = Clock::get()?.unix_timestamp;
        let policy = &mut ctx.accounts.policy;
        policy.authority = ctx.accounts.authority.key();
        policy.token_mint = ctx.accounts.mint.key();
        policy.eligibility_root = args.eligibility_root;
        policy.created_at = now;
        policy.protected_limit = PROTECTED_PARTICIPANTS;
        policy.protected_registered = 0;
        policy.minimum_lock_bps = MIN_LOCK_BPS;
        policy.cliff_seconds = MIN_CLIFF_SECONDS;
        policy.release_seconds = MIN_RELEASE_SECONDS;
        policy.liquidity_lock_seconds = MIN_LIQUIDITY_LOCK_SECONDS;
        policy.governance_delay_seconds = args.governance_delay_seconds;
        policy.eligibility_root_frozen = args.eligibility_root != [0u8; 32];
        policy.bump = ctx.bumps.policy;
        policy.version = 1;
        emit!(PolicyInitialized {
            policy: policy.key(),
            mint: policy.token_mint,
            authority: policy.authority,
            eligibility_root: policy.eligibility_root,
        });
        Ok(())
    }

    /// Seals the privacy-preserving eligibility list exactly once. This lets a
    /// creator lock their own allocation atomically at mint creation while the
    /// platform verifies the early-participant cohort off-chain. No early
    /// participant can register until the non-zero root has been sealed.
    pub fn seal_eligibility_root(
        ctx: Context<SealEligibilityRoot>,
        eligibility_root: [u8; 32],
    ) -> Result<()> {
        require!(eligibility_root != [0u8; 32], LockError::EmptyEligibilityRoot);
        require!(!ctx.accounts.policy.eligibility_root_frozen, LockError::EligibilityRootAlreadyFrozen);
        require!(ctx.accounts.policy.protected_registered == 0, LockError::EligibilityAlreadyUsed);
        ctx.accounts.policy.eligibility_root = eligibility_root;
        ctx.accounts.policy.eligibility_root_frozen = true;
        emit!(EligibilityRootSealed {
            policy: ctx.accounts.policy.key(),
            eligibility_root,
        });
        Ok(())
    }

    pub fn initialize_creator_vesting(
        ctx: Context<InitializeCreatorVesting>,
        total_allocation: u64,
        locked_amount: u64,
    ) -> Result<()> {
        validate_locked_amount(total_allocation, locked_amount, ctx.accounts.policy.minimum_lock_bps)?;
        initialize_vesting_state(
            &mut ctx.accounts.vesting,
            &ctx.accounts.policy,
            ctx.accounts.beneficiary.key(),
            ctx.accounts.mint.key(),
            total_allocation,
            locked_amount,
            CREATOR_ELIGIBILITY_ID,
            VestingKind::Creator,
            ctx.bumps.vesting,
            ctx.bumps.vault,
        )?;
        transfer_into_vault(
            &ctx.accounts.source,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.source_owner,
            &ctx.accounts.token_program,
            locked_amount,
        )?;
        emit!(VestingCreated {
            vesting: ctx.accounts.vesting.key(),
            policy: ctx.accounts.policy.key(),
            beneficiary: ctx.accounts.beneficiary.key(),
            locked_amount,
            kind: VestingKind::Creator as u8,
        });
        Ok(())
    }

    pub fn initialize_early_vesting(
        ctx: Context<InitializeEarlyVesting>,
        args: EarlyVestingArgs,
    ) -> Result<()> {
        require!(ctx.accounts.policy.eligibility_root_frozen, LockError::EligibilityRootNotReady);
        require!(args.eligibility_id != CREATOR_ELIGIBILITY_ID, LockError::InvalidEligibilityId);
        validate_locked_amount(args.total_allocation, args.locked_amount, ctx.accounts.policy.minimum_lock_bps)?;
        require!(
            ctx.accounts.policy.protected_registered < ctx.accounts.policy.protected_limit,
            LockError::ProtectedParticipantLimitReached
        );
        verify_eligibility(
            ctx.accounts.policy.key(),
            ctx.accounts.policy.eligibility_root,
            args.eligibility_id,
            ctx.accounts.beneficiary.key(),
            args.total_allocation,
            &args.merkle_proof,
        )?;

        let claim = &mut ctx.accounts.eligibility_claim;
        claim.policy = ctx.accounts.policy.key();
        claim.beneficiary = ctx.accounts.beneficiary.key();
        claim.eligibility_id = args.eligibility_id;
        claim.bump = ctx.bumps.eligibility_claim;

        initialize_vesting_state(
            &mut ctx.accounts.vesting,
            &ctx.accounts.policy,
            ctx.accounts.beneficiary.key(),
            ctx.accounts.mint.key(),
            args.total_allocation,
            args.locked_amount,
            args.eligibility_id,
            VestingKind::EarlyParticipant,
            ctx.bumps.vesting,
            ctx.bumps.vault,
        )?;
        ctx.accounts.policy.protected_registered = ctx.accounts.policy.protected_registered
            .checked_add(1)
            .ok_or(LockError::MathOverflow)?;
        transfer_into_vault(
            &ctx.accounts.source,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.source_owner,
            &ctx.accounts.token_program,
            args.locked_amount,
        )?;
        emit!(VestingCreated {
            vesting: ctx.accounts.vesting.key(),
            policy: ctx.accounts.policy.key(),
            beneficiary: ctx.accounts.beneficiary.key(),
            locked_amount: args.locked_amount,
            kind: VestingKind::EarlyParticipant as u8,
        });
        Ok(())
    }

    pub fn claim_vested(ctx: Context<ClaimVested>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let claimable = ctx.accounts.vesting.claimable_at(now)?;
        require!(claimable > 0, LockError::NothingToClaim);

        let policy_key = ctx.accounts.policy.key();
        let beneficiary_key = ctx.accounts.beneficiary.key();
        let eligibility_id = ctx.accounts.vesting.eligibility_id;
        let signer_seeds: &[&[u8]] = &[
            b"vesting",
            policy_key.as_ref(),
            beneficiary_key.as_ref(),
            eligibility_id.as_ref(),
            &[ctx.accounts.vesting.bump],
        ];
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.vesting.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[signer_seeds],
            ),
            claimable,
            ctx.accounts.mint.decimals,
        )?;
        ctx.accounts.vesting.released_amount = ctx.accounts.vesting.released_amount
            .checked_add(claimable)
            .ok_or(LockError::MathOverflow)?;
        emit!(TokensClaimed {
            vesting: ctx.accounts.vesting.key(),
            beneficiary: beneficiary_key,
            amount: claimable,
        });
        Ok(())
    }

    pub fn initialize_liquidity_lock(
        ctx: Context<InitializeLiquidityLock>,
        amount: u64,
        requested_lock_seconds: i64,
    ) -> Result<()> {
        require!(amount > 0, LockError::InvalidAmount);
        require!(requested_lock_seconds >= ctx.accounts.policy.liquidity_lock_seconds, LockError::LiquidityLockTooShort);
        let now = Clock::get()?.unix_timestamp;
        let unlock_at = now.checked_add(requested_lock_seconds).ok_or(LockError::MathOverflow)?;
        let liquidity_lock = &mut ctx.accounts.liquidity_lock;
        liquidity_lock.policy = ctx.accounts.policy.key();
        liquidity_lock.beneficiary = ctx.accounts.beneficiary.key();
        liquidity_lock.lp_mint = ctx.accounts.lp_mint.key();
        liquidity_lock.locked_amount = amount;
        liquidity_lock.released = false;
        liquidity_lock.created_at = now;
        liquidity_lock.unlock_at = unlock_at;
        liquidity_lock.bump = ctx.bumps.liquidity_lock;
        liquidity_lock.vault_bump = ctx.bumps.vault;
        transfer_into_vault(
            &ctx.accounts.source,
            &ctx.accounts.vault,
            &ctx.accounts.lp_mint,
            &ctx.accounts.source_owner,
            &ctx.accounts.token_program,
            amount,
        )?;
        emit!(LiquidityLocked {
            liquidity_lock: liquidity_lock.key(),
            policy: liquidity_lock.policy,
            lp_mint: liquidity_lock.lp_mint,
            amount,
            unlock_at,
        });
        Ok(())
    }

    pub fn release_liquidity(ctx: Context<ReleaseLiquidity>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(!ctx.accounts.liquidity_lock.released, LockError::AlreadyReleased);
        require!(now >= ctx.accounts.liquidity_lock.unlock_at, LockError::LiquidityStillLocked);
        let amount = ctx.accounts.liquidity_lock.locked_amount;
        let policy_key = ctx.accounts.policy.key();
        let mint_key = ctx.accounts.lp_mint.key();
        let beneficiary_key = ctx.accounts.beneficiary.key();
        let signer_seeds: &[&[u8]] = &[
            b"liquidity",
            policy_key.as_ref(),
            mint_key.as_ref(),
            beneficiary_key.as_ref(),
            &[ctx.accounts.liquidity_lock.bump],
        ];
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.lp_mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.liquidity_lock.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[signer_seeds],
            ),
            amount,
            ctx.accounts.lp_mint.decimals,
        )?;
        ctx.accounts.liquidity_lock.released = true;
        emit!(LiquidityReleased {
            liquidity_lock: ctx.accounts.liquidity_lock.key(),
            beneficiary: beneficiary_key,
            amount,
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializePolicyArgs {
    pub eligibility_root: [u8; 32],
    pub governance_delay_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EarlyVestingArgs {
    pub eligibility_id: [u8; 32],
    pub total_allocation: u64,
    pub locked_amount: u64,
    pub merkle_proof: Vec<[u8; 32]>,
}

#[derive(Accounts)]
pub struct InitializePolicy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + LaunchPolicy::INIT_SPACE,
        seeds = [b"policy", mint.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, LaunchPolicy>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SealEligibilityRoot<'info> {
    #[account(mut, has_one = authority)]
    pub policy: Account<'info, LaunchPolicy>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeCreatorVesting<'info> {
    #[account(mut, has_one = authority, has_one = token_mint)]
    pub policy: Account<'info, LaunchPolicy>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: The beneficiary is stored and must sign every future claim.
    pub beneficiary: UncheckedAccount<'info>,
    #[account(address = policy.token_mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: Constraint ties this account to policy.token_mint through `mint`.
    pub token_mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + VestingVault::INIT_SPACE,
        seeds = [b"vesting", policy.key().as_ref(), beneficiary.key().as_ref(), CREATOR_ELIGIBILITY_ID.as_ref()],
        bump
    )]
    pub vesting: Account<'info, VestingVault>,
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = vesting,
        token::token_program = token_program,
        seeds = [b"vault", vesting.key().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = source_owner, token::token_program = token_program)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub source_owner: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: EarlyVestingArgs)]
pub struct InitializeEarlyVesting<'info> {
    #[account(mut, has_one = token_mint)]
    pub policy: Account<'info, LaunchPolicy>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(address = policy.token_mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: Constraint ties this account to policy.token_mint through `mint`.
    pub token_mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = beneficiary,
        space = 8 + EligibilityClaim::INIT_SPACE,
        seeds = [b"eligibility", policy.key().as_ref(), args.eligibility_id.as_ref()],
        bump
    )]
    pub eligibility_claim: Account<'info, EligibilityClaim>,
    #[account(
        init,
        payer = beneficiary,
        space = 8 + VestingVault::INIT_SPACE,
        seeds = [b"vesting", policy.key().as_ref(), beneficiary.key().as_ref(), args.eligibility_id.as_ref()],
        bump
    )]
    pub vesting: Account<'info, VestingVault>,
    #[account(
        init,
        payer = beneficiary,
        token::mint = mint,
        token::authority = vesting,
        token::token_program = token_program,
        seeds = [b"vault", vesting.key().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = source_owner, token::token_program = token_program)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub source_owner: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimVested<'info> {
    pub policy: Account<'info, LaunchPolicy>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(
        mut,
        has_one = policy,
        has_one = beneficiary,
        has_one = mint,
        seeds = [b"vesting", policy.key().as_ref(), beneficiary.key().as_ref(), vesting.eligibility_id.as_ref()],
        bump = vesting.bump
    )]
    pub vesting: Account<'info, VestingVault>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = vesting, token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = beneficiary, token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitializeLiquidityLock<'info> {
    pub policy: Account<'info, LaunchPolicy>,
    #[account(mut)]
    pub source_owner: Signer<'info>,
    /// CHECK: Stored as the only signer allowed to release after the timelock.
    pub beneficiary: UncheckedAccount<'info>,
    pub lp_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = source_owner,
        space = 8 + LiquidityLock::INIT_SPACE,
        seeds = [b"liquidity", policy.key().as_ref(), lp_mint.key().as_ref(), beneficiary.key().as_ref()],
        bump
    )]
    pub liquidity_lock: Account<'info, LiquidityLock>,
    #[account(
        init,
        payer = source_owner,
        token::mint = lp_mint,
        token::authority = liquidity_lock,
        token::token_program = token_program,
        seeds = [b"liquidity-vault", liquidity_lock.key().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = lp_mint, token::authority = source_owner, token::token_program = token_program)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseLiquidity<'info> {
    pub policy: Account<'info, LaunchPolicy>,
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    pub lp_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        has_one = policy,
        has_one = beneficiary,
        seeds = [b"liquidity", policy.key().as_ref(), lp_mint.key().as_ref(), beneficiary.key().as_ref()],
        bump = liquidity_lock.bump
    )]
    pub liquidity_lock: Account<'info, LiquidityLock>,
    #[account(mut, token::mint = lp_mint, token::authority = liquidity_lock, token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = lp_mint, token::authority = beneficiary, token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct LaunchPolicy {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub eligibility_root: [u8; 32],
    pub created_at: i64,
    pub protected_limit: u32,
    pub protected_registered: u32,
    pub minimum_lock_bps: u16,
    pub cliff_seconds: i64,
    pub release_seconds: i64,
    pub liquidity_lock_seconds: i64,
    pub governance_delay_seconds: i64,
    pub eligibility_root_frozen: bool,
    pub bump: u8,
    pub version: u16,
}

#[event]
pub struct EligibilityRootSealed {
    pub policy: Pubkey,
    pub eligibility_root: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct VestingVault {
    pub policy: Pubkey,
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
    pub total_allocation: u64,
    pub locked_amount: u64,
    pub released_amount: u64,
    pub start_at: i64,
    pub cliff_end_at: i64,
    pub release_end_at: i64,
    pub eligibility_id: [u8; 32],
    pub kind: u8,
    pub bump: u8,
    pub vault_bump: u8,
}

impl VestingVault {
    pub fn vested_at(&self, timestamp: i64) -> Result<u64> {
        if timestamp < self.cliff_end_at {
            return Ok(0);
        }
        if timestamp >= self.release_end_at {
            return Ok(self.locked_amount);
        }
        let elapsed = timestamp.checked_sub(self.cliff_end_at).ok_or(LockError::MathOverflow)? as u128;
        let duration = self.release_end_at.checked_sub(self.cliff_end_at).ok_or(LockError::MathOverflow)? as u128;
        let vested = (self.locked_amount as u128)
            .checked_mul(elapsed)
            .ok_or(LockError::MathOverflow)?
            .checked_div(duration)
            .ok_or(LockError::MathOverflow)?;
        u64::try_from(vested).map_err(|_| error!(LockError::MathOverflow))
    }

    pub fn claimable_at(&self, timestamp: i64) -> Result<u64> {
        self.vested_at(timestamp)?
            .checked_sub(self.released_amount)
            .ok_or_else(|| error!(LockError::MathOverflow))
    }
}

#[account]
#[derive(InitSpace)]
pub struct EligibilityClaim {
    pub policy: Pubkey,
    pub beneficiary: Pubkey,
    pub eligibility_id: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LiquidityLock {
    pub policy: Pubkey,
    pub beneficiary: Pubkey,
    pub lp_mint: Pubkey,
    pub locked_amount: u64,
    pub created_at: i64,
    pub unlock_at: i64,
    pub released: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

#[repr(u8)]
pub enum VestingKind {
    Creator = 1,
    EarlyParticipant = 2,
}

fn initialize_vesting_state(
    vesting: &mut Account<'_, VestingVault>,
    policy: &Account<'_, LaunchPolicy>,
    beneficiary: Pubkey,
    mint: Pubkey,
    total_allocation: u64,
    locked_amount: u64,
    eligibility_id: [u8; 32],
    kind: VestingKind,
    bump: u8,
    vault_bump: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let cliff_end_at = now.checked_add(policy.cliff_seconds).ok_or(LockError::MathOverflow)?;
    let release_end_at = cliff_end_at.checked_add(policy.release_seconds).ok_or(LockError::MathOverflow)?;
    vesting.policy = policy.key();
    vesting.beneficiary = beneficiary;
    vesting.mint = mint;
    vesting.total_allocation = total_allocation;
    vesting.locked_amount = locked_amount;
    vesting.released_amount = 0;
    vesting.start_at = now;
    vesting.cliff_end_at = cliff_end_at;
    vesting.release_end_at = release_end_at;
    vesting.eligibility_id = eligibility_id;
    vesting.kind = kind as u8;
    vesting.bump = bump;
    vesting.vault_bump = vault_bump;
    Ok(())
}

fn validate_locked_amount(total_allocation: u64, locked_amount: u64, minimum_bps: u16) -> Result<()> {
    require!(total_allocation > 0 && locked_amount > 0, LockError::InvalidAmount);
    require!(locked_amount <= total_allocation, LockError::LockedAmountExceedsAllocation);
    let required = (total_allocation as u128)
        .checked_mul(minimum_bps as u128)
        .ok_or(LockError::MathOverflow)?
        .checked_add((BPS_DENOMINATOR - 1) as u128)
        .ok_or(LockError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(LockError::MathOverflow)?;
    require!((locked_amount as u128) >= required, LockError::LockBelowMinimum);
    Ok(())
}

fn transfer_into_vault<'info>(
    source: &InterfaceAccount<'info, TokenAccount>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    source_owner: &Signer<'info>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from: source.to_account_info(),
        mint: mint.to_account_info(),
        to: vault.to_account_info(),
        authority: source_owner.to_account_info(),
    };
    token_interface::transfer_checked(
        CpiContext::new(token_program.to_account_info(), cpi_accounts),
        amount,
        mint.decimals,
    )
}

fn verify_eligibility(
    policy: Pubkey,
    expected_root: [u8; 32],
    eligibility_id: [u8; 32],
    beneficiary: Pubkey,
    total_allocation: u64,
    proof: &[[u8; 32]],
) -> Result<()> {
    require!(proof.len() <= 32, LockError::MerkleProofTooLong);
    let allocation = total_allocation.to_le_bytes();
    let mut node = hashv(&[
        b"jamddmaj-eligibility-v1",
        policy.as_ref(),
        eligibility_id.as_ref(),
        beneficiary.as_ref(),
        allocation.as_ref(),
    ]).to_bytes();
    for sibling in proof {
        node = if node <= *sibling {
            hashv(&[node.as_ref(), sibling.as_ref()]).to_bytes()
        } else {
            hashv(&[sibling.as_ref(), node.as_ref()]).to_bytes()
        };
    }
    require!(node == expected_root, LockError::InvalidEligibilityProof);
    Ok(())
}

#[event]
pub struct PolicyInitialized {
    pub policy: Pubkey,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub eligibility_root: [u8; 32],
}

#[event]
pub struct VestingCreated {
    pub vesting: Pubkey,
    pub policy: Pubkey,
    pub beneficiary: Pubkey,
    pub locked_amount: u64,
    pub kind: u8,
}

#[event]
pub struct TokensClaimed {
    pub vesting: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LiquidityLocked {
    pub liquidity_lock: Pubkey,
    pub policy: Pubkey,
    pub lp_mint: Pubkey,
    pub amount: u64,
    pub unlock_at: i64,
}

#[event]
pub struct LiquidityReleased {
    pub liquidity_lock: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum LockError {
    #[msg("The eligibility Merkle root cannot be empty.")]
    EmptyEligibilityRoot,
    #[msg("The eligibility root has already been sealed and is immutable.")]
    EligibilityRootAlreadyFrozen,
    #[msg("The eligibility root must be sealed before early participants can register.")]
    EligibilityRootNotReady,
    #[msg("Eligibility registrations already exist for this policy.")]
    EligibilityAlreadyUsed,
    #[msg("The governance delay is shorter than the JamdDmaj minimum.")]
    GovernanceDelayTooShort,
    #[msg("The token amount must be greater than zero.")]
    InvalidAmount,
    #[msg("The locked amount exceeds the participant allocation.")]
    LockedAmountExceedsAllocation,
    #[msg("At least 85% of the participant allocation must be locked.")]
    LockBelowMinimum,
    #[msg("The eligibility identifier is invalid.")]
    InvalidEligibilityId,
    #[msg("The protected 2,000-participant capacity has been reached.")]
    ProtectedParticipantLimitReached,
    #[msg("The eligibility proof is invalid.")]
    InvalidEligibilityProof,
    #[msg("The Merkle proof is too long.")]
    MerkleProofTooLong,
    #[msg("No vested tokens are available to claim.")]
    NothingToClaim,
    #[msg("The liquidity lock is shorter than 24 months.")]
    LiquidityLockTooShort,
    #[msg("The liquidity position is still locked.")]
    LiquidityStillLocked,
    #[msg("The liquidity position was already released.")]
    AlreadyReleased,
    #[msg("A checked arithmetic operation failed.")]
    MathOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_vesting() -> VestingVault {
        VestingVault {
            policy: Pubkey::default(),
            beneficiary: Pubkey::default(),
            mint: Pubkey::default(),
            total_allocation: 100,
            locked_amount: 85,
            released_amount: 0,
            start_at: 0,
            cliff_end_at: 100,
            release_end_at: 200,
            eligibility_id: [1u8; 32],
            kind: VestingKind::EarlyParticipant as u8,
            bump: 1,
            vault_bump: 2,
        }
    }

    #[test]
    fn rejects_a_lock_below_eighty_five_percent() {
        assert!(validate_locked_amount(100, 84, MIN_LOCK_BPS).is_err());
        assert!(validate_locked_amount(101, 86, MIN_LOCK_BPS).is_ok());
    }

    #[test]
    fn vesting_releases_nothing_before_cliff() {
        let vesting = sample_vesting();
        assert_eq!(vesting.vested_at(99).unwrap(), 0);
        assert_eq!(vesting.vested_at(100).unwrap(), 0);
    }

    #[test]
    fn vesting_releases_linearly_after_cliff() {
        let vesting = sample_vesting();
        assert_eq!(vesting.vested_at(150).unwrap(), 42);
        assert_eq!(vesting.vested_at(200).unwrap(), 85);
        assert_eq!(vesting.vested_at(250).unwrap(), 85);
    }
}
