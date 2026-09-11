"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, CircleAlert, KeyRound, LoaderCircle, Plug, Power, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui";
import { api, ApiError, messageFrom } from "@/lib/api";
import { useT, type I18nKey } from "@/lib/i18n";
import type { Client, TelegramChannel } from "@/types";

const stateKeys: Record<TelegramChannel["status"], { label: I18nKey; copy: I18nKey }> = {
  disconnected: { label: "clients.telegram.statusDisconnectedLabel", copy: "clients.telegram.statusDisconnectedCopy" },
  connected: { label: "clients.telegram.statusConnectedLabel", copy: "clients.telegram.statusConnectedCopy" },
  error: { label: "clients.telegram.statusErrorLabel", copy: "clients.telegram.statusErrorCopy" },
};

export default function TelegramChannelPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [channel, setChannel] = useState<TelegramChannel | null>(null);
  const [agentId, setAgentId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadChannel = api<TelegramChannel>(`/telegram/channels/${id}`)
      .then((current) => { setChannel(current); setAgentId(current.agent_id); })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        setChannel(null);
      });
    Promise.all([
      api<Client>(`/clients/${id}`).then((item) => { setClient(item); setAgentId((value) => value || item.agents[0]?.id || ""); }),
      loadChannel,
    ]).catch((err) => setError(messageFrom(err))).finally(() => setLoading(false));
  }, [id]);

  async function save(): Promise<TelegramChannel | null> {
    if (!agentId) return null;
    const payload: Record<string, string> = { agent_id: agentId };
    if (botToken.trim()) payload.bot_token = botToken.trim();
    const saved = await api<TelegramChannel>(`/telegram/channels/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setChannel(saved);
    setBotToken("");
    return saved;
  }

  async function saveAndConnect() {
    setBusy(true); setError("");
    try {
      if (await save()) setChannel(await api<TelegramChannel>(`/telegram/channels/${id}/connect`, { method: "POST" }));
    } catch (err) { setError(messageFrom(err)); } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm(t("clients.telegram.confirmDisconnect"))) return;
    setBusy(true); setError("");
    try { setChannel(await api<TelegramChannel>(`/telegram/channels/${id}/disconnect`, { method: "POST" })); }
    catch (err) { setError(messageFrom(err)); } finally { setBusy(false); }
  }

  if (loading || !client) return <div className="page-loading"><LoaderCircle className="spin" /> {t("clients.telegram.loading")}</div>;
  const state = stateKeys[channel?.status || "disconnected"];
  const canConnect = Boolean(agentId && (botToken.trim() || channel?.has_bot_token) && !busy);
  return <div className="page wa-page">
    <Link href={`/clients/${client.id}`} className="back-link"><ArrowLeft size={17} /> {t("clients.whatsapp.back", { name: client.name })}</Link>
    <header className="wa-header"><div className="wa-mark"><Send size={24} /></div><div><span>{t("clients.whatsapp.channelOf", { name: client.name })}</span><h1>{t("clients.telegram.title")}</h1><p>{t("clients.telegram.headerCopy")}</p></div>{channel && <div className={`wa-state ${channel.status}`}>{channel.status === "connected" ? <CheckCircle2 size={17} /> : channel.status === "error" ? <CircleAlert size={17} /> : <RefreshCw size={17} />} {t(state.label)}</div>}</header>
    {error && <Alert>{error}</Alert>}
    <div className="wa-layout"><main>
      <section className="wa-panel"><div className="wa-panel-head"><span><Bot size={19} /></span><div><h2>{t("clients.whatsapp.assignedAgent")}</h2><p>{t("clients.whatsapp.assignedAgentCopy")}</p></div></div><div className="wa-agent-row"><label>{t("clients.whatsapp.agentToRespond")}<select value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={busy}><option value="">{t("clients.whatsapp.selectAgent")}</option>{client.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.is_active ? "" : t("clients.whatsapp.inactiveSuffix")}</option>)}</select></label></div>{!client.agents.length && <Alert>{t("clients.whatsapp.needsAgent")}</Alert>}</section>
      <section className="wa-panel"><div className="wa-panel-head"><span><KeyRound size={19} /></span><div><h2>{t("clients.telegram.credentialsTitle")}</h2><p>{t("clients.telegram.credentialsCopy")} <a href="https://core.telegram.org/bots/features#botfather" target="_blank" rel="noreferrer">@BotFather</a>.</p></div></div>
        <label>{t("clients.telegram.botTokenLabel")}<input type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder={channel?.has_bot_token ? t("clients.telegram.tokenSavedPlaceholder") : "123456789:AA..."} disabled={busy} /></label>
        {channel?.status === "connected" && <div className="wa-connected"><div className="wa-phone"><Send size={22} /><span><small>{t("clients.telegram.connectedBot")}</small><strong>@{channel.bot_username}</strong>{channel.display_name && <em>{channel.display_name}</em>}</span></div><div className="wa-ready"><CheckCircle2 size={18} /> {t("clients.whatsapp.readyForMessages")}</div></div>}
        {channel?.last_error && <Alert>{channel.last_error}</Alert>}
        <div className="wa-actions">
          {channel?.status === "connected" ? <button className="button danger" onClick={disconnect} disabled={busy}><Power size={17} /> {t("clients.telegram.disconnect")}</button> : <button className="button primary" onClick={saveAndConnect} disabled={!canConnect}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plug size={17} />} {t("clients.telegram.connect")}</button>}
        </div>
      </section>
    </main><aside className="wa-side"><ShieldCheck size={22} /><h3>{t("clients.whatsapp.separationTitle")}</h3><p>{t("clients.whatsapp.separationCopy")}<strong>{client.name}</strong>.</p><hr /><h3>{t("clients.telegram.howItWorksTitle")}</h3><p>{t("clients.telegram.howItWorksCopy")}</p></aside></div>
  </div>;
}
