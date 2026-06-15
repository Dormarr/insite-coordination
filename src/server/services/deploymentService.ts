import db from '../db/database.js';
import { ok, err } from '../types/common.js';

export type Deployment = {
    id: string,
    clientName: string,
    siteName: string,
    deploymentKey: string,
    tunnelIp: string,
    publicKey: string,
    lastHeartbeat: string | null,
    status: string,
    licenceId: string | null,
    createdAt: string,
}

export type CreateDeploymentParams = {
    clientName: string,
    siteName: string,
    tunnelIp: string,
    publicKey: string,
}

const _createDeployment = db.prepare(`
    INSERT INTO deployments (id, clientName, siteName, deploymentKey, tunnelIp, publicKey, status, createdAt)
    VALUES (@id, @clientName, @siteName, @deploymentKey, @tunnelIp, @publicKey, 'pending', @createdAt)
`);

const _getDeployments = db.prepare(`SELECT * FROM deployments`);
const _getDeploymentById = db.prepare(`SELECT * FROM deployments WHERE id = ?`);
const _getDeploymentByKey = db.prepare(`SELECT * FROM deployments WHERE deploymentKey = ?`);
const _updateHeartbeat = db.prepare(`UPDATE deployments SET lastHeartbeat = ? WHERE id = ?`);
const _updateStatus = db.prepare(`UPDATE deployments SET status = ? WHERE id = ?`);

export const createDeployment = (params: CreateDeploymentParams) => {
    try {
        const id = crypto.randomUUID();
        const deploymentKey = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        _createDeployment.run({
            id,
            clientName: params.clientName,
            siteName: params.siteName,
            deploymentKey,
            tunnelIp: params.tunnelIp,
            publicKey: params.publicKey,
            createdAt,
        });

        return ok({ id, deploymentKey });
    } catch(e) {
        return err('Failed to create deployment');
    }
}

export const getDeployments = () => {
    try {
        const rows = _getDeployments.all() as Deployment[];
        return ok(rows);
    } catch(e) {
        return err('Failed to get deployments');
    }
}

export const getDeploymentById = (id: string) => {
    try {
        const row = _getDeploymentById.get(id) as Deployment | undefined;
        if(!row) return err('Deployment not found');
        return ok(row);
    } catch(e) {
        return err('Failed to get deployment');
    }
}

export const getDeploymentByKey = (key: string) => {
    try {
        const row = _getDeploymentByKey.get(key) as Deployment | undefined;
        if(!row) return err('Deployment not found');
        return ok(row);
    } catch(e) {
        return err('Failed to get deployment');
    }
}

export const touchHeartbeat = (id: string) => {
    try {
        _updateHeartbeat.run(new Date().toISOString(), id);
        return ok(undefined);
    } catch(e) {
        return err('Failed to update heartbeat');
    }
}

export const setDeploymentStatus = (id: string, status: string) => {
    try {
        _updateStatus.run(status, id);
        return ok(undefined);
    } catch(e) {
        return err('Failed to update status');
    }
}