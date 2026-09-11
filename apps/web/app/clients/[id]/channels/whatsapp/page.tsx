"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, CircleAlert, LoaderCircle, MessageCircle, Plug, Power, QrCode, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { Alert } from "@/components/ui";
import { api, ApiError, messageFrom } from "@/lib/api";
import { useT, type I18nKey } from "@/lib/i18n";
import type { Client, WhatsAppChannel } from "@/types";

const stateKeys: Record<WhatsAppChannel["status"], { label: I18nKey; copy: I18nKey }> = {
  disconnected: { label: "clients.whatsapp.statusDisconnectedLabel", copy: "clients.whatsapp.statusDisconnectedCopy" },
  connecting: { label: "clients.whatsapp.statusConnectingLabel", copy: "clients.whatsapp.statusConnectingCopy" },
  qr: { label: "clients.whatsapp.statusQrLabel", copy: "clients.whatsapp.statusQrCopy" },
  pairing: { label: "clients.whatsapp.statusPairingLabel", copy: "clients.whatsapp.statusPairingCopy" },
  connected: { label: "clients.whatsapp.statusConnectedLabel", copy: "clients.whatsapp.statusConnectedCopy" },
  reconnecting: { label: "clients.whatsapp.statusReconnectingLabel", copy: "clients.whatsapp.statusReconnectingCopy" },
  error: { label: "clients.whatsapp.statusErrorLabel", copy: "clients.whatsapp.statusErrorCopy" },
};

