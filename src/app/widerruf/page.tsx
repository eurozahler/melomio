import type { Metadata } from "next";
import { Suspense } from "react";
import { Address, companyForLegal, LegalPage } from "@/legal/legal-page";

export const metadata: Metadata = { title: "Widerrufsbelehrung – melomio" };

/**
 * Widerrufsbelehrung für digitale Inhalte nach dem Muster der Anlage 1 zu Art. 246a § 1 Abs. 2
 * EGBGB, mit Hinweis auf das vorzeitige Erlöschen (§ 356 Abs. 5 BGB) und Muster-Widerrufsformular
 * (Anlage 2). ⚠️ Entwurf – juristisch prüfen (F-24).
 */
export default function Page() {
  return (
    <LegalPage title="Widerrufsbelehrung">
      <Suspense fallback={<p>…</p>}>
        <Withdrawal />
      </Suspense>
    </LegalPage>
  );
}

async function Withdrawal() {
  const c = await companyForLegal();
  return (
    <>
      <h2>Widerrufsrecht</h2>
      <p>
        Wenn Sie Verbraucher sind, haben Sie das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen
        Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
      </p>
      <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns</p>
      <Address c={c} />
      <p>
        E-Mail: <a href={`mailto:${c.email}`}>{c.email}</a>
        {c.phone ? `, Telefon: ${c.phone}` : ""}
      </p>
      <p>
        mittels einer eindeutigen Erklärung (z. B. eine E-Mail) über Ihren Entschluss, diesen Vertrag zu
        widerrufen, informieren. Sie können dafür das unten stehende Muster-Widerrufsformular verwenden, das
        jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung
        über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
      </p>

      <h2>Folgen des Widerrufs</h2>
      <p>
        Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben,
        unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung
        über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir
        dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit
        Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser
        Rückzahlung Entgelte berechnet.
      </p>

      <h2>Vorzeitiges Erlöschen des Widerrufsrechts</h2>
      <p>
        Bei einem Vertrag über die Bereitstellung digitaler Inhalte, die nicht auf einem körperlichen
        Datenträger geliefert werden, erlischt das Widerrufsrecht, wenn wir mit der Vertragserfüllung begonnen
        haben, nachdem Sie
      </p>
      <ul>
        <li>
          ausdrücklich zugestimmt haben, dass wir vor Ablauf der Widerrufsfrist mit der Ausführung beginnen,
        </li>
        <li>
          Ihre Kenntnis davon bestätigt haben, dass Sie durch Ihre Zustimmung Ihr Widerrufsrecht verlieren,
          und
        </li>
        <li>
          wir Ihnen eine Bestätigung des Vertrags auf einem dauerhaften Datenträger (E-Mail) zur Verfügung
          gestellt haben.
        </li>
      </ul>
      <p>
        Bei melomio geben Sie diese Zustimmung beim Kauf durch einen eigenen Haken. Unmittelbar nach der
        Zahlung beginnen wir mit der Erstellung von Song und Video und senden Ihnen die Bestellbestätigung per
        E-Mail.
      </p>

      <h2>Muster-Widerrufsformular</h2>
      <p>
        (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es
        zurück.)
      </p>
      <div className="rounded-xl border border-neutral-300 p-4 text-sm dark:border-neutral-700">
        <p>
          An: {c.name}, {c.street}, {c.postalCode} {c.city}, E-Mail: {c.email}
        </p>
        <p className="mt-2">
          Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Bereitstellung
          der folgenden digitalen Inhalte (*):
        </p>
        <p className="mt-2">Bestellnummer: ______________________</p>
        <p>Bestellt am (*): ______________________</p>
        <p>Name des/der Verbraucher(s): ______________________</p>
        <p>Anschrift des/der Verbraucher(s): ______________________</p>
        <p>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ______________________</p>
        <p>Datum: ______________________</p>
        <p className="mt-2">(*) Unzutreffendes streichen.</p>
      </div>
    </>
  );
}
