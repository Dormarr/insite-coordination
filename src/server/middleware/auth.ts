import type { Next } from 'hono';
import type { AppContext } from '../types/common.js';
import { Deployment } from '../services/deploymentService.js';
import { getDeploymentByKey } from '../services/deploymentService.js';

const ADMIN_KEY = process.env.COORDINATION_ADMIN_KEY ?? 'dev-admin-key';

export const requireAdminKey = async (c: AppContext, next: Next) => {
    const auth = c.req.header('Authorization');
    if(!auth || !auth.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorised' }, 401);
    }
    const key = auth.replace('Bearer ', '');
    if(key !== ADMIN_KEY) {
        return c.json({ error: 'Unauthorised' }, 401);
    }
    await next();
}

export const requireDeploymentKey = async (c: AppContext, next: Next) => {
    const auth = c.req.header('Authorization');
    if(!auth || !auth.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorised' }, 401);
    }
    const key = auth.replace('Bearer ', '');
    const res = getDeploymentByKey(key);
    if(!res.ok) {
        return c.json({ error: 'Unauthorised' }, 401);
    }
    c.set('deployment', res.data as Deployment);
    await next();
}