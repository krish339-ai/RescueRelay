import { Platform } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiCapabilities, AiOperationResponse, AiWorkspace, PlanResponse, SessionResponse, Snapshot } from '@rescuerelay/shared';
import { conflictMessage, createApiClient, normalizeApiUrl, RequestError } from './api';
import { createInvestigationFlow, type InvestigationInput, type PreparedInvestigation } from './ai';
import { clearToken, readToken, saveToken } from './session';

export const API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL, Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined);
const request = createApiClient(API_URL);
// Server bounds an investigation to 180 seconds; leave time for its final response.
const aiOperationRequest = createApiClient(API_URL, fetch, 190000);
export function useRelay() {
  const aiFlow = useRef(createInvestigationFlow(request, Date.now, aiOperationRequest));
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const config = useCallback(async () => {
    try { const result = await request<{ demoMode: boolean }>('/config'); setDemoMode(result.demoMode); }
    catch (e) { setDemoMode(null); setError((e as Error).message); }
  }, []);
  const dropSession = useCallback(async () => {
    aiFlow.current.clear();
    tokenRef.current = null; setToken(null); setSnapshot(null); setConnected(false);
    try { await clearToken(); }
    catch { setNotice('The device could not clear its secure session store. Sign in again only on a trusted device.'); }
  }, []);
  const refresh = useCallback(async (overrideToken?: string): Promise<boolean> => {
    const current = overrideToken ?? tokenRef.current;
    if (!current) return false;
    setRefreshing(true);
    try {
      const next = await request<Snapshot>('/snapshot', current);
      if (current !== tokenRef.current) return false;
      setSnapshot(previous => previous && previous.version > next.version ? previous : next); setConnected(true); setError(''); return true;
    } catch (e) {
      if (current !== tokenRef.current) return false;
      if (e instanceof RequestError && e.status === 401) {
        await dropSession(); setError('Your session expired. Please sign in again.');
      } else { setConnected(false); setError((e as Error).message); }
      return false;
    } finally { setRefreshing(false); }
  }, [dropSession]);
  useEffect(() => {
    let active = true;
    void config();
    void (async () => {
      try {
        const saved = await readToken();
        if (!active) return;
        if (saved) { tokenRef.current = saved; setToken(saved); await refresh(saved); }
      } catch { if (active) setNotice('Secure session storage is unavailable. Sign in to continue.'); }
      finally { if (active) setBooting(false); }
    })();
    return () => { active = false; };
  }, [config, refresh]);
  const authenticate = useCallback(async (mode: 'login' | 'register' | 'demo', body: unknown) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const session = await request<SessionResponse>(`/auth/${mode}`, null, body);
      tokenRef.current = session.token; setToken(session.token);
      try {
        const persisted = await saveToken(session.token);
        if (!persisted) setNotice('This session stays in memory only; sign in again after closing the app.');
      } catch { setNotice('Secure storage could not save this session. It will last only while the app is open.'); }
      await refresh(session.token);
    } catch (e) { setError((e as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }, [refresh]);
  const logout = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { if (tokenRef.current) await request('/auth/logout', tokenRef.current, {}); }
    catch { setNotice('Signed out on this device. The server could not confirm revocation; the remote session will expire automatically.'); }
    finally { await dropSession(); busyRef.current = false; setBusy(false); }
  }, [dropSession]);
  const mutate = useCallback(async (path: string, body: Record<string, unknown> = {}, method?: 'PATCH'): Promise<boolean> => {
    if (busyRef.current || !snapshot || !tokenRef.current || !connected) return false;
    const current = tokenRef.current;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<Snapshot | PlanResponse>(path, current, { ...body, expectedVersion: snapshot.version }, method);
      if (current !== tokenRef.current) return false;
      const next = 'snapshot' in result ? result.snapshot : result;
      setSnapshot(previous => previous && previous.version > next.version ? previous : next); setConnected(true);
      setNotice('Saved to your organization.'); return true;
    } catch (e) {
      if (current !== tokenRef.current) return false;
      if (e instanceof RequestError && e.status === 401) { await dropSession(); setError('Your session expired. Please sign in again.'); }
      else if (e instanceof RequestError && e.status === 409) {
        const ok = await refresh();
        if (ok) setError(conflictMessage(e));
      } else {
        if (!(e instanceof RequestError) || e.status === 0 || e.code === 'INVALID_RESPONSE' || e.status >= 500) setConnected(false);
        setError((e as Error).message);
      }
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }, [snapshot, connected, refresh, dropSession]);
  const aiCall = useCallback(async <T,>(action: (current: string, version: number) => Promise<T>): Promise<T> => {
    if (busyRef.current || !snapshot || !tokenRef.current || !connected || snapshot.user.role !== 'coordinator') {
      throw new RequestError('Wait for the current action and refresh an authorized coordinator workspace before continuing.', 409, 'WORKSPACE_NOT_READY');
    }
    const current = tokenRef.current;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await action(current, snapshot.version);
      if (current !== tokenRef.current) throw new RequestError('The session changed. Refresh before reviewing any result.', 401, 'SESSION_CHANGED');
      return result;
    } catch (e) {
      if (current === tokenRef.current) {
        if (e instanceof RequestError && e.status === 401) { await dropSession(); setError('Your session expired. Please sign in again.'); }
        else if (e instanceof RequestError && e.status === 409) await refresh();
        else if (!(e instanceof RequestError) || e.status === 0 || e.code === 'INVALID_RESPONSE' || e.status >= 500) setConnected(false);
      }
      throw e;
    } finally { busyRef.current = false; setBusy(false); }
  }, [snapshot, connected, refresh, dropSession]);
  const readAiCapabilities = useCallback(() => aiCall(current => request<AiCapabilities>('/ai/capabilities', current)), [aiCall]);
  const readAiReceipts = useCallback(() => aiCall(async current => (await request<AiWorkspace>('/ai/drafts', current)).receipts ?? []), [aiCall]);
  const prepareAiInvestigation = useCallback((input: InvestigationInput) => aiCall((current, version) => aiFlow.current.prepare(current, input, version)), [aiCall]);
  const discardAiConsent = useCallback((prepared: PreparedInvestigation) => aiFlow.current.discard(prepared), []);
  const runAiInvestigation = useCallback((prepared: PreparedInvestigation) => aiCall(async (current, version) => {
    const result: AiOperationResponse = await aiFlow.current.execute(prepared, current, version, true);
    if (current === tokenRef.current) {
      setSnapshot(previous => previous && previous.version > result.snapshot.version ? previous : result.snapshot);
      setConnected(true); setNotice('AI result received. No assignment was approved; review the recovery proposal separately.');
    }
    return result;
  }), [aiCall]);
  return { token, snapshot, booting, refreshing, busy, connected, error, notice, demoMode, authenticate, logout, refresh, mutate, retryConfig: config, readAiCapabilities, readAiReceipts, prepareAiInvestigation, discardAiConsent, runAiInvestigation };
}
export type Relay = ReturnType<typeof useRelay>;
