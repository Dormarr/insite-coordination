import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import './db/schema.js';
import deployments from './routes/deployments.js';
import certificates from './routes/certificates.js';
import health from './routes/health.js';
import { requireAdminKey, requireDeploymentKey } from './middleware/auth.js';
import { CoordinationVariables } from './types/common.js';

const app = new Hono<{ Variables: CoordinationVariables }>();
const PORT = 3041;

import { cors } from 'hono/cors';
import { startSweepSchedule } from './jobs/peerSweep.js';

app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

// Public
app.route('/health', health);

// Deployment heartbeat - deployment key auth
app.post('/api/v1/deployments/:id/heartbeat', requireDeploymentKey, async (c) => {
    const { touchHeartbeat } = await import('./services/deploymentService.js');
    const id = c.req.param('id');
    if(!id) return new Response(null, { status: 401 });
    const res = touchHeartbeat(id);
    if(!res.ok) return c.json({ error: res.error }, 500);
    return new Response(null, { status: 204 });
});

// Licence validation - deployment key auth
app.post('/api/v1/licences/validate', requireDeploymentKey, async (c) => {
    const { validateLicence } = await import('./services/licenceService.js');
    const deployment = c.get('deployment');
    const res = validateLicence(deployment.id);
    if(!res.ok) return c.json({ error: res.error }, 500);
    return c.json({ valid: res.data });
});

// Public deployment lookup - no auth
app.get('/api/v1/deployments/lookup/:siteCode', async (c) => {
    const siteCode = c.req.param('siteCode');
    const { getDeploymentBySiteCode } = await import('./services/deploymentService.js');
    const res = getDeploymentBySiteCode(siteCode);
    if(!res.ok) return c.json({ error: 'Deployment not found' }, 404);
    const { id, clientName, siteName, tunnelIp } = res.data;
    return c.json({ id, clientName, siteName, tunnelIp });
});

// Public deployment registration - no auth
app.post('/api/v1/deployments/register', async (c) => {
    const body = await c.req.json();
    const { siteCode, publicKey } = body;

    if(!siteCode || !publicKey) {
        return c.json({ error: 'siteCode and publicKey required' }, 400);
    }

    const { getDeploymentBySiteCode, updateDeploymentPeer } = 
        await import('./services/deploymentService.js');

    const res = getDeploymentBySiteCode(siteCode);
    if(!res.ok) return c.json({ error: 'Deployment not found' }, 404);

    const deployment = res.data;

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const wgInterface = process.env.WG_INTERFACE ?? 'wg0';

    // Live wg0 state is the only trustworthy source - the DB can drift from it
    const { stdout } = await execAsync(`wg show ${wgInterface} dump`);
    const livePeers = stdout.trim().split('\n').slice(1).filter(Boolean).map(line => {
        const [pubKey, , , allowedIps] = line.split('\t');
        return { pubKey, allowedIps };
    });

    // If this site already had a peer (e.g. re-registering after a reset with a
    // fresh keypair), remove the old one so it doesn't linger as a dead peer
    // and doesn't keep its old IP marked as "used" once it's gone
    if(deployment.publicKey && deployment.publicKey !== publicKey) {
        const stillPresent = livePeers.some(p => p.pubKey === deployment.publicKey);
        if(stillPresent) {
            await execAsync(`wg set ${wgInterface} peer ${deployment.publicKey} remove`);
        }
    }

    const usedIps = livePeers
        .filter(p => p.pubKey !== deployment.publicKey)
        .map(p => p.allowedIps)
        .filter(ip => ip?.startsWith('10.0.0.'))
        .map(ip => parseInt(ip.split('.')[3].split('/')[0]));

    let nextIp = 2;
    while(usedIps.includes(nextIp)) nextIp++;
    const assignedIp = `10.0.0.${nextIp}`;

    try {
        await execAsync(`wg set ${wgInterface} peer ${publicKey} allowed-ips ${assignedIp}/32`);
        await execAsync(`wg-quick save ${wgInterface}`);
    } catch(e) {
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

app.post('/api/v1/certificates/issue', requireDeploymentKey, async (c) => {
    console.log('[Certificates] Request received for issuance');
    const { issueCertificate } = await import('./services/certificateService.js');
    const deployment = c.get('deployment');
    const body = await c.req.json();
    const { csr } = body;

    if (!csr) return c.json({ error: 'csr is required' }, 400);
    if(!deployment) console.log('[Certificates] Deployment key is missing');

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