import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('festpass-timing-equaliser');
  await verify(await dummyHash, password);
}
