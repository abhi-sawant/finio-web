import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/ui/header';
import Main from '@/components/ui/main';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-muted-foreground space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <>
      <Header innerClassName="lg:max-w-2xl">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Privacy Policy</h1>
        <div className="h-9 w-9" />
      </Header>

      <Main className="lg:max-w-2xl">
        <div className="card-elevated space-y-6 rounded-md p-5">
          <p className="text-muted-foreground text-xs">
            Last updated: 13 August 2026. This policy covers the hosted Finio app and the optional
            cloud backup service. If you are using a self-hosted deployment, the person or
            organization operating that server — not us — controls your data; ask them for their
            policy.
          </p>

          <Section title="1. Local-first by default">
            Finio is built to work entirely on your device. Accounts, transactions, budgets,
            categories, goals, debts, and every other record you create are stored in your browser's
            local storage. None of this data is transmitted anywhere unless you explicitly turn on
            cloud backup or cloud sync. Uninstalling the app or clearing site data deletes it, since
            we never receive a copy in the first place.
          </Section>

          <Section title="2. What we collect if you create a cloud account">
            <p>Cloud backup is optional. If you register for one, we collect:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Your name and email address, to create and identify your account.</li>
              <li>
                A one-time password (OTP) sent to your email to verify it and to support password
                resets.
              </li>
              <li>
                Your password, which we never store in plain text — only a salted bcrypt hash.
              </li>
              <li>
                Your backup data. If you enable end-to-end encryption for backups, we only ever
                receive an opaque encrypted envelope and cannot read its contents. If you leave
                encryption off, the backup is your finance data in plain JSON, and our server
                operators can technically access it — treat that setting as a real trust decision.
              </li>
            </ul>
          </Section>

          <Section title="3. What we don't do">
            <ul className="list-disc space-y-1 pl-5">
              <li>No cookies and no ad or analytics trackers of any kind.</li>
              <li>No selling, renting, or sharing your data with advertisers or data brokers.</li>
              <li>No behavioral profiling.</li>
            </ul>
            The only outside party involved in operating the hosted service is the email provider
            used to deliver OTP and password-reset messages, which sees your email address and the
            fact that you requested a code — nothing else.
          </Section>

          <Section title="4. Why we process this data">
            We process account and backup data to provide the service you asked for: creating your
            account, authenticating you, and storing and restoring your backups. We don't rely on
            this data for marketing or send you anything beyond transactional emails (OTPs, password
            resets, and account-related notices).
          </Section>

          <Section title="5. How long we keep it">
            <p>
              Your account record is kept for as long as your account exists. Backup files are
              retained on a rolling basis (30 days by default on the hosted instance; a self-hoster
              can configure a different window) and older backups are deleted automatically. OTP and
              password-reset codes expire within minutes and are not reused.
            </p>
            <p>
              Deleting your account immediately and permanently deletes every backup tied to it.
            </p>
          </Section>

          <Section title="6. Your rights">
            <p>
              If you are in the EU/EEA or UK, GDPR gives you rights over your data, all of which
              this app supports in practice, not just on paper:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Access &amp; portability</strong> — view your profile from Settings, and
                export your full data as JSON at any time (from the device, or from a downloaded
                cloud backup).
              </li>
              <li>
                <strong>Erasure</strong> — delete your cloud account from Settings; this immediately
                deletes your account record and every backup on the server. Deleting the app or its
                site data removes everything stored locally.
              </li>
              <li>
                <strong>Rectification</strong> — update your name or password from Settings.
              </li>
              <li>
                <strong>Objection / restriction</strong> — stop using cloud backup at any time; the
                app keeps working fully offline.
              </li>
              <li>
                You also have the right to lodge a complaint with your local data protection
                supervisory authority.
              </li>
            </ul>
          </Section>

          <Section title="7. Security">
            Passwords are hashed with bcrypt, authentication uses short-lived signed tokens (JWT),
            and cloud backups can be end-to-end encrypted with a passphrase only you know — we never
            see it and cannot recover it if you lose it. No screen lock or encryption feature makes
            the app immune to a compromised device; it reduces risk, it doesn't eliminate it.
          </Section>

          <Section title="8. Children">
            Finio is not directed at children, and we do not knowingly collect data from anyone
            under 16.
          </Section>

          <Section title="9. Changes to this policy">
            If this policy changes materially, we'll update the "last updated" date above and, where
            required, notify account holders by email.
          </Section>

          <Section title="10. Contact">
            Questions about this policy, or to exercise a right not covered above, contact:{' '}
            <span className="text-foreground font-medium">contact@finio.slowatcoding.com</span>.
          </Section>
        </div>
      </Main>
    </>
  );
}
