# Privacy Cash Circuit Artifacts

This directory contains the ZK-SNARK circuit artifacts for the Privacy Cash withdrawal circuit.

## Files

- `withdrawal.circom` - The Circom circuit source code
- `verification_key.json` - Verification key for proof verification (placeholder)
- `withdrawal.wasm` - Compiled WebAssembly witness calculator (not included - must be generated)
- `withdrawal_final.zkey` - Proving key for proof generation (not included - must be generated)

## Generating Production Artifacts

The included verification_key.json is a **placeholder** for development. For production use,
you must generate real artifacts using a trusted setup ceremony.

### Prerequisites

```bash
# Install circom
curl -L https://github.com/iden3/circom/releases/latest/download/circom-linux-amd64 -o circom
chmod +x circom
sudo mv circom /usr/local/bin/

# Install snarkjs
npm install -g snarkjs

# Install circomlib
npm install circomlib
```

### Compilation Steps

```bash
# 1. Compile the circuit
circom withdrawal.circom --r1cs --wasm --sym -o build/

# 2. Download Powers of Tau (for tree depth 20, need at least 2^21)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_22.ptau

# 3. Generate proving key (Phase 2)
snarkjs groth16 setup build/withdrawal.r1cs powersOfTau28_hez_final_22.ptau withdrawal_0000.zkey

# 4. Contribute to the ceremony (repeat for more contributors)
snarkjs zkey contribute withdrawal_0000.zkey withdrawal_0001.zkey --name="First contributor" -v
snarkjs zkey contribute withdrawal_0001.zkey withdrawal_0002.zkey --name="Second contributor" -v

# 5. Apply beacon (optional, for extra security)
snarkjs zkey beacon withdrawal_0002.zkey withdrawal_final.zkey 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10

# 6. Export verification key
snarkjs zkey export verificationkey withdrawal_final.zkey verification_key.json

# 7. Copy artifacts to this directory
cp build/withdrawal_js/withdrawal.wasm .
cp withdrawal_final.zkey .
```

## Circuit Details

### Public Inputs
1. `root` - Merkle tree root (identifies the pool state)
2. `nullifierHash` - Hash of nullifier (prevents double-spending)
3. `recipient` - Withdrawal recipient address
4. `relayer` - Relayer address (for gasless transactions)
5. `fee` - Fee amount for relayer
6. `refund` - Refund/change amount

### Private Inputs
1. `secret` - 31-byte random secret
2. `nullifier` - 31-byte random nullifier
3. `pathElements[20]` - Merkle proof sibling hashes
4. `pathIndices[20]` - Merkle proof position bits (0=left, 1=right)

### Constraints
- Approximately 28,000 constraints for 20-level tree
- Proof generation time: ~10-30 seconds depending on hardware

## Security Considerations

1. **Trusted Setup**: The zkey file contains toxic waste from the ceremony.
   A compromised ceremony allows fake proofs. Use multiple independent contributors.

2. **Powers of Tau**: Use a sufficiently large ptau file (at least 2^21 for this circuit).

3. **Verification Key**: The verification key is derived from the proving key and
   should be embedded in the on-chain verifier contract.

4. **Nullifier Uniqueness**: The on-chain contract must track spent nullifierHashes
   to prevent double-spending.

## Testing

```bash
# Generate a test proof
snarkjs groth16 fullprove input.json build/withdrawal_js/withdrawal.wasm withdrawal_final.zkey proof.json public.json

# Verify the proof
snarkjs groth16 verify verification_key.json public.json proof.json
```

## License

MIT License - See main project LICENSE file.
