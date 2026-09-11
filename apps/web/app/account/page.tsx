"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Save } from "lucide-react";
import { PageHead } from "@/components/ui";
import { FormSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { api, messageFrom } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { User } from "@/types";

export default function AccountPage() {
  const t = useT();
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealCurrent, setRevealCurrent] = useState(false);
  const [revealNew, setRevealNew] = useState(false);

  useEffect(() => { api<User>("/auth/me").then(setUser); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("current_password") || "");
    const newPassword = String(data.get("new_password") || "");
    if (!currentPassword) { toast.error(t("account.needsCurrentPassword")); return; }
    setBusy(true);
    try {
      const updated = await api<User>("/auth/me", {
        method: "PUT",
        body: JSON.stringify({
          current_password: currentPassword,
          name: data.get("name"),
          email: data.get("email"),
          new_password: newPassword || undefined,
        }),
      });
      setUser(updated);
      (event.currentTarget.elements.namedItem("current_password") as HTMLInputElement).value = "";
      (event.currentTarget.elements.namedItem("new_password") as HTMLInputElement).value = "";
      toast.success(t("account.saved"));
    } catch (err) { toast.error(messageFrom(err)); } finally { setBusy(false); }
  }

  if (!user) return <div className="page"><PageHead eyebrow={t("account.eyebrow")} title={t("account.title")} description={t("account.description")} /><FormSkeleton sections={1} /></div>;

  return <div className="page">
    <PageHead eyebrow={t("account.eyebrow")} title={t("account.title")} description={t("account.description")} />
    <form className="page-form" onSubmit={save}>
      <section className="form-section">
        <div className="section-copy"><h2>{t("account.identityHeading")}</h2><p>{t("account.identityCopy")}</p></div>
        <div className="form-fields">
          <div className="form-grid">
            <label>{t("account.name")}<input name="name" required defaultValue={user.name} /></label>
            <label>{t("account.email")}<input type="email" name="email" required defaultValue={user.email} /></label>
          </div>
          <label>{t("account.newPassword")}
            <div className="key-input">
              <input type={revealNew ? "text" : "password"} name="new_password" autoComplete="new-password" placeholder={t("account.newPasswordPlaceholder")} minLength={8} />
              <button type="button" className="reveal" onClick={() => setRevealNew((v) => !v)} aria-label={t(revealNew ? "settings.providers.hide" : "settings.providers.reveal")}>{revealNew ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <label>{t("account.currentPassword")}
            <div className="key-input">
              <input type={revealCurrent ? "text" : "password"} name="current_password" required autoComplete="current-password" placeholder={t("account.currentPasswordPlaceholder")} />
              <button type="button" className="reveal" onClick={() => setRevealCurrent((v) => !v)} aria-label={t(revealCurrent ? "settings.providers.hide" : "settings.providers.reveal")}>{revealCurrent ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <small className="form-hint">{t("account.currentPasswordHint")}</small>
          <button className="button primary align-start" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />} {t("account.save")}</button>
        </div>
      </section>
    </form>
  </div>;
}
