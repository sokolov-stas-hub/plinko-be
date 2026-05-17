import { createHash, randomUUID } from 'crypto';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newJti = () => randomUUID();
