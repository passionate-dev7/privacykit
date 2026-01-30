#!/usr/bin/env bun
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const walletPath = process.env.WALLET_PATH || path.join(process.env.HOME || '', '.config/solana/id.json');
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  console.log('\n=== Wallet Balances ===\n');
  console.log(`Wallet: ${wallet.publicKey.toBase58()}\n`);

  // Devnet
  const devnet = new Connection('https://api.devnet.solana.com', 'confirmed');
  const devSol = await devnet.getBalance(wallet.publicKey);
  console.log(`DEVNET SOL:  ${devSol / LAMPORTS_PER_SOL} SOL`);
  
  // Check devnet USDC
  const USDC_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  try {
    const usdcAta = await getAssociatedTokenAddress(USDC_DEVNET, wallet.publicKey);
    const acc = await getAccount(devnet, usdcAta);
    console.log(`DEVNET USDC: ${Number(acc.amount) / 1_000_000} USDC`);
  } catch { console.log('DEVNET USDC: 0'); }

  // Mainnet
  const mainnet = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const mainSol = await mainnet.getBalance(wallet.publicKey);
  console.log(`\nMAINNET SOL:  ${mainSol / LAMPORTS_PER_SOL} SOL`);
  
  // Check mainnet USDC
  const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  try {
    const usdcAta = await getAssociatedTokenAddress(USDC_MAINNET, wallet.publicKey);
    const acc = await getAccount(mainnet, usdcAta);
    console.log(`MAINNET USDC: ${Number(acc.amount) / 1_000_000} USDC`);
  } catch { console.log('MAINNET USDC: 0'); }

  console.log('\n=== Network Availability ===\n');
  console.log('Privacy Cash: Mainnet only (ALT required)');
  console.log('ShadowWire:   API appears down (502)');
  console.log('Arcium:       Mainnet only (MXE required)');
  
  if (mainSol > 0.05 * LAMPORTS_PER_SOL) {
    console.log('\n✅ You have enough mainnet SOL to test Privacy Cash!');
    console.log('   Run: NETWORK=mainnet bun run scripts/test-privacycash-mainnet.ts');
  } else {
    console.log('\n⚠️  Need >0.05 mainnet SOL for Privacy Cash testing');
  }
  
  console.log('');
}

main().catch(console.error);
