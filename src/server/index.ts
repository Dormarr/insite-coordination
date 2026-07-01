import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import './db/schema.js';
import deployments from './routes/deployments.js';
import health from './routes/health.js';
import { requireAdminKey, requireDeploymentKey } from './middleware/auth.js';
import { CoordinationVariables } from './types/common.js';
import { cors } from 'hono/cors';
import { rateLimiter } from 'hono-rate-limiter';
import { startSweepSchedule } from './jobs/peerSweep.js';

const app = new Hono<{ Variables: CoordinationVariables }>();
const PORT = 3041;

app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

// IP allocation helpers for /16 subnet
const parseIp = (allowedIps: string): number[] | null => {
    const ip = allowedIps.split('/')[0];
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return null;
    return parts;
}

const ipToNumber = (parts: number[]): number => {
    return (parts[2] << 8) | parts[3];
}

const numberToIp = (n: number): string => {
    const third = (n >> 8) & 0xff;
    const fourth = n & 0xff;
    return `10.0.${third}.${fourth}`;
}

const getNextIp = (livePeers: { pubKey: string, allowedIps: string }[], excludePubKey?: string): string => {
    const usedNumbers = livePeers
        .filter(p => p.pubKey !== excludePubKey)
        .map(p => parseIp(p.allowedIps))
        .filter((parts): parts is number[] => parts !== null && parts[0] === 10 && parts[1] === 0)
        .map(parts => ipToNumber(parts));

    let next = 2;
    while (usedNumbers.includes(next)) next++;
    return numberToIp(next);
}

const getWgPeers = async (wgInterface: string) => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(`wg show ${wgInterface} dump`);
    return stdout.trim().split('\n').slice(1).filter(Boolean).map(line => {
        const [pubKey, , , allowedIps] = line.split('\t');
        return { pubKey, allowedIps };
    });
}

// Public
app.route('/health', health);

// Public deployment lookup - no auth
app.get('/api/v1/deployments/lookup/:siteCode', async (c) => {
    const siteCode = c.req.param('siteCode');
    const { getDeploymentBySiteCode } = await import('./services/deploymentService.js');
    const res = getDeploymentBySiteCode(siteCode);
    if (!res.ok) return c.json({ error: 'Deployment not found' }, 404);
    const { id, clientName, siteName, tunnelIp } = res.data;
    return c.json({ id, clientName, siteName, tunnelIp });
});

// Public peer registration for Electron clients - rate limited, no auth
app.post('/api/v1/deployments/peer', rateLimiter({
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: (c: any) => c.req.header('x-forwarded-for') ?? 'unknown',
}), async (c) => {
    const body = await c.req.json();
    const { siteCode, publicKey } = body;

    if (!siteCode || !publicKey) {
        return c.json({ error: 'siteCode and publicKey are required' }, 400);
    }

    const { getDeploymentBySiteCode, updateDeploymentPeer } =
        await import('./services/deploymentService.js');

    const res = getDeploymentBySiteCode(siteCode);
    if (!res.ok) return c.json({ error: 'Deployment not found' }, 404);

    const deployment = res.data;
    const wgInterface = process.env.WG_INTERFACE ?? 'wg0';

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const livePeers = await getWgPeers(wgInterface);

    if (deployment.publicKey && deployment.publicKey !== publicKey) {
        const stillPresent = livePeers.some(p => p.pubKey === deployment.publicKey);
        if (stillPresent) {
            await execAsync(`wg set ${wgInterface} peer ${deployment.publicKey} remove`);
        }
    }

    const assignedIp = getNextIp(livePeers, deployment.publicKey ?? undefined);

    try {
        await execAsync(`wg set ${wgInterface} peer ${publicKey} allowed-ips ${assignedIp}/32`);
        await execAsync(`wg-quick save ${wgInterface}`);
    } catch (e) {
        console.error('[WireGuard] Failed to add peer:', e);
        return c.json({ error: 'Failed to configure tunnel' }, 500);
    }

    updateDeploymentPeer(deployment.id, publicKey, assignedIp);

    return c.json({
        assignedIp,
        serverPublicKey: process.env.WG_SERVER_PUBLIC_KEY,
        serverEndpoint: process.env.WG_SERVER_ENDPOINT,
    });
});

// Authenticated peer registration for on-site server watchdog - deployment key auth
app.post('/api/v1/deployments/register', requireDeploymentKey, async (c) => {
    const body = await c.req.json();
    const { publicKey } = body;

    if (!publicKey) {
        return c.json({ error: 'publicKey is required' }, 400);
    }

    const deployment = c.get('deployment');
    const { updateDeploymentPeer } = await import('./services/deploymentService.js');
    const wgInterface = process.env.WG_INTERFACE ?? 'wg0';

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const livePeers = await getWgPeers(wgInterface);

    if (deployment.publicKey && deployment.publicKey !== publicKey) {
        const stillPresent = livePeers.some(p => p.pubKey === deployment.publicKey);
        if (stillPresent) {
            await execAsync(`wg set ${wgInterface} peer ${deployment.publicKey} remove`);
        }
    }

    const assignedIp = getNextIp(livePeers, deployment.publicKey ?? undefined);

    try {
        await execAsync(`wg set ${wgInterface} peer ${publicKey} allowed-ips ${assignedIp}/32`);
        await execAsync(`wg-quick save ${wgInterface}`);
    } catch (e) {
        console.error('[WireGuard] Failed to add peer:', e);
        return c.json({ error: 'Failed to configure tunnel' }, 500);
    }

    updateDeploymentPeer(deployment.id, publicKey, assignedIp);

    return c.json({
        assignedIp,
        serverPublicKey: process.env.WG_SERVER_PUBLIC_KEY,
        serverEndpoint: process.env.WG_SERVER_ENDPOINT,
    });
});

// Deployment heartbeat - deployment key auth
app.post('/api/v1/deployments/:id/heartbeat', requireDeploymentKey, async (c) => {
    const { touchHeartbeat } = await import('./services/deploymentService.js');
    const id = c.req.param('id');
    if (!id) return new Response(null, { status: 401 });
    const res = touchHeartbeat(id);
    if (!res.ok) return c.json({ error: res.error }, 500);
    return new Response(null, { status: 204 });
});

// Licence validation - deployment key auth
app.post('/api/v1/licences/validate', requireDeploymentKey, async (c) => {
    const { validateLicence } = await import('./services/licenceService.js');
    const deployment = c.get('deployment');
    const res = validateLicence(deployment.id);
    if (!res.ok) return c.json({ error: res.error }, 500);
    return c.json({ valid: res.data });
});

// Certificate issuance - deployment key auth
app.post('/api/v1/certificates/issue', requireDeploymentKey, async (c) => {
    console.log('[Certificates] Request received for issuance');
    const { issueCertificate } = await import('./services/certificateService.js');
    const deployment = c.get('deployment');
    const body = await c.req.json();
    const { csr } = body;

    if (!csr) return c.json({ error: 'csr is required' }, 400);

    const hostname = `${deployment.siteCode}.insite-platform.co.uk`;

    try {
        const certificate = await issueCertificate(hostname, csr);
        console.log('[Certificates] Certificate has reached the endpoint. Returning to client');
        return c.json({ certificate });
    } catch (e) {
        console.error('[Certificates] Issuance failed:', e);
        return c.json({ error: 'Certificate issuance failed' }, 500);
    }
});

// Admin routes - admin key auth
app.use('/api/v1/*', requireAdminKey);
app.route('/api/v1/deployments', deployments);

serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`InSite Coordination running on http://localhost:${PORT}`);
});

startSweepSchedule();

export default app;