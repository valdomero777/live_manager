/**
 * Automatable checks of phase 0 (spec 17/18). The rest (LIVE Studio, audio capture, a real live)
 * is manual: see docs/fase-0.md.
 *
 *   npm run phase0 -- env                      # Node vs. connector engines, native modules
 *   npm run phase0 -- cpu --seconds 60         # system CPU while you run the load (see below)
 *   npm run phase0 -- latency --host 192.168.1.50 [--port 3389] [--count 20]
 *
 * `cpu` only samples the whole machine; start `npm run dev` and, in another terminal,
 * `npm run load-test -- --rate 100 --seconds 60` (or the simulator) while it measures.
 * Target: average below 25 %.
 */
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { connect } from 'node:net';
import { parseArgs } from 'node:util';

const MAX_CPU_PERCENT = 25;
const MAX_LATENCY_MS = 20;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    seconds: { type: 'string', default: '60' },
    host: { type: 'string' },
    port: { type: 'string', default: '3000' },
    count: { type: 'string', default: '20' },
  },
});

function report(ok: boolean, label: string, detail: string): void {
  process.stdout.write(`${ok ? 'OK  ' : 'FALLA'} ${label}: ${detail}\n`);
  if (!ok) process.exitCode = 1;
}

function satisfiesMinimum(version: string, range: string): boolean {
  const min = /(\d+)(?:\.(\d+))?/.exec(range);
  if (!min) return true;
  const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number);
  return major > Number(min[1]) || (major === Number(min[1]) && minor >= Number(min[2] ?? 0));
}

async function checkEnv(): Promise<void> {
  report(
    satisfiesMinimum(process.version, '>=22'),
    'Node del proyecto',
    `${process.version} (se exige >=22)`,
  );
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
    packages: Record<string, { version?: string; engines?: { node?: string } }>;
  };
  const connector = lock.packages['node_modules/tiktok-live-connector'];
  const needed = connector?.engines?.node ?? '(sin requisito)';
  report(
    satisfiesMinimum(process.version, needed),
    'Node exigido por tiktok-live-connector',
    `${connector?.version ?? '?'} pide ${needed}`,
  );
  try {
    await import('better-sqlite3');
    report(true, 'better-sqlite3', 'binario nativo carga');
  } catch (error) {
    report(false, 'better-sqlite3', error instanceof Error ? error.message : String(error));
  }
  process.stdout.write(
    'Pendiente manual: confirmar en el README del conector si hay límites sin clave de firma.\n',
  );
}

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const { times } of cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

async function checkCpu(): Promise<void> {
  const seconds = Number(values.seconds);
  const samples: number[] = [];
  let previous = cpuTimes();
  process.stdout.write(`Midiendo CPU del equipo durante ${seconds} s...\n`);
  for (let i = 0; i < seconds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const now = cpuTimes();
    const total = now.total - previous.total;
    samples.push(total > 0 ? (1 - (now.idle - previous.idle) / total) * 100 : 0);
    previous = now;
  }
  const average = samples.reduce((a, b) => a + b, 0) / samples.length;
  const peak = Math.max(...samples);
  report(
    average < MAX_CPU_PERCENT,
    'CPU media',
    `${average.toFixed(1)} % (máx. ${peak.toFixed(1)} %, límite ${MAX_CPU_PERCENT} %)`,
  );
}

function tcpRoundTrip(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const socket = connect({ host, port, timeout: 2000 }, () => {
      const elapsed = performance.now() - start;
      socket.destroy();
      resolve(elapsed);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('tiempo de espera agotado'));
    });
    socket.on('error', reject);
  });
}

async function checkLatency(): Promise<void> {
  const host = values.host;
  if (!host) throw new Error('Falta --host (IP de la PC de stream)');
  const count = Number(values.count);
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    try {
      times.push(await tcpRoundTrip(host, Number(values.port)));
    } catch (error) {
      process.stdout.write(
        `  intento ${i + 1}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (times.length === 0) {
    report(false, 'Latencia', `sin respuesta de ${host}:${values.port} (¿puerto abierto?)`);
    return;
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] ?? 0;
  report(
    p95 < MAX_LATENCY_MS,
    'Latencia TCP',
    `mediana ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms (límite ${MAX_LATENCY_MS} ms), ${times.length}/${count} respuestas`,
  );
}

const command = positionals[0];
try {
  if (command === 'env') await checkEnv();
  else if (command === 'cpu') await checkCpu();
  else if (command === 'latency') await checkLatency();
  else
    process.stdout.write('Uso: npm run phase0 -- env | cpu [--seconds 60] | latency --host <ip>\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
