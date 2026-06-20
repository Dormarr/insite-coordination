import { Hono } from 'hono';
import { issueCertificate } from '../services/certificateService.js';
import { CoordinationVariables } from '../types/common.js';

const certificates = new Hono<{ Variables: CoordinationVariables }>();

certificates.post('/issue', async (c) => {
    const deployment = c.get('deployment'); // populated by requireDeploymentKey
    const body = await c.req.json();
    const { csr } = body;

    if (!csr) return c.json({ error: 'csr is required' }, 400);

    const hostname = `${deployment.siteCode}.insite-platform.co.uk`;

    try {
        const certificate = await issueCertificate(hostname, csr);
        return c.json({ certificate });
    } catch (e) {
        console.error('[Certificates] Issuance failed:', e);
        return c.json({ error: 'Certificate issuance failed' }, 500);
    }
});

export default certificates;