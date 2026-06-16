import db from './database.js';

const deploymentsTable = `
    CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY NOT NULL,
        clientName TEXT NOT NULL,
        siteName TEXT NOT NULL,
        siteCode TEXT NOT NULL,
        deploymentKey TEXT NOT NULL UNIQUE,
        tunnelIp TEXT NOT NULL UNIQUE,
        publicKey TEXT NOT NULL UNIQUE,
        lastHeartbeat TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        licenceId TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (licenceId) REFERENCES licences(id)
    )`;

const licencesTable = `
    CREATE TABLE IF NOT EXISTS licences (
        id TEXT PRIMARY KEY NOT NULL,
        deploymentId TEXT NOT NULL UNIQUE,
        issuedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        tier TEXT NOT NULL,
        hardwareFingerprint TEXT,
        active INT NOT NULL DEFAULT 1,
        FOREIGN KEY (deploymentId) REFERENCES deployments(id)
    )`;

const licenceModulesTable = `
    CREATE TABLE IF NOT EXISTS licence_modules (
        licenceId TEXT NOT NULL,
        moduleId TEXT NOT NULL,
        PRIMARY KEY (licenceId, moduleId),
        FOREIGN KEY (licenceId) REFERENCES licences(id)
    )`;

export const createDatabaseTables = () => {
    db.exec(deploymentsTable);
    db.exec(licencesTable);
    db.exec(licenceModulesTable);

    // Deployments
    db.exec('CREATE INDEX IF NOT EXISTS idx_deployments_deploymentKey ON deployments(deploymentKey)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deployments_siteCode ON deployments(siteCode)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deployments_licenceId ON deployments(licenceId)');

    // Licences
    db.exec('CREATE INDEX IF NOT EXISTS idx_licences_deploymentId ON licences(deploymentId)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_licences_expiresAt ON licences(expiresAt)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_licences_active ON licences(active)');

    // Licence modules
    db.exec('CREATE INDEX IF NOT EXISTS idx_licence_modules_licenceId ON licence_modules(licenceId)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_licence_modules_moduleId ON licence_modules(moduleId)');
}

createDatabaseTables();