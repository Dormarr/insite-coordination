const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

const cfHeaders = () => ({
    'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json',
});

export const createTxtRecord = async (name: string, content: string): Promise<string> => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    console.log('[Cloudflare] token length:', token?.length, 'last 6 chars:', token?.slice(-6));
    console.log('[Cloudflare] zone id:', process.env.CLOUDFLARE_ZONE_ID);

    const res = await fetch(`${CF_API_BASE}/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`, {
        method: 'POST',
        headers: cfHeaders(),
        body: JSON.stringify({ type: 'TXT', name, content, ttl: 60 }),
    });
    const data = await res.json();
    console.log('[Cloudflare] full response:', JSON.stringify(data));
    if (!data.success) throw new Error(`Cloudflare TXT create failed: ${JSON.stringify(data.errors)}`);
    return data.result.id;
};

export const deleteTxtRecord = async (recordId: string): Promise<void> => {
    const res = await fetch(`${CF_API_BASE}/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`, {
        method: 'DELETE',
        headers: cfHeaders(),
    });
    const data = await res.json();
    if (!data.success) console.error(`[Cloudflare] Failed to delete TXT record ${recordId}:`, data.errors);
    // deliberately not throwing - a leftover stale TXT record is harmless, shouldn't fail the whole issuance
};