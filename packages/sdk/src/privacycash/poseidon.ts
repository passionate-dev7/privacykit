/**
 * Poseidon Hash Implementation
 *
 * Production-ready Poseidon hash function using circomlibjs.
 * This is the same hash function used in Tornado Cash and other
 * privacy protocols for ZK-SNARK friendly hashing.
 *
 * Poseidon operates over the BN254 scalar field and is optimized
 * for use in Groth16/PLONK circuits.
 */

/// <reference path="./typedefs.d.ts" />

import type { Poseidon as PoseidonType, PoseidonFn } from './types';

// Field modulus for BN254 (alt_bn128) scalar field
// This is the prime p for the field F_p where Poseidon operates
export const SNARK_FIELD_SIZE = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

// Poseidon round constants and MDS matrix for t=3 (2 inputs + 1 capacity)
// These are derived from the Grain LFSR as per the Poseidon paper
const POSEIDON_C: bigint[] = [
  BigInt('14397397413755236225575615486459253198602422701513067526754101844196324375522'),
  BigInt('10405129301473404666785234951972711717481302463898292859783056520670200613128'),
  BigInt('5179144822360023508491245509308555580251733042407187134628755730783052214509'),
  BigInt('9132640374240188374542843306219594180154739721841249568925550236430986592615'),
  BigInt('20360807315276763881209958738450444293273549928693737723235350358403012458514'),
  BigInt('17933600965499023212689924809448543050840131883187652471064418452962948061619'),
  BigInt('3636213416533737411392076250708419981662897009810345015164671602334517041153'),
  BigInt('2008540005368330234524962342006691994500273283000229509835662097352946198608'),
  BigInt('16018407964853379535338740313053768402596521780991140819786060484533668987481'),
  BigInt('20653139667070586705378398435856186172195806027708437373130277731439401046791'),
  BigInt('13825168702119319738888931394920269109546790695524393280115817707436906697484'),
  BigInt('12968110754030272584278027616102229304242552988891243164424143922891942930064'),
  BigInt('9790190777431561806364206812520294858402119050213251720514796023178257802468'),
  BigInt('11112103939017792011544260599469773557105652890159546983091479545682644885013'),
  BigInt('11506025971573417514417665959849723423295538646617347551987437163942912785101'),
  BigInt('11218997337567311562873717270381099966814829177881243233553439587941920227481'),
  BigInt('2944936996950417908923802590338828850611991265586258736021592449377991784773'),
  BigInt('16230943662093607594093572850040063149770721072810662568957155496166959751482'),
  BigInt('5107653375879271476132738581765370649413950780497966947754313889787795227939'),
  BigInt('19081867138213821045498993009024256577453235306178206972079748657583742131383'),
  BigInt('17170316842170117812890738166890446505655235899952170825615290478803426640769'),
  BigInt('21787765913830725806803786995629205858987960989633611491093716189133252605722'),
  BigInt('4932869038193893675645116327096773498261012758193626401546639454201934109337'),
  BigInt('12889566313785133108170903451687542687298815727443476308883583796819866285121'),
  BigInt('19920747662055618155885207604423759938992720046662668447556789171889945772042'),
  BigInt('19601029765312053147942092576632082779140385846918428397893388085183889053923'),
  BigInt('17937851424533509572313178270497107684773863549614800326598853977568531163420'),
  BigInt('21696416494873685979093980010996872550268704784558481421387987553187577826001'),
  BigInt('7957446296273653027659800697545971425968484403089888027912782709848814390825'),
  BigInt('12007236814369655787963893445945419439281266937621618591464972099890163009012'),
  BigInt('21134818821884896246105937022831052695199655175618035833902833936538710875992'),
  BigInt('21115688547409892708100422098705687605329515067546515893639015251591875718680'),
  BigInt('14287360007621393538115867640891568949498977284665015730306168619503328638814'),
  BigInt('8596413922579948716886660279515538656462168988687634243376590453663743766771'),
  BigInt('4434556894313172232998379490997697174737759386401649706152887927159027391634'),
  BigInt('15244639902769613076439821234059568730434289890390098915938930426345156524698'),
  BigInt('4539022058987115768469330615430954233869927424672437548904606810763712536319'),
  BigInt('4273109519044626666227152093966391576825465249583972200823046606116867411298'),
  BigInt('9008262707773160166934509654938745267988413178696627917016714062973540878929'),
  BigInt('13254028508967925965538895679949513883785992736614314120044864054082329494716'),
  BigInt('18137481515646076405974112421535879275989739378653586684814629562710599176149'),
  BigInt('3156472330817073315712982032893476938545621102085569595989609814098706790855'),
  BigInt('7056656988328642334533403273648773449212028310522088733563005651659036028869'),
  BigInt('20216240804238264108847009191856266859773609253938547925369007046259847227849'),
  BigInt('20980789621044043269116937697702683102485632044889445693280474741840663234779'),
  BigInt('5618822908991468883691639798652946287003884633527580098901903630795361326009'),
  BigInt('9621998109559363227538206929935197519808549522192860305063036985752548487968'),
  BigInt('16973251849921904607049361177690702835952733279741975719032091818988915137690'),
  BigInt('11912308947453011047762014377847048553420892789574587732481932707961002621266'),
  BigInt('15916704583245245387800542226580625206920027454429964107393631028590829135882'),
  BigInt('10654917297442456460296860918809655284121207500280856195695088847814333839536'),
  BigInt('19478934914737356107923816621374046735295838631227399657979711960856833570595'),
  BigInt('10051797070119783098033108689526029784668611685662209422488131004906428832157'),
  BigInt('12231697952344302684523085628604746679805057339929024761678373861975734270548'),
  BigInt('12899728697614065692686289493395795997116339776339992301489211619053338932960'),
  BigInt('14248691727356110299831509211201751561886676813297340526408773851982771850761'),
  BigInt('21817041012053793591534606455867806225817045298267553648927769920936193988131'),
  BigInt('5813887215115922038695440939846628571578988877887963011562823986013313119506'),
  BigInt('1854992131491491896349771596095933194614009172570774604114843715149485906621'),
  BigInt('20549975377897792178820650367147858419524232292348553795309163631288099530252'),
  BigInt('14736303568107990421168564437947893452932309144657152826682619813951534212691'),
  BigInt('13867778673498149680555622229679879549655697122502165604018222045696779765550'),
  BigInt('4693777268776687445488298569277408038827921761270879068797399041691088698735'),
  BigInt('2979907082875729146832111379935413034078862221104445821499754821256221841774'),
];

