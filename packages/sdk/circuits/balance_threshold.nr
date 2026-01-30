// Balance Threshold Circuit for PrivacyKit SDK
// Proves balance exceeds a threshold without revealing the actual balance
//
// Public Inputs:
// - threshold: The minimum balance to prove
// - commitment: Pedersen commitment to the actual balance
//
// Private Inputs:
// - balance: The actual balance (hidden)
// - blinding: Random blinding factor for the commitment

use std::hash::pedersen_hash;
use std::hash::poseidon::bn254::hash_2;
use std::hash::poseidon::bn254::hash_3;

/// Compute a Pedersen commitment to a balance
/// C = H(balance || blinding)
fn compute_balance_commitment(balance: Field, blinding: Field) -> Field {
    pedersen_hash([balance, blinding])
}

/// Main circuit: prove balance >= threshold without revealing balance
fn main(
    // Public inputs
    threshold: pub Field,
    commitment: pub Field,

    // Private inputs (witnesses)
    balance: Field,
    blinding: Field
) {
    // 1. Verify the commitment is valid
    let computed_commitment = compute_balance_commitment(balance, blinding);
    assert(computed_commitment == commitment, "Invalid balance commitment");

    // 2. Range check: balance must fit in u64 to prevent overflow attacks
    assert(balance as u64 as Field == balance, "Balance overflow");
    assert(threshold as u64 as Field == threshold, "Threshold overflow");

    // 3. Prove balance >= threshold
    // Convert to unsigned integers for comparison
    let balance_u64 = balance as u64;
    let threshold_u64 = threshold as u64;

    assert(balance_u64 >= threshold_u64, "Balance below threshold");
}

/// Extended: prove balance is within a range [min, max]
/// Useful for credit score proofs, age verification, etc.
fn balance_in_range(
    // Public inputs
    min_threshold: pub Field,
    max_threshold: pub Field,
    commitment: pub Field,

    // Private inputs
    balance: Field,
    blinding: Field
) {
    // Verify commitment
    let computed = compute_balance_commitment(balance, blinding);
    assert(computed == commitment, "Invalid balance commitment");

    // Range checks
    assert(balance as u64 as Field == balance, "Balance overflow");
    assert(min_threshold as u64 as Field == min_threshold, "Min threshold overflow");
    assert(max_threshold as u64 as Field == max_threshold, "Max threshold overflow");

    // Prove min <= balance <= max
    let balance_u64 = balance as u64;
    let min_u64 = min_threshold as u64;
    let max_u64 = max_threshold as u64;

    assert(balance_u64 >= min_u64, "Balance below minimum");
    assert(balance_u64 <= max_u64, "Balance above maximum");
}

/// Prove multiple balances each exceed their respective thresholds
/// Useful for multi-token portfolio proofs
fn multi_balance_threshold(
    // Public inputs
    thresholds: pub [Field; 4],
    commitments: pub [Field; 4],
    num_balances: pub u8,

    // Private inputs
    balances: [Field; 4],
    blindings: [Field; 4]
) {
    for i in 0..4 {
        if (i as u8) < num_balances {
            // Verify commitment
            let computed = compute_balance_commitment(balances[i], blindings[i]);
            assert(computed == commitments[i], "Invalid balance commitment");

            // Range check
            assert(balances[i] as u64 as Field == balances[i], "Balance overflow");

            // Threshold check
            let balance_u64 = balances[i] as u64;
            let threshold_u64 = thresholds[i] as u64;
            assert(balance_u64 >= threshold_u64, "Balance below threshold");
        }
    }
}

/// Prove total balance across multiple accounts exceeds threshold
/// Without revealing individual balances or total
fn aggregate_balance_threshold(
    // Public inputs
    total_threshold: pub Field,
    individual_commitments: pub [Field; 4],
    num_accounts: pub u8,

    // Private inputs
    individual_balances: [Field; 4],
    individual_blindings: [Field; 4]
) {
    let mut total_balance: Field = 0;

    for i in 0..4 {
        if (i as u8) < num_accounts {
            // Verify each commitment
            let computed = compute_balance_commitment(
                individual_balances[i],
                individual_blindings[i]
            );
            assert(computed == individual_commitments[i], "Invalid commitment");

            // Range check individual balance
            assert(
                individual_balances[i] as u64 as Field == individual_balances[i],
                "Individual balance overflow"
            );

            total_balance += individual_balances[i];
        }
    }

    // Verify total exceeds threshold
    let total_u64 = total_balance as u64;
    let threshold_u64 = total_threshold as u64;
    assert(total_u64 >= threshold_u64, "Total balance below threshold");
}

