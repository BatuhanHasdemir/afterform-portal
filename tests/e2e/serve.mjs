import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../dev-mock/server.mjs';

// The mock on its own port with throwaway data, so the browser tests never touch the data
// behind `npm run mock`. Playwright ends this process without a signal on Windows, so the
// folder is cleared when the next run starts rather than on exit.
const port = Number(process.argv[2] ?? 3200);
const dataDir = join(tmpdir(), `afterform-e2e-${port}`);
rmSync(dataDir, { recursive: true, force: true });
await startServer({ port, host: 'localhost', dataDir });