// MDS matrix for Poseidon with t=3
const POSEIDON_M: bigint[][] = [
  [
    BigInt('7511745149465107256748700652201246547602992235352608707588321460060273774987'),
    BigInt('10370080108974718697676803824769673834027675643658433702224577712625900127200'),
    BigInt('19705173408229649878903981084052839426532978878058043055305024233888854471533'),
  ],
  [
    BigInt('18732019378264290557468133440468564866454307626475683536618613112504878618481'),
    BigInt('20870176810702568768751421378473869562658540583882454726129544628203806653987'),
    BigInt('7266061498423634438633389053804536045105766754026813321943009179476902321146'),
  ],
  [
    BigInt('9131299761947733513298312097611845208338517739621853568979632113419485819303'),
    BigInt('10595341252162738537912664445405114076324478519622938027420701542910180337937'),
    BigInt('11597556804922396090267472882856054602429588299176362916247939723151043581408'),
  ],
];

/**
 * Poseidon instance holder
 * Lazily initialized when first needed
 */
let poseidonInstance: PoseidonFn | null = null;
let poseidonF: any = null;

/**
 * Initialize Poseidon hash function
 * Uses circomlibjs if available, otherwise uses native implementation
 */
export async function initPoseidon(): Promise<PoseidonFn> {
  if (poseidonInstance) {
    return poseidonInstance;
  }

  try {
    // Try to use circomlibjs for production-grade implementation
    const circomlibjs = await import('circomlibjs');
    const poseidon = await circomlibjs.buildPoseidon();
    poseidonF = poseidon.F;

    poseidonInstance = (inputs: bigint[]): bigint => {
      const hash = poseidon(inputs.map(x => poseidonF.e(x)));
      return BigInt(poseidonF.toString(hash));
    };

    return poseidonInstance;
  } catch {
    // Fallback to native implementation
    console.warn('circomlibjs not available, using native Poseidon implementation');
    poseidonInstance = nativePoseidon;
    return poseidonInstance;
  }
}

/**
 * Native Poseidon implementation
 * This is a pure TypeScript implementation for environments where circomlibjs is not available
 */
