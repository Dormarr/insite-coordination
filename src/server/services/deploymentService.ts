import db from '../db/database.js';
import { ok, err, ServiceResult } from '../types/common.js';

export type Deployment = {
    id: string,
    clientName: string,
    siteName: string,
    siteCode: string,
    deploymentKey: string,
    tunnelIp?: string,
    publicKey?: string,
    lastHeartbeat: string | null,
    status: string,
    licenceId: string | null,
    createdAt: string,
}

export type CreateDeploymentParams = {
    clientName: string,
    siteName: string,
    tunnelIp?: string,
    publicKey?: string,
    siteCode: string,
}

export type DeploymentId = {
    id: string,
    deploymentKey: string,
}

const _createDeployment = db.prepare(`
    INSERT INTO deployments (id, clientName, siteName, siteCode, deploymentKey, tunnelIp, publicKey, status, createdAt)
    VALUES (@id, @clientName, @siteName, @siteCode, @deploymentKey, @tunnelIp, @publicKey, 'pending', @createdAt)
`);

const _getDeployments = db.prepare(`SELECT * FROM deployments`);
const _getDeploymentById = db.prepare(`SELECT * FROM deployments WHERE id = ?`);
const _getDeploymentByKey = db.prepare(`SELECT * FROM deployments WHERE deploymentKey = ?`);
const _updateHeartbeat = db.prepare(`UPDATE deployments SET lastHeartbeat = ? WHERE id = ?`);
const _updateStatus = db.prepare(`UPDATE deployments SET status = ? WHERE id = ?`);
const _getDeploymentBySiteCode = db.prepare(`SELECT * FROM deployments WHERE siteCode = ?`);
const _updateDeploymentPeer = db.prepare(`UPDATE deployments SET publicKey = ?, tunnelIp = ?, status = 'active' WHERE id = ?`);


export const updateDeploymentPeer = (id: string, publicKey: string, tunnelIp: string) => {
    try {
        _updateDeploymentPeer.run(publicKey, tunnelIp, id);
        return ok(undefined);
    } catch(e) {
        return err('Failed to update deployment peer');
    }
}

export const createDeployment = (params: CreateDeploymentParams): ServiceResult<DeploymentId> => {
    try {
        const id = crypto.randomUUID();
        const deploymentKey = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        _createDeployment.run({
            id,
            clientName: params.clientName,
            siteName: params.siteName,
            siteCode: params.siteCode,
            deploymentKey,
            tunnelIp: params.tunnelIp ?? null,
            publicKey: params.publicKey ?? null,
            createdAt,
        });

        return ok({ id, deploymentKey });
    } catch(e) {
        return err('Failed to create deployment:' + e);
    }
}

export const getDeployments = (): ServiceResult<Deployment[]> => {
    try {
        const rows = _getDeployments.all() as Deployment[];
        return ok(rows);
    } catch(e) {
        return err('Failed to get deployments');
    }
}

export const getDeploymentById = (id: string): ServiceResult<Deployment> => {
    try {
        const row = _getDeploymentById.get(id) as Deployment | undefined;
        if(!row) return err('Deployment not found');
        return ok(row);
    } catch(e) {
        return err('Failed to get deployment');
    }
}

export const getDeploymentByKey = (key: string): ServiceResult<Deployment> => {
    try {
        const row = _getDeploymentByKey.get(key) as Deployment | undefined;
        if(!row) return err('Deployment not found');
        return ok(row);
    } catch(e) {
        return err('Failed to get deployment');
    }
}

export const touchHeartbeat = (id: string): ServiceResult<void> => {
    try {
        _updateHeartbeat.run(new Date().toISOString(), id);
        return ok(undefined);
    } catch(e) {
        return err('Failed to update heartbeat');
    }
}

export const setDeploymentStatus = (id: string, status: string): ServiceResult<void> => {
    try {
        _updateStatus.run(status, id);
        return ok(undefined);
    } catch(e) {
        return err('Failed to update status');
    }
}

export const getDeploymentBySiteCode = (siteCode: string): ServiceResult<Deployment> => {
    try {
        const row = _getDeploymentBySiteCode.get(siteCode) as Deployment | undefined;
        if(!row) return err('Deployment not found');
        return ok(row);
    } catch(e) {
        return err('Failed to get deployment');
    }
}

const _getStaleDeployments = db.prepare(`
    SELECT * FROM deployments 
    WHERE status = 'active' 
    AND (
        (lastHeartbeat IS NOT NULL AND lastHeartbeat < @cutoff)
        OR (lastHeartbeat IS NULL AND createdAt < @cutoff)
    )
`);

export const getStaleDeployments = (cutoffIso: string): ServiceResult<Deployment[]> => {
    try {
        const rows = _getStaleDeployments.all({ cutoff: cutoffIso }) as Deployment[];
        return ok(rows);
    } catch(e) {
        return err('Failed to get stale deployments');
    }
}