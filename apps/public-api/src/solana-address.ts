const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((character, index) => [character, index]));

/** Pure, network-free validation of a canonical 32-byte Solana public key. */
export function isValidSolanaAddress(input: string): boolean {
  if (typeof input !== "string" || input.length < 32 || input.length > 44) return false;

  const bytes: number[] = [0];
  for (const character of input) {
    const value = BASE58_INDEX.get(character);
    if (value === undefined) return false;
    let carry = value;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index]! * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeroes = 0;
  while (leadingZeroes < input.length && input[leadingZeroes] === "1") leadingZeroes += 1;
  const decodedLength = bytes.length + leadingZeroes - (bytes.length === 1 && bytes[0] === 0 ? 1 : 0);
  return decodedLength === 32;
}