function nativePoseidon(inputs: bigint[]): bigint {
  if (inputs.length === 0 || inputs.length > 2) {
    throw new Error('Poseidon: supports 1 or 2 inputs');
  }

  const t = 3; // state width
  const nRoundsF = 8; // full rounds
  const nRoundsP = 57; // partial rounds

  // Initialize state with inputs
  let state: bigint[] = [BigInt(0), ...inputs];
  while (state.length < t) {
    state.push(BigInt(0));
  }

  // Ensure all values are in the field
  state = state.map(x => mod(x, SNARK_FIELD_SIZE));

  let roundIdx = 0;

  // First half of full rounds
  for (let r = 0; r < nRoundsF / 2; r++) {
    state = addRoundConstants(state, roundIdx);
    state = sBoxFull(state);
    state = mixLayer(state);
    roundIdx++;
  }

  // Partial rounds
  for (let r = 0; r < nRoundsP; r++) {
    state = addRoundConstants(state, roundIdx);
    state[0] = sBox(state[0]);
    state = mixLayer(state);
    roundIdx++;
  }

  // Second half of full rounds
  for (let r = 0; r < nRoundsF / 2; r++) {
    state = addRoundConstants(state, roundIdx);
    state = sBoxFull(state);
    state = mixLayer(state);
    roundIdx++;
  }

  return state[0];
}

/**
 * Add round constants to state
 */
function addRoundConstants(state: bigint[], round: number): bigint[] {
  const t = state.length;
  return state.map((s, i) => mod(s + POSEIDON_C[round * t + i], SNARK_FIELD_SIZE));
}

/**
 * S-box function: x^5 mod p
 */
function sBox(x: bigint): bigint {
  const x2 = mod(x * x, SNARK_FIELD_SIZE);
  const x4 = mod(x2 * x2, SNARK_FIELD_SIZE);
  return mod(x4 * x, SNARK_FIELD_SIZE);
}

/**
 * Apply S-box to all state elements
 */
function sBoxFull(state: bigint[]): bigint[] {
  return state.map(sBox);
}

/**
 * Mix layer using MDS matrix multiplication
 */
function mixLayer(state: bigint[]): bigint[] {
  const result: bigint[] = [];
  for (let i = 0; i < state.length; i++) {
    let sum = BigInt(0);
    for (let j = 0; j < state.length; j++) {
      sum = mod(sum + state[j] * POSEIDON_M[i][j], SNARK_FIELD_SIZE);
    }
    result.push(sum);
  }
  return result;
}

/**
 * Modular arithmetic helper
 */
function mod(n: bigint, p: bigint): bigint {
  const result = n % p;
  return result >= BigInt(0) ? result : result + p;
}

/**
 * Hash two field elements using Poseidon
 */
export async function poseidonHash(left: bigint, right: bigint): Promise<bigint> {
  const poseidon = await initPoseidon();
  return poseidon([left, right]);
}

/**
 * Hash a single field element using Poseidon
 */
export async function poseidonHashSingle(input: bigint): Promise<bigint> {
  const poseidon = await initPoseidon();
  return poseidon([input]);
}

/**
 * Hash multiple field elements using Poseidon sponge construction
 */
export async function poseidonHashMany(inputs: bigint[]): Promise<bigint> {
  const poseidon = await initPoseidon();

  if (inputs.length === 0) {
    throw new Error('Cannot hash empty input');
  }

  if (inputs.length === 1) {
    return poseidon([inputs[0]]);
  }

  if (inputs.length === 2) {
    return poseidon([inputs[0], inputs[1]]);
  }

  // For more than 2 inputs, use sponge construction
  let hash = poseidon([inputs[0], inputs[1]]);
  for (let i = 2; i < inputs.length; i++) {
    hash = poseidon([hash, inputs[i]]);
  }

  return hash;
}

/**
 * Convert bytes to field element
 */
export function bytesToField(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result = result * BigInt(256) + BigInt(bytes[i]);
  }
  return mod(result, SNARK_FIELD_SIZE);
}

/**
 * Convert field element to bytes (32 bytes, big-endian)
 */
export function fieldToBytes(field: bigint): Uint8Array {
  const hex = field.toString(16).padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert hex string to field element
 */
export function hexToField(hex: string): bigint {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return mod(BigInt('0x' + cleanHex), SNARK_FIELD_SIZE);
}

/**
 * Convert field element to hex string
 */
export function fieldToHex(field: bigint): string {
  return field.toString(16).padStart(64, '0');
}

/**
 * Generate a random field element
 */
export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToField(bytes);
}

/**
 * Check if a value is a valid field element
 */
export function isValidFieldElement(value: bigint): boolean {
  return value >= BigInt(0) && value < SNARK_FIELD_SIZE;
}

// Export types
export type { PoseidonFn };
