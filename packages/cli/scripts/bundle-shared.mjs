import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');
const cliDist = path.join(cliRoot, 'dist');
const sharedDist = path.join(repoRoot, 'packages', 'shared', 'dist');
const bundledSharedDir = path.join(cliDist, 'shared');
const bundledSharedIndex = path.join(bundledSharedDir, 'index.js');
const bareSharedSpecifier = '@pw-doctor/shared';

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function isRewriteTarget(filePath) {
  return (
    filePath.endsWith('.js') ||
    filePath.endsWith('.d.ts') ||
    filePath.endsWith('.js.map') ||
    filePath.endsWith('.d.ts.map')
  );
}

function relativeSharedSpecifier(fromFile) {
  const relativePath = path.relative(path.dirname(fromFile), bundledSharedIndex).replaceAll(path.sep, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

async function copySharedDeclarations() {
  const files = await listFiles(sharedDist);
  const declarationFiles = files.filter((file) => file.endsWith('.d.ts') || file.endsWith('.d.ts.map'));

  await Promise.all(declarationFiles.map(async (sourceFile) => {
    const relativePath = path.relative(sharedDist, sourceFile);
    const destinationFile = path.join(bundledSharedDir, relativePath);
    await fs.mkdir(path.dirname(destinationFile), { recursive: true });
    await fs.copyFile(sourceFile, destinationFile);
  }));
}

async function rewriteSharedSpecifiers() {
  const files = (await listFiles(cliDist)).filter(isRewriteTarget);

  await Promise.all(files.map(async (file) => {
    const contents = await fs.readFile(file, 'utf8');
    if (!contents.includes(bareSharedSpecifier)) {
      return;
    }

    const replacement = relativeSharedSpecifier(file);
    const rewritten = contents.replaceAll(
      /(['"])@pw-doctor\/shared\1/g,
      (_match, quote) => `${quote}${replacement}${quote}`,
    );

    await fs.writeFile(file, rewritten);
  }));
}

async function deleteSourceMapsForPublish() {
  const files = await listFiles(cliDist);
  const sourceMaps = files.filter((file) => file.endsWith('.map'));

  await Promise.all(sourceMaps.map((file) => fs.rm(file)));
}

async function main() {
  const sharedEntry = path.join(sharedDist, 'index.js');

  if (!await pathExists(sharedEntry)) {
    throw new Error(`Missing ${sharedEntry}. Run the monorepo build so @pw-doctor/shared builds before pw-doctor.`);
  }

  await fs.mkdir(bundledSharedDir, { recursive: true });

  await build({
    entryPoints: [sharedEntry],
    outfile: bundledSharedIndex,
    bundle: true,
    external: ['zod'],
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    treeShaking: true,
    sourcemap: false,
    legalComments: 'none',
  });

  await copySharedDeclarations();
  await rewriteSharedSpecifiers();

  if (process.env.PWDOCTOR_PUBLISH_BUILD === '1') {
    // Publish tarballs do not need development sourcemaps; normal builds keep them for local debugging.
    await deleteSourceMapsForPublish();
  }
}

await main();
