import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import './db/schema.js';
import deployments from './routes/deployments.js';
import licences from './routes/licences.js';
import health from './routes/health.js';
import { requireAdminKey, requireDeploymentKey } from './middleware/auth.js';
import { CoordinationVariables } from './types/common.js';

const app = new Hono<{ Variables: CoordinationVariables }>();
const PORT = 3041;

import { cors } from 'hono/cors';

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

    const { getDeploymentBySiteCode, getDeployments, updateDeploymentPeer } = 
        await import('./services/deploymentService.js');

    const res = getDeploymentBySiteCode(siteCode);
    if(!res.ok) return c.json({ error: 'Deployment not found' }, 404);

    const deployment = res.data;

    const allDeployments = getDeployments();
    if(!allDeployments.ok) return c.json({ error: 'Failed' }, 500);

    const usedIps = allDeployments.data
        .map((d: any) => d.tunnelIp)
        .filter((ip: string) => ip?.startsWith('10.0.0.'))
        .map((ip: string) => parseInt(ip.split('.')[3]));

    let nextIp = 2;
    while(usedIps.includes(nextIp)) nextIp++;
    const assignedIp = `10.0.0.${nextIp}`;

    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const wgInterface = process.env.WG_INTERFACE ?? 'wg0';
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

// Admin routes - admin key auth
app.use('/api/v1/*', requireAdminKey);
app.route('/api/v1/deployments', deployments);
app.route('/api/v1/licences', licences);

serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`InSite Coordination running on http://localhost:${PORT}`);
});

export default app;