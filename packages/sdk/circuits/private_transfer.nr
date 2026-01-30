// Private Transfer Circuit for PrivacyKit SDK
// Proves valid transfer without revealing amount using Pedersen commitments
//
// Public Inputs:
// - input_commitment: Pedersen commitment to input amount
// - output_commitment: Pedersen commitment to output amount
// - nullifier: Prevents double-spending
//
// Private Inputs:
// - amount: The actual transfer amount (hidden)
// - sender_blinding: Random blinding factor for sender's commitment
// - recipient_blinding: Random blinding factor for recipient's commitment
// - nullifier_secret: Secret used to generate nullifier

use std::hash::pedersen_hash;
use std::hash::poseidon::bn254::hash_2;
use std::hash::poseidon::bn254::hash_3;

// Field element type for BN254 curve
// Noir uses Field as the native type

// Generator points for Pedersen commitment (conceptually)
// In practice, these are embedded in the Pedersen hash implementation

/// Compute a Pedersen commitment: C = amount * G + blinding * H
/// Using the stdlib pedersen_hash which provides binding and hiding properties
fn compute_commitment(amount: Field, blinding: Field) -> Field {
    // Pedersen hash provides a binding commitment
    // H(amount || blinding)
    pedersen_hash([amount, blinding])
}

/// Compute nullifier to prevent double-spending
/// Uses Poseidon hash for efficiency in ZK circuits
fn compute_nullifier(secret: Field, commitment: Field) -> Field {
    hash_2([secret, commitment])
}

/// Verify that two values are equal (conservation of value)
fn assert_value_conservation(input_amount: Field, output_amount: Field) {
    assert(input_amount == output_amount, "Value not conserved in transfer");
}

/// Main circuit for private transfer
/// Proves:
/// 1. Input commitment correctly commits to the amount
/// 2. Output commitment correctly commits to the same amount
/// 3. Nullifier is correctly derived
/// 4. Value is conserved (input amount == output amount)
fn main(
    // Public inputs - visible on-chain
    input_commitment: pub Field,
    output_commitment: pub Field,
    nullifier: pub Field,

    // Private inputs (witnesses) - hidden
    amount: Field,
    sender_blinding: Field,
    recipient_blinding: Field,
    nullifier_secret: Field
) {
    // 1. Verify input commitment matches the committed amount
    let computed_input = compute_commitment(amount, sender_blinding);
    assert(computed_input == input_commitment, "Invalid input commitment");

    // 2. Verify output commitment matches the committed amount
    let computed_output = compute_commitment(amount, recipient_blinding);
    assert(computed_output == output_commitment, "Invalid output commitment");

    // 3. Verify nullifier is correctly computed
    let computed_nullifier = compute_nullifier(nullifier_secret, input_commitment);
    assert(computed_nullifier == nullifier, "Invalid nullifier");

    // 4. Range check: amount must be non-negative and within valid range
    // The Field type in Noir is automatically constrained to be in the field
    // For additional range checking, we verify amount < 2^64
    assert(amount as u64 as Field == amount, "Amount overflow");
}

/// Extended private transfer with fee support
/// Allows for transaction fees while maintaining privacy
fn transfer_with_fee(
    // Public inputs
    input_commitment: pub Field,
    output_commitment: pub Field,
    fee_commitment: pub Field,
    nullifier: pub Field,

    // Private inputs
    input_amount: Field,
    output_amount: Field,
    fee_amount: Field,
    sender_blinding: Field,
    recipient_blinding: Field,
    fee_blinding: Field,
    nullifier_secret: Field
) {
    // Verify value conservation: input = output + fee
    assert(input_amount == output_amount + fee_amount, "Value not conserved");

    // Verify all commitments
    let computed_input = compute_commitment(input_amount, sender_blinding);
    assert(computed_input == input_commitment, "Invalid input commitment");

    let computed_output = compute_commitment(output_amount, recipient_blinding);
    assert(computed_output == output_commitment, "Invalid output commitment");

    let computed_fee = compute_commitment(fee_amount, fee_blinding);
    assert(computed_fee == fee_commitment, "Invalid fee commitment");

    // Verify nullifier
    let computed_nullifier = compute_nullifier(nullifier_secret, input_commitment);
    assert(computed_nullifier == nullifier, "Invalid nullifier");

    // Range checks
    assert(input_amount as u64 as Field == input_amount, "Input amount overflow");
    assert(output_amount as u64 as Field == output_amount, "Output amount overflow");
    assert(fee_amount as u64 as Field == fee_amount, "Fee amount overflow");
}

/// Multi-input transfer: combine multiple inputs into one output
/// Useful for consolidating UTXOs
fn multi_input_transfer(
    // Public inputs
    input_commitments: pub [Field; 4],  // Up to 4 inputs
    output_commitment: pub Field,
    nullifiers: pub [Field; 4],
    num_inputs: pub u8,

    // Private inputs
    amounts: [Field; 4],
    blindings: [Field; 4],
    output_blinding: Field,
    nullifier_secrets: [Field; 4]
) {
    // Sum all input amounts
    let mut total_input: Field = 0;

    for i in 0..4 {
        if (i as u8) < num_inputs {
            // Verify each input commitment
            let computed = compute_commitment(amounts[i], blindings[i]);
            assert(computed == input_commitments[i], "Invalid input commitment");

            // Verify nullifier
            let computed_null = compute_nullifier(nullifier_secrets[i], input_commitments[i]);
            assert(computed_null == nullifiers[i], "Invalid nullifier");

            total_input += amounts[i];
        }
    }

    // Verify output commitment
    let computed_output = compute_commitment(total_input, output_blinding);
    assert(computed_output == output_commitment, "Invalid output commitment");
}

#[test]
fn test_basic_transfer() {
    let amount: Field = 1000;
    let sender_blinding: Field = 12345;
    let recipient_blinding: Field = 67890;
    let nullifier_secret: Field = 11111;

    let input_commitment = compute_commitment(amount, sender_blinding);
    let output_commitment = compute_commitment(amount, recipient_blinding);
    let nullifier = compute_nullifier(nullifier_secret, input_commitment);

    main(
        input_commitment,
        output_commitment,
        nullifier,
        amount,
        sender_blinding,
        recipient_blinding,
        nullifier_secret
    );
}

#[test]
fn test_commitment_hiding() {
    // Same amount with different blindings should produce different commitments
    let amount: Field = 1000;
    let blinding1: Field = 111;
    let blinding2: Field = 222;

    let commitment1 = compute_commitment(amount, blinding1);
    let commitment2 = compute_commitment(amount, blinding2);

    assert(commitment1 != commitment2, "Commitments should differ with different blindings");
}

#[test]
fn test_commitment_binding() {
    // Different amounts should produce different commitments (same blinding)
    let amount1: Field = 1000;
    let amount2: Field = 2000;
    let blinding: Field = 12345;

    let commitment1 = compute_commitment(amount1, blinding);
    let commitment2 = compute_commitment(amount2, blinding);

    assert(commitment1 != commitment2, "Commitments should differ with different amounts");
}
