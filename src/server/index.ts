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

// Admin routes - admin key auth
app.use('/api/v1/*', requireAdminKey);
app.route('/api/v1/deployments', deployments);
app.route('/api/v1/licences', licences);

serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`InSite Coordination running on http://localhost:${PORT}`);
});

export default app;