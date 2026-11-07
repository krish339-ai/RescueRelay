import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { AiCapabilities, AiOperationReceipt, AiOperationResponse } from '@rescuerelay/shared';
import type { InvestigationInput, PreparedInvestigation } from './ai';
import type { Relay } from './useRelay';

const names = { fireworks: 'Fireworks AI', nebius: 'Nebius Token Factory', openai: 'OpenAI API', pinecone: 'Pinecone', langsmith: 'LangSmith' };
function Action({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, disabled && s.disabled, pressed && { opacity: 0.75 }]}><Text style={[s.buttonText, secondary && { color: '#173F35' }]}>{label}</Text></Pressable>;
}
export function AiAssist({ relay, reviewRecovery }: { relay: Relay; reviewRecovery: () => void }) {
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [provider, setProvider] = useState<InvestigationInput['provider']>('fireworks');
  const [usePinecone, setUsePinecone] = useState(false);
  const [trace, setTrace] = useState(false);
  const [prepared, setPrepared] = useState<PreparedInvestigation | null>(null);
  const [payloadExpanded, setPayloadExpanded] = useState(false);
  const [payloadReviewed, setPayloadReviewed] = useState(false);
  const preparedRef = useRef<PreparedInvestigation | null>(null);
  const [result, setResult] = useState<AiOperationResponse | null>(null);
  const [resultProviders, setResultProviders] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<AiOperationReceipt[]>([]);
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'running'>('idle');
  const [now, setNow] = useState(Date.now);
  const active = useRef(true);
  const snapshot = relay.snapshot!;
  const pending = snapshot.rescues.filter(rescue => rescue.status === 'needs_recovery');
  const manifest = prepared?.manifest;
  const expired = !!manifest && Date.parse(manifest.expiresAt) <= now;
  const stale = !!manifest && manifest.expectedVersion !== snapshot.version;
  const locked = relay.busy || !relay.connected;
  const invalidate = () => {
    if (preparedRef.current) relay.discardAiConsent(preparedRef.current);
    preparedRef.current = null; setPrepared(null); setPayloadExpanded(false); setPayloadReviewed(false); setError('');
  };
  useEffect(() => {
    active.current = true;
    // Status is a local API GET. Never prepares consent or contacts a vendor on mount.
    void relay.readAiCapabilities().then(value => { if (active.current) setCapabilities(value); }).catch(e => { if (active.current) setError((e as Error).message); }).finally(() => { if (active.current) setLoading(false); });
    return () => { active.current = false; if (preparedRef.current) relay.discardAiConsent(preparedRef.current); };
  }, []);
  useEffect(() => {
    if (!prepared) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [prepared]);
  const refreshCapabilities = async () => {
    invalidate(); setLoading(true);
    try { const value = await relay.readAiCapabilities(); if (active.current) setCapabilities(value); }
    catch (e) { if (active.current) setError((e as Error).message); }
    finally { if (active.current) setLoading(false); }
  };
  const prepare = async () => {
    invalidate(); setResult(null); setResultProviders([]); setPhase('preparing');
    try {
      const next = await relay.prepareAiInvestigation({ provider, rescueIds: pending.map(rescue => rescue.id), usePinecone, trace });
      if (!active.current) { relay.discardAiConsent(next); return; }
      preparedRef.current = next; setPrepared(next); setNow(Date.now());
    } catch (e) { if (active.current) setError((e as Error).message); }
    finally { if (active.current) setPhase('idle'); }
  };
  const readReceipts = async () => {
    setError('');
    try { const next = await relay.readAiReceipts(); if (active.current) { setReceipts(next); setReceiptsLoaded(true); } }
    catch (e) { if (active.current) setError((e as Error).message); }
  };
  const confirm = async () => {
    const consent = preparedRef.current;
    if (!consent || locked || !payloadReviewed) return;
    // Remove the control immediately. A failed or uncertain operation never reuses consent.
    preparedRef.current = null; setPrepared(null); setPhase('running'); setError('');
    try { const response = await relay.runAiInvestigation(consent); if (active.current) { setResult(response); setResultProviders(consent.manifest.providers.map(id => names[id as keyof typeof names] ?? id)); if (response.receipt) setReceipts(previous => [response.receipt!, ...previous.filter(item => item.id !== response.receipt!.id)]); } }
    catch (e) { if (active.current) setError(`${(e as Error).message}\nNo request was automatically repeated. External work may already have occurred unless the server explicitly says no call was made. Refresh and review before authorizing a new transfer.`); }
    finally { relay.discardAiConsent(consent); if (active.current) setPhase('idle'); }
  };
  return <>
    <Text style={s.eyebrow}>OPTIONAL INTELLIGENCE. HUMAN AUTHORITY.</Text>
    <Text accessibilityRole="header" style={s.title}>A second perspective.</Text>
    <Text style={s.body}>Investigate recovery options with a provider you choose. Every transfer needs your consent. Every assignment still needs separate approval.</Text>
    {error ? <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.error}><Text style={s.warning}>{error}</Text></View> : null}
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>Connection status, not a promise</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Reading local AI capability settings" color="#173F35" /> : <Text style={s.badge}>{capabilities ? `External calls ${capabilities.externalCallsEnabled ? 'enabled by operator' : 'OFF'}` : 'Status unavailable'}</Text>}
      <Text style={s.body}>{capabilities?.disclosure ?? 'Status is read from your API. No vendor connection, credit balance, or model access is tested here.'}</Text>
      {capabilities && <>
        {(expanded ? capabilities.providers : capabilities.providers.filter(item => ['fireworks', 'nebius', 'openai', 'pinecone', 'langsmith'].includes(item.provider))).map(item => <View key={item.provider} style={s.providerStatus}>
          <Text style={s.heading}>{item.label}</Text>
          <Text style={s.small}>{item.enabled ? 'Enabled' : 'Disabled'} · {item.configured ? 'Configured' : 'Unconfigured'} · {item.available ? 'Execution available' : 'Execution blocked'} · Live-unverified</Text>
          {expanded && <><Text style={s.small}>{item.note}</Text>{item.missingEnv.length > 0 && <Text selectable style={s.small}>Missing server settings: {item.missingEnv.join(', ')}</Text>}</>}
        </View>)}
        <Action secondary label={expanded ? 'Show investigation services only' : 'Show all service status & setup names'} onPress={() => setExpanded(!expanded)} />
      </>}
      <Action secondary label="Refresh local capability status" disabled={locked || loading} onPress={() => void refreshCapabilities()} />
      <Text style={s.small}>No keys are collected or displayed. Configured ≠ connected. Subscription credits and pricing are not verified.</Text>
    </View>
    <View style={s.card}>
      <Text style={s.step}>01 · CHOOSE THE INVESTIGATION</Text>
      <Text accessibilityRole="header" style={s.heading}>Your provider. Your choice.</Text>
      {(['fireworks', 'nebius', 'openai'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${names[value]} investigation`} accessibilityState={{ checked: provider === value, disabled: locked }} disabled={locked} onPress={() => { invalidate(); setProvider(value); }} style={[s.choice, provider === value && s.selected]}><View style={[s.radio, provider === value && s.checked]} /><Text style={s.heading}>{names[value]}</Text></Pressable>)}
      <View style={s.toggle}><View style={s.flex}><Text style={s.heading}>Pinecone policy retrieval</Text><Text style={s.small}>Separate remote reference lookup. Cannot override configured constraints.</Text></View><Switch accessibilityLabel="Include Pinecone policy retrieval in consent" value={usePinecone} disabled={locked} onValueChange={value => { invalidate(); setUsePinecone(value); }} trackColor={{ false: '#DDE2D7', true: '#173F35' }} /></View>
      <View style={s.toggle}><View style={s.flex}><Text style={s.heading}>LangSmith redacted trace</Text><Text style={s.small}>Separate count and tool metadata transfer, disclosed before execution.</Text></View><Switch accessibilityLabel="Include LangSmith redacted trace in consent" value={trace} disabled={locked} onValueChange={value => { invalidate(); setTrace(value); }} trackColor={{ false: '#DDE2D7', true: '#173F35' }} /></View>
      <Text style={s.body}>{pending.length} current recovery incident{pending.length === 1 ? '' : 's'} · workspace v{snapshot.version}</Text>
      <Action label={phase === 'preparing' ? 'Preparing local preview…' : 'Prepare data-transfer preview'} disabled={locked || !pending.length || loading} onPress={() => void prepare()} />
      <Text style={s.small}>Preparation stays local, even when integrations are disabled. It does not run a model or approve a rescue. Changing options discards the old preview.</Text>
      {!pending.length && <Text style={s.body}>No recovery incidents need investigation. Existing proposals remain in Recovery.</Text>}
    </View>
    {manifest && <View style={s.consent}>
      <Text style={s.step}>02 · REVIEW BEFORE YOU AUTHORIZE</Text>
      <Text accessibilityRole="header" style={s.heading}>This exact transfer</Text>
      <Text style={s.label}>PROVIDERS</Text><Text selectable style={s.body}>{manifest.providers.map(id => names[id as keyof typeof names] ?? id).join(' + ')}</Text>
      <Text style={s.label}>DATA CATEGORIES</Text>{manifest.dataCategories.map((category, index) => <Text key={index} style={s.body}>• {category}</Text>)}
      <Text style={s.label}>EXACT PAYLOAD PREVIEW · FROM THE SERVER</Text><Action secondary label={payloadExpanded ? 'Hide exact payload' : 'Show exact payload before confirming'} onPress={() => { setPayloadExpanded(!payloadExpanded); setPayloadReviewed(true); }} />{payloadExpanded && <Text selectable style={s.payload}>{JSON.stringify(manifest.payloadPreview, null, 2)}</Text>}
      <Text style={s.label}>PAYLOAD SHA-256</Text><Text selectable style={s.hash}>{manifest.payloadSha256}</Text>
      <Text style={s.body}>At most {manifest.maximumRequests} requests · {manifest.executionMode} · workspace v{manifest.expectedVersion}</Text>
      <Text style={s.small}>This request budget is not a monetary or credit cap. Expires {new Date(manifest.expiresAt).toLocaleString()}.</Text>
      <Text style={s.warning}>{manifest.retentionNotice}</Text>
      {!manifest.executionAvailable && <Text style={s.warning}>Execution blocked: a required service is disabled or unconfigured. An operator must configure server settings; this app cannot activate accounts.</Text>}
      {(expired || stale) && <Text style={s.warning}>{expired ? 'This consent expired.' : 'The workspace changed after this preview.'} Prepare and review a fresh preview. Nothing has run.</Text>}
      {!payloadReviewed && <Text style={s.small}>Open the exact payload to review the sanitized evidence and model settings before confirming.</Text>}
      <Action label="Confirm this data transfer" disabled={locked || !manifest.executionAvailable || expired || stale || !payloadReviewed} onPress={() => void confirm()} />
      <Action secondary label="Discard consent · do not run" disabled={relay.busy} onPress={invalidate} />
      <Text style={s.small}>One use only. You confirm permission to transfer the disclosed data under the provider’s terms. This operation is never automatically resubmitted after an error or timeout.</Text>
    </View>}
    {phase === 'running' && <View accessibilityLiveRegion="polite" style={s.card}><ActivityIndicator color="#173F35" /><Text style={s.heading}>Running your one authorized investigation…</Text><Text style={s.body}>This can take up to three minutes. No assignment is approved. Do not submit another request if the connection is interrupted.</Text></View>}
    {result && <View style={s.card}><Text style={s.step}>03 · REVIEW, THEN DECIDE</Text><Text style={s.heading}>{result.fallback === 'local-only' ? 'Local-only result' : 'Investigation result'}</Text><Text style={s.small}>Authorized services: {resultProviders.join(' + ')}</Text><Text style={s.body}>{result.summary}</Text>{result.warnings.map((warning, index) => <Text key={index} style={s.warning}>• {warning}</Text>)}<Text style={s.small}>Provider output is untrusted evidence. Check policy citations and deterministic constraints. No assignment has been approved by this action.</Text><Action label="Review recovery proposal separately" onPress={reviewRecovery} /></View>}
    <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Check an uncertain outcome</Text><Text style={s.body}>A timeout does not prove that nothing happened. After refreshing the workspace, read your retained operation receipts before authorizing another transfer. This local read does not contact a vendor or repeat work.</Text><Action secondary label="Read recent operation receipts" disabled={locked} onPress={() => void readReceipts()} />{receiptsLoaded && !receipts.length && <Text style={s.small}>No retained receipts were returned for this account. This is not proof that a vendor received no request.</Text>}{receipts.slice(0, 5).map(receipt => <View key={receipt.id} style={s.providerStatus}><Text style={s.heading}>{receipt.operation.replace(/_/g, ' ')} · {receipt.status.replace(/_/g, ' ')}</Text><Text style={s.small}>{new Date(receipt.createdAt).toLocaleString()} · {receipt.requestCount} requests recorded · {receipt.providers.join(', ')}</Text><Text selectable style={s.small}>Receipt {receipt.id}</Text><Text selectable style={s.hash}>Payload SHA-256: {receipt.payloadSha256}</Text>{receipt.externalRecords.map((record, index) => <Text key={index} selectable style={s.body}>{record.provider} · {record.kind}: {record.id}</Text>)}<Text style={s.warning}>{receipt.guidance}</Text></View>)}</View>
    <View style={s.card}><Text style={s.heading}>More workflows in the web workspace</Text><Text style={s.body}>Document and audio uploads, source discovery, saved preferences, and reference-draft review use the web coordinator workspace in this phase. This native app does not request file or microphone access.</Text><Action secondary label="Open local recovery review" onPress={reviewRecovery} /></View>
  </>;
}
const s = StyleSheet.create({
  flex: { flex: 1 }, eyebrow: { color: '#66766C', fontSize: 10, letterSpacing: 1.3, fontWeight: '700', lineHeight: 17 }, title: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : Platform.OS === 'web' ? 'Georgia, serif' : 'serif', fontSize: 37, lineHeight: 43, color: '#173F35', letterSpacing: -1 },
  card: { backgroundColor: '#FFFEF9', borderRadius: 18, borderWidth: 1, borderColor: '#DDE2D7', padding: 18, gap: 13 }, consent: { backgroundColor: '#EDF0E7', borderRadius: 18, borderWidth: 1, borderColor: '#BCCCB6', padding: 18, gap: 13 }, heading: { color: '#173F35', fontSize: 16, lineHeight: 23, fontWeight: '700', flexShrink: 1 }, body: { color: '#213C32', fontSize: 14, lineHeight: 22 }, small: { color: '#66766C', fontSize: 11, lineHeight: 18 }, label: { color: '#173F35', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }, step: { color: '#A13C25', fontSize: 10, lineHeight: 17, fontWeight: '700', letterSpacing: 1.2 }, badge: { color: '#173F35', fontSize: 12, fontWeight: '700', backgroundColor: '#E4EBDF', borderRadius: 7, padding: 9, alignSelf: 'flex-start' },
  providerStatus: { gap: 4, borderTopWidth: 1, borderColor: '#DDE2D7', paddingTop: 12 }, button: { minHeight: 50, backgroundColor: '#173F35', borderRadius: 13, padding: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#173F35' }, secondary: { backgroundColor: '#FFFEF9', borderColor: '#DDE2D7' }, buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' }, disabled: { opacity: 0.42 }, choice: { minHeight: 54, padding: 14, gap: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DDE2D7', borderRadius: 12 }, selected: { backgroundColor: '#EDF0E5', borderColor: '#173F35' }, radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1, borderColor: '#A5B1A5' }, checked: { borderWidth: 6, borderColor: '#173F35' }, toggle: { minHeight: 60, gap: 12, flexDirection: 'row', alignItems: 'center' }, warning: { color: '#9A3823', fontSize: 13, lineHeight: 21 }, error: { backgroundColor: '#FCE7DD', borderRadius: 12, padding: 15 }, payload: { backgroundColor: '#FFFEF9', borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 19, color: '#213C32', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, hash: { color: '#66766C', fontSize: 11, lineHeight: 18, flexShrink: 1 },
});