export default function WhatsAppChannelPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [channel, setChannel] = useState<WhatsAppChannel | null>(null);
  const [agentId, setAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState<"qr" | "phone">("qr");
  const [phoneNumber, setPhoneNumber] = useState("");

  const loadChannel = useCallback(async () => {
    try {
      const current = await api<WhatsAppChannel>(`/whatsapp/channels/${id}`);
      setChannel(current);
      setAgentId((value) => value || current.agent_id);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
      setChannel(null);
    }
  }, [id]);

  useEffect(() => {
    Promise.all([api<Client>(`/clients/${id}`).then((item) => { setClient(item); setAgentId((value) => value || item.agents[0]?.id || ""); }), loadChannel()])
      .catch((err) => setError(messageFrom(err))).finally(() => setLoading(false));
  }, [id, loadChannel]);

  useEffect(() => {
    if (!channel) return;
    const timer = window.setInterval(() => { loadChannel().catch((err) => setError(messageFrom(err))); }, 2500);
    return () => window.clearInterval(timer);
  }, [channel, loadChannel]);

  async function saveAndConnect() {
    if (!agentId) return;
    if (method === "phone" && !/^[0-9]{6,20}$/.test(phoneNumber)) { setError(t("clients.whatsapp.phoneNumberHint")); return; }
    setBusy(true); setError("");
    try {
      await api<WhatsAppChannel>(`/whatsapp/channels/${id}`, { method: "PUT", body: JSON.stringify({ agent_id: agentId }) });
      const body = method === "phone" ? { phone_number: phoneNumber } : {};
      setChannel(await api<WhatsAppChannel>(`/whatsapp/channels/${id}/connect`, { method: "POST", body: JSON.stringify(body) }));
    } catch (err) { setError(messageFrom(err)); } finally { setBusy(false); }
  }

  async function saveAgent() {
    setBusy(true); setError("");
    try { setChannel(await api<WhatsAppChannel>(`/whatsapp/channels/${id}`, { method: "PUT", body: JSON.stringify({ agent_id: agentId }) })); }
    catch (err) { setError(messageFrom(err)); } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm(t("clients.whatsapp.confirmDisconnect"))) return;
    setBusy(true); setError("");
    try { setChannel(await api<WhatsAppChannel>(`/whatsapp/channels/${id}/disconnect`, { method: "POST" })); }
    catch (err) { setError(messageFrom(err)); } finally { setBusy(false); }
  }

  if (loading || !client) return <div className="page-loading"><LoaderCircle className="spin" /> {t("clients.whatsapp.loading")}</div>;
  const state = stateKeys[channel?.status || "disconnected"];
  const canConnect = Boolean(agentId && !busy && channel?.status !== "connected");
  return <div className="page wa-page">
    <Link href={`/clients/${client.id}`} className="back-link"><ArrowLeft size={17} /> {t("clients.whatsapp.back", { name: client.name })}</Link>
    <header className="wa-header"><div className="wa-mark"><MessageCircle size={26} /></div><div><span>{t("clients.whatsapp.channelOf", { name: client.name })}</span><h1>{t("clients.whatsapp.title")}</h1><p>{t("clients.whatsapp.headerCopy")}</p></div>{channel && <div className={`wa-state ${channel.status}`}>{channel.status === "connected" ? <CheckCircle2 size={17} /> : channel.status === "error" ? <CircleAlert size={17} /> : <RefreshCw className={["connecting", "reconnecting"].includes(channel.status) ? "spin" : ""} size={17} />} {t(state.label)}</div>}</header>
    {error && <Alert>{error}</Alert>}
    <div className="wa-layout"><main>
      <section className="wa-panel"><div className="wa-panel-head"><span><Bot size={19} /></span><div><h2>{t("clients.whatsapp.assignedAgent")}</h2><p>{t("clients.whatsapp.assignedAgentCopy")}</p></div></div><div className="wa-agent-row"><label>{t("clients.whatsapp.agentToRespond")}<select value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={busy}><option value="">{t("clients.whatsapp.selectAgent")}</option>{client.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.is_active ? "" : t("clients.whatsapp.inactiveSuffix")}</option>)}</select></label>{channel && channel.agent_id !== agentId && <button className="button secondary" onClick={saveAgent} disabled={!agentId || busy}>{t("clients.whatsapp.saveAgent")}</button>}</div>{!client.agents.length && <Alert>{t("clients.whatsapp.needsAgent")}</Alert>}</section>
      <section className="wa-panel"><div className="wa-panel-head"><span><Plug size={19} /></span><div><h2>{t("clients.whatsapp.connection")}</h2><p>{t(state.copy)}</p></div></div>
        {(!channel || ["disconnected", "error"].includes(channel.status)) && <div className="wa-method"><button type="button" className={`wa-method-btn ${method === "qr" ? "active" : ""}`} onClick={() => setMethod("qr")} disabled={busy}><QrCode size={16} /> {t("clients.whatsapp.connectMethodQr")}</button><button type="button" className={`wa-method-btn ${method === "phone" ? "active" : ""}`} onClick={() => setMethod("phone")} disabled={busy}><Smartphone size={16} /> {t("clients.whatsapp.connectMethodPhone")}</button></div>}
        {(!channel || ["disconnected", "error"].includes(channel.status)) && method === "phone" && <label className="wa-phone-input">{t("clients.whatsapp.phoneNumberLabel")}<input type="tel" inputMode="numeric" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value.replace(/[^0-9]/g, ""))} placeholder={t("clients.whatsapp.phoneNumberPlaceholder")} disabled={busy} /><small>{t("clients.whatsapp.phoneNumberHint")}</small></label>}
        {channel?.status === "qr" && channel.qr_code && <div className="wa-qr"><img src={channel.qr_code} alt={t("clients.whatsapp.qrAlt")} /><div><span><QrCode size={18} /> {t("clients.whatsapp.scanFromPhone")}</span><ol><li>{t("clients.whatsapp.qrStep1")}</li><li>{t("clients.whatsapp.qrStep2Prefix")}<strong>{t("clients.whatsapp.qrStep2Bold")}</strong>.</li><li>{t("clients.whatsapp.qrStep3Prefix")}<strong>{t("clients.whatsapp.qrStep3Bold")}</strong>{t("clients.whatsapp.qrStep3Suffix")}</li></ol><small>{t("clients.whatsapp.qrHint")}</small></div></div>}
        {channel?.status === "pairing" && channel.pairing_code && <div className="wa-qr"><div className="wa-pairing-code" role="img" aria-label={t("clients.whatsapp.pairingCodeAlt")}>{channel.pairing_code}</div><div><span><Smartphone size={18} /> {t("clients.whatsapp.pairingCodeTitle")}</span><ol><li>{t("clients.whatsapp.pairingStep1")}</li><li>{t("clients.whatsapp.pairingStep2Prefix")}<strong>{t("clients.whatsapp.pairingStep2Bold")}</strong>.</li><li>{t("clients.whatsapp.pairingStep3Prefix")}<strong>{t("clients.whatsapp.pairingStep3Bold")}</strong>{t("clients.whatsapp.pairingStep3Suffix")}</li></ol><small>{t("clients.whatsapp.pairingHint")}</small></div></div>}
        {channel?.status === "connected" && <div className="wa-connected"><div className="wa-phone"><Smartphone size={24} /><span><small>{t("clients.whatsapp.connectedNumber")}</small><strong>{channel.phone_number ? `+${channel.phone_number}` : t("clients.whatsapp.linkedNumber")}</strong>{channel.display_name && <em>{channel.display_name}</em>}</span></div><div className="wa-ready"><CheckCircle2 size={18} /> {t("clients.whatsapp.readyForMessages")}</div></div>}
        {channel?.last_error && <Alert>{channel.last_error}</Alert>}
        <div className="wa-actions">{channel?.status === "connected" ? <button className="button danger" onClick={disconnect} disabled={busy}><Power size={17} /> {t("clients.whatsapp.disconnectAccount")}</button> : <button className="button primary" onClick={saveAndConnect} disabled={!canConnect || (method === "phone" && !phoneNumber)}>{busy || ["connecting", "reconnecting"].includes(channel?.status || "") ? <LoaderCircle className="spin" size={17} /> : method === "phone" ? <Smartphone size={17} /> : <QrCode size={17} />} {channel?.has_session ? t("clients.whatsapp.recoverConnection") : method === "phone" ? t("clients.whatsapp.connectWithPhone") : t("clients.whatsapp.connectWithQr")}</button>}</div>
      </section>
    </main><aside className="wa-side"><ShieldCheck size={22} /><h3>{t("clients.whatsapp.separationTitle")}</h3><p>{t("clients.whatsapp.separationCopy")}<strong>{client.name}</strong>.</p><hr /><h3>{t("clients.whatsapp.humanControlTitle")}</h3><p>{t("clients.whatsapp.humanControlCopy")}</p></aside></div>
  </div>;
}
