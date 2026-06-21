import * as acme from 'acme-client';
import fs from 'fs';
import path from 'path';
import { createTxtRecord, deleteTxtRecord } from './cloudflareService.js';

const ACCOUNT_KEY_PATH = path.join(process.cwd(), 'data', 'acme-account-key.pem');

const getOrCreateAccountKey = async (): Promise<string> => {
    if (fs.existsSync(ACCOUNT_KEY_PATH)) {
        return fs.readFileSync(ACCOUNT_KEY_PATH, 'utf-8');
    }
    const key = await acme.crypto.createPrivateKey();
    fs.mkdirSync(path.dirname(ACCOUNT_KEY_PATH), { recursive: true });
    fs.writeFileSync(ACCOUNT_KEY_PATH, key);
    return key.toString();
};

export const issueCertificate = async (hostname: string, csrPem: string): Promise<string> => {
    console.log('[Certificates] Issuing certificate...')

    const accountKey = await getOrCreateAccountKey();

    const directoryUrl = acme.directory.letsencrypt.staging;
    console.log('[Certificates] Using directory:', directoryUrl);

    const client = new acme.Client({
        directoryUrl,
        accountKey,
    });
    acme.setLogger((message) => console.log('[acme-client]', message));

    const recordIds: string[] = [];

    console.log('[Certificates] Creating certificate...');
    const cert = await client.auto({
        csr: csrPem,
        email: 'admin@insite-platform.co.uk', // worth using a real, monitored mailbox - Let's Encrypt emails here on expiry problems
        termsOfServiceAgreed: true,
        challengePriority: ['dns-01'],
        challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
            const recordName = `_acme-challenge.${authz.identifier.value}`;
            const recordId = await createTxtRecord(recordName, keyAuthorization);
            recordIds.push(recordId);
        },
        challengeRemoveFn: async () => {
            for (const id of recordIds) await deleteTxtRecord(id);
        },
    });

    console.log('[Certificates] Certificate has been made, returning as string');

    return cert.toString();
};