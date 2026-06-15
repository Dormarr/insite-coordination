import { Hono } from 'hono';
import { createDeployment, getDeployments, getDeploymentById, touchHeartbeat, setDeploymentStatus } from '../services/deploymentService.js';

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

    if(!body.clientName || !body.siteName || !body.tunnelIp || !body.publicKey){
        return c.json({ error: 'clientName, siteName, tunnelIp and publicKey are required' }, 400);
    }

    const res = createDeployment({
        clientName: body.clientName,
        siteName: body.siteName,
        tunnelIp: body.tunnelIp,
        publicKey: body.publicKey,
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

export default deployments;