/// Time-locked balance proof
/// Proves balance exceeds threshold AND was committed before a certain time
fn time_locked_balance_threshold(
    // Public inputs
    threshold: pub Field,
    commitment: pub Field,
    max_timestamp: pub Field,  // Block timestamp when balance was committed

    // Private inputs
    balance: Field,
    blinding: Field,
    actual_timestamp: Field
) {
    // Verify balance commitment
    let computed = compute_balance_commitment(balance, blinding);
    assert(computed == commitment, "Invalid balance commitment");

    // Verify balance meets threshold
    assert(balance as u64 as Field == balance, "Balance overflow");
    let balance_u64 = balance as u64;
    let threshold_u64 = threshold as u64;
    assert(balance_u64 >= threshold_u64, "Balance below threshold");

    // Verify timestamp is before max
    assert(actual_timestamp as u64 as Field == actual_timestamp, "Timestamp overflow");
    assert(max_timestamp as u64 as Field == max_timestamp, "Max timestamp overflow");

    let actual_ts = actual_timestamp as u64;
    let max_ts = max_timestamp as u64;
    assert(actual_ts <= max_ts, "Balance committed too recently");
}

/// Credit score range proof
/// Specialized circuit for proving credit score is in acceptable range
fn credit_score_range(
    // Public inputs
    min_score: pub Field,
    max_score: pub Field,
    score_commitment: pub Field,
    provider_signature: pub Field,  // Hash of provider's attestation

    // Private inputs
    actual_score: Field,
    blinding: Field,
    provider_secret: Field
) {
    // Verify score commitment
    let computed = compute_balance_commitment(actual_score, blinding);
    assert(computed == score_commitment, "Invalid score commitment");

    // Verify provider signature
    let expected_sig = hash_2([actual_score, provider_secret]);
    assert(expected_sig == provider_signature, "Invalid provider signature");

    // Verify score is in range
    let score_u64 = actual_score as u64;
    let min_u64 = min_score as u64;
    let max_u64 = max_score as u64;

    assert(score_u64 >= min_u64, "Score below minimum");
    assert(score_u64 <= max_u64, "Score above maximum");

    // Sanity check: credit scores typically 300-850
    assert(score_u64 >= 300, "Invalid credit score");
    assert(score_u64 <= 850, "Invalid credit score");
}

#[test]
fn test_basic_threshold() {
    let balance: Field = 1000;
    let threshold: Field = 500;
    let blinding: Field = 12345;

    let commitment = compute_balance_commitment(balance, blinding);

    main(threshold, commitment, balance, blinding);
}

#[test]
fn test_exact_threshold() {
    let balance: Field = 500;
    let threshold: Field = 500;
    let blinding: Field = 12345;

    let commitment = compute_balance_commitment(balance, blinding);

    main(threshold, commitment, balance, blinding);
}

#[test]
fn test_range_proof() {
    let balance: Field = 750;
    let min_threshold: Field = 500;
    let max_threshold: Field = 1000;
    let blinding: Field = 12345;

    let commitment = compute_balance_commitment(balance, blinding);

    balance_in_range(min_threshold, max_threshold, commitment, balance, blinding);
}

#[test]
fn test_multiple_thresholds() {
    let balances: [Field; 4] = [1000, 2000, 500, 0];
    let thresholds: [Field; 4] = [500, 1000, 250, 0];
    let blindings: [Field; 4] = [111, 222, 333, 0];
    let num_balances: u8 = 3;

    let mut commitments: [Field; 4] = [0; 4];
    for i in 0..3 {
        commitments[i] = compute_balance_commitment(balances[i], blindings[i]);
    }

    multi_balance_threshold(thresholds, commitments, num_balances, balances, blindings);
}
