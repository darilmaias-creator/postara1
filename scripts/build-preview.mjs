import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourceDirectory = resolve('postara-backend', 'public');
const outputDirectory = resolve('dist');

// Mantemos um build simples: a Vercel recebe exatamente o scaffold atual do front.
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });

console.log(`Preview estático pronto em ${outputDirectory}`);

