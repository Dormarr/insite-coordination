import db from "../db/database.js";
import { ok, err } from "../types/common.js";

export type Licence = {
    id: string,
    deploymentId: string,
    issuedAt: string,
    expiresAt: string,
    tier: string,
    hardwareFingerprint: string | null,
    active: number,
}

export type CreateLicenceParams = {
    deploymentId: string,
    expiresAt: string,
    tier: string,
    hardwareFingerprint?: string,
}

const _createLicence = db.prepare(`
    INSERT INTO licences (id, deploymentId, issuedAt, expiresAt, tier, hardwareFingerprint, active)
    VALUES (@id, @deploymentId, @issuedAt, @expiresAt, @tier, @hardwareFingerprint, 1)
`);

const _getLicenceByDeploymentId = db.prepare(`
    SELECT * FROM licences WHERE deploymentId = ?
`);

const _validateLicence = db.prepare(`
    SELECT COUNT(*) as count FROM licences 
    WHERE deploymentId = ? 
    AND active = 1 
    AND expiresAt > ?
`);

const _addModule = db.prepare(`
    INSERT OR IGNORE INTO licence_modules (licenceId, moduleId)
    VALUES (@licenceId, @moduleId)
`);

const _removeModule = db.prepare(`
    DELETE FROM licence_modules WHERE licenceId = ? AND moduleId = ?
`);

const _getModules = db.prepare(`
    SELECT moduleId FROM licence_modules WHERE licenceId = ?
`);

export const createLicence = (params: CreateLicenceParams) => {
    try {
        const id = crypto.randomUUID();
        const issuedAt = new Date().toISOString();
        _createLicence.run({
            id,
            deploymentId: params.deploymentId,
            issuedAt,
            expiresAt: params.expiresAt,
            tier: params.tier,
            hardwareFingerprint: params.hardwareFingerprint ?? null,
        });
        return ok(id);
    } catch(e) {
        return err('Failed to create licence');
    }
}

export const getLicenceByDeploymentId = (deploymentId: string) => {
    try {
        const row = _getLicenceByDeploymentId.get(deploymentId) as Licence | undefined;
        if(!row) return err('Licence not found');
        return ok(row);
    } catch(e) {
        return err('Failed to get licence');
    }
}

export const validateLicence = (deploymentId: string) => {
    try {
        const result = _validateLicence.get(deploymentId, new Date().toISOString()) as { count: number };
        return ok(result.count > 0);
    } catch(e) {
        return err('Failed to validate licence');
    }
}

export const addModuleToLicence = (licenceId: string, moduleId: string) => {
    try {
        _addModule.run({ licenceId, moduleId });
        return ok(undefined);
    } catch(e) {
        return err('Failed to add module to licence');
    }
}

export const removeModuleFromLicence = (licenceId: string, moduleId: string) => {
    try {
        _removeModule.run(licenceId, moduleId);
        return ok(undefined);
    } catch(e) {
        return err('Failed to remove module from licence');
    }
}

export const getModulesForLicence = (licenceId: string) => {
    try {
        const rows = _getModules.all(licenceId) as { moduleId: string }[];
        return ok(rows.map(r => r.moduleId));
    } catch(e) {
        return err('Failed to get modules');
    }
}