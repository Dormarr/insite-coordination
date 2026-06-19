// jobs/peerSweep.ts
import { getStaleDeployments, setDeploymentStatus } from '../services/deploymentService.js';

const STALE_DAYS = 30;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const sweepStalePeers = async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const wgInterface = process.env.WG_INTERFACE ?? 'wg0';

    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const res = getStaleDeployments(cutoff);
    if (!res.ok) {
        console.error('[Sweep] Failed to query stale deployments:', res.error);
        return;
    }

    for (const deployment of res.data) {
        if (!deployment.publicKey) continue;
        try {
            await execAsync(`wg set ${wgInterface} peer ${deployment.publicKey} remove`);
            await execAsync(`wg-quick save ${wgInterface}`);
            setDeploymentStatus(deployment.id, 'stale');
            console.log(`[Sweep] Removed stale peer for ${deployment.siteCode}`);
        } catch(e) {
            console.error(`[Sweep] Failed to remove peer for ${deployment.id}:`, e);
        }
    }
}

export const startSweepSchedule = () => {
    sweepStalePeers().catch(e => console.error('[Sweep] Initial run failed:', e));
    setInterval(() => {
        sweepStalePeers().catch(e => console.error('[Sweep] Scheduled run failed:', e));
    }, SWEEP_INTERVAL_MS);
}