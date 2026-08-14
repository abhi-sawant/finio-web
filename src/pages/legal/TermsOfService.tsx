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

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <>
      <Header innerClassName="lg:max-w-2xl">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-base font-semibold">Terms of Service</h1>
        <div className="h-9 w-9" />
      </Header>

      <Main className="lg:max-w-2xl">
        <div className="card-elevated space-y-6 rounded-md p-5">
          <p className="text-muted-foreground text-xs">
            Last updated: 13 August 2026. These terms cover the hosted Finio app and its
            optional cloud backup service. See the <span className="text-foreground">Privacy Policy</span>{' '}
            for how your data is handled.
          </p>

          <Section title="1. Acceptance">
            By creating a cloud account, or by using Finio at all, you agree to these terms. If
            you don't agree, you can still use the app fully offline without an account — no
            terms apply to purely local use.
          </Section>

          <Section title="2. The service">
            Finio is a personal finance tracker. Cloud backup is an optional add-on that stores a
            copy of your data on a server so you can restore it on another device; it is not
            required for the app to work. Finio does not connect to your bank, does not initiate
            or process payments, and does not provide investment or financial advice — it is a
            record-keeping tool, and any totals, forecasts, or insights it shows are informational
            estimates based only on the data you entered.
          </Section>

          <Section title="3. Your account">
            <p>You're responsible for:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Providing a working email address and keeping your password confidential.</li>
              <li>
                Everything entered under your account, and for setting a passphrase you can
                remember if you enable encrypted backups — it cannot be recovered if lost.
              </li>
              <li>Notifying us if you believe your account has been compromised.</li>
            </ul>
          </Section>

          <Section title="4. Your data">
            You own the data you put into Finio. We don't claim any rights over it, we don't use
            it for anything other than providing the backup/restore feature you asked for, and
            you can export or delete it at any time (see the Privacy Policy for how).
          </Section>

          <Section title="5. Acceptable use">
            <p>Don't use Finio to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Attempt to access another user's account or data.</li>
              <li>Interfere with, overload, or probe the service's infrastructure.</li>
              <li>Upload unlawful content into a backup, or use the account system for anything other than backing up your own finance data.</li>
            </ul>
          </Section>

          <Section title="6. Availability and no warranty">
            The hosted service, including cloud backup, is provided free of charge, "as is" and
            "as available," without warranties of any kind. We don't guarantee uninterrupted
            availability, and while backups are retained on a rolling basis, they are a
            convenience feature, not a guaranteed archival service — keep your own local export
            of anything you can't afford to lose.
          </Section>

          <Section title="7. Limitation of liability">
            To the fullest extent permitted by law, the service is provided without liability for
            indirect, incidental, or consequential damages, including loss of data, arising from
            your use of it. Nothing in these terms limits liability that cannot be excluded under
            applicable law, including EU consumer-protection law.
          </Section>

          <Section title="8. Termination">
            You may stop using the service and delete your account at any time from Settings,
            which permanently removes your account and all associated backups. We may suspend or
            terminate accounts used in violation of section 5.
          </Section>

          <Section title="9. Self-hosted deployments">
            Finio's source is open, and these terms apply only to the officially hosted instance.
            If you connect the app to a self-hosted backend, your relationship — and these terms
            — are with whoever operates that server, not with us.
          </Section>

          <Section title="10. Changes">
            We may update these terms from time to time; material changes will be reflected in
            the "last updated" date above.
          </Section>

          <Section title="11. Contact">
            Questions about these terms: <span className="text-foreground font-medium">contact@finio.slowatcoding.com</span>.
          </Section>
        </div>
      </Main>
    </>
  );
}
