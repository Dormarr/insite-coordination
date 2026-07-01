import { Hono } from 'hono';
import { createDeployment, getDeployments, getDeploymentById, touchHeartbeat, setDeploymentStatus, getDeploymentBySiteCode } from '../services/deploymentService.js';

const deployments = new Hono();

// List all deployments
deployments.get('/', (c) => {
    const res = getDeployments();
    if(!res.ok) return c.json({ error: res.error }, 500);
    return c.json(res.data);
});

// Get single deployment
deployments.get('/:id', (c) => {
    const id = c.req.param('id');
    const res = getDeploymentById(id);
    if(!res.ok) return c.json({ error: res.error }, 404);
    return c.json(res.data);
});

// Register new deployment
deployments.post('/', async (c) => {
    const body = await c.req.json();

    const _res = getDeploymentBySiteCode(body.siteCode);
    if(_res.ok){
        return c.json({ error: `Site with site code ${body.siteCode} is already registered`}, 409);
    }

    if(!body.clientName || !body.siteName || !body.siteCode){
        return c.json({ error: 'clientName, siteName, and siteCode are required' }, 400);
    }

    const res = createDeployment({
        clientName: body.clientName,
        siteName: body.siteName,
        ...(body.tunnelIp ? { tunnelIp: body.tunnelIp } : {}),
        ...(body.publicKey ? { publicKey: body.publicKey } : {}),
        siteCode: body.siteCode,
    });

    if(!res.ok) return c.json({ error: res.error }, 500);
    return c.json(res.data, 201);
});

// Heartbeat
deployments.post('/:id/heartbeat', (c) => {
    const id = c.req.param('id');
    const res = touchHeartbeat(id);
    if(!res.ok) return c.json({ error: res.error }, 500);
    return new Response(null, { status: 204 });
});

// Update status
deployments.patch('/:id/status', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    if(!body.status) return c.json({ error: 'status is required' }, 400);
    const res = setDeploymentStatus(id, body.status);
    if(!res.ok) return c.json({ error: res.error }, 500);
    return new Response(null, { status: 204 });
});

// Public - lookup by site code (no auth required)
deployments.get('/lookup/:siteCode', (c) => {
    const siteCode = c.req.param('siteCode');
    const res = getDeploymentBySiteCode(siteCode);
    if(!res.ok) return c.json({ error: 'Deployment not found' }, 404);
    
    // Only return what the client needs - not the deploymentKey
    const { id, clientName, siteName, tunnelIp } = res.data;
    return c.json({ id, clientName, siteName, tunnelIp });
});

export default deployments;