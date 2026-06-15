import type { Context } from "hono";
import type { Deployment } from '../services/deploymentService.js';

export type ServiceResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; code?: number }

export const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data});
export const err = <T>(error: string, code?: number): ServiceResult<T> => ({ ok: false, error, ...(code !== undefined ? {code} : {}) });

export type CoordinationVariables = {
    deployment: Deployment,
}

export type AppContext = Context<{ Variables: CoordinationVariables }>;