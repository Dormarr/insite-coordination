import { Hono } from 'hono';
import db from '../db/database.js';

const health = new Hono();

health.get('/', (c) => {
    try {
        db.prepare('SELECT 1').get();
        return c.json({ 
            status: 'ok',
            timestamp: new Date().toISOString(),
        });
    } catch(e) {
        return c.json({ 
            status: 'error',
            timestamp: new Date().toISOString(),
        }, 500);
    }
});

export default health;